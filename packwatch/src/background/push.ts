// Pro alert channels: phone push via ntfy (no backend) and the user's own Discord webhook.
import type { Plan, Priority, Settings } from "../shared/types";
import { can } from "../shared/entitlements";
import { gameLabel } from "../shared/data";
import { formatMoney } from "../shared/price";
import { fmtDuration } from "../shared/time";
import type { PendingAlert } from "./process";
import { alertText } from "./alerts";
import { DISCORD_WEBHOOK, NTFY_TOPIC } from "../shared/channels";

export { DISCORD_WEBHOOK, NTFY_TOPIC, newNtfyTopic } from "../shared/channels";


const NTFY_PRIORITY: Record<Priority, number> = { "wake-me": 5, normal: 4, silent: 1 };

export function ntfyPayload(a: PendingAlert, topic: string, priority: Priority) {
  const text = alertText(a);
  const tags = a.event === "queue" ? ["hourglass"] : a.event === "stall" ? ["warning"] : a.event === "price-drop" ? ["moneybag"] : ["package"];
  return {
    topic,
    title: text.title,
    message: [text.message, text.context].filter(Boolean).join("\n"),
    priority: a.event === "stall" ? 4 : NTFY_PRIORITY[priority],
    click: a.url,
    tags,
  };
}

const COLORS: Record<string, number> = { restock: 0x10b981, preorder: 0x0ea5e9, "price-drop": 0xf59e0b, "new-listing": 0x8b5cf6, queue: 0xf59e0b, stall: 0xef4444, test: 0x71717a };

export function discordPayload(a: PendingAlert, now = Date.now()) {
  const text = alertText(a);
  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  if (a.price) fields.push({ name: "Price", value: formatMoney(a.price), inline: true });
  fields.push({ name: "Shop", value: a.shopDomain, inline: true });
  if (a.game) fields.push({ name: "Game", value: gameLabel(a.game) || a.game, inline: true });
  if (a.latencyMs) fields.push({ name: "Detected", value: `within ${fmtDuration(Math.max(1, Math.round(a.latencyMs / 1000)))}`, inline: true });
  return {
    username: "Packwatch",
    allowed_mentions: { parse: [] as string[] },
    embeds: [{
      title: text.title.slice(0, 256),
      url: /^https?:/.test(a.url) ? a.url : undefined,
      description: [text.message, a.evidence].filter(Boolean).join("\n").slice(0, 2000),
      color: COLORS[a.event] ?? 0x71717a,
      fields,
      timestamp: new Date(now).toISOString(),
      footer: { text: "Packwatch" },
    }],
  };
}

async function post(url: string, body: unknown): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch { return false; }
}

export async function sendNtfy(a: PendingAlert, s: Settings, priority: Priority): Promise<boolean> {
  if (!NTFY_TOPIC.test(s.ntfyTopic)) return false;
  return post(s.ntfyServer.replace(/\/+$/, "") + "/", ntfyPayload(a, s.ntfyTopic, priority));
}

export async function sendDiscord(a: PendingAlert, s: Settings): Promise<boolean> {
  if (!DISCORD_WEBHOOK.test(s.discordWebhook)) return false;
  return post(s.discordWebhook, discordPayload(a));
}

/** Called by the dispatcher (not during quiet hours, never for silent monitors). */
export async function pushChannels(a: PendingAlert, plan: Plan, s: Settings, priority: Priority): Promise<string[]> {
  if (a.event === "stall") return []; // stall pushes go through pushStall (separate setting)
  const sent: string[] = [];
  if (s.ntfyEnabled && can(plan, "phonePush") && (await sendNtfy(a, s, priority))) sent.push("ntfy");
  if (s.discordEnabled && can(plan, "discord") && (await sendDiscord(a, s))) sent.push("discord");
  return sent;
}
