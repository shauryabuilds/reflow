import { describe, it, expect } from "vitest";
import { detectSelector } from "../src/detect/selector";
import { fx } from "./helpers";

const html = fx("selector-page.html");
const en = { locale: "en" };

describe("selector strategy", () => {
  it("in stock when text matches the in-stock rule", () => {
    expect(detectSelector(html, "#atc", en)).toMatchObject({ state: "in" });
  });
  it("out of stock text wins", () => {
    expect(detectSelector(html, "#soldout", en)).toMatchObject({ state: "out" });
  });
  it("disabled button is out of stock", () => {
    expect(detectSelector(html, "#disabled", en)).toMatchObject({ state: "out", evidence: expect.stringMatching(/disabled/) });
    expect(detectSelector(html, "#disabled", { locale: "en", useEnabled: false })).toMatchObject({ state: "in" });
  });
  it("preorder", () => {
    expect(detectSelector(html, '[data-role="cta"]', en)).toMatchObject({ state: "preorder" });
  });
  it("ambiguous text and missing element are unknown", () => {
    expect(detectSelector(html, "#odd", en).state).toBe("unknown");
    expect(detectSelector(html, "#nope", en)).toMatchObject({ state: "unknown", evidence: expect.stringMatching(/not found/) });
    expect(detectSelector(html, "##bad", en)).toMatchObject({ state: "unknown", evidence: "Invalid selector" });
  });
  it("custom regexes override the locale rule", () => {
    expect(detectSelector(html, "#odd", { locale: "en", inStock: "check back" }).state).toBe("in");
  });
});
