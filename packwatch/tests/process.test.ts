import { describe, it, expect } from "vitest";
import { processResult } from "../src/background/process";
import { monitor, ok, runtime } from "./factories";

const run = (over: Parameters<typeof processResult>[0]) => processResult({ rnd: 0.5, ...over });

describe("transitions and dedupe", () => {
  it("out → in fires one restock alert with detection latency", () => {
    const r = run({ monitor: monitor(), runtime: runtime({ lastSuccessAt: 50_000 }), result: ok({ state: "in", price: { amount: 64.99, currency: "SGD" } }), plan: "free", now: 62_000 });
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({ event: "restock", latencyMs: 12_000, price: { amount: 64.99 } });
    expect(r.events.map((e) => e.event)).toEqual(["restock"]);
    expect(r.monitor).toMatchObject({ state: "in", stableState: "in", lastChangeAt: 62_000 });
    expect(r.runtime.nextCheckAt).toBe(62_000 + 60_000);
  });
  it("in → in fires nothing", () => {
    const r = run({ monitor: monitor({ state: "in", stableState: "in" }), runtime: runtime(), result: ok({ state: "in" }), plan: "free", now: 1 });
    expect(r.alerts).toEqual([]);
    expect(r.events).toEqual([]);
  });
  it("first check (unknown → in) is not an alert", () => {
    const r = run({ monitor: monitor({ state: "unknown", stableState: "unknown" }), runtime: runtime(), result: ok({ state: "in" }), plan: "free", now: 1 });
    expect(r.alerts).toEqual([]);
    expect(r.monitor.stableState).toBe("in");
  });
  it("out → preorder fires a preorder alert; respects alertOn", () => {
    const r = run({ monitor: monitor(), runtime: runtime(), result: ok({ state: "preorder" }), plan: "free", now: 1 });
    expect(r.alerts.map((a) => a.event)).toEqual(["preorder"]);
    const r2 = run({ monitor: monitor({ alertOn: { restock: true, preorder: false } }), runtime: runtime(), result: ok({ state: "preorder" }), plan: "free", now: 1 });
    expect(r2.alerts).toEqual([]);
    expect(r2.events.map((e) => e.event)).toEqual(["preorder"]);
  });
  it("unknown results never cause a transition", () => {
    const r = run({ monitor: monitor({ state: "in", stableState: "in" }), runtime: runtime(), result: ok({ state: "unknown" }), plan: "free", now: 1 });
    expect(r.monitor.stableState).toBe("in");
    const r2 = run({ monitor: r.monitor, runtime: r.runtime, result: ok({ state: "in" }), plan: "free", now: 2 });
    expect(r2.alerts).toEqual([]);
  });
  it("flapping within the cooldown alerts once", () => {
    let m = monitor(), rt = runtime();
    let count = 0;
    const seq = ["in", "out", "in", "out", "in"] as const;
    seq.forEach((s, i) => {
      const r = run({ monitor: m, runtime: rt, result: ok({ state: s }), plan: "free", now: 100_000 + i * 60_000 });
      count += r.alerts.length; m = r.monitor; rt = r.runtime;
    });
    expect(count).toBe(1);
    const later = run({ monitor: { ...m, stableState: "out" }, runtime: rt, result: ok({ state: "in" }), plan: "free", now: 100_000 + 20 * 60_000 });
    expect(later.alerts).toHaveLength(1);
  });
});

describe("errors, backoff and queue", () => {
  it("429 backs off exponentially and backs the domain off", () => {
    const r = run({ monitor: monitor(), runtime: runtime(), result: { ok: false, state: "unknown", evidence: "", httpStatus: 429, checkedAt: 0 }, plan: "free", now: 0 });
    expect(r.monitor).toMatchObject({ state: "error", consecutiveErrors: 1 });
    expect(r.runtime.nextCheckAt).toBe(120_000);
    expect(r.domainBackoffMs).toBe(120_000);
    const r2 = run({ monitor: r.monitor, runtime: r.runtime, result: { ok: false, state: "unknown", evidence: "", httpStatus: 503, checkedAt: 0 }, plan: "free", now: 0 });
    expect(r2.runtime.nextCheckAt).toBe(240_000);
    const back = run({ monitor: r2.monitor, runtime: r2.runtime, result: ok({ state: "out" }), plan: "free", now: 1 });
    expect(back.monitor.consecutiveErrors).toBe(0);
    expect(back.runtime.nextCheckAt).toBe(60_001);
  });
  it("an error between out and in still alerts on the restock", () => {
    const e = run({ monitor: monitor(), runtime: runtime(), result: { ok: false, state: "unknown", evidence: "", error: "network", checkedAt: 0 }, plan: "free", now: 0 });
    const r = run({ monitor: e.monitor, runtime: e.runtime, result: ok({ state: "in" }), plan: "free", now: 1 });
    expect(r.alerts.map((a) => a.event)).toEqual(["restock"]);
  });
  it("queue stops checking and alerts once", () => {
    const r = run({ monitor: monitor(), runtime: runtime(), result: ok({ state: "queue", evidence: "Queue-it" }), plan: "free", now: 0 });
    expect(r.monitor).toMatchObject({ state: "queue", pausedReason: "queue" });
    expect(r.alerts.map((a) => a.event)).toEqual(["queue"]);
    expect(r.runtime.nextCheckAt).toBe(Number.MAX_SAFE_INTEGER);
    const r2 = run({ monitor: r.monitor, runtime: r.runtime, result: ok({ state: "queue", evidence: "Queue-it" }), plan: "free", now: 1 });
    expect(r2.alerts).toEqual([]);
  });
  it("typing guard skip retries soon without changes", () => {
    const r = run({ monitor: monitor(), runtime: runtime(), result: { ok: true, state: "unknown", evidence: "", skipped: "typing", checkedAt: 0 }, plan: "free", now: 10 });
    expect(r.runtime.nextCheckAt).toBe(5_010);
    expect(r.monitor.state).toBe("out");
  });
});

