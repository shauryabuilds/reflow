// Validation helpers for the Pro alert channels (shared by the options page and the worker).
export const DISCORD_WEBHOOK = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
export const NTFY_TOPIC = /^[A-Za-z0-9_-]{1,64}$/;

/** Random, unguessable topic: anyone who knows a ntfy topic can read it. */
export function newNtfyTopic(): string {
  const a = new Uint8Array(15);
  crypto.getRandomValues(a);
  return "pw-" + Array.from(a, (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
}
