import { describe, it, expect } from "vitest";
import { diffListing, extractListing, matchesKeywords, parseKeywords } from "../src/detect/listing";
import { runDetection, fetchUrlFor, autoDetect } from "../src/detect";
import { classifyPage } from "../src/detect/classify";
import { fx, fxJson } from "./helpers";

const base = "https://cardshop.example/collections/one-piece";

describe("listing extraction and keywords", () => {
  const products = extractListing(fx("listing-links.html"), base, { currencyHint: "SGD" });
  it("extracts product links once each, keeping the best title and price", () => {
    expect(products.map((p) => p.id)).toEqual(["/products/op-15-booster-box", "/products/sv-etb", "/products/op-15-booster-box-jp", "/products/sleeves"]);
    expect(products[0]).toMatchObject({ title: "OP-15 Booster Box (Pre-order)", price: { amount: 189, currency: "SGD" } });
  });
  it("include/exclude keywords", () => {
    const inc = parseKeywords("OP-15, booster box");
    const exc = parseKeywords("japanese");
    expect(products.filter((p) => matchesKeywords(p.title, inc, exc)).map((p) => p.id)).toEqual(["/products/op-15-booster-box"]);
    expect(matchesKeywords("Pokémon ETB", ["pokemon"])).toBe(true); // accents ignored
    expect(matchesKeywords("anything", [])).toBe(true);
  });
  it("diff: added, removed, re-titled", () => {
    const d = diffListing({ "/products/sv-etb": "SV ETB", "/products/gone": "Gone" }, products);
    expect(d.added.map((p) => p.id)).toEqual(["/products/op-15-booster-box", "/products/op-15-booster-box-jp", "/products/sleeves"]);
    expect(d.removed).toEqual(["/products/gone"]);
    expect(d.retitled[0]).toMatchObject({ oldTitle: "SV ETB", product: { title: "Scarlet & Violet ETB" } });
  });
});

describe("runDetection / fetchUrlFor / classify / autoDetect", () => {
  it("Shopify uses JSON endpoints", () => {
    expect(fetchUrlFor({ kind: "product", strategy: "shopify", url: "https://s.example/collections/x/products/pe-etb?variant=1" })).toBe("https://s.example/products/pe-etb.js");
    expect(fetchUrlFor({ kind: "listing", strategy: "shopify", url: "https://s.example/collections/one-piece" })).toBe("https://s.example/collections/one-piece/products.json?limit=250");
    expect(fetchUrlFor({ kind: "product", strategy: "jsonld", url: "https://s.example/p/1" })).toBe("https://s.example/p/1");
  });
  it("runs the configured strategy", () => {
    const cfg = { kind: "product" as const, strategy: "shopify" as const, url: "https://s.example/products/pe-etb", inStockRule: { locale: "en" }, currencyHint: "SGD" };
    expect(runDetection(cfg, fx("shopify-product-out.json")).state).toBe("out");
    const lst = runDetection({ ...cfg, kind: "listing", url: base }, fx("shopify-collection-1.json"));
    expect(lst.products).toHaveLength(3);
    expect(runDetection({ ...cfg, strategy: "jsonld" }, fx("jsonld-preorder.html")).state).toBe("preorder");
  });
  it("classifies pages", () => {
    expect(classifyPage(fx("shopify-storefront.html"), "https://cardshop.example/products/pe-etb").type).toBe("product");
    expect(classifyPage(fx("jsonld-itemlist.html"), "https://shop.example.au/c").type).toBe("listing");
    expect(classifyPage(fx("listing-links.html"), base).type).toBe("listing");
    expect(classifyPage(fx("heuristic-ambiguous.html"), "https://blog.example/").type).toBe("unknown");
  });
  it("auto-detect follows Shopify → JSON-LD → heuristic", () => {
    const html = fx("shopify-storefront.html");
    expect(autoDetect(html, "https://c.example/products/pe-etb", { shopifyJson: fxJson("shopify-product-in.json") })).toMatchObject({ strategy: "shopify", result: { state: "in", price: { currency: "SGD" } } });
    expect(autoDetect(fx("jsonld-out.html"), "https://x.example/p").strategy).toBe("jsonld");
    expect(autoDetect(fx("heuristic-out.html"), "https://x.example/p")).toMatchObject({ strategy: "heuristic", result: { state: "out" } });
  });
});
