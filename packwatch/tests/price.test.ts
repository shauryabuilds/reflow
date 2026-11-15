import { describe, it, expect } from "vitest";
import { formatMoney, parsePrice, toMoney } from "../src/shared/price";

describe("multi-currency price parsing", () => {
  it.each([
    ["$12.99", undefined, 12.99, "USD"],
    ["$12.99", "SGD", 12.99, "SGD"],
    ["S$189.00", undefined, 189, "SGD"],
    ["SGD 1,299.90", undefined, 1299.9, "SGD"],
    ["£1,299", undefined, 1299, "GBP"],
    ["1.299,00 €", undefined, 1299, "EUR"],
    ["24,99 €", undefined, 24.99, "EUR"],
    ["¥12,900", undefined, 12900, "JPY"],
    ["A$ 144", undefined, 144, "AUD"],
    ["HK$1,050.50", undefined, 1050.5, "HKD"],
    ["RM 89.90", undefined, 89.9, "MYR"],
    ["₩45,000", undefined, 45000, "KRW"],
    ["USD 1,234,567.89", undefined, 1234567.89, "USD"],
  ])("%s (hint %s) → %d %s", (text, hint, amount, currency) => {
    expect(parsePrice(text, hint)).toEqual({ amount, currency });
  });
  it("no currency, no price", () => {
    expect(parsePrice("12.99")).toBeNull();
    expect(parsePrice("Sold out")).toBeNull();
  });
  it("machine-readable values", () => {
    expect(toMoney("129.90", "usd")).toEqual({ amount: 129.9, currency: "USD" });
    expect(toMoney(54.95, "GBP")).toEqual({ amount: 54.95, currency: "GBP" });
    expect(toMoney("12.900", "JPY")).toEqual({ amount: 12900, currency: "JPY" });
    expect(toMoney("5", undefined)).toBeUndefined();
  });
  it("formats in the user's locale", () => {
    expect(formatMoney({ amount: 189, currency: "SGD" }, "en-SG")).toMatch(/189\.00/);
    expect(formatMoney({ amount: 1299, currency: "EUR" }, "de-DE")).toMatch(/1\.299,00/);
  });
});
