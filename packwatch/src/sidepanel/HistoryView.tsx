import { useMemo, useState } from "react";
import type { HistoryEvent, Monitor, Plan } from "../shared/types";
import { t, uiLocale } from "../shared/i18n";
import { can } from "../shared/entitlements";
import { formatMoney } from "../shared/price";
import { fmtDuration } from "../shared/time";
import { distinct, gameOptions, productTypeOptions } from "../shared/filters";
import { formatDays, formatHours, shopPatterns, toCsv, visibleHistory, withDurations } from "../shared/history";
import { sendBg } from "../shared/messages";
import { APP } from "../config/app";
import { useLocal } from "../ui/hooks";
import { ProChip, useUpgrade } from "../ui/kit";

const PILL: Record<HistoryEvent["event"], string> = {
  restock: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  preorder: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  out: "bg-zinc-500/10 text-zinc-500",
  "price-drop": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "new-listing": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
};

function download(name: string, text: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function HistoryView({ plan, monitors }: { plan: Plan; monitors: Record<string, Monitor> }) {
  const upgrade = useUpgrade();
  const all = useLocal("pw.history") ?? [];
  const [game, setGame] = useState("");
  const [shop, setShop] = useState("");
  const [ptype, setPtype] = useState("");
  const now = Date.now();
  const visible = useMemo(() => visibleHistory(all, plan, now), [all, plan]);
  const filtered = visible.filter((e) => (!game || (e.game ?? "other") === game) && (!shop || e.shopDomain === shop) && (!ptype || e.productType === ptype));
  const timeline = useMemo(() => withDurations(filtered).reverse(), [filtered]);
  const patterns = useMemo(() => shopPatterns(filtered), [filtered]);
  const locale = uiLocale();
  const boosted = new Set(Object.values(monitors).filter((m) => m.boost).map((m) => m.shopDomain));

  const boost = async (p: (typeof patterns)[number], on: boolean) => {
    if (!can(plan, "boost")) return upgrade("boost");
    await sendBg({ type: "pw:setBoost", shopDomain: p.shopDomain, boost: on ? { days: p.days, startHour: p.startHour, endHour: p.endHour, intervalSec: 0, outsideIntervalSec: 0 } : null });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1">
        <select className="input" value={game} onChange={(e) => setGame(e.target.value)} aria-label={t("game")}>
          <option value="">{t("allGames")}</option>
          {gameOptions().map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select className="input" value={shop} onChange={(e) => setShop(e.target.value)} aria-label={t("shop")}>
          <option value="">{t("allShops")}</option>
          {distinct(visible, (e) => e.shopDomain).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className="input" value={ptype} onChange={(e) => setPtype(e.target.value)} aria-label={t("productType")}>
          <option value="">{t("allTypes")}</option>
          {productTypeOptions().map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {!can(plan, "historyFull") && (
        <div className="text-[11px] text-zinc-500 flex items-center gap-1.5">{t("historyFreeNote", String(APP.FREE_HISTORY_DAYS))}<ProChip feature="historyFull" /></div>
      )}

      <section className="card p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="label flex items-center gap-1.5">{t("patternsTitle")}{!can(plan, "patterns") && <ProChip feature="patterns" />}</h3>
          <button className="btn h-7" onClick={() => (can(plan, "csvExport") ? download("packwatch-history.csv", toCsv(filtered), "text/csv") : upgrade("csvExport"))}>
            {t("exportCsv")}{!can(plan, "csvExport") && <ProChip feature="csvExport" />}
          </button>
        </div>
        {!patterns.length && <p className="text-[12px] text-zinc-500">{t("patternsEmpty")}</p>}
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {patterns.map((p) => (
          <div key={p.shopDomain} className="text-[12px] space-y-1 py-2 first:pt-0 last:pb-0">
            {can(plan, "patterns") ? (
              <>
                <div>{t("patternLine", p.shopDomain, formatDays(p.days, locale), formatHours(p.startHour, p.endHour))}</div>
                {p.typicalInStockMs !== undefined && <div className="text-zinc-500">{t("patternWindow", fmtDuration(Math.round(p.typicalInStockMs / 1000)))}</div>}
                <button className="btn h-7" onClick={() => boost(p, !boosted.has(p.shopDomain))}>
                  {boosted.has(p.shopDomain) ? t("boostOff") : t("boostOn")}
                </button>
              </>
            ) : (
              <button className="text-left text-zinc-500 blur-[3px] select-none" onClick={() => upgrade("patterns")} aria-label={t("patternsTitle")}>
                {t("patternLine", p.shopDomain, "Tue–Thu", "10:00–11:00")}
              </button>
            )}
          </div>
        ))}
        </div>
      </section>

      {!timeline.length && <p className="text-zinc-500 text-center py-6">{t("historyEmpty")}</p>}
      <ol className="space-y-1">
        {timeline.slice(0, 500).map((e, i) => (
          <li key={`${e.at}-${i}`} className="card p-2 text-[12px] space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className={`px-1.5 h-5 inline-flex items-center rounded text-[10px] font-semibold uppercase ${PILL[e.event]}`}>{t(`ev_${e.event.replace("-", "_")}`)}</span>
              <span className="text-[11px] text-zinc-500">{new Date(e.at).toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit", month: "short", day: "numeric" })}</span>
            </div>
            <div className="truncate">{e.title}</div>
            <div className="text-[11px] text-zinc-500 flex flex-wrap gap-x-2">
              <span>{e.shopDomain}</span>
              {e.price && <span>{formatMoney(e.price, locale)}</span>}
              {e.inStockMs !== undefined && <span>{t("inStockFor", fmtDuration(Math.round(e.inStockMs / 1000)))}</span>}
              {e.latencyMs !== undefined && e.event !== "out" && <span>{t("detectedWithin", fmtDuration(Math.max(1, Math.round(e.latencyMs / 1000))))}</span>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
