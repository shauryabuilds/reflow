import { describe, it, expect } from "vitest";
import { buildSelector, looksGenerated, normalizeTarget } from "../src/shared/selector";

function doc(html: string) {
  document.body.innerHTML = html;
  return document;
}

describe("robust selector builder", () => {
  it("prefers a stable id", () => {
    const d = doc(`<div><button id="add-to-cart">Add</button></div>`);
    expect(buildSelector(d.querySelector("button")!)).toBe("#add-to-cart");
  });
  it("skips generated ids and uses data-* attributes", () => {
    const d = doc(`<button id="btn-839201" data-testid="pdp-add">Add</button><button data-testid="other">x</button>`);
    expect(buildSelector(d.querySelector("#btn-839201")!)).toBe('button[data-testid="pdp-add"]');
  });
  it("uses stable classes, ignoring state and hashed classes", () => {
    const d = doc(`<button class="is-active css-1x9z2k product-form__submit">Add</button><button class="secondary">x</button>`);
    expect(buildSelector(d.querySelector("button")!)).toBe("button.product-form__submit");
  });
  it("anchors on a stable ancestor instead of an nth-child chain", () => {
    const d = doc(`<div id="buy-box"><div class="row"><button class="btn">Add</button></div></div><div class="row"><button class="btn">Wishlist</button></div>`);
    const sel = buildSelector(d.querySelector("#buy-box button")!);
    expect(sel).toBe("#buy-box button.btn");
    expect(sel).not.toMatch(/nth-child/);
    expect(d.querySelectorAll(sel)).toHaveLength(1);
  });
  it("normalizes a span inside a button to the button", () => {
    const d = doc(`<button id="go"><span>Add</span></button>`);
    expect(normalizeTarget(d.querySelector("span")!)).toBe(d.querySelector("button"));
  });
  it("still returns a working selector for anonymous markup", () => {
    const d = doc(`<div><div><button>A</button><button>B</button></div></div>`);
    const b = d.querySelectorAll("button")[1];
    const sel = buildSelector(b);
    expect(d.querySelector(sel)).toBe(b);
  });
  it("generated-token detection", () => {
    expect(looksGenerated("btn-839201")).toBe(true);
    expect(looksGenerated("radix-:r3:")).toBe(true);
    expect(looksGenerated("product-form__submit")).toBe(false);
  });
});
