import type { DetectConfig } from "../detect";
import type { Monitor } from "./types";

export function detectConfigOf(m: Monitor): DetectConfig {
  return {
    kind: m.kind === "listing" ? "listing" : "product",
    strategy: m.strategy, url: m.url, selector: m.selector, inStockRule: m.inStockRule,
    variantId: m.variantId, currencyHint: m.currencyHint,
  };
}

export const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
