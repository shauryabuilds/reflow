import { describe, it, expect } from "vitest";
import { detectShopifyCollection, detectShopifyProduct, isShopify, shopifyCurrency } from "../src/detect/shopify";
import { diffListing } from "../src/detect/listing";
import { fx, fxJson } from "./helpers";

describe("Shopify product .js", () => {
  it("in stock", () => {
    const r = detectShopifyProduct(fxJson("shopify-product-in.json"), { currencyHint: "SGD" });
    expect(r.state).toBe("in");
    expect(r.price).toEqual({ amount: 64.99, currency: "SGD" });
    expect(r.evidence).toMatch(/available = true/);
  });
  it("out of stock", () => {
    expect(detectShopifyProduct(fxJson("shopify-product-out.json"), { currencyHint: "USD" }).state).toBe("out");
  });
  it("preorder via tags", () => {
    const r = detectShopifyProduct(fxJson("shopify-product-preorder.json"));
    expect(r.state).toBe("preorder");
    expect(r.evidence).toMatch(/preorder/);
  });
  it("watches a specific variant", () => {
    const j = fxJson("shopify-product-variants.json");
    expect(detectShopifyProduct(j, { variantId: "21", currencyHint: "USD" })).toMatchObject({ state: "out", variantTitle: "English" });
    expect(detectShopifyProduct(j, { variantId: "22", currencyHint: "USD" })).toMatchObject({ state: "in", variantTitle: "Japanese", price: { amount: 139, currency: "USD" } });
  });
  it("ambiguous response is unknown", () => {
    expect(detectShopifyProduct(fxJson("shopify-product-ambiguous.json")).state).toBe("unknown");
    expect(detectShopifyProduct("nope").state).toBe("unknown");
  });
  it("recognises a storefront and its currency", () => {
    const html = fx("shopify-storefront.html");
    expect(isShopify(html)).toBe(true);
    expect(shopifyCurrency(html)).toBe("SGD");
    expect(isShopify(fx("jsonld-in.html"))).toBe(false);
  });
});

describe("Shopify collection diff", () => {
  const origin = "https://cardshop.example";
  const first = detectShopifyCollection(fxJson("shopify-collection-1.json"), origin, "SGD").products!;
  const second = detectShopifyCollection(fxJson("shopify-collection-2.json"), origin, "SGD").products!;
  it("reads products with URLs and prices", () => {
    expect(first).toHaveLength(3);
    expect(first[0]).toMatchObject({ id: "1", url: `${origin}/products/op-14-box`, price: { amount: 119.9, currency: "SGD" }, available: true });
  });
  it("finds added, removed and re-titled products", () => {
    const seen = Object.fromEntries(first.map((p) => [p.id, p.title]));
    const d = diffListing(seen, second);
    expect(d.added.map((p) => p.id)).toEqual(["4"]);
    expect(d.removed).toEqual(["3"]);
    expect(d.retitled).toEqual([{ product: expect.objectContaining({ id: "2", title: "OP-15 Booster Box Pre-Order" }), oldTitle: "Coming Soon Mystery Item" }]);
  });
  it("rejects non-collection JSON", () => {
    expect(detectShopifyCollection({ product: {} }, origin).products).toBeUndefined();
  });
});
