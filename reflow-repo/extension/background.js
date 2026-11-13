// Reflow — service worker
//
// Scheduling: a 1s in-worker ticker drives refreshes (this is what makes
// sub-30s intervals work: Chrome clamps chrome.alarms to >= 30s for store
// installs). A per-tab alarm is kept as a backstop so refreshing resumes
// even if the worker is torn down.
//
// State: running tabs live in chrome.storage.session (tab ids don't survive
// a browser restart anyway). Per-site preferences live in storage.local.

const K_TABS = "tabs";
const K_ALERTS = "alerts";
const K_DOMAINS = "reflow_domains";
const K_LAST = "reflow_last";
const ALARM = (id) => `rf_${id}`;
const PAUSE_RETRY_MS = 3000;

let tabs = {};   // tabId -> config
let alerts = {}; // tabId -> { text, mode, at }
let ticker = null;
const firing = new Set();

const ready = chrome.storage.session.get([K_TABS, K_ALERTS]).then((d) => {
  tabs = d[K_TABS] || {};
  alerts = d[K_ALERTS] || {};
  syncTicker();
});

const persist = () => chrome.storage.session.set({ [K_TABS]: tabs, [K_ALERTS]: alerts });

// ---------- helpers ----------

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ""; } };

function nextDelay(cfg) {
  let ms = cfg.interval * 1000;
  if (cfg.randomize) ms += (Math.random() * 2 - 1) * ms * 0.25; // ±25%
  return Math.max(1000, Math.round(ms));
}

function fmtBadge(sec) {
  if (sec >= 3600) return Math.floor(sec / 3600) + "h";
  if (sec >= 60) return Math.floor(sec / 60) + "m";
  return String(sec);
}

function badge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text }).catch(() => {});
  if (color) {
    chrome.action.setBadgeBackgroundColor({ tabId, color }).catch(() => {});
    chrome.action.setBadgeTextColor({ tabId, color: "#ffffff" }).catch(() => {});
  }
}

function send(tabId, msg, timeout = 400) {
  return Promise.race([
    chrome.tabs.sendMessage(tabId, msg).catch(() => undefined),
    new Promise((r) => setTimeout(() => r(undefined), timeout)),
  ]);
}

// Inject the (idempotent) page helper. Only ever runs on tabs you turned on.
async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return true;
  } catch { return false; } // chrome:// pages, Web Store, etc.
}

async function syncPage(tabId) {
  const cfg = tabs[tabId];
  if (!cfg) return;
  if (!(await inject(tabId))) return;
  await send(tabId, { type: "RF_SYNC", ...pagePayload(cfg) });
}

// ---------- ticker ----------

function syncTicker() {
  const any = Object.keys(tabs).length > 0;
  if (any && !ticker) ticker = setInterval(tick, 1000);
  if (!any && ticker) { clearInterval(ticker); ticker = null; }
}

function tick() {
  const now = Date.now();
  for (const [id, cfg] of Object.entries(tabs)) {
    const tabId = +id;
    if (now >= cfg.nextAt) fire(tabId);
    else if (cfg.paused) badge(tabId, "II", "#b45309");
    else badge(tabId, fmtBadge(Math.ceil((cfg.nextAt - now) / 1000)), "#18181b");
  }
}

async function fire(tabId) {
  const cfg = tabs[tabId];
  if (!cfg || firing.has(tabId)) return;
  firing.add(tabId);
  try {
    // Reserve the next slot first so the ticker and alarm can't double-fire.
    cfg.nextAt = Date.now() + nextDelay(cfg);

    if (cfg.smartPause) {
      const r = await send(tabId, { type: "RF_BUSY" });
      if (tabs[tabId] !== cfg) return; // stopped or restarted meanwhile
      if (r && r.busy) {
        cfg.nextAt = Date.now() + PAUSE_RETRY_MS;
        if (!cfg.paused) { cfg.paused = true; send(tabId, { type: "RF_SYNC", ...pagePayload(cfg) }); }
        badge(tabId, "II", "#b45309");
        chrome.alarms.create(ALARM(tabId), { when: cfg.nextAt });
        await persist();
        return;
      }
    }
    cfg.paused = false;

    if (cfg.preserveScroll) await send(tabId, { type: "RF_SAVE_SCROLL" });
    if (tabs[tabId] !== cfg) return;
    try {
      await chrome.tabs.reload(tabId, { bypassCache: !!cfg.hardRefresh });
    } catch {
      await stop(tabId);
      return;
    }
    cfg.count += 1;
    cfg.nextAt = Date.now() + nextDelay(cfg);
    chrome.alarms.create(ALARM(tabId), { when: cfg.nextAt });
    await persist();
  } finally {
    firing.delete(tabId);
  }
}

const pagePayload = (cfg) => ({
  nextAt: cfg.nextAt, interval: cfg.interval, showTimer: cfg.showTimer,
  paused: !!cfg.paused, watch: cfg.watch || null,
});

// ---------- start / stop ----------

