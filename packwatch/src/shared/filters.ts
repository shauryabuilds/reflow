// Filter/group options for the monitor list and history. Games and product types
// come from tags.json, so a new tag appears here with no code change.
import { TAGS } from "./data";
import type { Monitor } from "./types";

export interface FilterOption { id: string; label: string; count: number }

export function gameOptions(monitors: Pick<Monitor, "game">[] = []): FilterOption[] {
  return TAGS.games.map((g) => ({ id: g.id, label: g.label, count: monitors.filter((m) => (m.game ?? "other") === g.id).length }));
}

export function productTypeOptions(items: Array<{ productType?: string }> = []): FilterOption[] {
  return TAGS.productTypes.map((p) => ({ id: p.id, label: p.label, count: items.filter((m) => m.productType === p.id).length }));
}

export function distinct<T>(items: T[], key: (t: T) => string | undefined): FilterOption[] {
  const counts = new Map<string, number>();
  for (const it of items) { const k = key(it); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([id, count]) => ({ id, label: id, count }));
}

export type GroupBy = "game" | "shop" | "region";

export function groupMonitors(monitors: Monitor[], by: GroupBy): Array<{ key: string; label: string; items: Monitor[] }> {
  const keyOf = (m: Monitor) => (by === "game" ? m.game ?? "other" : by === "shop" ? m.shopDomain : m.region ?? "—");
  const map = new Map<string, Monitor[]>();
  for (const m of monitors) { const k = keyOf(m); map.set(k, [...(map.get(k) ?? []), m]); }
  const label = (k: string) => (by === "game" ? TAGS.games.find((g) => g.id === k)?.label ?? k : k);
  const order = by === "game" ? TAGS.games.map((g) => g.id) : [...map.keys()].sort();
  return [...map.entries()]
    .sort((a, b) => (order.indexOf(a[0]) + 1 || 999) - (order.indexOf(b[0]) + 1 || 999) || a[0].localeCompare(b[0]))
    .map(([key, items]) => ({ key, label: label(key), items }));
}
