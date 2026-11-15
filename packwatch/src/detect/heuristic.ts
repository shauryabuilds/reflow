// Last-resort detection: a generic add-to-cart button and a price. Labelled "less reliable" in the UI.
import type { InStockRule, Money } from "../shared/types";
import { stockRules } from "../shared/data";
import { parsePrice, toMoney } from "../shared/price";
import { parseHTML, textOf } from "./html";
import { evaluateElement } from "./selector";
import type { DetectResult } from "./types";

const CANDIDATES = [
  'form[action*="/cart/add"] [type="submit"]',
  'form[action*="/cart/add"] button',
  'button[name="add"]',
  '[data-testid*="add-to-cart" i]',
  '[id*="add-to-cart" i], [class*="add-to-cart" i], [id*="addtocart" i], [class*="addtocart" i]',
  'button, input[type="submit"], input[type="button"], a[role="button"]',
];

export function findPrice(doc: Document, currencyHint?: string): Money | undefined {
  const metaAmt = doc.querySelector('meta[property="product:price:amount"], meta[property="og:price:amount"]');
  const metaCur = doc.querySelector('meta[property="product:price:currency"], meta[property="og:price:currency"]');
  if (metaAmt) {
    const m = toMoney(metaAmt.getAttribute("content") ?? "", metaCur?.getAttribute("content") ?? undefined, currencyHint);
    if (m) return m;
  }
  const ip = doc.querySelector('[itemprop="price"]');
  if (ip) {
    const cur = doc.querySelector('[itemprop="priceCurrency"]')?.getAttribute("content") ?? undefined;
    const m = toMoney(ip.getAttribute("content") ?? textOf(ip), cur, currencyHint);
    if (m) return m;
  }
  for (const el of Array.from(doc.querySelectorAll('[class*="price" i], [id*="price" i]')).slice(0, 40)) {
    const m = parsePrice(textOf(el).slice(0, 60), currencyHint);
    if (m && m.amount > 0) return m;
  }
  return undefined;
}

export function findSeller(doc: Document): string | undefined {
  const text = (doc.body?.textContent || "").replace(/\s+/g, " ");
  const m = text.match(/(?:ships from and sold by|sold by|seller)\s*:?\s+([A-Za-z0-9][\w&'.\- ]{1,50}?)(?=[.,|]|\s{2}|\s(?:and|ships|fulfilled)\b|$)/i);
  return m?.[1]?.trim();
}

export function detectHeuristic(html: string | Document, rule: InStockRule = { locale: "en" }, currencyHint?: string): DetectResult {
  const doc = typeof html === "string" ? parseHTML(html) : html;
  const rules = stockRules(rule.locale);
  const any = new RegExp(`${rules.inStock}|${rules.outOfStock}`, "i");
  const price = findPrice(doc, currencyHint);
  const seller = findSeller(doc);
  for (const sel of CANDIDATES) {
    for (const el of Array.from(doc.querySelectorAll(sel)).slice(0, 200)) {
      if (!any.test(textOf(el))) continue;
      const r = evaluateElement(el, rule);
      if (r.state !== "unknown") return { ...r, price, seller, evidence: `Heuristic (less reliable): ${r.evidence}` };
    }
  }
  return { state: "unknown", price, seller, evidence: "Heuristic (less reliable): no add-to-cart button found" };
}
