import { describe, it, expect } from "vitest";
import { detectQueue } from "../src/detect/queue";
import { runDetection } from "../src/detect";
import { fx } from "./helpers";

describe("queue / challenge guard", () => {
  it.each([
    ["queue-it.html", "queue"],
    ["queue-text.html", "queue"],
    ["cloudflare.html", "challenge"],
    ["incapsula.html", "block"],
  ])("%s → %s", (file, kind) => {
    expect(detectQueue(fx(file))?.kind).toBe(kind);
  });
  it("waiting-room URLs", () => {
    expect(detectQueue("<html></html>", "https://shop.queue-it.net/?c=x")?.kind).toBe("queue");
  });
  it("does not fire on normal pages", () => {
    expect(detectQueue(fx("normal-product.html"), "https://shop.example/products/x")).toBeNull();
    expect(detectQueue(fx("jsonld-in.html"))).toBeNull();
  });
  it("runDetection reports state queue before any strategy", () => {
    const r = runDetection({ kind: "product", strategy: "jsonld", url: "https://shop.example/p", inStockRule: { locale: "en" } }, fx("cloudflare.html"));
    expect(r.state).toBe("queue");
  });
});
