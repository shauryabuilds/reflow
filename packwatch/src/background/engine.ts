// The service-worker side of scheduling. Everything is reloaded from storage on each call;
// nothing lives in memory between ticks.
import { APP } from "../config/app";
import type { CheckResult, Monitor, Plan } from "../shared/types";
import { getLocal, getLocalMany, getSeen, getSessionTabs, setLocal, setSeen } from "../shared/storage";
import { getPlan, can } from "../shared/entitlements";
import { siteRuleFor } from "../shared/data";
import { fmtDuration } from "../shared/time";
import { withLock } from "./lock";
import { clearInFlight, newRuntime, planTick } from "./scheduler";
import { processResult, type PendingAlert } from "./process";
import { markDone } from "./polite";
import { runner } from "./runner";
import { dispatchAlert } from "./alerts";
import { applyBadge, badgeState } from "./badge";
import { closeOffscreen, ensureOffscreen } from "./offscreenHost";
import { ensureWatcherTab } from "./watcherTabs";
import { runSimple, simpleCountdowns } from "./simpleRefresh";
import { pushStall } from "./pushStall";

export async function tick(): Promise<void> {
  const now = Date.now();
  const plan = await getPlan();
  const { plan: tp, monitors } = await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime", "pw.domains"]);
    const p = planTick(s["pw.monitors"], s["pw.runtime"], s["pw.domains"], plan, now);
    if (p.changed) await setLocal({ "pw.runtime": p.runtime, "pw.domains": p.domains });
    return { plan: p, monitors: s["pw.monitors"] };
  });
  for (const id of tp.dispatch) void checkOne(monitors[id], plan);
  for (const id of tp.simple) void runSimple(monitors[id], plan);
  simpleCountdowns(monitors, tp.runtime, now);
}

async function checkOne(m: Monitor, plan: Plan) {
  let result: CheckResult;
  try { result = await runner.run(m); }
  catch (e) { result = { ok: false, state: "unknown", evidence: String(e), error: String(e), checkedAt: Date.now() }; }
  await applyResult(m.id, result, plan);
}

export async function applyResult(id: string, result: CheckResult, planIn?: Plan): Promise<PendingAlert[]> {
  const plan = planIn ?? (await getPlan());
  const { alerts, monitor } = await withLock(async () => {
    const now = Date.now();
    const s = await getLocalMany(["pw.monitors", "pw.runtime", "pw.domains", "pw.history"]);
    const m = s["pw.monitors"][id];
    const domains = s["pw.domains"];
    const rt = s["pw.runtime"][id] ?? newRuntime(now);
    if (!m || m.state === "paused") {
      // Deleted or paused while the check ran: just release the in-flight markers.
      if (m) { delete rt.inFlightSince; s["pw.runtime"][id] = rt; }
      const d = m?.shopDomain ?? new URL(result.finalUrl ?? "https://x.invalid").hostname;
      if (domains[d]) domains[d] = markDone(domains[d], now);
      await setLocal({ "pw.runtime": s["pw.runtime"], "pw.domains": domains });
      return { alerts: [] as PendingAlert[], monitor: m };
    }
    const seen = m.kind === "listing" ? await getSeen(id) : undefined;
    const out = processResult({ monitor: m, runtime: rt, result, plan, now, seen, siteMinSec: siteRuleFor(m.shopDomain).minIntervalSec });
    s["pw.monitors"][id] = out.monitor;
    s["pw.runtime"][id] = out.runtime;
    domains[m.shopDomain] = markDone(domains[m.shopDomain], now, out.domainBackoffMs);
    const write: Parameters<typeof setLocal>[0] = { "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"], "pw.domains": domains };
    if (out.events.length) write["pw.history"] = [...s["pw.history"], ...out.events].slice(-APP.HISTORY_CAP);
    await setLocal(write);
    if (out.seen && m.kind === "listing") await setSeen(id, out.seen);
    const b = badgeState(s["pw.monitors"], s["pw.runtime"], plan, now);
    applyBadge(b.stale.length, b.live.length);
    return { alerts: out.alerts, monitor: out.monitor };
  });
  for (const a of alerts) await dispatchAlert(a, plan, monitor);
  return alerts;
}

/** Every minute: keep the ticker alive, flag stale monitors once per stall, refresh the badge. */
export async function watchdog(): Promise<void> {
  const now = Date.now();
  const plan = await getPlan();
  const stalled = await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    const b = badgeState(s["pw.monitors"], s["pw.runtime"], plan, now);
    applyBadge(b.stale.length, b.live.length);
    const fresh: Monitor[] = [];
    for (const m of b.stale) {
      const rt = s["pw.runtime"][m.id] ?? newRuntime(now);
      if (rt.stalledNotifiedAt) continue;
      rt.stalledNotifiedAt = now;
      s["pw.runtime"][m.id] = rt;
      fresh.push(m);
    }
    if (fresh.length) await setLocal({ "pw.runtime": s["pw.runtime"] });
    return { fresh, runtime: s["pw.runtime"] };
  });
  for (const m of stalled.fresh) {
    const last = stalled.runtime[m.id]?.lastSuccessAt;
    const evidence = m.evidence && m.state === "error" ? m.evidence : last ? `Last good check ${fmtDuration(Math.round((now - last) / 1000))} ago` : "No successful check yet";
    const a: PendingAlert = { event: "stall", monitorId: m.id, title: m.title, url: m.url, shopDomain: m.shopDomain, game: m.game, evidence, priority: "normal" };
    await dispatchAlert(a, plan, m);
    if (can(plan, "stallToPhone")) await pushStall(a, plan);
  }
  await syncOffscreen();
}

/** The offscreen ticker only runs while something needs checking. */
export async function syncOffscreen(): Promise<void> {
  const monitors = await getLocal("pw.monitors");
  const active = Object.values(monitors).some((m) => m.state !== "paused" && m.state !== "queue");
  if (active) await ensureOffscreen();
  else await closeOffscreen();
}

/** Browser start / extension update: rebuild schedules, reopen watcher tabs. Never needs a Start press. */
export async function restore(): Promise<void> {
  const now = Date.now();
  await withLock(async () => {
    const s = await getLocalMany(["pw.runtime", "pw.domains"]);
    const c = clearInFlight(s["pw.runtime"], s["pw.domains"], now);
    await setLocal({ "pw.runtime": c.runtime, "pw.domains": c.domains });
  });
  const [monitors, plan] = await Promise.all([getLocal("pw.monitors"), getPlan()]);
  const tabs = await getSessionTabs();
  for (const m of Object.values(monitors)) {
    if (m.kind !== "simple" && m.mode === "tab" && m.state !== "paused" && m.state !== "queue" && tabs[m.id] === undefined) {
      await ensureWatcherTab(m).catch(() => {});
    }
  }
  const runtime = await getLocal("pw.runtime");
  const b = badgeState(monitors, runtime, plan, now);
  applyBadge(b.stale.length, b.live.length);
  await syncOffscreen();
}
