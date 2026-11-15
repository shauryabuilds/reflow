// User-picked element. In stock when its text matches the in-stock rule and not the
// out-of-stock rule, or (optionally) when the button is enabled.
import type { InStockRule } from "../shared/types";
import { stockRules } from "../shared/data";
import { isDisabled, parseHTML, textOf } from "./html";
import type { DetectResult } from "./types";

const re = (src: string) => new RegExp(src, "i");
const clip = (s: string) => (s.length > 40 ? s.slice(0, 40) + "…" : s);

export function evaluateElement(el: Element, rule: InStockRule): DetectResult {
  const rules = stockRules(rule.locale);
  const text = textOf(el);
  const inRe = re(rule.inStock || rules.inStock);
  const outRe = re(rule.outOfStock || rules.outOfStock);
  const isControl = /^(BUTTON|INPUT|A)$/.test(el.tagName) || el.getAttribute("role") === "button";
  if (outRe.test(text)) return { state: "out", evidence: `“${clip(text)}” matches the out-of-stock rule` };
  if (rule.useEnabled !== false && isControl && isDisabled(el)) return { state: "out", evidence: `Button “${clip(text)}” is disabled` };
  if (inRe.test(text)) {
    const pre = re(rules.preorder).test(text);
    return { state: pre ? "preorder" : "in", evidence: `“${clip(text)}” matches the ${pre ? "preorder" : "in-stock"} rule` };
  }
  return { state: "unknown", evidence: `“${clip(text) || "(empty)"}” matches no rule` };
}

export function detectSelector(html: string | Document, selector: string, rule: InStockRule): DetectResult {
  const doc = typeof html === "string" ? parseHTML(html) : html;
  let el: Element | null = null;
  try { el = doc.querySelector(selector); } catch { return { state: "unknown", evidence: "Invalid selector" }; }
  if (!el) return { state: "unknown", evidence: "Picked element not found on the page" };
  return evaluateElement(el, rule);
}
