// Service worker entry: wires Chrome events to the engine. No state is kept here.
import { runMigrations } from "../shared/migrations";
import { getLocal, getSessionTabs, setLocal } from "../shared/storage";
import { getPlan } from "../shared/entitlements";
import { shopDomainOf } from "../shared/url";
import type { BgMsg, Reply } from "../shared/messages";
import { APP } from "../config/app";
import { restore, tick, watchdog, syncOffscreen } from "./engine";
import { checkNow, createMonitor, deleteMonitor, setPaused, updateMonitor } from "./monitors";
import { dispatchAlert, focusOrOpen } from "./alerts";
import { DEFAULT_SIMPLE, simpleMonitorForTab, startSimple, stopSimple } from "./simpleRefresh";
import { unbindTab, injectGuard, hasHostPermission } from "./tabs";
import { onPicked, startPicker, finalizePendingFor } from "./picker";
import { initEntitlements, refreshEntitlement, setDevPlan, chooseActive } from "./entitlementSync";
import { importPack, setBoost } from "./packsImport";
import { withLock } from "./lock";

const WATCHDOG = "pw-watchdog";
const ENTITLEMENT = "pw-entitlement";

async function boot(reason: string, previousVersion?: string) {
  await runMigrations();
  if (reason === "update" && previousVersion && /^[12]\./.test(previousVersion)) {
    const ui = await getLocal("pw.ui");
    await setLocal({ "pw.ui": { ...ui, welcomePending: true } });
  }
  if (APP.UNINSTALL_URL) chrome.runtime.setUninstallURL(APP.UNINSTALL_URL).catch(() => {});
  await chrome.alarms.create(WATCHDOG, { periodInMinutes: 1 });
  await chrome.alarms.create(ENTITLEMENT, { periodInMinutes: 360 });
  await refreshEntitlement().catch(() => {});
  await restore();
}

chrome.runtime.onInstalled.addListener((d) => { void boot(d.reason, d.previousVersion); });
chrome.runtime.onStartup.addListener(() => { void boot("startup"); });
initEntitlements();
// Every worker wake: make sure the ticker exists if anything is being watched.
void syncOffscreen().catch(() => {});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === WATCHDOG) void watchdog().then(tick);
  if (a.name === ENTITLEMENT) void refreshEntitlement();
});

chrome.notifications.onClicked.addListener(async (nid) => {
  if (!nid.startsWith("pw:")) return;
  chrome.notifications.clear(nid);
  const id = nid.slice(3);
  const rec = await withLock(async () => {
    const alerts = await getLocal("pw.alerts");
    const r = alerts.find((x) => x.id === id);
    if (r) { r.clickedAt = Date.now(); await setLocal({ "pw.alerts": alerts }); }
    return r;
  });
  if (!rec) return;
  if (rec.event === "stall" || rec.event === "test") await chrome.tabs.create({ url: chrome.runtime.getURL("src/sidepanel/index.html") });
  else await focusOrOpen(rec.url);
});

chrome.tabs.onRemoved.addListener(async (tabId, info) => {
  const tabs = await getSessionTabs();
  const ids = Object.keys(tabs).filter((k) => tabs[k] === tabId);
  if (!ids.length) return;
  const monitors = await getLocal("pw.monitors");
  for (const id of ids) {
    const m = monitors[id];
    // Closing a Simple Refresh tab stops it (as in Reflow), unless the whole browser is closing.
    if (m?.kind === "simple" && !info.isWindowClosing) await stopSimple(tabId);
    else await unbindTab(id); // watcher tabs are reopened at the next check
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== "complete") return;
  const tabs = await getSessionTabs();
  const id = Object.keys(tabs).find((k) => tabs[k] === tabId);
  if (!id) return;
  const t = await chrome.tabs.get(tabId).catch(() => null);
  if (t?.url && (await hasHostPermission(t.url))) await injectGuard(tabId);
});

chrome.permissions.onAdded.addListener((p) => { void finalizePendingFor(p.origins ?? []); });

chrome.commands.onCommand.addListener(async (cmd, tab) => {
  if (cmd !== "toggle-refresh") return;
  const active = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (active?.id === undefined || !active.url) return;
  if (await simpleMonitorForTab(active.id)) return stopSimple(active.id);
  const [prefs, last] = await Promise.all([getLocal("pw.simplePrefs"), getLocal("pw.simpleLast")]);
  await startSimple(active.id, active.url, active.title ?? "", prefs[shopDomainOf(active.url)] ?? last ?? DEFAULT_SIMPLE);
});

async function handle(msg: BgMsg): Promise<Reply<unknown>> {
  switch (msg.type) {
    case "pw:tick": await tick(); return { ok: true };
    case "pw:createMonitor": return createMonitor(msg.draft);
    case "pw:updateMonitor": return updateMonitor(msg.id, msg.patch);
    case "pw:deleteMonitor": return deleteMonitor(msg.id);
    case "pw:setPaused": return setPaused(msg.id, msg.paused);
    case "pw:checkNow": return checkNow(msg.id);
    case "pw:testAlert": {
      const plan = await getPlan();
      const rec = await dispatchAlert({ event: "test", monitorId: "test", title: "Packwatch", url: chrome.runtime.getURL("src/sidepanel/index.html"), shopDomain: "example-shop.com", evidence: "Test", priority: "normal", price: { amount: 59.99, currency: "USD" }, latencyMs: 12_000 }, plan);
      return { ok: true, data: rec };
    }
    case "pw:simpleStart": {
      const tab = await chrome.tabs.get(msg.tabId);
      return { ok: true, data: await startSimple(msg.tabId, msg.url, tab.title ?? "", msg.pref) };
    }
    case "pw:simpleStop": await stopSimple(msg.tabId); return { ok: true };
    case "pw:startPicker": return startPicker(msg.tabId, msg.draft);
    case "pw:picked": return onPicked(msg.draftId, msg.selector, msg.text);
    case "pw:refreshPlan": return { ok: true, data: await refreshEntitlement() };
    case "pw:devPlan": return setDevPlan(msg.plan);
    case "pw:chooseActive": return chooseActive(msg.ids);
    case "pw:importPack": return importPack(msg.pack);
    case "pw:setBoost": return setBoost(msg.shopDomain, msg.boost);
    case "pw:alertClicked": return { ok: true };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== "bg") return false;
  handle(msg as BgMsg).then(reply, (e) => reply({ ok: false, error: String((e as Error)?.message ?? e) }));
  return true;
});
