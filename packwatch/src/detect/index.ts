// Entry point used by the offscreen document (fetch mode), the tab-mode runner and the popup.
import type { InStockRule, MonitorKind, Strategy } from "../shared/types";
import { shopifyCollectionJsonUrl, shopifyProductJsUrl } from "../shared/url";
import { parseHTML } from "./html";
import { detectQueue } from "./queue";
import { detectShopifyCollection, detectShopifyProduct, shopifyCurrency } from "./shopify";
import { detectJsonLd } from "./jsonld";
import { detectSelector } from "./selector";
import { detectHeuristic, findSeller } from "./heuristic";
import { extractListing } from "./listing";
import type { DetectResult } from "./types";

export type { DetectResult } from "./types";

export interface DetectConfig {
  kind: Exclude<MonitorKind, "simple">;
  strategy: Strategy;
  url: string;
  selector?: string;
  inStockRule: InStockRule;
  variantId?: string;
  currencyHint?: string;
}

/** The URL a fetch-mode check requests. Shopify uses its JSON endpoints. */
export function fetchUrlFor(c: Pick<DetectConfig, "kind" | "strategy" | "url">): string {
  if (c.strategy === "shopify") {
    const j = c.kind === "product" ? shopifyProductJsUrl(c.url) : shopifyCollectionJsonUrl(c.url);
    if (j) return j;
  }
  return c.url;
}

function tryJson(body: string): unknown | undefined {
  const s = body.trimStart();
  if (!s.startsWith("{") && !s.startsWith("[")) return undefined;
  try { return JSON.parse(s); } catch { return undefined; }
}

/** Runs the monitor's strategy on a response body (HTML or JSON). Queue/challenge pages win over everything. */
export function runDetection(c: DetectConfig, body: string, finalUrl = c.url): DetectResult {
  const json = tryJson(body);
  if (json === undefined) {
    const q = detectQueue(body, finalUrl, c.inStockRule.locale);
    if (q) return { state: "queue", evidence: q.evidence };
  }
  const origin = new URL(c.url).origin;
  if (c.kind === "listing") {
    if (c.strategy === "shopify" && json !== undefined) return detectShopifyCollection(json, origin, c.currencyHint);
    const products = extractListing(body, finalUrl, { selector: c.selector, currencyHint: c.currencyHint });
    return { state: "unknown", products, evidence: `${products.length} products on the page` };
  }
  if (c.strategy === "shopify" && json !== undefined) return detectShopifyProduct(json, c);
  const doc = parseHTML(body);
  const hint = c.currencyHint ?? shopifyCurrency(body);
  let r: DetectResult;
  switch (c.strategy) {
    case "selector": r = c.selector ? detectSelector(doc, c.selector, c.inStockRule) : { state: "unknown", evidence: "No element picked" }; break;
    case "heuristic": r = detectHeuristic(doc, c.inStockRule, hint); break;
    default: r = detectJsonLd(doc, hint);
  }
  if (!r.seller) r.seller = findSeller(doc);
  return r;
}

export interface AutoDetectResult { strategy: Strategy; result: DetectResult }

/**
 * Creation-time auto-detect, in spec order: Shopify → JSON-LD → (selector, user-driven) → heuristic.
 * `shopifyJson` is the /products/<handle>.js body when the page is a Shopify product.
 */
export function autoDetect(html: string, url: string, opts: { shopifyJson?: unknown; locale?: string } = {}): AutoDetectResult {
  const q = detectQueue(html, url, opts.locale);
  if (q) return { strategy: "heuristic", result: { state: "queue", evidence: q.evidence } };
  const currencyHint = shopifyCurrency(html);
  if (opts.shopifyJson !== undefined) {
    const r = detectShopifyProduct(opts.shopifyJson, { currencyHint });
    if (r.state !== "unknown") return { strategy: "shopify", result: r };
  }
  const doc = parseHTML(html);
  const ld = detectJsonLd(doc, currencyHint);
  if (ld.state !== "unknown") return { strategy: "jsonld", result: { ...ld, seller: ld.seller ?? findSeller(doc) } };
  const h = detectHeuristic(doc, { locale: opts.locale ?? "en" }, currencyHint);
  return { strategy: "heuristic", result: { ...h, price: h.price ?? ld.price } };
}