describe("price alerts (Pro)", () => {
  const target = { amount: 100, currency: "USD" };
  it("alerts when the price crosses at or below the target, same currency only", () => {
    const m = monitor({ state: "in", stableState: "in", lastPrice: { amount: 120, currency: "USD" }, alertOn: { restock: true, preorder: true, priceAtOrBelow: target } });
    const r = run({ monitor: m, runtime: runtime(), result: ok({ state: "in", price: { amount: 99, currency: "USD" } }), plan: "pro", now: 1 });
    expect(r.alerts.map((a) => a.event)).toEqual(["price-drop"]);
    const free = run({ monitor: m, runtime: runtime(), result: ok({ state: "in", price: { amount: 99, currency: "USD" } }), plan: "free", now: 1 });
    expect(free.alerts).toEqual([]);
    const other = run({ monitor: m, runtime: runtime(), result: ok({ state: "in", price: { amount: 99, currency: "SGD" } }), plan: "pro", now: 1 });
    expect(other.alerts).toEqual([]);
    const already = run({ monitor: { ...m, lastPrice: { amount: 99, currency: "USD" } }, runtime: runtime(), result: ok({ state: "in", price: { amount: 98, currency: "USD" } }), plan: "pro", now: 1 });
    expect(already.alerts).toEqual([]);
  });
  it("price guard suppresses restock alerts above the target", () => {
    const m = monitor({ priceGuard: true, alertOn: { restock: true, preorder: true, priceAtOrBelow: target } });
    const r = run({ monitor: m, runtime: runtime(), result: ok({ state: "in", price: { amount: 149, currency: "USD" } }), plan: "pro", now: 1 });
    expect(r.alerts).toEqual([]);
    expect(r.events.map((e) => e.event)).toEqual(["restock"]);
  });
  it("seller filter skips third-party listings", () => {
    const m = monitor({ sellerMustContain: "Official Store" });
    const r = run({ monitor: m, runtime: runtime(), result: ok({ state: "in", seller: "MarkupMart" }), plan: "pro", now: 1 });
    expect(r.alerts).toEqual([]);
    expect(r.monitor.evidence).toMatch(/MarkupMart/);
    const r2 = run({ monitor: m, runtime: runtime(), result: ok({ state: "in", seller: "Shop Official Store" }), plan: "pro", now: 1 });
    expect(r2.alerts.map((a) => a.event)).toEqual(["restock"]);
  });
});

describe("listing watch", () => {
  const lm = monitor({ kind: "listing", keywords: ["op-15"], excludeKeywords: ["japanese"], state: "unknown", stableState: "unknown" });
  const p = (id: string, title: string) => ({ id, title, url: `https://shop.example/products/${id}` });
  it("seeds on the first check without alerting", () => {
    const r = run({ monitor: lm, runtime: runtime(), result: ok({ products: [p("a", "OP-15 Box")] }), plan: "free", now: 1, seen: {} });
    expect(r.alerts).toEqual([]);
    expect(r.seen).toEqual({ a: "OP-15 Box" });
    expect(r.runtime.listingSeeded).toBe(true);
  });
  it("alerts once per new matching product, remembering every id", () => {
    const rt = runtime({ listingSeeded: true });
    const seen = { a: "OP-14 Box" };
    const r = run({ monitor: lm, runtime: rt, seen, plan: "free", now: 1,
      result: ok({ products: [p("a", "OP-14 Box"), p("b", "OP-15 Booster Box"), p("c", "OP-15 Japanese"), p("d", "Sleeves")] }) });
    expect(r.alerts).toHaveLength(1);
    expect(r.alerts[0]).toMatchObject({ event: "new-listing", title: "OP-15 Booster Box" });
    expect(Object.keys(r.seen!).sort()).toEqual(["a", "b", "c", "d"]);
    const again = run({ monitor: r.monitor, runtime: r.runtime, seen: r.seen, plan: "free", now: 2,
      result: ok({ products: [p("a", "OP-14 Box"), p("b", "OP-15 Booster Box")] }) });
    expect(again.alerts).toEqual([]);
    // a second, different product within the cooldown still alerts
    const second = run({ monitor: again.monitor, runtime: again.runtime, seen: again.seen, plan: "free", now: 3,
      result: ok({ products: [p("e", "OP-15 Starter Deck")] }) });
    expect(second.alerts).toHaveLength(1);
  });
  it("a re-titled product that now matches counts as new", () => {
    const r = run({ monitor: lm, runtime: runtime({ listingSeeded: true }), seen: { x: "Mystery item" }, plan: "free", now: 1,
      result: ok({ products: [p("x", "OP-15 Booster Box Pre-order")] }) });
    expect(r.alerts).toHaveLength(1);
  });
  it("an empty listing never wipes the memory", () => {
    const r = run({ monitor: lm, runtime: runtime({ listingSeeded: true }), seen: { a: "A" }, plan: "free", now: 1, result: ok({ products: [] }) });
    expect(r.seen).toEqual({ a: "A" });
    expect(r.alerts).toEqual([]);
  });
});
