// The single source of truth for what the user's plan allows.
import type { Plan } from "./types";
import { getLocal } from "./storage";

export type Feature =
  | "unlimitedMonitors" | "fastInterval" | "phonePush" | "discord" | "stallToPhone"
  | "priceAlerts" | "historyFull" | "patterns" | "csvExport" | "packExport"
  | "priority" | "quietHours" | "boost";

const PRO_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  "unlimitedMonitors", "fastInterval", "phonePush", "discord", "stallToPhone", "priceAlerts",
  "historyFull", "patterns", "csvExport", "packExport", "priority", "quietHours", "boost",
]);

/** Trial users get everything Pro has. */
export function can(plan: Plan, feature: Feature): boolean {
  if (plan === "pro" || plan === "trial") return true;
  return !PRO_FEATURES.has(feature);
}

export const isPaidLike = (plan: Plan) => plan === "pro" || plan === "trial";

/** Cached plan; the dev override only exists in dev builds. */
export async function getPlan(): Promise<Plan> {
  const e = await getLocal("pw.entitlement");
  if (__PW_DEV__ && e.devOverride) return e.devOverride;
  return e.plan;
}
