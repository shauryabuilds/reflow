// Restock history: visibility by plan, in-stock durations, local pattern insights, CSV.
import { APP } from "../config/app";
import type { HistoryEvent, Plan } from "./types";
import { can } from "./entitlements";

const DAY = 86_400_000;
const IN_EVENTS = new Set(["restock", "preorder"]);

export function visibleHistory(events: HistoryEvent[], plan: Plan, now: number): HistoryEvent[] {
  if (can(plan, "historyFull")) return events;
  return events.filter((e) => now - e.at <= APP.FREE_HISTORY_DAYS * DAY);
}

export interface TimelineItem extends HistoryEvent { inStockMs?: number }

/** Pairs each restock/preorder with the next "out" for the same monitor. */
export function withDurations(events: HistoryEvent[]): TimelineItem[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const out: TimelineItem[] = sorted.map((e) => ({ ...e }));
  const open = new Map<string, TimelineItem>();
  for (const e of out) {
    if (IN_EVENTS.has(e.event)) { if (!open.has(e.monitorId)) open.set(e.monitorId, e); }
    else if (e.event === "out") {
      const start = open.get(e.monitorId);
      if (start) { start.inStockMs = e.at - start.at; open.delete(e.monitorId); }
    }
  }
  return out;
}

export interface ShopPattern {
  shopDomain: string;
  restocks: number;
  days: number[]; // 0 = Sunday
  startHour: number;
  endHour: number; // exclusive
  typicalInStockMs?: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Busiest days and hour window per shop, computed locally from 3+ restocks. Local time. */
export function shopPatterns(events: HistoryEvent[], minRestocks = 3): ShopPattern[] {
  const items = withDurations(events);
  const byShop = new Map<string, TimelineItem[]>();
  for (const e of items) if (IN_EVENTS.has(e.event)) byShop.set(e.shopDomain, [...(byShop.get(e.shopDomain) ?? []), e]);
  const out: ShopPattern[] = [];
  for (const [shopDomain, list] of byShop) {
    if (list.length < minRestocks) continue;
    const dayCount = new Array(7).fill(0), hourCount = new Array(24).fill(0);
    for (const e of list) { const d = new Date(e.at); dayCount[d.getDay()]++; hourCount[d.getHours()]++; }
    const maxDay = Math.max(...dayCount);
    const days = dayCount.map((c, i) => (c >= maxDay * 0.5 && c > 0 ? i : -1)).filter((i) => i >= 0);
    const peak = hourCount.indexOf(Math.max(...hourCount));
    let start = peak, end = peak + 1;
    while (start > 0 && hourCount[start - 1] >= hourCount[peak] * 0.5 && hourCount[start - 1] > 0) start--;
    while (end < 24 && hourCount[end] >= hourCount[peak] * 0.5 && hourCount[end] > 0) end++;
    const durations = list.map((e) => e.inStockMs).filter((x): x is number => x !== undefined);
    out.push({ shopDomain, restocks: list.length, days, startHour: start, endHour: end, typicalInStockMs: median(durations) });
  }
  return out.sort((a, b) => b.restocks - a.restocks);
}

const DAY_NAMES = (locale: string) => Array.from({ length: 7 }, (_, i) => new Date(2026, 0, 4 + i).toLocaleDateString(locale, { weekday: "short" }));

/** "Tue–Thu" for consecutive days, "Mon, Wed" otherwise. */
export function formatDays(days: number[], locale = "en-US"): string {
  const names = DAY_NAMES(locale);
  const s = [...days].sort((a, b) => a - b);
  const contiguous = s.length > 1 && s.every((d, i) => i === 0 || d === s[i - 1] + 1);
  if (contiguous && s.length > 2) return `${names[s[0]]}–${names[s[s.length - 1]]}`;
  return s.map((d) => names[d]).join(", ");
}

export const formatHours = (start: number, end: number) => `${String(start).padStart(2, "0")}:00–${String(end % 24).padStart(2, "0")}:00`;

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  // Neutralise spreadsheet formulas and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(events: HistoryEvent[]): string {
  const rows = withDurations(events);
  const head = ["time", "shop", "title", "game", "product_type", "event", "price", "currency", "detected_within_s", "in_stock_s"];
  const lines = rows.map((e) => [
    new Date(e.at).toISOString(), e.shopDomain, e.title, e.game, e.productType, e.event,
    e.price?.amount, e.price?.currency,
    e.latencyMs !== undefined ? Math.round(e.latencyMs / 1000) : "",
    e.inStockMs !== undefined ? Math.round(e.inStockMs / 1000) : "",
  ].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n");
}
