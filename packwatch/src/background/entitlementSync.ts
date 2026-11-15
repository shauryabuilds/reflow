// Keeps the cached plan in sync with ExtensionPay, and handles upgrades / downgrades.
import ExtPay from "extpay";
import { APP } from "../config/app";
import { TRIAL_DAYS } from "../config/plans";
import type { EntitlementCache, Monitor, Plan } from "../shared/types";
import { getPlan, isPaidLike } from "../shared/entitlements";
import { getLocal, getLocalMany, setLocal } from "../shared/storage";
import type { Reply } from "../shared/messages";
import { withLock } from "./lock";
import { syncOffscreen } from "./engine";

interface ExtPayUser { paid: boolean; paidAt: Date | null; trialStartedAt: Date | null; email: string | null }

let extpay: ReturnType<typeof ExtPay> | null = null;

export function planFromUser(u: ExtPayUser | null, now: number): Plan {
  if (!u) return "free";
  if (u.paid) return "pro";
  const started = u.trialStartedAt ? new Date(u.trialStartedAt).getTime() : 0;
  if (started && now - started < TRIAL_DAYS * 86_400_000) return "trial";
  return "free";
}

/** Downgrade: keep everything, pause monitors beyond the Free limit (oldest stay active), ask the user to choose. */
export function applyDowngrade(monitors: Record<string, Monitor>): { monitors: Record<string, Monitor>; paused: number } {
  const out = { ...monitors };
  const active = Object.values(out).filter((m) => m.kind !== "simple" && m.state !== "paused").sort((a, b) => a.createdAt - b.createdAt);
  let paused = 0;
  for (const m of active.slice(APP.FREE_MONITOR_LIMIT)) {
    out[m.id] = { ...m, state: "paused", pausedReason: "plan" };
    paused++;
  }
  return { monitors: out, paused };
}

/** Upgrade: monitors paused only because of the plan come back automatically. */
export function applyUpgrade(monitors: Record<string, Monitor>): Record<string, Monitor> {
  const out = { ...monitors };
  for (const m of Object.values(out)) {
    if (m.state === "paused" && m.pausedReason === "plan") {
      out[m.id] = { ...m, state: m.stableState === "unknown" ? "unknown" : m.stableState, pausedReason: undefined };
    }
  }
  return out;
}

export function chooseActiveMonitors(monitors: Record<string, Monitor>, keep: string[]): Record<string, Monitor> {
  const ids = new Set(keep.slice(0, APP.FREE_MONITOR_LIMIT));
  const out = { ...monitors };
  for (const m of Object.values(out)) {
    if (m.kind === "simple") continue;
    if (ids.has(m.id) && m.state === "paused" && m.pausedReason !== "user") {
      out[m.id] = { ...m, state: m.stableState === "unknown" ? "unknown" : m.stableState, pausedReason: undefined };
    } else if (!ids.has(m.id) && m.state !== "paused") {
      out[m.id] = { ...m, state: "paused", pausedReason: "plan" };
    }
  }
  return out;
}

async function onPlanChange(before: Plan, after: Plan) {
  if (isPaidLike(before) === isPaidLike(after)) return;
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.ui"]);
    if (!isPaidLike(after)) {
      const r = applyDowngrade(s["pw.monitors"]);
      await setLocal({ "pw.monitors": r.monitors, "pw.ui": { ...s["pw.ui"], needsChooseActive: r.paused > 0 } });
    } else {
      await setLocal({ "pw.monitors": applyUpgrade(s["pw.monitors"]), "pw.ui": { ...s["pw.ui"], needsChooseActive: false } });
    }
  });
  await syncOffscreen();
}

async function save(next: Partial<EntitlementCache>): Promise<Plan> {
  const before = await getPlan();
  const cur = await getLocal("pw.entitlement");
  await setLocal({ "pw.entitlement": { ...cur, ...next } });
  const after = await getPlan();
  await onPlanChange(before, after);
  return after;
}

async function applyUser(u: ExtPayUser): Promise<Plan> {
  const now = Date.now();
  return save({
    plan: planFromUser(u, now), checkedAt: now,
    trialStartedAt: u.trialStartedAt ? new Date(u.trialStartedAt).getTime() : undefined,
    paidAt: u.paidAt ? new Date(u.paidAt).getTime() : undefined,
    email: u.email,
  });
}

/** Must run synchronously at service-worker start so ExtPay can register its listeners. */
export function initEntitlements() {
  try {
    extpay = ExtPay(APP.EXTPAY_ID);
    extpay.startBackground();
    extpay.onPaid.addListener(async (u) => {
      const c = await getLocal("pw.counters");
      await setLocal({ "pw.counters": { ...c, proConversions: c.proConversions + 1 } });
      await applyUser(u as unknown as ExtPayUser);
    });
    extpay.onTrialStarted.addListener((u) => { void applyUser(u as unknown as ExtPayUser); });
  } catch { extpay = null; }
}

/** Startup, every 6 h, and on demand. On network failure the cached plan stands (trial expiry still applies). */
export async function refreshEntitlement(): Promise<Plan> {
  try {
    if (!extpay) throw new Error("ExtPay unavailable");
    const u = (await extpay.getUser()) as unknown as ExtPayUser;
    return await applyUser(u);
  } catch {
    const cur = await getLocal("pw.entitlement");
    if (cur.plan === "trial" && cur.trialStartedAt && Date.now() - cur.trialStartedAt >= TRIAL_DAYS * 86_400_000) {
      return save({ plan: "free" });
    }
    return getPlan();
  }
}

export async function setDevPlan(plan: Plan | null): Promise<Reply> {
  if (!__PW_DEV__) return { ok: false, error: "Dev builds only" };
  await save({ devOverride: plan ?? undefined });
  return { ok: true, data: await getPlan() };
}

export async function chooseActive(ids: string[]): Promise<Reply> {
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.ui", "pw.runtime"]);
    const monitors = chooseActiveMonitors(s["pw.monitors"], ids);
    for (const id of ids) if (s["pw.runtime"][id]) s["pw.runtime"][id] = { ...s["pw.runtime"][id], nextCheckAt: Date.now() + 1000, lastSuccessAt: Date.now() };
    await setLocal({ "pw.monitors": monitors, "pw.runtime": s["pw.runtime"], "pw.ui": { ...s["pw.ui"], needsChooseActive: false } });
  });
  await syncOffscreen();
  return { ok: true };
}
