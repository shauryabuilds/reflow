import { describe, it, expect, beforeEach } from "vitest";
import { migrateV0toV1, runMigrations } from "../src/shared/migrations";
import { resetChromeStorage } from "./setup";
import { getLocal } from "../src/shared/storage";

describe("Reflow → Packwatch migration", () => {
  beforeEach(resetChromeStorage);

  it("moves Reflow per-site prefs into Simple Refresh prefs and flags the welcome card", () => {
    const r = migrateV0toV1({ local: {
      reflow_domains: { "shop.example": { interval: 10, hardRefresh: false, preserveScroll: true, randomize: true } },
      reflow_last: { interval: 2 },
      reflow_state: { "12": { active: true } },
    } });
    expect(r.reflowUpgrade).toBe(true);
    expect(r.set["pw.simplePrefs"]).toEqual({ "shop.example": { intervalSec: 10, randomize: true, hardRefresh: false, keepScroll: true } });
    expect(r.set["pw.simpleLast"]).toEqual({ intervalSec: 5, randomize: false, hardRefresh: true, keepScroll: true });
    expect(r.remove.sort()).toEqual(["reflow_domains", "reflow_last", "reflow_state"]);
    expect((r.set["pw.ui"] as { welcomePending: boolean }).welcomePending).toBe(true);
  });

  it("is a no-op for fresh installs apart from the schema version", () => {
    const r = migrateV0toV1({ local: {} });
    expect(r.reflowUpgrade).toBe(false);
    expect(r.set).toEqual({ "pw.schema": 1 });
  });

  it("runs against storage once and is idempotent", async () => {
    await chrome.storage.local.set({ reflow_domains: { "a.example": { interval: 30 } } });
    const first = await runMigrations();
    expect(first).toMatchObject({ from: 0, to: 1, reflowUpgrade: true });
    expect(await getLocal("pw.simplePrefs")).toHaveProperty("a.example");
    expect((await chrome.storage.local.get("reflow_domains")).reflow_domains).toBeUndefined();
    expect((await getLocal("pw.ui")).welcomePending).toBe(true);
    const second = await runMigrations();
    expect(second).toMatchObject({ from: 1, to: 1, reflowUpgrade: false });
  });
});
