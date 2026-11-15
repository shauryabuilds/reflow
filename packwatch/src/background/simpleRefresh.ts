// Simple Refresh: the legacy Reflow auto-refresh of one of the user's own tabs. No stock logic,
// but it keeps the typing guard, scroll memory and the queue guard.
import { APP } from "../config/app";
import type { Monitor, Plan, SimplePref } from "../shared/types";
import { getLocal, getLocalMany, getSessionTabs, setLocal } from "../shared/storage";
import { shopDomainOf } from "../shared/url";
import { newId } from "../shared/monitor";
import { detectQueue, type QueueHit } from "../detect/queue";
import { withLock } from "./lock";
import { newRuntime } from "./scheduler";
import { bindTab, hasHostPermission, injectGuard, probe, tabExists, unbindTab } from "./tabs";
import { dispatchAlert } from "./alerts";
import type { PendingAlert } from "./process";
import { ensureOffscreen } from "./offscreenHost";

type Outcome = { kind: "refreshed" } | { kind: "skipped" } | { kind: "gone" } | { kind: "queue"; hit: QueueHit };

export const DEFAULT_SIMPLE: SimplePref = { intervalSec: 30, randomize: false, hardRefresh: true, keepScroll: true };

export function nextSimpleDelayMs(m: Pick<Monitor, "intervalSec" | "randomize">, rnd = Math.random()): number {
  const base = Math.max(APP.SIMPLE_MIN_SEC, m.intervalSec) * 1000;
  return Math.round(m.randomize ? base * (1 + (rnd * 2 - 1) * 0.25) : base);
}

export async function simpleMonitorForTab(tabId: number): Promise<Monitor | null> {
  const [tabs, monitors] = await Promise.all([getSessionTabs(), getLocal("pw.monitors")]);
  const id = Object.keys(tabs).find((k) => tabs[k] === tabId && monitors[k]?.kind === "simple");
  return id ? monitors[id] : null;
}

export async function startSimple(tabId: number, url: string, title: string, pref: SimplePref): Promise<Monitor> {
  const prev = await simpleMonitorForTab(tabId);
  if (prev) await stopSimple(tabId);
  const now = Date.now();
  const m: Monitor = {
    id: newId(), kind: "simple", url, title: title || shopDomainOf(url), shopDomain: shopDomainOf(url),
    mode: "tab", strategy: "heuristic", inStockRule: { locale: "en" }, alertOn: { restock: false, preorder: false },
    intervalSec: Math.max(APP.SIMPLE_MIN_SEC, Math.round(pref.intervalSec)), priority: "normal",
    state: "unknown", stableState: "unknown", consecutiveErrors: 0, createdAt: now,
    randomize: pref.randomize, hardRefresh: pref.hardRefresh, keepScroll: pref.keepScroll, refreshCount: 0,
  };
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime", "pw.simplePrefs"]);
    s["pw.monitors"][m.id] = m;
    s["pw.runtime"][m.id] = newRuntime(now, nextSimpleDelayMs(m));
    if (m.shopDomain) s["pw.simplePrefs"][m.shopDomain] = pref;
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"], "pw.simplePrefs": s["pw.simplePrefs"], "pw.simpleLast": pref });
  });
  await bindTab(m.id, tabId);
  await chrome.tabs.update(tabId, { autoDiscardable: false }).catch(() => {});
  if (await hasHostPermission(url)) await injectGuard(tabId);
  await ensureOffscreen();
  return m;
}

export async function stopSimple(tabId: number): Promise<void> {
  const m = await simpleMonitorForTab(tabId);
  if (!m) return;
  await deleteSimple(m.id);
  chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  chrome.tabs.update(tabId, { autoDiscardable: true }).catch(() => {});
}

async function deleteSimple(id: string) {
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    delete s["pw.monitors"][id];
    delete s["pw.runtime"][id];
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
  });
  await unbindTab(id);
}

export async function runSimple(m: Monitor, plan: Plan): Promise<void> {
  const tabs = await getSessionTabs();
  let tab = await tabExists(tabs[m.id]);
  if (!tab) {
    // After a browser restart the session map is empty: re-attach to the tab with the same URL.
    const used = new Set(Object.values(tabs));
    tab = (await chrome.tabs.query({})).find((x) => x.url === m.url && x.id !== undefined && !used.has(x.id)) ?? null;
    if (tab?.id === undefined) return finish(m.id, { kind: "gone" }, plan);
    await bindTab(m.id, tab.id);
  }
  const tabId = tab.id!;
  if (await hasHostPermission(m.url)) {
    await injectGuard(tabId);
    const p = await probe(tabId, { typingMs: APP.TYPING_GUARD_MS, saveScroll: m.keepScroll !== false, html: 300_000 });
    if (p?.busy) return finish(m.id, { kind: "skipped" }, plan);
    const q = p ? detectQueue(p.html, p.url) : null;
    if (q) return finish(m.id, { kind: "queue", hit: q }, plan);
  }
  try { await chrome.tabs.reload(tabId, { bypassCache: m.hardRefresh !== false }); }
  catch { return finish(m.id, { kind: "gone" }, plan); }
  return finish(m.id, { kind: "refreshed" }, plan);
}

async function finish(id: string, o: Outcome, plan: Plan) {
  if (o.kind === "gone") return deleteSimple(id);
  const alert = await withLock(async () => {
    const now = Date.now();
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    const m = s["pw.monitors"][id];
    if (!m) return null;
    const rt = s["pw.runtime"][id] ?? newRuntime(now);
    delete rt.inFlightSince;
    let a: PendingAlert | null = null;
    if (o.kind === "skipped") {
      rt.nextCheckAt = now + 3000;
      rt.skippedTyping = (rt.skippedTyping ?? 0) + 1;
    } else if (o.kind === "queue") {
      m.state = "queue"; m.pausedReason = "queue"; m.evidence = o.hit.evidence;
      rt.nextCheckAt = Number.MAX_SAFE_INTEGER;
      a = { event: "queue", monitorId: id, title: m.title, url: m.url, shopDomain: m.shopDomain, evidence: o.hit.evidence, priority: "normal" };
    } else {
      m.refreshCount = (m.refreshCount ?? 0) + 1;
      m.lastCheckedAt = now;
      rt.lastSuccessAt = now;
      rt.nextCheckAt = now + nextSimpleDelayMs(m);
    }
    s["pw.monitors"][id] = m;
    s["pw.runtime"][id] = rt;
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
    return a;
  });
  if (alert) await dispatchAlert(alert, plan);
}

/** Per-tab badge countdown on Simple Refresh tabs (the global badge is for monitors). */
export async function simpleCountdowns(monitors: Record<string, Monitor>, runtime: Record<string, { nextCheckAt: number }>, now: number) {
  const simple = Object.values(monitors).filter((m) => m.kind === "simple");
  if (!simple.length) return;
  const tabs = await getSessionTabs();
  for (const m of simple) {
    const tabId = tabs[m.id];
    if (tabId === undefined) continue;
    const left = Math.max(0, Math.ceil(((runtime[m.id]?.nextCheckAt ?? now) - now) / 1000));
    const text = m.state === "queue" ? "Q" : m.state === "paused" ? "II" : left >= 3600 ? `${Math.floor(left / 3600)}h` : left >= 60 ? `${Math.floor(left / 60)}m` : String(left);
    chrome.action.setBadgeText({ tabId, text }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: m.state === "queue" ? "#b45309" : "#18181b" }).catch(() => {});
  }
}
