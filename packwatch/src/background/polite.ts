// Polite mode: per-domain caps that keep users from getting blocked. Pure functions over persisted state.
import { APP } from "../config/app";
import type { DomainState } from "../shared/types";

export interface DomainRule { minGapSec: number; maxPerHour: number }
export type Gate = { ok: true } | { ok: false; retryAt: number; reason: "in-flight" | "backoff" | "gap" | "hourly" };

const HOUR = 3_600_000;

export function freshDomain(now: number): DomainState {
  return { lastRequestAt: 0, windowStart: now, windowCount: 0 };
}

export function canRequest(ds: DomainState | undefined, rule: DomainRule, now: number): Gate {
  if (!ds) return { ok: true };
  if (ds.inFlightSince !== undefined && now - ds.inFlightSince < APP.IN_FLIGHT_TIMEOUT_MS) return { ok: false, retryAt: now + 1000, reason: "in-flight" };
  if (ds.backoffUntil && ds.backoffUntil > now) return { ok: false, retryAt: ds.backoffUntil, reason: "backoff" };
  const gapAt = ds.lastRequestAt + rule.minGapSec * 1000;
  if (gapAt > now) return { ok: false, retryAt: gapAt, reason: "gap" };
  if (now - ds.windowStart < HOUR && ds.windowCount >= rule.maxPerHour) return { ok: false, retryAt: ds.windowStart + HOUR, reason: "hourly" };
  return { ok: true };
}

export function markRequest(ds: DomainState | undefined, now: number): DomainState {
  const d = ds ? { ...ds } : freshDomain(now);
  if (now - d.windowStart >= HOUR) { d.windowStart = now; d.windowCount = 0; }
  d.windowCount += 1;
  d.lastRequestAt = now;
  d.inFlightSince = now;
  return d;
}

export function markDone(ds: DomainState | undefined, now: number, backoffMs = 0): DomainState {
  const d = ds ? { ...ds } : freshDomain(now);
  delete d.inFlightSince;
  if (backoffMs > 0) d.backoffUntil = now + backoffMs;
  else delete d.backoffUntil;
  return d;
}

/** HTTP statuses that mean "slow down". */
export const isRateLimitStatus = (s?: number) => s === 429 || s === 403 || (s !== undefined && s >= 500);
