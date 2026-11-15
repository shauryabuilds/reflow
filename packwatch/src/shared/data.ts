// Typed access to the JSON data files.
import tagsJson from "../data/tags.json";
import presetsJson from "../data/presets.json";
import siteRulesJson from "../data/siteRules.json";
import stockRulesJson from "../data/stockRules.json";
import type { InStockRule, Strategy } from "./types";

export interface TagDef { id: string; label: string; keywords: string[] }
export interface TagsData { games: TagDef[]; productTypes: TagDef[] }

export interface Preset {
  todo?: boolean;
  name: string;
  region?: string;
  platform: "shopify" | "other";
  games: string[];
  strategy: Strategy;
  selector?: string;
  inStockRule?: InStockRule;
  listingUrls?: Array<{ label: string; url: string }>;
  notes?: string;
}
export interface PresetsData { version: number; generic: { shopify: Preset } & Record<string, Preset>; shops: Record<string, Preset> }

export interface SiteRule { minIntervalSec?: number; minGapSec?: number; maxPerHour?: number; notes?: string }
export interface SiteRulesData { defaults: { minGapSec: number; maxPerHour: number; floorGapSec: number }; rules: Record<string, SiteRule> }

export interface StockRuleSet { inStock: string; outOfStock: string; preorder: string; queue: string }

export const TAGS = tagsJson as TagsData;
export const PRESETS = presetsJson as unknown as PresetsData;
export const SITE_RULES = siteRulesJson as SiteRulesData;
const STOCK_RULES = stockRulesJson as unknown as Record<string, StockRuleSet>;

export function stockRules(locale = "en"): StockRuleSet {
  const base = locale.split("-")[0];
  return STOCK_RULES[locale] ?? STOCK_RULES[base] ?? STOCK_RULES.en;
}

export function gameLabel(id?: string): string {
  return TAGS.games.find((g) => g.id === id)?.label ?? "";
}
export function productTypeLabel(id?: string): string {
  return TAGS.productTypes.find((g) => g.id === id)?.label ?? "";
}

/** Exact domain or a parent domain ("eu.shop.com" matches "shop.com"). Placeholder (todo) presets never match. */
export function presetFor(domain: string): Preset | null {
  let d = domain;
  while (d.includes(".")) {
    const p = PRESETS.shops[d];
    if (p && !p.todo) return p;
    d = d.slice(d.indexOf(".") + 1);
  }
  return null;
}

export function siteRuleFor(domain: string): SiteRule & { minGapSec: number; maxPerHour: number } {
  const def = SITE_RULES.defaults;
  let d = domain;
  let rule: SiteRule = {};
  while (d) {
    if (SITE_RULES.rules[d]) { rule = SITE_RULES.rules[d]; break; }
    if (!d.includes(".")) break;
    d = d.slice(d.indexOf(".") + 1);
  }
  return {
    ...rule,
    minGapSec: Math.max(def.floorGapSec, rule.minGapSec ?? def.minGapSec),
    maxPerHour: rule.maxPerHour ?? def.maxPerHour,
  };
}
