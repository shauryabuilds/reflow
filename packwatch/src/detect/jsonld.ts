// schema.org Product / Offer / ItemList from <script type="application/ld+json">.
import type { ListingProduct, Money } from "../shared/types";
import { toMoney } from "../shared/price";
import { absUrl, productIdFromUrl } from "../shared/url";
import { parseHTML } from "./html";
import type { DetectResult, DetectState } from "./types";

type Node = Record<string, unknown>;
const isObj = (v: unknown): v is Node => !!v && typeof v === "object" && !Array.isArray(v);

function parseLoose(text: string): unknown {
  try { return JSON.parse(text); } catch { /* fall through */ }
  try {
    // Common CMS breakage: raw newlines/tabs inside strings, trailing commas.
    return JSON.parse(text.replace(/[\u0000-\u001f]+/g, " ").replace(/,\s*([}\]])/g, "$1"));
  } catch { return null; }
}

/** All JSON-LD nodes in the document, with @graph and arrays flattened. */
export function extractJsonLd(input: string | Document): Node[] {
  const doc = typeof input === "string" ? parseHTML(input) : input;
  const out: Node[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) { v.forEach(visit); return; }
    if (!isObj(v)) return;
    out.push(v);
    if (Array.isArray(v["@graph"])) (v["@graph"] as unknown[]).forEach(visit);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => visit(parseLoose(s.textContent || "")));
  return out;
}

const typeIs = (n: Node, t: string) => {
  const ty = n["@type"];
  return Array.isArray(ty) ? ty.includes(t) : ty === t;
};

const AVAIL: Array<[RegExp, DetectState]> = [
  [/PreOrder|PreSale/i, "preorder"],
  [/BackOrder/i, "preorder"],
  [/OutOfStock|SoldOut|Discontinued/i, "out"],
  [/InStock|LimitedAvailability|OnlineOnly|InStoreOnly/i, "in"],
];

function availabilityState(a: unknown): { state: DetectState; raw: string } | null {
  if (typeof a !== "string") return null;
  const raw = a.replace(/^https?:\/\/schema\.org\//i, "");
  for (const [re, s] of AVAIL) if (re.test(raw)) return { state: s, raw };
  return null;
}

function offersOf(product: Node): Node[] {
  const out: Node[] = [];
  const add = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(add);
    else if (isObj(o)) {
      if (typeIs(o, "AggregateOffer") && o.offers) add(o.offers);
      out.push(o);
    }
  };
  add(product.offers);
  // ProductGroup → variants
  if (Array.isArray(product.hasVariant)) for (const v of product.hasVariant) if (isObj(v)) add(v.offers);
  return out;
}

function sellerOf(o: Node): string | undefined {
  const s = o.seller;
  if (isObj(s) && typeof s.name === "string") return s.name;
  if (typeof s === "string") return s;
  return undefined;
}

export function detectJsonLd(html: string | Document, currencyHint?: string): DetectResult {
  const nodes = extractJsonLd(html);
  const product = nodes.find((n) => typeIs(n, "Product")) ?? nodes.find((n) => typeIs(n, "ProductGroup"));
  if (!product) return { state: "unknown", evidence: "No JSON-LD Product found" };
  const offers = offersOf(product);
  if (!offers.length) return { state: "unknown", evidence: "JSON-LD Product has no offers" };
  const states = offers.map((o) => ({ o, a: availabilityState(o.availability) })).filter((x) => x.a);
  const pick = states.find((x) => x.a!.state === "in") ?? states.find((x) => x.a!.state === "preorder") ?? states[0];
  const priceOffer = pick?.o ?? offers[0];
  const price: Money | undefined = toMoney(priceOffer.price ?? priceOffer.lowPrice, priceOffer.priceCurrency as string | undefined, currencyHint);
  const seller = sellerOf(priceOffer);
  if (!pick) return { state: "unknown", price, seller, evidence: "JSON-LD offer has no availability" };
  return { state: pick.a!.state, price, seller, evidence: `JSON-LD availability = ${pick.a!.raw}` };
}

/** schema.org ItemList → listing products. */
export function listingFromJsonLd(html: string | Document, baseUrl: string, currencyHint?: string): ListingProduct[] {
  const nodes = extractJsonLd(html);
  const lists = nodes.filter((n) => typeIs(n, "ItemList") || typeIs(n, "CollectionPage") || typeIs(n, "SearchResultsPage"));
  const products: ListingProduct[] = [];
  for (const l of lists) {
    const items = (l.itemListElement ?? (isObj(l.mainEntity) ? l.mainEntity.itemListElement : undefined)) as unknown;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (!isObj(it)) continue;
      const item = isObj(it.item) ? it.item : it;
      const url = typeof item.url === "string" ? item.url : typeof it.url === "string" ? it.url : typeof item["@id"] === "string" ? item["@id"] : "";
      const name = typeof item.name === "string" ? item.name : typeof it.name === "string" ? it.name : "";
      if (!url || !name) continue;
      const offers = offersOf(item);
      const avail = offers.map((o) => availabilityState(o.availability)?.state).find(Boolean);
      products.push({
        id: productIdFromUrl(url, baseUrl), title: name, url: absUrl(url, baseUrl),
        price: offers[0] ? toMoney(offers[0].price ?? offers[0].lowPrice, offers[0].priceCurrency as string | undefined, currencyHint) : undefined,
        available: avail ? avail === "in" || avail === "preorder" : undefined,
      });
    }
  }
  return dedupe(products);
}

export function dedupe(list: ListingProduct[]): ListingProduct[] {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
}
