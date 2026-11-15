// Reads the active tab (activeTab grant) so the popup can preview detection before any permission prompt.
export interface PageSnapshot {
  url: string;
  title: string;
  html: string;
  json: unknown | null; // Shopify /products/<h>.js or /collections/<h>/products.json, fetched same-origin
}

export async function inspectTab(tabId: number): Promise<PageSnapshot | null> {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const html = document.documentElement.outerHTML.slice(0, 3_000_000);
        const og = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
        const h1 = document.querySelector("h1")?.textContent?.trim();
        const out = { url: location.href, title: (og || h1 || document.title || "").trim().slice(0, 200), html, json: null as unknown };
        if (/cdn\.shopify\.com|Shopify\.shop|window\.Shopify/.test(html.slice(0, 400_000))) {
          const p = location.pathname.match(/\/products\/([^/?#]+)/);
          const c = location.pathname.match(/\/collections\/([^/?#]+)/);
          const path = p ? `/products/${p[1]}.js` : c ? `/collections/${c[1]}/products.json?limit=250` : null;
          if (path) {
            try {
              const res = await fetch(path, { credentials: "include", headers: { Accept: "application/json" } });
              if (res.ok) out.json = await res.json();
            } catch { /* not fatal */ }
          }
        }
        return out;
      },
    });
    return (r?.result as PageSnapshot) ?? null;
  } catch {
    return null;
  }
}

export const isRestricted = (url?: string) =>
  !url || !/^https?:/.test(url) || /chromewebstore\.google\.com|chrome\.google\.com\/webstore/.test(url);
