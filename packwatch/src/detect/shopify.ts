// Shopify: product pages expose /products/<handle>.js, collections /collections/<handle>/products.json.
import type { ListingProduct } from "../shared/types";
import { toMoney } from "../shared/price";
import type { DetectResult } from "./types";

export function isShopify(html: string, url = ""): boolean {
  return /cdn\.shopify\.com|window\.Shopify\b|Shopify\.shop\s*=|shopify-section|myshopify\.com/i.test(html.slice(0, 400_000))
    || /\.myshopify\.com$/i.test(safeHost(url));
}

/** Reads Shopify.currency.active from storefront HTML. */
export function shopifyCurrency(html: string): string | undefined {
  const m = html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/);
  return m?.[1];
}

interface ShopifyVariant { id: number | string; title?: string; available?: boolean; price?: number | string }
interface ShopifyProductJs {
  title?: string; available?: boolean; price?: number; tags?: string[] | string;
  variants?: ShopifyVariant[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** .js prices are integers in minor units (cents); products.json prices are decimal strings. */
function centsToMoney(v: unknown, currency: string | undefined) {
  if (typeof v === "number") return toMoney(v / 100, currency);
  if (typeof v === "string" && /^\d+$/.test(v)) return toMoney(Number(v) / 100, currency);
  return toMoney(v, currency);
}

export function detectShopifyProduct(json: unknown, opts: { variantId?: string; currencyHint?: string } = {}): DetectResult {
  if (!isObj(json) || !Array.isArray((json as ShopifyProductJs).variants)) {
    return { state: "unknown", evidence: "Not a Shopify product response" };
  }
  const p = json as ShopifyProductJs;
  const variants = p.variants ?? [];
  const tags = (Array.isArray(p.tags) ? p.tags : String(p.tags ?? "").split(",")).map((t) => t.trim().toLowerCase());
  const preorderish = tags.some((t) => /pre-?order/.test(t)) || /pre-?order/i.test(p.title ?? "");
  let target: ShopifyVariant | undefined;
  if (opts.variantId) target = variants.find((v) => String(v.id) === String(opts.variantId));
  const available = target ? !!target.available : (p.available ?? variants.some((v) => v.available));
  const priceVariant = target ?? variants.find((v) => v.available) ?? variants[0];
  const price = centsToMoney(priceVariant?.price ?? p.price, opts.currencyHint);
  const vt = target?.title && target.title !== "Default Title" ? target.title : undefined;
  const scope = target ? `variant “${vt ?? target.id}”` : "product";
  if (!available) return { state: "out", price, variantTitle: vt, evidence: `Shopify ${scope} available = false` };
  return {
    state: preorderish ? "preorder" : "in",
    price, variantTitle: vt,
    evidence: preorderish ? `Shopify ${scope} available, tagged preorder` : `Shopify ${scope} available = true`,
  };
}

interface ShopifyCollectionProduct { id: number | string; title?: string; handle?: string; variants?: ShopifyVariant[] }

export function detectShopifyCollection(json: unknown, origin: string, currencyHint?: string): DetectResult {
  const list = isObj(json) && Array.isArray(json.products) ? (json.products as ShopifyCollectionProduct[]) : null;
  if (!list) return { state: "unknown", evidence: "Not a Shopify products.json response" };
  const products: ListingProduct[] = list.map((p) => {
    const v = p.variants ?? [];
    const avail = v.some((x) => x.available);
    return {
      id: String(p.id),
      title: p.title ?? p.handle ?? String(p.id),
      url: `${origin}/products/${p.handle ?? ""}`,
      price: toMoney((v.find((x) => x.available) ?? v[0])?.price, currencyHint),
      available: avail,
    };
  });
  return { state: "unknown", products, evidence: `Shopify collection: ${products.length} products` };
}

function safeHost(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}
