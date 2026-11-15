import { describe, it, expect } from "vitest";
import { detectHeuristic } from "../src/detect/heuristic";
import { fx } from "./helpers";

describe("heuristic strategy", () => {
  it("finds an enabled add-to-cart button, price and seller", () => {
    const r = detectHeuristic(fx("heuristic-in.html"));
    expect(r.state).toBe("in");
    expect(r.price).toEqual({ amount: 12900, currency: "JPY" });
    expect(r.seller).toBe("CardStore JP");
    expect(r.evidence).toMatch(/less reliable/);
  });
  it("out of stock", () => {
    const r = detectHeuristic(fx("heuristic-out.html"));
    expect(r.state).toBe("out");
    expect(r.price).toEqual({ amount: 54.95, currency: "GBP" });
  });
  it("ambiguous page is unknown", () => {
    expect(detectHeuristic(fx("heuristic-ambiguous.html")).state).toBe("unknown");
  });
});
