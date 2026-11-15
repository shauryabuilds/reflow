// Stall alerts to phone / Discord (Pro): "Monitor stopped" reaches you even away from the computer.
import type { Plan } from "../shared/types";
import { can } from "../shared/entitlements";
import { getLocal } from "../shared/storage";
import type { PendingAlert } from "./process";
import { sendDiscord, sendNtfy } from "./push";

export async function pushStall(a: PendingAlert, plan: Plan): Promise<string[]> {
  const s = await getLocal("pw.settings");
  if (!s.stallToPhone || !can(plan, "stallToPhone")) return [];
  const sent: string[] = [];
  if (s.ntfyEnabled && (await sendNtfy(a, s, "normal"))) sent.push("ntfy");
  if (s.discordEnabled && (await sendDiscord(a, s))) sent.push("discord");
  return sent;
}
