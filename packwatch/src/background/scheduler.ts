// Picks which monitors to check this tick. Pure planning + a thin chrome-facing driver.
import type { DomainState, Monitor, MonitorRuntime, Plan } from "../shared/types";
import { APP } from "../config/app";
import { siteRuleFor } from "../shared/data";
import { isActiveWatch } from "../shared/intervals";
import { canRequest, markRequest } from "./polite";

export interface TickPlan {
  dispatch: string[]; // monitor ids to check now (product/listing)
  simple: string[]; // Simple Refresh monitors due now
  runtime: Record<string, MonitorRuntime>;
  domains: Record<string, DomainState>;
  changed: boolean;
}

export function newRuntime(now: number, firstDelayMs = 0): MonitorRuntime {
  return { nextCheckAt: now + firstDelayMs, lastAlertAt: {} };
}

/**
 * Most overdue first. Polite mode allows one in-flight request per domain and a minimum gap,
 * so two monitors on the same shop never fire in the same second.
 */
export function planTick(
  monitors: Record<string, Monitor>,
  runtimeIn: Record<string, MonitorRuntime>,
  domainsIn: Record<string, DomainState>,
  plan: Plan,
  now: number,
): TickPlan {
  const runtime = { ...runtimeIn };
  const domains = { ...domainsIn };
  const dispatch: string[] = [];
  const simple: string[] = [];
  let changed = false;
  void plan;

  const list = Object.values(monitors)
    .map((m) => ({ m, rt: runtime[m.id] ?? newRuntime(now) }))
    .sort((a, b) => a.rt.nextCheckAt - b.rt.nextCheckAt);

  for (const { m, rt: rt0 } of list) {
    let rt = rt0;
    if (!runtime[m.id]) { runtime[m.id] = rt; changed = true; }
    if (rt.inFlightSince !== undefined && now - rt.inFlightSince < APP.IN_FLIGHT_TIMEOUT_MS) continue;
    if (rt.nextCheckAt > now) continue;
    if (m.kind === "simple") {
      if (m.state === "paused" || m.state === "queue") continue;
      runtime[m.id] = { ...rt, inFlightSince: now };
      simple.push(m.id);
      changed = true;
      continue;
    }
    if (!isActiveWatch(m)) continue;
    const rule = siteRuleFor(m.shopDomain);
    const gate = canRequest(domains[m.shopDomain], rule, now);
    if (!gate.ok) {
      if (gate.retryAt > rt.nextCheckAt) { rt = { ...rt, nextCheckAt: gate.retryAt }; runtime[m.id] = rt; changed = true; }
      continue;
    }
    domains[m.shopDomain] = markRequest(domains[m.shopDomain], now);
    runtime[m.id] = { ...rt, inFlightSince: now };
    dispatch.push(m.id);
    changed = true;
  }
  return { dispatch, simple, runtime, domains, changed };
}

/** After a browser restart nothing is actually in flight any more. */
export function clearInFlight(runtime: Record<string, MonitorRuntime>, domains: Record<string, DomainState>, now: number) {
  const rt: Record<string, MonitorRuntime> = {};
  for (const [id, r] of Object.entries(runtime)) {
    const { inFlightSince: _drop, ...rest } = r;
    void _drop;
    rt[id] = { ...rest, nextCheckAt: Math.min(rest.nextCheckAt, now + 5_000) };
  }
  const ds: Record<string, DomainState> = {};
  for (const [d, s] of Object.entries(domains)) { const { inFlightSince: _x, ...rest } = s; void _x; ds[d] = rest; }
  return { runtime: rt, domains: ds };
}
