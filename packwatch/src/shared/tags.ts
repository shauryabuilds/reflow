// Tag suggestions from a product title, driven entirely by tags.json keywords.
import { TAGS, type TagDef } from "./data";

function matches(def: TagDef, title: string): boolean {
  return def.keywords.some((k) => {
    try { return new RegExp(k, "i").test(title); } catch { return title.toLowerCase().includes(k.toLowerCase()); }
  });
}

export function suggestTags(title: string, presetGames: string[] = []): { game?: string; productType?: string } {
  const game = TAGS.games.find((g) => matches(g, title))?.id ?? (presetGames.length === 1 ? presetGames[0] : undefined);
  const productType = TAGS.productTypes.find((p) => matches(p, title))?.id;
  return { game, productType };
}
