import { describe, it, expect } from "vitest";
import { applyDowngrade, applyUpgrade, chooseActiveMonitors, planFromUser } from "../src/background/entitlementSync";
import { can } from "../src/shared/entitlements";
import { pickNudge } from "../src/shared/nudge";
import { annualPerMonth, annualSavingsPct, PLANS } from "../src/config/plans";
import { monitor } from "./factories";
import type { AlertRecord, Monitor, UiState } from "../src/shared/types";

const DAY = 86_400_000;

describe("plans", () => {
  it("prices and labels come from config", () => {
    expect(PLANS.monthly.price).toBe(7.99);
    expect(PLANS.annual.price).toBe(59.99);
    expect(annualSavingsPct()).toBe(37);
    expect(annualPerMonth()).toBe(5);
  });
  it("ExtPay user → plan, with a 7-day trial", () => {
    const now = 100 * DAY;
    expect(planFromUser({ paid: true, paidAt: null, trialStartedAt: null, email: null }, now)).toBe("pro");
    expect(planFromUser({ paid: false, paidAt: null, trialStartedAt: new Date(now - 6 * DAY), email: null }, now)).toBe("trial");
    expect(planFromUser({ paid: false, paidAt: null, trialStartedAt: new Date(now - 7 * DAY), email: null }, now)).toBe("free");
    expect(planFromUser(null, now)).toBe("free");
  });
  it("can(): Free is limited, trial and Pro get everything", () => {
    expect(can("free", "phonePush")).toBe(false);
    expect(can("free", "historyFull")).toBe(false);
    expect(can("trial", "phonePush")).toBe(true);
    expect(can("pro", "packExport")).toBe(true);
  });
});

describe("downgrade keeps all data", () => {
  const ms: Record<string, Monitor> = Object.fromEntries(
    ["a", "b", "c", "d", "e"].map((id, i) => [id, monitor({ id, createdAt: i, state: "out" })]),
  );
  ms.s = monitor({ id: "s", kind: "simple", createdAt: 9 });
  ms.p = monitor({ id: "p", state: "paused", pausedReason: "user", createdAt: -1 });
  it("pauses monitors beyond 3 (oldest stay active), never touches Simple Refresh or user pauses", () => {
    const r = applyDowngrade(ms);
    expect(r.paused).toBe(2);
    expect(Object.keys(r.monitors).sort()).toEqual(Object.keys(ms).sort());
    expect(["a", "b", "c"].map((id) => r.monitors[id].state)).toEqual(["out", "out", "out"]);
    expect(["d", "e"].map((id) => r.monitors[id].pausedReason)).toEqual(["plan", "plan"]);
    expect(r.monitors.s.state).toBe(ms.s.state);
    expect(r.monitors.p.pausedReason).toBe("user");
  });
  it("the user can choose which 3 stay active", () => {
    const down = applyDowngrade(ms).monitors;
    const chosen = chooseActiveMonitors(down, ["e", "d", "a", "b"]);
    const active = Object.values(chosen).filter((m) => m.kind !== "simple" && m.state !== "paused").map((m) => m.id).sort();
    expect(active).toEqual(["a", "d", "e"]);
    expect(chosen.p.pausedReason).toBe("user");
  });
  it("upgrading brings plan-paused monitors back", () => {
    const up = applyUpgrade(applyDowngrade(ms).monitors);
    expect(Object.values(up).filter((m) => m.state === "paused").map((m) => m.id)).toEqual(["p"]);
  });
});

describe("missed-restock nudge", () => {
  const ui: UiState = { welcomePending: false, nudgedAlertIds: [], needsChooseActive: false };
  const alert = (over: Partial<AlertRecord>): AlertRecord => ({ id: "1", monitorId: "m", event: "restock", title: "ETB", shopDomain: "s", url: "u", at: 0, chromeFocused: true, channels: [], ...over });
  const now = 10 * DAY;
  it("fires for an alert while Chrome was not focused", () => {
    expect(pickNudge([alert({ at: now - 60_000, chromeFocused: false })], ui, "free", now)?.id).toBe("1");
  });
  it("fires for an alert not clicked within 2 minutes", () => {
    expect(pickNudge([alert({ at: now - 3 * 60_000 })], ui, "free", now)?.id).toBe("1");
    expect(pickNudge([alert({ at: now - 60_000 })], ui, "free", now)).toBeNull();
    expect(pickNudge([alert({ at: now - 3 * 60_000, clickedAt: now - 2 * 60_000 })], ui, "free", now)).toBeNull();
  });
  it("at most once per day, never for Pro, never twice for one alert", () => {
    const a = [alert({ at: now - 60_000, chromeFocused: false })];
    expect(pickNudge(a, { ...ui, lastNudgeAt: now - 3600_000 }, "free", now)).toBeNull();
    expect(pickNudge(a, ui, "pro", now)).toBeNull();
    expect(pickNudge(a, { ...ui, nudgedAlertIds: ["1"] }, "free", now)).toBeNull();
    expect(pickNudge([alert({ event: "stall", chromeFocused: false, at: now - 1 })], ui, "free", now)).toBeNull();
  });
});
