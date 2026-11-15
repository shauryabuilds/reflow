import { describe, it, expect } from "vitest";
import { alertText } from "../src/background/alerts";
import { nextSimpleDelayMs } from "../src/background/simpleRefresh";
import { inQuietHours, fmtDuration } from "../src/shared/time";
import type { PendingAlert } from "../src/background/process";

const a = (over: Partial<PendingAlert>): PendingAlert => ({
  event: "restock", monitorId: "m", title: "OP-15 Booster Box", url: "https://s.example/p", shopDomain: "s.example",
  game: "one-piece", evidence: "JSON-LD availability = InStock", priority: "normal", ...over,
});

describe("alert text", () => {
  it("restock: title, price, shop, game, evidence and detection latency", () => {
    const x = alertText(a({ price: { amount: 189, currency: "SGD" }, latencyMs: 12_000 }));
    expect(x.title).toBe("Back in stock: OP-15 Booster Box");
    expect(x.message).toMatch(/189\.00.*s\.example · One Piece/);
    expect(x.context).toBe("JSON-LD availability = InStock · detected within 12s");
  });
  it("several new listings are summarised", () => {
    const x = alertText(a({ event: "new-listing", products: [{ id: "1", title: "A", url: "u" }, { id: "2", title: "B", url: "u" }] }));
    expect(x.title).toBe("2 new listings on s.example");
    expect(x.message).toBe("A\nB");
  });
  it("queue vs bot check wording", () => {
    expect(alertText(a({ event: "queue", evidence: "Queue-it waiting room markup" })).title).toBe("You're in a queue on s.example");
    expect(alertText(a({ event: "queue", evidence: "Cloudflare challenge markup" })).title).toBe("s.example is showing a bot check");
  });
});

describe("Simple Refresh timing", () => {
  it("never goes below 5s; randomize varies ±25%", () => {
    expect(nextSimpleDelayMs({ intervalSec: 1, randomize: false })).toBe(5000);
    expect(nextSimpleDelayMs({ intervalSec: 60, randomize: true }, 0)).toBe(45_000);
    expect(nextSimpleDelayMs({ intervalSec: 60, randomize: true }, 1)).toBe(75_000);
  });
});

describe("time helpers", () => {
  const at = (h: number, m = 0) => new Date(2026, 0, 5, h, m).getTime();
  it("quiet hours wrap midnight", () => {
    const q = { start: "22:00", end: "07:00" };
    expect(inQuietHours(q, at(23))).toBe(true);
    expect(inQuietHours(q, at(6, 59))).toBe(true);
    expect(inQuietHours(q, at(7))).toBe(false);
    expect(inQuietHours({ start: "09:00", end: "17:00" }, at(12))).toBe(true);
    expect(inQuietHours(undefined, at(12))).toBe(false);
  });
  it("durations", () => {
    expect(fmtDuration(42)).toBe("42s");
    expect(fmtDuration(220)).toBe("3m 40s");
    expect(fmtDuration(3900)).toBe("1h 5m");
  });
});
