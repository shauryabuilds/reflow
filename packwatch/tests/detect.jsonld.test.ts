import { describe, it, expect } from "vitest";
import { detectJsonLd, listingFromJsonLd } from "../src/detect/jsonld";
import { fx } from "./helpers";

describe("JSON-LD product", () => {
  it.each([
    ["jsonld-in.html", "in", "InStock"],
    ["jsonld-out.html", "out", "OutOfStock"],
    ["jsonld-soldout.html", "out", "SoldOut"],
    ["jsonld-preorder.html", "preorder", "PreOrder"],
    ["jsonld-backorder.html", "preorder", "BackOrder"],
  ])("%s → %s", (file, state, raw) => {
    const r = detectJsonLd(fx(file));
    expect(r.state).toBe(state);
    expect(r.evidence).toBe(`JSON-LD availability = ${raw}`);
  });
  it("reads price and currency", () => {
    expect(detectJsonLd(fx("jsonld-preorder.html")).price).toEqual({ amount: 189, currency: "SGD" });
    expect(detectJsonLd(fx("jsonld-in.html")).price).toEqual({ amount: 129.9, currency: "USD" });
  });
  it("@graph + AggregateOffer: any in-stock offer wins, with its price", () => {
    const r = detectJsonLd(fx("jsonld-graph-aggregate.html"));
    expect(r.state).toBe("in");
    expect(r.price).toEqual({ amount: 59.95, currency: "GBP" });
  });
  it("tolerates broken JSON (trailing commas)", () => {
    expect(detectJsonLd(fx("jsonld-broken.html"))).toMatchObject({ state: "in", price: { amount: 24.99, currency: "EUR" } });
  });
  it("reports the seller", () => {
    expect(detectJsonLd(fx("jsonld-seller.html")).seller).toBe("MarkupMart");
  });
  it("ambiguous: no product / no availability", () => {
    expect(detectJsonLd(fx("heuristic-ambiguous.html")).state).toBe("unknown");
    const r = detectJsonLd(fx("jsonld-no-availability.html"));
    expect(r.state).toBe("unknown");
    expect(r.price).toEqual({ amount: 5, currency: "USD" });
  });
  it("ItemList → listing products", () => {
    const list = listingFromJsonLd(fx("jsonld-itemlist.html"), "https://shop.example.au/collections/all");
    expect(list).toEqual([
      { id: "/product/lorcana-box", title: "Lorcana Booster Box", url: "https://shop.example.au/product/lorcana-box", price: { amount: 144, currency: "AUD" }, available: true },
      { id: "/product/ygo-tin", title: "Yu-Gi-Oh! Tin", url: "https://shop.example.au/product/ygo-tin", price: undefined, available: undefined },
    ]);
  });
});
