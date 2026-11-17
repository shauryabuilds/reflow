// Auto refresh (internally "simple"): the Reflow auto-refresh of one of the user's own tabs, with the
// typing guard, scroll memory, queue guard and an optional page monitor (alert when text appears/disappears).
import { APP } from "../config/app";
import type { Monitor, Plan, SimplePref } from "../shared/types";
import { getLocal, getLocalMany, getSessionTabs, setLocal } from "../shared/storage";
import { shopDomainOf } from "../shared/url";
import { newId } from "../shared/monitor";
import { detectQueue, type QueueHit } from "../detect/queue";
import { withLock } from "./lock";
import { newRuntime } from "./scheduler";
import { bindTab, findText, hasHostPermission, injectGuard, nextLoad, probe, tabExists, unbindTab } from "./tabs";
import { dispatchAlert } from "./alerts";
import type { PendingAlert } from "./process";
import { ensureOffscreen } from "./offscreenHost";
import { getPlan } from "../shared/entitlements";

type Outcome =
  | { kind: "refreshed"; found?: boolean | null; at?: number }
  | { kind: "skipped" } | { kind: "gone" } | { kind: "queue"; hit: QueueHit };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Page monitor decision. "appears" fires on the first sighting; "disappears" needs two misses in a row,
 * so a page that hasn't finished rendering never causes a false alert.
 */
export function textDecision(mode: "appears" | "disappears", found: boolean | null | undefined, misses = 0): { hit: boolean; misses: number } {
  if (found === null || found === undefined) return { hit: false, misses };
  if (mode === "appears") return { hit: found, misses: 0 };
  const m = found ? 0 : misses + 1;
  return { hit: m >= 2, misses: m };
}

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
    ...(pref.watchText?.trim() ? { watchText: pref.watchText.trim().slice(0, 200), watchMode: pref.watchMode === "disappears" ? "disappears" as const : "appears" as const } : {}),
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
  if (await hasHostPermission(url)) {
    await injectGuard(tabId);
    // The text may already be on the page: check right away instead of waiting a full interval.
    if (m.watchText) {
      const found = await findText(tabId, m.watchText, true);
      await finishText(m.id, found, await getPlan());
    }
  }
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
  const loaded = m.watchText ? nextLoad(tabId, 30_000) : null;
  const at = Date.now();
  try { await chrome.tabs.reload(tabId, { bypassCache: m.hardRefresh !== false }); }
  catch { return finish(m.id, { kind: "gone" }, plan); }
  let found: boolean | null = null;
  if (m.watchText && loaded && (await loaded)) {
    await sleep(1500); // let client-side rendering settle
    found = await findText(tabId, m.watchText, true);
  }
  return finish(m.id, { kind: "refreshed", found, at }, plan);
}

/** Applies a page-monitor result; on a hit, stops refreshing and alerts. */
async function finishText(id: string, found: boolean | null, plan: Plan): Promise<void> {
  const alert = await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    const m = s["pw.monitors"][id];
    if (!m?.watchText) return null;
    const rt = s["pw.runtime"][id] ?? newRuntime(Date.now());
    const d = textDecision(m.watchMode ?? "appears", found, rt.textMisses);
    rt.textMisses = d.misses;
    let a: PendingAlert | null = null;
    if (d.hit) {
      m.state = "paused"; m.pausedReason = "matched";
      m.evidence = m.watchMode === "disappears" ? `“${m.watchText}” is gone` : `Found “${m.watchText}”`;
      rt.nextCheckAt = Number.MAX_SAFE_INTEGER;
      a = { event: "text-match", monitorId: id, title: m.title, url: m.url, shopDomain: m.shopDomain,
        evidence: m.evidence, priority: "normal", products: [{ id: m.watchMode ?? "appears", title: m.watchText, url: m.url }] };
    }
    s["pw.monitors"][id] = m;
    s["pw.runtime"][id] = rt;
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
    return a;
  });
  if (alert) await dispatchAlert(alert, plan);
}

/** Stop the alert part but keep refreshing (popup "Keep refreshing" after a match). */
export async function clearTextWatch(tabId: number): Promise<void> {
  const m = await simpleMonitorForTab(tabId);
  if (!m) return;
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    const x = s["pw.monitors"][m.id];
    if (!x) return;
    delete x.watchText; delete x.watchMode; delete x.pausedReason;
    x.state = "unknown"; x.evidence = undefined;
    const rt = s["pw.runtime"][m.id] ?? newRuntime(Date.now());
    rt.nextCheckAt = Date.now() + nextSimpleDelayMs(x);
    rt.textMisses = 0;
    s["pw.monitors"][m.id] = x;
    s["pw.runtime"][m.id] = rt;
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
  });
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
      // The interval runs from the refresh itself, not from after the page check finished.
      rt.nextCheckAt = Math.max(now + 1000, (o.at ?? now) + nextSimpleDelayMs(m));
    }
    s["pw.monitors"][id] = m;
    s["pw.runtime"][id] = rt;
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
    return a;
  });
  if (alert) await dispatchAlert(alert, plan);
  if (o.kind === "refreshed" && o.found !== undefined && o.found !== null) await finishText(id, o.found, plan);
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
    const text = m.state === "queue" ? "Q" : m.pausedReason === "matched" ? "✓" : m.state === "paused" ? "II" : left >= 3600 ? `${Math.floor(left / 3600)}h` : left >= 60 ? `${Math.floor(left / 60)}m` : String(left);
    chrome.action.setBadgeText({ tabId, text }).catch(() => {});
    chrome.action.setBadgeBackgroundColor({ tabId, color: m.state === "queue" ? "#b45309" : m.pausedReason === "matched" ? "#059669" : "#18181b" }).catch(() => {});
  }
}
