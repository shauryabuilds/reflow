import { describe, it, expect } from "vitest";
import { discordPayload, ntfyPayload } from "../src/background/push";
import { DISCORD_WEBHOOK, NTFY_TOPIC, newNtfyTopic } from "../src/shared/channels";
import type { PendingAlert } from "../src/background/process";

const a: PendingAlert = {
  event: "restock", monitorId: "m", title: "Pokémon ETB", url: "https://shop.example/p", shopDomain: "shop.example",
  game: "pokemon", evidence: "Shopify product available = true", priority: "normal", price: { amount: 64.99, currency: "SGD" }, latencyMs: 9000,
};

describe("ntfy", () => {
  it("JSON publish with title, price, shop, click URL and mapped priority", () => {
    const p = ntfyPayload(a, "pw-abc", "wake-me");
    expect(p).toMatchObject({ topic: "pw-abc", title: "Back in stock: Pokémon ETB", click: "https://shop.example/p", priority: 5, tags: ["package"] });
    expect(p.message).toMatch(/64\.99/);
    expect(p.message).toMatch(/detected within 9s/);
    expect(ntfyPayload(a, "t", "normal").priority).toBe(4);
  });
  it("topics are random and valid", () => {
    const t1 = newNtfyTopic(), t2 = newNtfyTopic();
    expect(t1).not.toBe(t2);
    expect(NTFY_TOPIC.test(t1)).toBe(true);
    expect(t1).toHaveLength(18);
  });
});

describe("Discord", () => {
  it("embed with title, game, price, shop, link and timestamp; mentions disabled", () => {
    const p = discordPayload(a, Date.UTC(2026, 10, 15, 10, 42));
    const e = p.embeds[0];
    expect(e.title).toBe("Back in stock: Pokémon ETB");
    expect(e.url).toBe("https://shop.example/p");
    expect(e.timestamp).toBe("2026-11-15T10:42:00.000Z");
    expect(e.fields.map((f) => f.name)).toEqual(["Price", "Shop", "Game", "Detected"]);
    expect(e.fields[2].value).toBe("Pokémon TCG");
    expect(p.allowed_mentions.parse).toEqual([]);
  });
  it("validates webhook URLs", () => {
    expect(DISCORD_WEBHOOK.test("https://discord.com/api/webhooks/123456/abc-DEF_9")).toBe(true);
    expect(DISCORD_WEBHOOK.test("https://ptb.discord.com/api/webhooks/1/x")).toBe(true);
    expect(DISCORD_WEBHOOK.test("https://evil.example/api/webhooks/1/x")).toBe(false);
    expect(DISCORD_WEBHOOK.test("http://discord.com/api/webhooks/1/x")).toBe(false);
  });
});
