// Missed-restock nudge: the main upgrade moment, shown at most once a day to Free users.
import { APP } from "../config/app";
import type { AlertRecord, Plan, UiState } from "./types";

const NUDGE_EVENTS = new Set(["restock", "preorder", "new-listing"]);
const DAY = 86_400_000;

export function pickNudge(alerts: AlertRecord[], ui: UiState, plan: Plan, now: number): AlertRecord | null {
  if (plan !== "free") return null;
  if (ui.lastNudgeAt && now - ui.lastNudgeAt < DAY) return null;
  const missed = alerts
    .filter((a) => NUDGE_EVENTS.has(a.event) && now - a.at < DAY && !ui.nudgedAlertIds.includes(a.id))
    .filter((a) => !a.chromeFocused || (!a.clickedAt && now - a.at > APP.NUDGE_UNCLICKED_MS))
    .sort((a, b) => b.at - a.at);
  return missed[0] ?? null;
}
