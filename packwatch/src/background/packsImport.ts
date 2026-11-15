// Watchlist pack import and restock boost windows.
import type { BoostWindow, Draft } from "../shared/types";
import type { WatchlistPack } from "../shared/packs";
import type { Reply } from "../shared/messages";
import { can, getPlan } from "../shared/entitlements";
import { getLocalMany, setLocal } from "../shared/storage";
import { planMinInterval } from "../shared/intervals";
import { newId } from "../shared/monitor";
import { createMonitor } from "./monitors";
import { withLock } from "./lock";

export interface ImportResult { created: number; skipped: Array<{ title: string; reason: string }> }

export async function importPack(pack: WatchlistPack): Promise<Reply<ImportResult>> {
  const res: ImportResult = { created: 0, skipped: [] };
  for (const pm of pack.monitors) {
    const draft: Draft = {
      id: newId(), kind: pm.kind === "listing" ? "listing" : "product", url: pm.url, title: pm.title, strategy: pm.strategy,
      selector: pm.selector, game: pm.game ?? pack.game, productType: pm.productType, region: pm.region,
      alertOn: { restock: pm.alertOn.restock, preorder: pm.alertOn.preorder }, keywords: pm.keywords, excludeKeywords: pm.excludeKeywords,
      intervalSec: pm.intervalSec, currencyHint: pm.currencyHint, variantId: pm.variantId, createdAt: Date.now(),
    };
    const r = await createMonitor(draft);
    if (r.ok) res.created++;
    else res.skipped.push({ title: pm.title, reason: r.code ?? r.error });
  }
  return { ok: true, data: res };
}

/** Pro: shorter interval inside the shop's usual restock window, longer outside (polite caps still apply). */
export async function setBoost(shopDomain: string, w: BoostWindow | null): Promise<Reply> {
  const plan = await getPlan();
  if (!can(plan, "boost")) return { ok: false, code: "pro", error: "Pro feature" };
  await withLock(async () => {
    const s = await getLocalMany(["pw.monitors", "pw.runtime"]);
    for (const m of Object.values(s["pw.monitors"])) {
      if (m.shopDomain !== shopDomain || m.kind === "simple") continue;
      if (!w) { delete m.boost; continue; }
      const min = planMinInterval(plan, m.mode);
      m.boost = { ...w, intervalSec: Math.max(min, Math.round(m.intervalSec / 2)), outsideIntervalSec: Math.max(m.intervalSec, m.intervalSec * 2) };
      if (s["pw.runtime"][m.id]) s["pw.runtime"][m.id].nextCheckAt = Date.now() + 1000;
    }
    await setLocal({ "pw.monitors": s["pw.monitors"], "pw.runtime": s["pw.runtime"] });
  });
  return { ok: true };
}
