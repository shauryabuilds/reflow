// Watchlist packs: shareable sets of monitors without any user data, history or alert channels.
import type { Monitor } from "./types";

export const PACK_FORMAT = "packwatch-pack";

export type PackMonitor = Pick<Monitor, "kind" | "url" | "title" | "mode" | "strategy" | "inStockRule" | "intervalSec">
  & Partial<Pick<Monitor, "game" | "productType" | "region" | "selector" | "keywords" | "excludeKeywords" | "variantId" | "currencyHint">>
  & { alertOn: { restock: boolean; preorder: boolean } };

export interface WatchlistPack {
  format: typeof PACK_FORMAT;
  version: 1;
  name: string;
  description: string;
  game?: string;
  createdAt: number;
  monitors: PackMonitor[];
}

export function toPackMonitor(m: Monitor): PackMonitor {
  const p: PackMonitor = {
    kind: m.kind, url: m.url, title: m.title, mode: m.mode, strategy: m.strategy, inStockRule: m.inStockRule,
    intervalSec: m.intervalSec, alertOn: { restock: m.alertOn.restock, preorder: m.alertOn.preorder },
  };
  for (const k of ["game", "productType", "region", "selector", "keywords", "excludeKeywords", "variantId", "currencyHint"] as const) {
    if (m[k] !== undefined) (p as Record<string, unknown>)[k] = m[k];
  }
  return p;
}

export function exportPack(monitors: Monitor[], meta: { name: string; description: string; game?: string }, now = Date.now()): WatchlistPack {
  return {
    format: PACK_FORMAT, version: 1, name: meta.name, description: meta.description, game: meta.game, createdAt: now,
    monitors: monitors.filter((m) => m.kind !== "simple").map(toPackMonitor),
  };
}

const KINDS = new Set(["product", "listing"]);
const MODES = new Set(["fetch", "tab"]);
const STRATS = new Set(["shopify", "jsonld", "selector", "heuristic"]);

/** Parses a pack from a file or pasted text blob, validating every field. Throws with a readable reason. */
export function parsePack(text: string): WatchlistPack {
  let raw: unknown;
  const s = text.trim();
  try { raw = JSON.parse(s.startsWith("{") ? s : atob(s.replace(/^packwatch:/, ""))); }
  catch { throw new Error("Not a Packwatch pack"); }
  const p = raw as Partial<WatchlistPack>;
  if (!p || p.format !== PACK_FORMAT || p.version !== 1 || !Array.isArray(p.monitors)) throw new Error("Not a Packwatch pack");
  const monitors: PackMonitor[] = [];
  for (const m of p.monitors as PackMonitor[]) {
    if (!m || !KINDS.has(m.kind) || !MODES.has(m.mode) || !STRATS.has(m.strategy)) continue;
    let url: URL;
    try { url = new URL(m.url); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    monitors.push({
      ...toPackMonitor({ ...(m as Monitor), alertOn: { restock: m.alertOn?.restock ?? true, preorder: m.alertOn?.preorder ?? true } }),
      title: String(m.title || url.hostname).slice(0, 200),
      intervalSec: Math.max(15, Number(m.intervalSec) || 60),
      inStockRule: { locale: String(m.inStockRule?.locale || "en"), ...(m.inStockRule?.inStock ? { inStock: String(m.inStockRule.inStock) } : {}), ...(m.inStockRule?.outOfStock ? { outOfStock: String(m.inStockRule.outOfStock) } : {}) },
    });
  }
  if (!monitors.length) throw new Error("This pack has no valid monitors");
  return { format: PACK_FORMAT, version: 1, name: String(p.name || "Watchlist").slice(0, 100), description: String(p.description || "").slice(0, 500), game: p.game ? String(p.game) : undefined, createdAt: Number(p.createdAt) || Date.now(), monitors };
}

/** Compact text form for pasting into chat: "packwatch:<base64>". */
export function packToText(p: WatchlistPack): string {
  return "packwatch:" + btoa(unescape(encodeURIComponent(JSON.stringify(p))));
}
