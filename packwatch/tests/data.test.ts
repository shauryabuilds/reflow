import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import tags from "../src/data/tags.json";
import presets from "../src/data/presets.json";
import siteRules from "../src/data/siteRules.json";
import stockRules from "../src/data/stockRules.json";
import tagsSchema from "../src/data/schemas/tags.schema.json";
import presetsSchema from "../src/data/schemas/presets.schema.json";
import siteRulesSchema from "../src/data/schemas/siteRules.schema.json";
import stockRulesSchema from "../src/data/schemas/stockRules.schema.json";
import { TAGS, presetFor, siteRuleFor } from "../src/shared/data";
import { gameOptions, groupMonitors } from "../src/shared/filters";
import { suggestTags } from "../src/shared/tags";
import type { Monitor } from "../src/shared/types";

const ajv = new Ajv({ allErrors: true, strict: false });

describe("data files match their JSON schemas", () => {
  it.each([
    ["tags.json", tags, tagsSchema],
    ["presets.json", presets, presetsSchema],
    ["siteRules.json", siteRules, siteRulesSchema],
    ["stockRules.json", stockRules, stockRulesSchema],
  ])("%s", (_name, data, schema) => {
    const validate = ajv.compile(schema);
    expect(validate(data), JSON.stringify(validate.errors)).toBe(true);
  });
  it("every regex in data compiles", () => {
    for (const t of [...TAGS.games, ...TAGS.productTypes]) for (const k of t.keywords) expect(() => new RegExp(k, "i")).not.toThrow();
    for (const set of Object.entries(stockRules).filter(([k]) => k !== "$comment")) {
      for (const src of Object.values(set[1] as Record<string, string>)) expect(() => new RegExp(src, "i")).not.toThrow();
    }
  });
  it("placeholder presets are never used", () => {
    expect(presetFor("todo-us.invalid")).toBeNull();
  });
  it("site rules never go below the floor gap", () => {
    expect(siteRuleFor("anything.example").minGapSec).toBeGreaterThanOrEqual(5);
  });
});

describe("tags are data-driven", () => {
  it("suggests game and product type from a title", () => {
    expect(suggestTags("Pokémon TCG: Prismatic Evolutions Elite Trainer Box")).toEqual({ game: "pokemon", productType: "elite-trainer-box" });
    expect(suggestTags("One Piece Card Game OP-15 Booster Box")).toEqual({ game: "one-piece", productType: "booster-box" });
    expect(suggestTags("Disney Lorcana Booster Bundle")).toEqual({ game: "lorcana", productType: "booster-bundle" });
    expect(suggestTags("2025 Topps Chrome Baseball Hobby Box")).toEqual({ game: "sports", productType: "booster-box" });
    expect(suggestTags("Random thing")).toEqual({ game: undefined, productType: undefined });
  });
  it("a new GameTag added to tags.json shows up in filters and grouping without code changes", () => {
    const before = gameOptions().length;
    TAGS.games.push({ id: "digimon", label: "Digimon", keywords: ["digimon"] });
    try {
      const opts = gameOptions([{ game: "digimon" }]);
      expect(opts).toHaveLength(before + 1);
      expect(opts.find((o) => o.id === "digimon")).toEqual({ id: "digimon", label: "Digimon", count: 1 });
      expect(suggestTags("Digimon BT-20 Booster Box").game).toBe("digimon");
      const groups = groupMonitors([{ id: "1", game: "digimon", shopDomain: "a" } as Monitor], "game");
      expect(groups[0]).toMatchObject({ key: "digimon", label: "Digimon" });
    } finally {
      TAGS.games.pop();
    }
  });
});
