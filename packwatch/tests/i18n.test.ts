import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

describe("i18n", () => {
  it("every string key used in the UI exists in messages.json", () => {
    expect(() => execFileSync("node", ["scripts/i18n-keys.mjs"], { stdio: "pipe" })).not.toThrow();
  });
});
