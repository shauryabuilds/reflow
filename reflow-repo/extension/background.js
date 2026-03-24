const STORE = "reflow_state";
async function loadState() { const d = await chrome.storage.local.get(STORE); return d[STORE] || {}; }
async function saveState(state) { await chrome.storage.local.set({ [STORE]: state }); }
async function getTabState(tabId) { const s = await loadState(); return s[String(tabId)] || null; }
async function setTabState(tabId, data) { const s = await loadState(); s[String(tabId)] = data; await saveState(s); }
async function clearTabState(tabId) { const s = await loadState(); delete s[String(tabId)]; await saveState(s); }

function setBadge(tabId, text, active) {
  chrome.action.setBadgeText({ text, tabId }).catch(() => {});
  if (active) {
    chrome.action.setBadgeBackgroundColor({ color: "#18181b", tabId }).catch(() => {});
    chrome.action.setBadgeTextColor({ color: "#a1a1aa", tabId }).catch(() => {});
  }
}
function formatBadge(sec) {
  if (sec >= 3600) return Math.floor(sec / 3600) + "h";
  if (sec >= 60) return Math.floor(sec / 60) + "m";
  return sec + "";
}
const aName = (id) => `rf_${id}`;

async function startRefresh(tabId, interval, opts = {}) {
  let url = "";
  try { const tab = await chrome.tabs.get(tabId); url = tab.url || ""; } catch (e) {}
  const config = {
    interval, active: true,
    hardRefresh: opts.hardRefresh ?? true,
    preserveScroll: opts.preserveScroll ?? true,
    notify: opts.notify ?? false,
    randomize: opts.randomize ?? false,
    randomRange: opts.randomRange || 0,
    startedAt: Date.now(),
    nextAt: Date.now() + interval * 1000,
    count: 0, url,
  };
  let delayMs = interval * 1000;
  if (config.randomize && config.randomRange > 0) {
    delayMs += Math.random() * config.randomRange * 1000;
    config.nextAt = Date.now() + delayMs;
  }
  await setTabState(tabId, config);
  chrome.alarms.create(aName(tabId), { when: Date.now() + delayMs });
  setBadge(tabId, formatBadge(interval), true);
  try { await chrome.tabs.sendMessage(tabId, { type: "RF_START", interval, nextAt: config.nextAt, preserveScroll: config.preserveScroll }); } catch (e) {}
  if (url) {
    try {
      const domain = new URL(url).hostname;
      const prefs = (await chrome.storage.local.get("reflow_domains"))["reflow_domains"] || {};
      prefs[domain] = { interval, ...opts };
      await chrome.storage.local.set({ reflow_domains: prefs });
    } catch (e) {}
  }
}

async function stopRefresh(tabId) {
  await chrome.alarms.clear(aName(tabId));
  await clearTabState(tabId);
  setBadge(tabId, "", false);
  try { await chrome.tabs.sendMessage(tabId, { type: "RF_STOP" }); } catch (e) {}
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("rf_")) return;
  const tabId = parseInt(alarm.name.slice(3));
  const cfg = await getTabState(tabId);
  if (!cfg || !cfg.active) return;
  if (cfg.preserveScroll) { try { await chrome.tabs.sendMessage(tabId, { type: "RF_SAVE_SCROLL" }); } catch (e) {} }
  await new Promise(r => setTimeout(r, 50));
  try {
    if (cfg.hardRefresh) { await chrome.scripting.executeScript({ target: { tabId }, func: () => location.reload() }); }
    else { await chrome.tabs.reload(tabId, { bypassCache: false }); }
  } catch (e) { await stopRefresh(tabId); return; }
  cfg.count += 1;
  let nextDelay = cfg.interval * 1000;
  if (cfg.randomize && cfg.randomRange > 0) { nextDelay += Math.random() * cfg.randomRange * 1000; }
  cfg.nextAt = Date.now() + nextDelay;
  await setTabState(tabId, cfg);
  chrome.alarms.create(aName(tabId), { when: cfg.nextAt });
  setBadge(tabId, formatBadge(cfg.interval), true);
  if (cfg.notify) { chrome.notifications.create({ type: "basic", iconUrl: "icons/icon128.png", title: "Reflow", message: `Refreshed · #${cfg.count}`, silent: true }); }
});

chrome.tabs.onRemoved.addListener(async (tabId) => { await chrome.alarms.clear(aName(tabId)); await clearTabState(tabId); });

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status === "complete") {
    const cfg = await getTabState(tabId);
    if (cfg && cfg.active) {
      setBadge(tabId, formatBadge(cfg.interval), true);
      try { await chrome.tabs.sendMessage(tabId, { type: "RF_START", interval: cfg.interval, nextAt: cfg.nextAt, preserveScroll: cfg.preserveScroll }); } catch (e) {}
      if (cfg.preserveScroll) { setTimeout(async () => { try { await chrome.tabs.sendMessage(tabId, { type: "RF_RESTORE_SCROLL" }); } catch (e) {} }, 300); }
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    switch (msg.type) {
      case "GET_TAB": reply({ config: await getTabState(msg.tabId) }); break;
      case "START": await startRefresh(msg.tabId, msg.interval, msg.opts || {}); reply({ ok: true }); break;
      case "STOP": await stopRefresh(msg.tabId); reply({ ok: true }); break;
      case "GET_ALL": reply({ state: await loadState() }); break;
      case "GET_DOMAIN_PREF": {
        const prefs = (await chrome.storage.local.get("reflow_domains"))["reflow_domains"] || {};
        reply({ pref: prefs[msg.domain] || null }); break;
      }
      default: reply({});
    }
  })();
  return true;
});

chrome.runtime.onStartup.addListener(async () => {
  const s = await loadState();
  for (const [tabId, cfg] of Object.entries(s)) {
    if (cfg.active) { chrome.alarms.create(aName(tabId), { when: Date.now() + Math.max(1000, cfg.nextAt - Date.now()) }); }
  }
});

setInterval(async () => {
  const s = await loadState();
  for (const [tabId, cfg] of Object.entries(s)) {
    if (!cfg.active) continue;
    const left = Math.max(0, Math.round((cfg.nextAt - Date.now()) / 1000));
    setBadge(parseInt(tabId), formatBadge(left), true);
  }
}, 1000);
