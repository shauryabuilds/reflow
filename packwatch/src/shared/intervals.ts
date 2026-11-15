// How often a monitor is checked, and when it counts as stale.
import { APP, MIN_INTERVAL } from "../config/app";
import type { Monitor, MonitorRuntime, Plan } from "./types";
import { can } from "./entitlements";
import { inBoostWindow } from "./time";

export function planMinInterval(plan: Plan, mode: Monitor["mode"]): number {
  return MIN_INTERVAL[plan === "free" ? "free" : "pro"][mode];
}

export function baseIntervalSec(m: Monitor, plan: Plan, now: number, siteMinSec = 0): number {
  if (m.kind === "simple") return Math.max(m.intervalSec, APP.SIMPLE_MIN_SEC);
  let base = m.intervalSec;
  if (m.boost && can(plan, "boost")) base = inBoostWindow(m.boost, now) ? m.boost.intervalSec : m.boost.outsideIntervalSec;
  return Math.max(base, planMinInterval(plan, m.mode), siteMinSec);
}

/** Doubles per consecutive error, capped at 15 min (or the base interval if that is longer). */
export function effectiveIntervalSec(m: Monitor, plan: Plan, now: number, siteMinSec = 0, errors = m.consecutiveErrors): number {
  const e = baseIntervalSec(m, plan, now, siteMinSec);
  if (errors <= 0) return e;
  return Math.min(e * 2 ** errors, Math.max(APP.MAX_BACKOFF_SEC, e));
}

export const isActiveWatch = (m: Monitor) => m.kind !== "simple" && m.state !== "paused" && m.state !== "queue";

/** No successful check for STALE_FACTOR × the interval (ignoring backoff). */
export function isStale(m: Monitor, rt: MonitorRuntime | undefined, plan: Plan, now: number, siteMinSec = 0): boolean {
  if (!isActiveWatch(m)) return false;
  const last = rt?.lastSuccessAt ?? m.createdAt;
  const limit = APP.STALE_FACTOR * baseIntervalSec(m, plan, now, siteMinSec) * 1000 + 15_000;
  return now - last > limit;
}

/** ±10% jitter so monitors on one domain drift apart instead of firing together. */
export function jitterMs(intervalSec: number, rnd = Math.random()): number {
  return Math.round((rnd * 2 - 1) * intervalSec * 100);
}
