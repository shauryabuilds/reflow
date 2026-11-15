import type { CheckResult, Monitor, MonitorRuntime } from "../src/shared/types";

export function monitor(over: Partial<Monitor> = {}): Monitor {
  return {
    id: "m1", kind: "product", url: "https://shop.example/products/etb", title: "ETB", shopDomain: "shop.example",
    mode: "fetch", strategy: "shopify", inStockRule: { locale: "en" }, alertOn: { restock: true, preorder: true },
    intervalSec: 60, priority: "normal", state: "out", stableState: "out", consecutiveErrors: 0, createdAt: 0,
    ...over,
  };
}
export function runtime(over: Partial<MonitorRuntime> = {}): MonitorRuntime {
  return { nextCheckAt: 0, lastAlertAt: {}, lastSuccessAt: 1_000, ...over };
}
export function ok(over: Partial<CheckResult> = {}): CheckResult {
  return { ok: true, state: "in", evidence: "test", checkedAt: 0, ...over };
}
