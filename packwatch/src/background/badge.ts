// Toolbar badge: count of in-stock / preorder monitors, or a red "!" when any active monitor is stale.
import type { Monitor, MonitorRuntime, Plan } from "../shared/types";
import { isStale } from "../shared/intervals";
import { siteRuleFor } from "../shared/data";

export function badgeState(monitors: Record<string, Monitor>, runtime: Record<string, MonitorRuntime>, plan: Plan, now: number) {
  const list = Object.values(monitors).filter((m) => m.kind !== "simple");
  const stale = list.filter((m) => isStale(m, runtime[m.id], plan, now, siteRuleFor(m.shopDomain).minIntervalSec));
  const live = list.filter((m) => m.state !== "paused" && (m.kind === "product" ? m.stableState === "in" || m.stableState === "preorder" : false));
  return { stale, live };
}

let last = "";
export function applyBadge(stale: number, live: number) {
  const key = `${stale}:${live}`;
  if (key === last) return;
  last = key;
  if (stale > 0) {
    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  } else {
    chrome.action.setBadgeText({ text: live ? String(live) : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#059669" });
  }
  chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
}
