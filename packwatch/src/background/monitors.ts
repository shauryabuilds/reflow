// Monitor CRUD. The service worker is the only writer of monitors.
import { APP } from "../config/app";
import type { Draft, Monitor, Plan } from "../shared/types";
import { can, getPlan } from "../shared/entitlements";
import { getLocal, getLocalMany, removeSeen, setLocal, setSeen } from "../shared/storage";
import { planMinInterval } from "../shared/intervals";
import { guessRegion, shopDomainOf } from "../shared/url";
import { detectConfigOf } from "../shared/monitor";
import { sendOffscreen, type Reply } from "../shared/messages";
import { presetFor } from "../shared/data";
import { withLock } from "./lock";
import { newRuntime } from "./scheduler";
import { ensureOffscreen } from "./offscreenHost";
import { hasHostPermission } from "./tabs";
import { closeWatcherTab } from "./watcherTabs";
import { syncOffscreen } from "./engine";

export const activeWatchCount = (monitors: Record<string, Monitor>) =>
  Object.values(monitors).filter((m) => m.kind !== "simple" && m.state !== "paused").length;

export function monitorFromDraft(d: Draft, plan: Plan): Monitor {
  const shopDomain = shopDomainOf(d.url);
  const preset = presetFor(shopDomain);
  return {
    id: d.id, kind: d.kind, url: d.url, title: d.title.slice(0, 200) || shopDomain, shopDomain,
    region: d.region ?? preset?.region ?? guessRegion(shopDomain),
    game: d.game, productType: d.productType, mode: "fetch", strategy: d.strategy, selector: d.selector,
    inStockRule: preset?.inStockRule ?? { locale: "en" },
    alertOn: { restock: d.alertOn.restock, preorder: d.alertOn.preorder, ...(d.alertOn.priceAtOrBelow && can(plan, "priceAlerts") ? { priceAtOrBelow: d.alertOn.priceAtOrBelow } : {}) },
    keywords: d.keywords, excludeKeywords: d.excludeKeywords, variantId: d.variantId,
    // Shopify .js prices carry no currency: fall back to the price target's currency.
    currencyHint: d.currencyHint ?? d.alertOn.priceAtOrBelow?.currency,
    intervalSec: Math.max(d.intervalSec, planMinInterval(plan, "fetch")), priority: "normal",
    state: "unknown", stableState: "unknown", consecutiveErrors: 0, createdAt: d.createdAt || Date.now(),
  };
}

/** Idempotent: the draft id becomes the monitor id, so a retried create returns the same monitor. */
export async function createMonitor(draft: Draft): Promise<Reply<Monitor>> {
  const plan = await getPlan();
  const existing = await getLocal("pw.monitors");
  if (existing[draft.id]) return { ok: true, data: existing[draft.id] };
  const dup = Object.values(existing).find((m) => m.kind === draft.kind && m.url === draft.url);
  if (dup) return { ok: false, code: "duplicate", error: "Already watching this page" };
  if (!can(plan, "unlimitedMonitors") && activeWatchCount(existing) >= APP.FREE_MONITOR_LIMIT) {
    return { ok: false, code: "limit", error: `Free plan watches up to ${APP.FREE_MONITOR_LIMIT} pages` };
  }
  if (!(await hasHostPermission(draft.url))) return { ok: false, code: "permission", error: "Permission needed" };

  const m = monitorFromDraft(draft, plan);
  // Probe once in fetch mode (cheapest). If it can't read stock, fall back to a watcher tab.
  await ensureOffscreen();
  const probe = await sendOffscreen({ type: "pw:check", cfg: detectConfigOf(m) }).catch(() => null);
  const readable = !!probe?.ok && probe.state !== "queue" && (m.kind === "listing" ? (probe.products?.length ?? 0) > 0 : probe.state !== "unknown");
  const now = Date.now();
  const rt = newRuntime(now, m.intervalSec * 1000);
  if (readable && probe) {
    m.mode = "fetch";
    if (m.kind === "product" && probe.state !== "queue") {
      m.state = probe.state; m.stableState = probe.state;
      if (probe.price) { m.lastPrice = probe.price; m.currencyHint ??= probe.price.currency; }
    } else m.state = "in";
    m.evidence = probe.evidence;
    m.lastCheckedAt = now;
    rt.lastSuccessAt = now;
  } else {
    m.mode = "tab";
    m.intervalSec = Math.max(m.intervalSec, planMinInterval(plan, "tab"));
    rt.nextCheckAt = now + 1000; // first tab check right away
    m.evidence = probe?.state === "queue" ? `${probe.evidence}: using a watcher tab` : "Page needs a browser tab to render";
  }
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime", "pw.counters", "pw.pending"]);
    s["pw.monitors"][m.id] = m;
    if (m.kind === "listing" && readable && probe?.products) rt.listingSeeded = true;
    s["pw.runtime"][m.id] = rt;
    const g = m.game ?? "other";
    s["pw.counters"].monitorsByGame[g] = (s["pw.counters"].monitorsByGame[g] ?? 0) + 1;
    delete s["pw.pending"][draft.id];
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"], "pw.counters": s["pw.counters"], "pw.pending": s["pw.pending"] });
  });
  if (m.kind === "listing" && readable && probe?.products) {
    await setSeen(m.id, Object.fromEntries(probe.products.map((p) => [p.id, p.title])));
  }
  await syncOffscreen();
  return { ok: true, data: m };
}

