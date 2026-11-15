import { describe, it, expect } from "vitest";
import { formatDays, formatHours, shopPatterns, toCsv, visibleHistory, withDurations } from "../src/shared/history";
import { exportPack, packToText, parsePack } from "../src/shared/packs";
import type { HistoryEvent } from "../src/shared/types";
import { monitor } from "./factories";

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime(); // Oct 2026; the 6th is a Tuesday
const ev = (over: Partial<HistoryEvent>): HistoryEvent => ({ monitorId: "m", shopDomain: "cards.example", title: "ETB", event: "restock", at: 0, ...over });

describe("history", () => {
  it("Free sees the last 7 days only; Pro sees everything", () => {
    const now = at(20, 12);
    const list = [ev({ at: at(1, 10) }), ev({ at: at(18, 10) })];
    expect(visibleHistory(list, "free", now)).toHaveLength(1);
    expect(visibleHistory(list, "pro", now)).toHaveLength(2);
  });
  it("computes how long each item stayed in stock", () => {
    const d = withDurations([ev({ at: at(6, 10) }), ev({ event: "out", at: at(6, 10, 3) + 40_000 }), ev({ event: "restock", at: at(7, 9) })]);
    expect(d[0].inStockMs).toBe(220_000); // 3m 40s
    expect(d[2].inStockMs).toBeUndefined();
  });
  it("finds the busiest days and hours once a shop has 3+ restocks", () => {
    const list: HistoryEvent[] = [];
    for (const day of [6, 7, 8, 13, 15]) { // Tue, Wed, Thu, Tue, Thu
      list.push(ev({ at: at(day, 10, 15) }), ev({ event: "out", at: at(day, 10, 19) }));
    }
    list.push(ev({ shopDomain: "rare.example", at: at(6, 3) }));
    const p = shopPatterns(list);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ shopDomain: "cards.example", restocks: 5, days: [2, 3, 4], startHour: 10, endHour: 11, typicalInStockMs: 240_000 });
    expect(formatDays(p[0].days)).toBe("Tue–Thu");
    expect(formatDays([1, 3])).toBe("Mon, Wed");
    expect(formatHours(10, 11)).toBe("10:00–11:00");
  });
  it("CSV export escapes text and neutralises formulas", () => {
    const csv = toCsv([ev({ title: 'Box, "Limited"', at: Date.UTC(2026, 9, 6, 2), price: { amount: 5, currency: "USD" } }), ev({ title: "=HYPERLINK(1)", at: Date.UTC(2026, 9, 6, 3) })]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("time,shop,title,game,product_type,event,price,currency,detected_within_s,in_stock_s");
    expect(lines[1]).toContain('"Box, ""Limited"""');
    expect(lines[2]).toContain("'=HYPERLINK(1)");
  });
});

describe("watchlist packs", () => {
  const ms = [
    monitor({ id: "a", title: "Pokémon ETB", game: "pokemon", lastPrice: { amount: 1, currency: "USD" }, sellerMustContain: "x", quietHours: { start: "1:00", end: "2:00" } }),
    monitor({ id: "b", kind: "listing", url: "https://shop.example/collections/op", keywords: ["op-15"] }),
    monitor({ id: "s", kind: "simple" }),
  ];
  it("exports monitors without personal data or alert channels", () => {
    const p = exportPack(ms, { name: "OP-15 launch", description: "d" }, 1);
    expect(p.monitors).toHaveLength(2);
    const json = JSON.stringify(p);
    for (const leak of ["lastPrice", "sellerMustContain", "quietHours", "createdAt\":0", "\"id\"", "state"]) expect(json).not.toContain(leak);
  });
  it("round-trips through the text form, including non-ASCII", () => {
    const p = exportPack(ms, { name: "Pokémon set", description: "" }, 1);
    const back = parsePack(packToText(p));
    expect(back.name).toBe("Pokémon set");
    expect(back.monitors[0].title).toBe("Pokémon ETB");
    expect(parsePack(JSON.stringify(p)).monitors).toHaveLength(2);
  });
  it("rejects junk and drops invalid monitors", () => {
    expect(() => parsePack("hello")).toThrow();
    expect(() => parsePack(JSON.stringify({ format: "packwatch-pack", version: 1, monitors: [{ kind: "product", url: "javascript:alert(1)", mode: "fetch", strategy: "jsonld" }] }))).toThrow(/no valid monitors/);
  });
});
