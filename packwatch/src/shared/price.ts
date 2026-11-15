// Locale-aware price parsing. Prices are always { amount, currency }.
import type { Money } from "./types";

// Longest symbols first so "S$" wins over "$".
const SYMBOLS: Array<[string, string]> = [
  ["US$", "USD"], ["S$", "SGD"], ["SG$", "SGD"], ["A$", "AUD"], ["AU$", "AUD"], ["C$", "CAD"], ["CA$", "CAD"],
  ["NZ$", "NZD"], ["HK$", "HKD"], ["NT$", "TWD"], ["RM", "MYR"], ["R$", "BRL"], ["MX$", "MXN"],
  ["€", "EUR"], ["£", "GBP"], ["¥", "JPY"], ["￥", "JPY"], ["₩", "KRW"], ["₱", "PHP"], ["฿", "THB"], ["₹", "INR"],
  ["$", "USD"],
];
const CODES = new Set(["USD", "SGD", "AUD", "CAD", "NZD", "HKD", "TWD", "MYR", "BRL", "MXN", "EUR", "GBP", "JPY", "KRW", "PHP", "THB", "INR", "CNY", "IDR", "VND", "CHF", "SEK", "NOK", "DKK", "PLN"]);
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "IDR", "TWD"]);

/** "$" alone is ambiguous: trust a hint (from JSON-LD, Shopify or the shop's region) over the USD default. */
function resolveSymbol(sym: string, hint?: string): string {
  const cur = SYMBOLS.find(([s]) => s === sym)?.[1] ?? "USD";
  if (sym === "$" && hint && CODES.has(hint.toUpperCase())) return hint.toUpperCase();
  if (sym === "¥" && hint?.toUpperCase() === "CNY") return "CNY";
  return cur;
}

/** Parses a number written with either "," or "." as decimal separator. */
export function parseAmount(raw: string, currency?: string): number | null {
  const s = raw.replace(/[\s  ']/g, "");
  const m = s.match(/\d[\d.,]*/);
  if (!m) return null;
  let n = m[0].replace(/[.,]$/, "");
  const lastDot = n.lastIndexOf("."), lastComma = n.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);
  if (lastSep === -1) return Number(n);
  const decimals = n.length - lastSep - 1;
  const both = lastDot !== -1 && lastComma !== -1;
  const sepCount = (n.match(/[.,]/g) || []).length;
  // Both separators: the last one is the decimal mark ("1.299,00", "1,299.00").
  // One kind only: repeated ("1,234,567") or followed by exactly 3 digits ("1,299", "12.000") means thousands.
  let isDecimal = both || (sepCount === 1 && decimals !== 3);
  if (!both && currency && ZERO_DECIMAL.has(currency)) isDecimal = false;
  if (isDecimal) {
    const intPart = n.slice(0, lastSep).replace(/[.,]/g, "");
    n = `${intPart}.${n.slice(lastSep + 1)}`;
  } else {
    n = n.replace(/[.,]/g, "");
  }
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

/** Parses "S$12.90", "SGD 12.90", "1.299,00 €", "¥12,000"… Returns null when no price is found. */
export function parsePrice(text: string, hintCurrency?: string): Money | null {
  if (!text) return null;
  const t = text.trim();
  let currency: string | undefined;
  const code = t.match(/\b([A-Z]{3})\b/);
  if (code && CODES.has(code[1])) currency = code[1];
  if (!currency) {
    for (const [sym] of SYMBOLS) {
      if (t.includes(sym)) { currency = resolveSymbol(sym, hintCurrency); break; }
    }
  }
  currency ??= hintCurrency?.toUpperCase();
  if (!currency) return null;
  const amount = parseAmount(t, currency);
  if (amount === null) return null;
  return { amount, currency };
}

/** Normalizes a raw JSON value (number or string) plus a currency code into Money. */
export function toMoney(value: unknown, currency?: string, hint?: string): Money | undefined {
  const cur = (currency || hint || "").toUpperCase();
  if (typeof value === "number" && Number.isFinite(value) && cur) return { amount: value, currency: cur };
  if (typeof value === "string" && value.trim()) {
    const v = value.trim();
    // Machine-readable prices (JSON-LD, meta tags) use "." as the decimal mark, except
    // zero-decimal currencies where "12.900" can only mean twelve thousand nine hundred.
    if (/^\d+(\.\d+)?$/.test(v) && cur) {
      if (ZERO_DECIMAL.has(cur) && /\.\d{3}$/.test(v)) return { amount: Number(v.replace(".", "")), currency: cur };
      return { amount: Number(v), currency: cur };
    }
    return parsePrice(value, cur || undefined) ?? undefined;
  }
  return undefined;
}

export function formatMoney(m: Money | undefined, locale = "en-US"): string {
  if (!m) return "";
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: m.currency }).format(m.amount);
  } catch {
    return `${m.currency} ${m.amount}`;
  }
}

export const sameCurrency = (a?: Money, b?: Money) => !!a && !!b && a.currency === b.currency;
