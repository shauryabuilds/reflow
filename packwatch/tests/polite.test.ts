import { describe, it, expect } from "vitest";
import { canRequest, markDone, markRequest } from "../src/background/polite";
import { planTick } from "../src/background/scheduler";
import { effectiveIntervalSec, isStale } from "../src/shared/intervals";
import { monitor, runtime } from "./factories";

const rule = { minGapSec: 10, maxPerHour: 3 };

describe("polite mode", () => {
  it("one in-flight request per domain", () => {
    const d = markRequest(undefined, 0);
    expect(canRequest(d, rule, 20_000)).toMatchObject({ ok: false, reason: "in-flight" });
    expect(canRequest(markDone(d, 1_000), rule, 20_000)).toEqual({ ok: true });
  });
  it("minimum gap between requests", () => {
    const d = markDone(markRequest(undefined, 0), 500);
    expect(canRequest(d, rule, 9_999)).toMatchObject({ ok: false, reason: "gap", retryAt: 10_000 });
    expect(canRequest(d, rule, 10_000)).toEqual({ ok: true });
  });
  it("max checks per hour", () => {
    let d = markDone(markRequest(undefined, 0), 0);
    d = markDone(markRequest(d, 20_000), 20_000);
    d = markDone(markRequest(d, 40_000), 40_000);
    expect(canRequest(d, rule, 60_000)).toMatchObject({ ok: false, reason: "hourly", retryAt: 3_600_000 });
    expect(canRequest(d, rule, 3_600_000)).toEqual({ ok: true });
  });
  it("domain backoff", () => {
    const d = markDone(markRequest(undefined, 0), 0, 120_000);
    expect(canRequest(d, rule, 60_000)).toMatchObject({ ok: false, reason: "backoff" });
  });
});

describe("intervals and backoff", () => {
  it("plan minimums apply", () => {
    expect(effectiveIntervalSec(monitor({ intervalSec: 15 }), "free", 0)).toBe(60);
    expect(effectiveIntervalSec(monitor({ intervalSec: 15 }), "pro", 0)).toBe(15);
    expect(effectiveIntervalSec(monitor({ intervalSec: 15, mode: "tab" }), "pro", 0)).toBe(30);
  });
  it("doubles per error up to 15 minutes", () => {
    const m = monitor({ intervalSec: 60 });
    expect(effectiveIntervalSec(m, "free", 0, 0, 1)).toBe(120);
    expect(effectiveIntervalSec(m, "free", 0, 0, 3)).toBe(480);
    expect(effectiveIntervalSec(m, "free", 0, 0, 10)).toBe(900);
    expect(effectiveIntervalSec(monitor({ intervalSec: 1800 }), "free", 0, 0, 2)).toBe(1800);
  });
  it("stale after 3× the interval without success", () => {
    const m = monitor({ intervalSec: 60 });
    expect(isStale(m, runtime({ lastSuccessAt: 0 }), "free", 180_000)).toBe(false);
    expect(isStale(m, runtime({ lastSuccessAt: 0 }), "free", 196_000)).toBe(true);
    expect(isStale({ ...m, state: "paused" }, runtime({ lastSuccessAt: 0 }), "free", 999_999)).toBe(false);
  });
});

describe("planTick", () => {
  it("spreads monitors on the same domain and never double-dispatches", () => {
    const ms = { a: monitor({ id: "a" }), b: monitor({ id: "b" }), c: monitor({ id: "c", shopDomain: "other.example" }) };
    const rt = { a: runtime({ nextCheckAt: 0 }), b: runtime({ nextCheckAt: 0 }), c: runtime({ nextCheckAt: 0 }) };
    const p = planTick(ms, rt, {}, "free", 1_000);
    expect(p.dispatch.sort()).toEqual(["a", "c"]);
    expect(p.runtime.a.inFlightSince).toBe(1_000);
    // b waits (domain in flight); a second tick while a is in flight dispatches nothing new
    const p2 = planTick(ms, p.runtime, p.domains, "free", 2_000);
    expect(p2.dispatch).toEqual([]);
  });
  it("skips paused and queued monitors, and future checks", () => {
    const ms = { a: monitor({ id: "a", state: "paused" }), b: monitor({ id: "b", state: "queue" }), c: monitor({ id: "c" }) };
    const p = planTick(ms, { c: runtime({ nextCheckAt: 5_000 }) }, {}, "free", 1_000);
    expect(p.dispatch).toEqual([]);
  });
  it("Simple Refresh is not domain-gated", () => {
    const ms = { s: monitor({ id: "s", kind: "simple", mode: "tab" }), a: monitor({ id: "a" }) };
    const p = planTick(ms, { s: runtime(), a: runtime() }, { "shop.example": { lastRequestAt: 999, windowStart: 0, windowCount: 1 } }, "free", 1_000);
    expect(p.simple).toEqual(["s"]);
    expect(p.dispatch).toEqual([]);
  });
});