const EDITABLE: Array<keyof Monitor> = [
  "title", "game", "productType", "region", "intervalSec", "alertOn", "keywords", "excludeKeywords", "sellerMustContain",
  "priceGuard", "priority", "quietHours", "mode", "strategy", "selector", "inStockRule", "variantId", "boost",
  "randomize", "hardRefresh", "keepScroll",
];

export async function updateMonitor(id: string, patch: Partial<Monitor>): Promise<Reply<Monitor>> {
  const plan = await getPlan();
  let closeTab = false;
  const r = await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    const m = s["pw.monitors"][id];
    if (!m) return null;
    const next: Monitor = { ...m };
    for (const k of EDITABLE) if (k in patch) (next as unknown as Record<string, unknown>)[k] = patch[k];
    if (m.kind !== "simple") next.intervalSec = Math.max(Number(next.intervalSec) || 60, planMinInterval(plan, next.mode));
    if (!can(plan, "priceAlerts")) { delete next.alertOn.priceAtOrBelow; delete next.sellerMustContain; next.priceGuard = false; }
    if (!can(plan, "priority")) next.priority = "normal";
    if (!can(plan, "quietHours")) delete next.quietHours;
    closeTab = m.mode === "tab" && next.mode === "fetch";
    s["pw.monitors"][id] = next;
    s["pw.runtime"][id] = { ...(s["pw.runtime"][id] ?? newRuntime(Date.now())), nextCheckAt: Date.now() + 1000 };
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
    return next;
  });
  if (closeTab) await closeWatcherTab(id);
  return r ? { ok: true, data: r } : { ok: false, error: "Not found" };
}

export async function deleteMonitor(id: string): Promise<Reply> {
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    delete s["pw.monitors"][id];
    delete s["pw.runtime"][id];
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
  });
  await removeSeen(id);
  await closeWatcherTab(id);
  await syncOffscreen();
  return { ok: true };
}

export async function setPaused(id: string, paused: boolean): Promise<Reply<Monitor>> {
  const plan = await getPlan();
  const r = await withLock(async (): Promise<Reply<Monitor>> => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    const m = s["pw.monitors"][id];
    if (!m) return { ok: false, error: "Not found" };
    if (paused) {
      m.state = "paused"; m.pausedReason = "user";
    } else {
      const others = { ...s["pw.monitors"] };
      delete others[id];
      if (m.kind !== "simple" && !can(plan, "unlimitedMonitors") && activeWatchCount(others) >= APP.FREE_MONITOR_LIMIT) {
        return { ok: false, code: "limit", error: `Free plan watches up to ${APP.FREE_MONITOR_LIMIT} pages` };
      }
      m.state = m.stableState === "unknown" ? "unknown" : m.stableState;
      delete m.pausedReason;
      m.consecutiveErrors = 0;
    }
    s["pw.monitors"][id] = m;
    const rt = s["pw.runtime"][id] ?? newRuntime(Date.now());
    delete rt.inFlightSince;
    delete rt.stalledNotifiedAt;
    s["pw.runtime"][id] = { ...rt, nextCheckAt: Date.now() + 1000, lastSuccessAt: paused ? rt.lastSuccessAt : Date.now() };
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
    return { ok: true, data: m };
  });
  if (r.ok && paused) await closeWatcherTab(id);
  await syncOffscreen();
  return r;
}

export async function checkNow(id: string): Promise<Reply> {
  await withLock(async () => {
    const rt = await getLocal("pw.runtime");
    if (rt[id]) { rt[id] = { ...rt[id], nextCheckAt: Date.now() }; await setLocal({ "pw.runtime": rt }); }
  });
  return { ok: true };
}
