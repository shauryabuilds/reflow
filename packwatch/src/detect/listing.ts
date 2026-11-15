// Listing pages: extract products, diff against what we've already seen, match keywords.
import type { ListingProduct } from "../shared/types";
import { parsePrice } from "../shared/price";
import { absUrl, productIdFromUrl } from "../shared/url";
import { parseHTML, textOf } from "./html";
import { dedupe, listingFromJsonLd } from "./jsonld";

const PRODUCT_HREF = /\/(products?|p|item|items|dp|listing|shop\/product)\/[^/?#]+/i;

export function extractListing(html: string | Document, baseUrl: string, opts: { selector?: string; currencyHint?: string } = {}): ListingProduct[] {
  const doc = typeof html === "string" ? parseHTML(html) : html;
  if (!opts.selector) {
    const ld = listingFromJsonLd(doc, baseUrl, opts.currencyHint);
    if (ld.length) return ld;
  }
  let root: ParentNode = doc;
  if (opts.selector) {
    try { root = doc.querySelector(opts.selector) ?? doc; } catch { root = doc; }
  }
  const out: ListingProduct[] = [];
  for (const a of Array.from(root.querySelectorAll("a[href]"))) {
    const href = a.getAttribute("href") || "";
    if (!PRODUCT_HREF.test(href)) continue;
    const title = (textOf(a) || a.getAttribute("title") || a.querySelector("img")?.getAttribute("alt") || "").trim();
    if (title.length < 3) continue;
    let price;
    let p: Element | null = a;
    for (let i = 0; i < 4 && p && !price; i++, p = p.parentElement) {
      const priceEl = p.querySelector('[class*="price" i]');
      if (priceEl) price = parsePrice(textOf(priceEl).slice(0, 60), opts.currencyHint) ?? undefined;
    }
    out.push({ id: productIdFromUrl(href, baseUrl), title: title.slice(0, 200), url: absUrl(href, baseUrl), price });
  }
  // The same product is often linked twice (image + title): keep the longest title.
  const best = new Map<string, ListingProduct>();
  for (const p of out) {
    const prev = best.get(p.id);
    if (!prev || p.title.length > prev.title.length) best.set(p.id, { ...p, price: p.price ?? prev?.price });
  }
  return dedupe([...best.values()]);
}

export interface ListingDiff {
  added: ListingProduct[];
  removed: string[];
  retitled: Array<{ product: ListingProduct; oldTitle: string }>;
}

export function diffListing(seen: Record<string, string>, products: ListingProduct[]): ListingDiff {
  const now = new Set(products.map((p) => p.id));
  const added: ListingProduct[] = [];
  const retitled: ListingDiff["retitled"] = [];
  for (const p of products) {
    if (!(p.id in seen)) added.push(p);
    else if (seen[p.id] !== p.title) retitled.push({ product: p, oldTitle: seen[p.id] });
  }
  const removed = Object.keys(seen).filter((id) => !now.has(id));
  return { added, removed, retitled };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/** Any include keyword matches (or none given), and no exclude keyword matches. */
export function matchesKeywords(title: string, include: string[] = [], exclude: string[] = []): boolean {
  const t = norm(title);
  const inc = include.map(norm).filter(Boolean);
  const exc = exclude.map(norm).filter(Boolean);
  if (exc.some((k) => t.includes(k))) return false;
  return inc.length === 0 || inc.some((k) => t.includes(k));
}

export function parseKeywords(s: string): string[] {
  return s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
}
