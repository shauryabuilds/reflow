const $ = (s) => document.querySelector(s);
const DEFAULTS = { hardRefresh: true, preserveScroll: true, smartPause: true, showTimer: true, randomize: false, sound: true };

let tab = null, host = "", cfg = null, all = {}, pref = null, selected = null, timer = null;
const opts = { ...DEFAULTS };

const el = {
  dot: $("#dot"), url: $("#url"), count: $("#count"), alert: $("#alert"), alertTitle: $("#alertTitle"),
  alertWhen: $("#alertWhen"), resume: $("#resume"), live: $("#live"), time: $("#time"), every: $("#every"),
  refreshes: $("#refreshes"), watching: $("#watching"), fill: $("#fill"), setup: $("#setup"),
  presets: $("#presets"), cVal: $("#cVal"), cUnit: $("#cUnit"), wText: $("#wText"), wMode: $("#wMode"),
  act: $("#act"), list: $("#list"), ftr: $("#ftr"), kbd: $("#kbd"),
};

const msg = (m) => chrome.runtime.sendMessage(m);
const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (s) => s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}` : s >= 60 ? `${Math.floor(s / 60)}:${pad(s % 60)}` : String(s);
const fmtEvery = (s) => s >= 3600 ? +(s / 3600).toFixed(1) + "h" : s >= 60 ? +(s / 60).toFixed(1) + "m" : s + "s";
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };
const restricted = (u) => !u || /^(chrome|edge|about|chrome-extension|devtools|view-source):/.test(u) || /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(u);

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  host = hostOf(tab.url);
  try { const u = new URL(tab.url); el.url.textContent = u.hostname + (u.pathname !== "/" ? u.pathname : ""); }
  catch { el.url.textContent = tab.title || "—"; }

  chrome.commands.getAll((cmds) => {
    const c = cmds.find((x) => x.name === "toggle-refresh");
    if (c && c.shortcut) el.kbd.textContent = c.shortcut; else el.kbd.textContent = "Set shortcut";
  });

  const r = await msg({ type: "GET", tabId: tab.id, host });
  cfg = r.config; all = r.all || {}; pref = r.pref;
  applyPref(pref);
  if (r.alert) showAlert(r.alert);
  render();
  renderCount();
}

function applyPref(p) {
  if (!p) { syncOpts(); return; }
  for (const k of Object.keys(DEFAULTS)) if (p[k] !== undefined) opts[k] = !!p[k];
  if (p.watchText) { el.wText.value = p.watchText; el.wMode.value = p.watchMode || "appears"; }
  const s = p.interval;
  const btn = el.presets.querySelector(`[data-s="${s}"]`);
  if (btn) btn.classList.add("sel");
  else if (s) {
    const unit = s % 3600 === 0 ? 3600 : s % 60 === 0 ? 60 : 1;
    el.cVal.value = s / unit; el.cUnit.value = String(unit);
  }
  selected = s || null;
  if (p.remembered && host) el.ftr.textContent = "Remembered for " + host;
  syncOpts();
}

function syncOpts() {
  document.querySelectorAll(".opt").forEach((o) => o.classList.toggle("on", !!opts[o.dataset.k]));
  document.querySelector('[data-k="sound"]').classList.toggle("hide", !el.wText.value.trim());
  el.act.disabled = !cfg && !(selected || customSeconds());
}

function showAlert(a) {
  el.alertTitle.textContent = a.mode === "appears" ? `Found “${a.text}”` : `“${a.text}” disappeared`;
  el.alertWhen.textContent = clock(a.at) + " · stopped refreshing";
  el.alert.classList.remove("hide");
}

function render() {
  const on = !!cfg;
  el.dot.classList.toggle("on", on);
  el.live.classList.toggle("hide", !on);
  el.setup.classList.toggle("hide", on);
  el.act.textContent = on ? "Stop" : "Start";
  el.act.classList.toggle("stop", on);
  el.act.disabled = !on && !(selected || customSeconds());
  clearInterval(timer);
  if (on) {
    el.alert.classList.add("hide");
    el.every.textContent = fmtEvery(cfg.interval) + (cfg.randomize ? " ±25%" : "");
    el.watching.classList.toggle("hide", !cfg.watch);
    if (cfg.watch) {
      el.watching.innerHTML = "";
      el.watching.append(`Alert when `, Object.assign(document.createElement("em"), { textContent: `“${cfg.watch.text}”` }), ` ${cfg.watch.mode}`);
    }
    el.ftr.textContent = "Since " + clock(cfg.startedAt);
    tick(); timer = setInterval(tick, 250);
  } else if (restricted(tab.url)) {
    el.ftr.textContent = "Alerts & page timer can't run on this page";
  }
}

function tick() {
  if (!cfg) return;
  el.refreshes.textContent = cfg.count || 0;
  if (cfg.paused) {
    el.time.textContent = "paused · typing";
    el.time.classList.add("paused");
    el.fill.style.width = "100%";
  } else {
    const left = Math.max(0, Math.ceil((cfg.nextAt - Date.now()) / 1000));
    el.time.classList.remove("paused");
    el.time.textContent = fmtTime(left);
    el.fill.style.width = Math.min(100, (1 - left / cfg.interval) * 100) + "%";
  }
  if (!el.list.classList.contains("hide")) tickList();
}

// ---- all running tabs ----
function renderCount() {
  const n = Object.keys(all).length;
  el.count.classList.toggle("vis", n > 0);
  el.count.textContent = n + " running";
  if (n === 0) el.list.classList.add("hide");
  if (!el.list.classList.contains("hide")) renderList();
}

async function renderList() {
  const ids = Object.keys(all).map(Number);
  const tabsInfo = await chrome.tabs.query({});
  el.list.innerHTML = "";
  for (const id of ids) {
    const t = tabsInfo.find((x) => x.id === id);
    const row = document.createElement("div");
    row.className = "item"; row.dataset.id = id;
    const img = document.createElement("img");
    img.src = t?.favIconUrl && /^https?:|^data:/.test(t.favIconUrl) ? t.favIconUrl : "icons/icon16.png";
    img.onerror = () => { img.src = "icons/icon16.png"; };
    const h = Object.assign(document.createElement("span"), { className: "h", textContent: hostOf(t?.url || all[id].url) || t?.title || "tab" });
    if (id === tab.id) h.textContent += " (this tab)";
    const tm = Object.assign(document.createElement("span"), { className: "t" });
    const x = Object.assign(document.createElement("button"), { className: "x", textContent: "×", title: "Stop" });
    x.onclick = (e) => { e.stopPropagation(); msg({ type: "STOP", tabId: id }); };
    row.onclick = () => { if (t) { chrome.tabs.update(id, { active: true }); chrome.windows.update(t.windowId, { focused: true }); window.close(); } };
    row.append(img, h, tm, x);
    el.list.append(row);
  }
  tickList();
}

function tickList() {
  el.list.querySelectorAll(".item").forEach((row) => {
    const c = all[row.dataset.id];
    if (c) row.querySelector(".t").textContent = c.paused ? "paused" : fmtTime(Math.max(0, Math.ceil((c.nextAt - Date.now()) / 1000)));
  });
}

el.count.onclick = () => {
  const show = el.list.classList.contains("hide");
  el.list.classList.toggle("hide", !show);
  if (show) renderList();
};

// Live updates from the background (refresh count, next time, pause, stop).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session" || !tab) return;
  if (changes.tabs) {
    all = changes.tabs.newValue || {};
    const was = !!cfg;
    cfg = all[tab.id] || null;
    if (was !== !!cfg) render();
    renderCount();
  }
  if (changes.alerts) {
    const a = (changes.alerts.newValue || {})[tab.id];
    if (a) { showAlert(a); }
  }
});

// ---- controls ----
function customSeconds() {
  const v = parseFloat(el.cVal.value);
  return v > 0 ? Math.max(1, Math.round(v * +el.cUnit.value)) : null;
}

function start(seconds) {
  if (!seconds) return;
  const o = { ...opts, watchText: el.wText.value.trim(), watchMode: el.wMode.value };
  cfg = { interval: seconds, startedAt: Date.now(), nextAt: Date.now() + seconds * 1000, count: 0, ...o,
    watch: o.watchText ? { text: o.watchText, mode: o.watchMode } : null };
  render();
  msg({ type: "START", tabId: tab.id, interval: seconds, opts: o });
}

el.presets.onclick = (e) => {
  const b = e.target.closest(".p");
  if (!b) return;
  el.presets.querySelectorAll(".p").forEach((x) => x.classList.toggle("sel", x === b));
  el.cVal.value = "";
  selected = +b.dataset.s;
  start(selected);
};
const onCustom = () => {
  el.presets.querySelectorAll(".p").forEach((x) => x.classList.remove("sel"));
  selected = customSeconds();
  syncOpts();
};
el.cVal.oninput = onCustom;
el.cUnit.onchange = onCustom;
el.cVal.onkeydown = (e) => { if (e.key === "Enter") start(customSeconds()); };
el.wText.oninput = syncOpts;
el.wText.onkeydown = (e) => { if (e.key === "Enter") start(selected || customSeconds()); };
document.querySelectorAll(".opt").forEach((o) => {
  o.onclick = () => { opts[o.dataset.k] = !opts[o.dataset.k]; syncOpts(); };
});
el.act.onclick = () => {
  if (cfg) { msg({ type: "STOP", tabId: tab.id }); cfg = null; render(); }
  else start(selected || customSeconds());
};
el.resume.onclick = () => { el.alert.classList.add("hide"); msg({ type: "DISMISS", tabId: tab.id }); };
el.kbd.onclick = () => chrome.tabs.create({ url: "chrome://extensions/shortcuts" });

init();
