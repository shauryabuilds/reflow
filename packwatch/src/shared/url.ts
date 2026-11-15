// URL helpers: shop domain, region guess, Shopify paths.
export function shopDomainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

export function originPattern(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.hostname}/*`;
}

const TLD_REGION: Array<[RegExp, string]> = [
  [/\.sg$/, "SG"], [/\.co\.uk$|\.uk$/, "UK"], [/\.com\.au$|\.au$/, "AU"], [/\.ca$/, "CA"], [/\.jp$/, "JP"],
  [/\.com\.my$|\.my$/, "MY"], [/\.ph$/, "PH"], [/\.hk$/, "HK"], [/\.tw$/, "TW"], [/\.kr$/, "KR"], [/\.nz$/, "NZ"],
  [/\.de$|\.fr$|\.nl$|\.es$|\.it$|\.be$|\.at$|\.ie$|\.eu$/, "EU"],
];

export function guessRegion(domain: string): string | undefined {
  for (const [re, r] of TLD_REGION) if (re.test(domain)) return r;
  return undefined;
}

/** "/products/<handle>" (optionally under /collections/x/ or a locale prefix). */
export function shopifyProductHandle(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\/products\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]).replace(/\.(js|json)$/, "") : null;
  } catch { return null; }
}

export function shopifyCollectionHandle(url: string): string | null {
  try {
    const p = new URL(url).pathname;
    if (/\/products\//.test(p)) return null;
    const m = p.match(/\/collections\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

export function shopifyProductJsUrl(url: string): string | null {
  const h = shopifyProductHandle(url);
  if (!h) return null;
  const u = new URL(url);
  return `${u.origin}/products/${encodeURIComponent(h)}.js`;
}

export function shopifyCollectionJsonUrl(url: string): string | null {
  const h = shopifyCollectionHandle(url);
  if (!h) return null;
  const u = new URL(url);
  return `${u.origin}/collections/${encodeURIComponent(h)}/products.json?limit=250`;
}

export function absUrl(href: string, base: string): string {
  try { return new URL(href, base).href; } catch { return href; }
}

/** Stable product id from a URL: path without trailing slash, query or hash. */
export function productIdFromUrl(href: string, base: string): string {
  try {
    const u = new URL(href, base);
    return u.pathname.replace(/\/+$/, "").toLowerCase();
  } catch { return href; }
}