async function start(tabId, interval, opts = {}) {
  await ready;
  interval = Math.max(1, Math.round(+interval || 0));
  let url = "";
  try { url = (await chrome.tabs.get(tabId)).url || ""; } catch { return; }

  const watchText = (opts.watchText || "").trim();
  const cfg = {
    interval,
    hardRefresh: opts.hardRefresh ?? true,
    preserveScroll: opts.preserveScroll ?? true,
    smartPause: opts.smartPause ?? true,
    randomize: opts.randomize ?? false,
    showTimer: opts.showTimer ?? true,
    sound: opts.sound ?? true,
    watch: watchText ? { text: watchText, mode: opts.watchMode === "disappears" ? "disappears" : "appears" } : null,
    startedAt: Date.now(),
    count: 0,
    paused: false,
    url,
  };
  cfg.nextAt = Date.now() + nextDelay(cfg);

  tabs[tabId] = cfg;
  delete alerts[tabId];
  await persist();

  chrome.alarms.create(ALARM(tabId), { when: cfg.nextAt });
  chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  badge(tabId, fmtBadge(interval), "#18181b");
  syncTicker();
  syncPage(tabId);

  // Remember for this site and as the global default for the shortcut.
  const saved = { interval, ...opts };
  const host = hostOf(url);
  const d = await chrome.storage.local.get(K_DOMAINS);
  const domains = d[K_DOMAINS] || {};
  if (host) domains[host] = saved;
  await chrome.storage.local.set({ [K_DOMAINS]: domains, [K_LAST]: saved });
}

async function stop(tabId, { keepAlert = false } = {}) {
  await ready;
  const had = !!tabs[tabId];
  delete tabs[tabId];
  if (!keepAlert) delete alerts[tabId];
  await persist();
  chrome.alarms.clear(ALARM(tabId));
  syncTicker();
  if (!keepAlert) badge(tabId, "");
  if (had) {
    chrome.tabs.update(tabId, { autoDiscardable: true }).catch(() => {});
    send(tabId, { type: "RF_STOP" });
  }
}

async function toggle(tab) {
  await ready;
  if (!tab?.id) return;
  if (tabs[tab.id]) return stop(tab.id);
  const d = await chrome.storage.local.get([K_DOMAINS, K_LAST]);
  const pref = (d[K_DOMAINS] || {})[hostOf(tab.url)] || d[K_LAST] || { interval: 30 };
  return start(tab.id, pref.interval, pref);
}

// ---------- watch alerts ----------

async function onMatch(tabId) {
  const cfg = tabs[tabId];
  if (!cfg || !cfg.watch) return;
  const { text, mode } = cfg.watch;
  alerts[tabId] = { text, mode, at: Date.now() };
  const sound = cfg.sound;
  await stop(tabId, { keepAlert: true });
  badge(tabId, "!", "#16a34a");

  let title = "Untitled";
  try { title = (await chrome.tabs.get(tabId)).title || title; } catch {}
  chrome.notifications.create(`rf_match_${tabId}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: mode === "appears" ? `Found “${text}”` : `“${text}” is gone`,
    message: `${title} · refreshing stopped`,
    requireInteraction: true,
    priority: 2,
  });
  if (sound) chime();
}

async function chime() {
  try {
    if (!(await chrome.offscreen.hasDocument())) {
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play a short chime when a watched keyword is found.",
      });
    }
    await chrome.runtime.sendMessage({ type: "RF_CHIME" }).catch(() => {});
  } catch {}
  setTimeout(() => chrome.offscreen.closeDocument().catch(() => {}), 3000);
}

chrome.notifications.onClicked.addListener(async (id) => {
  if (!id.startsWith("rf_match_")) return;
  const tabId = +id.slice(9);
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch {}
  chrome.notifications.clear(id);
});

// ---------- events ----------

chrome.alarms.onAlarm.addListener(async (a) => {
  if (!a.name.startsWith("rf_")) return;
  await ready;
  const tabId = +a.name.slice(3);
  syncTicker();
  if (tabs[tabId] && Date.now() >= tabs[tabId].nextAt - 500) fire(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  await ready;
  if (tabs[tabId]) syncPage(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await ready;
  if (tabs[tabId] || alerts[tabId]) {
    delete tabs[tabId]; delete alerts[tabId];
    chrome.alarms.clear(ALARM(tabId));
    await persist();
    syncTicker();
  }
});

chrome.tabs.onReplaced.addListener(async (added, removed) => {
  await ready;
  if (!tabs[removed]) return;
  tabs[added] = tabs[removed];
  delete tabs[removed];
  chrome.alarms.clear(ALARM(removed));
  chrome.alarms.create(ALARM(added), { when: tabs[added].nextAt });
  await persist();
});

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd !== "toggle-refresh") return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  toggle(tab);
});

const HANDLED = new Set(["GET", "START", "STOP", "DISMISS", "RF_MATCH"]);
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!HANDLED.has(msg?.type)) return false;
  (async () => {
    await ready;
    switch (msg.type) {
      case "GET": {
        const d = await chrome.storage.local.get([K_DOMAINS, K_LAST]);
        const site = (d[K_DOMAINS] || {})[msg.host];
        reply({
          config: tabs[msg.tabId] || null,
          alert: alerts[msg.tabId] || null,
          pref: site ? { ...site, remembered: true } : d[K_LAST] ? { ...d[K_LAST], watchText: "" } : null,
          all: tabs,
        });
        break;
      }
      case "START": await start(msg.tabId, msg.interval, msg.opts); reply({ ok: true }); break;
      case "STOP": await stop(msg.tabId); reply({ ok: true }); break;
      case "DISMISS":
        delete alerts[msg.tabId]; await persist();
        if (!tabs[msg.tabId]) badge(msg.tabId, "");
        reply({ ok: true }); break;
      case "RF_MATCH": if (sender.tab) await onMatch(sender.tab.id); reply({}); break;
    }
  })();
  return true;
});
