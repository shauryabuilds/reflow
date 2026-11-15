// What kind of page is the user on? Drives which button the popup offers first.
import { shopifyCollectionHandle, shopifyProductHandle } from "../shared/url";
import { parseHTML } from "./html";
import { extractJsonLd } from "./jsonld";
import { isShopify } from "./shopify";
import { extractListing } from "./listing";
import { detectHeuristic } from "./heuristic";

export interface PageClass {
  type: "product" | "listing" | "unknown";
  shopify: boolean;
  evidence: string;
}

export function classifyPage(html: string, url: string): PageClass {
  const shopify = isShopify(html, url);
  if (shopify && shopifyProductHandle(url)) return { type: "product", shopify, evidence: "Shopify /products/ URL" };
  if (shopify && (shopifyCollectionHandle(url) || /\/search\b/.test(url))) return { type: "listing", shopify, evidence: "Shopify collection or search URL" };
  const doc = parseHTML(html);
  const ld = extractJsonLd(doc);
  const has = (t: string) => ld.some((n) => (Array.isArray(n["@type"]) ? (n["@type"] as string[]).includes(t) : n["@type"] === t));
  if (has("Product") || has("ProductGroup")) return { type: "product", shopify, evidence: "JSON-LD Product" };
  if (has("ItemList") || has("CollectionPage") || has("SearchResultsPage")) return { type: "listing", shopify, evidence: "JSON-LD ItemList" };
  if (detectHeuristic(doc).state !== "unknown") return { type: "product", shopify, evidence: "Add-to-cart button" };
  if (extractListing(doc, url).length >= 4) return { type: "listing", shopify, evidence: "Many product links" };
  return { type: "unknown", shopify, evidence: "No product data found" };
}
