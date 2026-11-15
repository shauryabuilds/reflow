import { useMemo, useState } from "react";
import type { Monitor } from "../shared/types";
import { t } from "../shared/i18n";
import { sendBg } from "../shared/messages";
import { distinct, gameOptions, groupMonitors, type GroupBy } from "../shared/filters";
import type { Feature } from "../shared/entitlements";
import { APP } from "../config/app";
import { useLocal, useNow, usePlan } from "../ui/hooks";
import { Disclaimer, Logo, UpgradeContext } from "../ui/kit";
import { UpgradeSheet } from "../ui/UpgradeSheet";
import { PlanChip } from "../ui/PlanChip";
import { MonitorRow } from "../ui/MonitorRow";
import { MonitorEditor } from "../ui/MonitorEditor";
import { ChooseActive } from "../ui/ChooseActive";
import { HistoryView } from "./HistoryView";

export function SidePanel() {
  const plan = usePlan();
  const now = useNow();
  const monitors = useLocal("pw.monitors") ?? {};
  const runtime = useLocal("pw.runtime") ?? {};
  const ui = useLocal("pw.ui");
  const [tab, setTab] = useState<"monitors" | "history">("monitors");
  const [groupBy, setGroupBy] = useState<GroupBy>("game");
  const [game, setGame] = useState("");
  const [shop, setShop] = useState("");
  const [region, setRegion] = useState("");
  const [editing, setEditing] = useState<Monitor | null>(null);
  const [sheet, setSheet] = useState<{ open: boolean; feature?: Feature }>({ open: false });
  const [tested, setTested] = useState(false);

  const all = Object.values(monitors);
  const watches = all.filter((m) => m.kind !== "simple").sort((a, b) => a.createdAt - b.createdAt);
  const simple = all.filter((m) => m.kind === "simple");
  const filtered = watches.filter((m) => (!game || (m.game ?? "other") === game) && (!shop || m.shopDomain === shop) && (!region || m.region === region));
  const groups = useMemo(() => groupMonitors(filtered, groupBy), [filtered, groupBy]);
  const games = gameOptions(watches);
  const shops = distinct(watches, (m) => m.shopDomain);
  const regions = distinct(watches, (m) => m.region);
  const active = watches.filter((m) => m.state !== "paused").length;

  const test = async () => { await sendBg({ type: "pw:testAlert" }); setTested(true); setTimeout(() => setTested(false), 3000); };

  return (
    <UpgradeContext.Provider value={(feature) => setSheet({ open: true, feature })}>
      <div className="min-h-screen flex flex-col">
        <header className="sticky top-0 z-10 bg-white/90 dark:bg-zinc-950/90 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><Logo /><span className="font-semibold">Packwatch</span><PlanChip plan={plan} /></div>
            <div className="flex gap-1">
              <button className="btn h-7" onClick={test}>{tested ? t("testSent") : t("testAlert")}</button>
              <button className="btn-ghost h-7 px-2" onClick={() => chrome.runtime.openOptionsPage()} aria-label={t("settings")}>⚙</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-[12px] font-semibold">
            <button className={`h-7 rounded ${tab === "monitors" ? "bg-white dark:bg-zinc-800 shadow-sm" : "text-zinc-500"}`} onClick={() => setTab("monitors")}>{t("tabMonitors", String(watches.length))}</button>
            <button className={`h-7 rounded ${tab === "history" ? "bg-white dark:bg-zinc-800 shadow-sm" : "text-zinc-500"}`} onClick={() => setTab("history")}>{t("tabHistory")}</button>
          </div>
          {tab === "monitors" && watches.length > 0 && (
            <div className="grid grid-cols-4 gap-1">
              <select className="input" aria-label={t("groupBy")} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="game">{t("groupGame")}</option>
                <option value="shop">{t("groupShop")}</option>
                <option value="region">{t("groupRegion")}</option>
              </select>
              <select className="input" aria-label={t("game")} value={game} onChange={(e) => setGame(e.target.value)}>
                <option value="">{t("allGames")}</option>
                {games.map((g) => <option key={g.id} value={g.id}>{g.label}{g.count ? ` (${g.count})` : ""}</option>)}
              </select>
              <select className="input" aria-label={t("shop")} value={shop} onChange={(e) => setShop(e.target.value)}>
                <option value="">{t("allShops")}</option>
                {shops.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select className="input" aria-label={t("region")} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">{t("allRegions")}</option>
                {regions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
          )}
        </header>

        <main className="flex-1 p-3 space-y-4">
          {tab === "monitors" && (
            <>
              {plan === "free" && (
                <div className="flex justify-between items-center text-[11px] text-zinc-500">
                  <span>{t("footerFree", String(active), String(APP.FREE_MONITOR_LIMIT))}</span>
                  <button className="underline" onClick={() => setSheet({ open: true, feature: "unlimitedMonitors" })}>{t("getUnlimited")}</button>
                </div>
              )}
              {!watches.length && <p className="text-zinc-500 text-center py-10">{t("emptyMonitors")}</p>}
              {groups.map((g) => (
                <section key={g.key} className="space-y-2">
                  <h2 className="label">{g.label} · {g.items.length}</h2>
                  {g.items.map((m) => <MonitorRow key={m.id} m={m} rt={runtime[m.id]} plan={plan} now={now} onEdit={() => setEditing(m)} />)}
                </section>
              ))}
              {simple.length > 0 && (
                <section className="space-y-2">
                  <h2 className="label">{t("modeSimple")} · {simple.length}</h2>
                  {simple.map((m) => (
                    <div key={m.id} className="card p-2.5 flex items-center justify-between gap-2 text-[12px]">
                      <div className="min-w-0"><div className="truncate">{m.title}</div><div className="text-[11px] text-zinc-500">{t("simpleStatus", String(m.refreshCount ?? 0), String(m.intervalSec))}</div></div>
                      <button className="btn h-7" onClick={() => sendBg({ type: "pw:deleteMonitor", id: m.id })}>{t("stop")}</button>
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {tab === "history" && <HistoryView plan={plan} monitors={monitors} />}
        </main>
        <footer className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800"><Disclaimer /></footer>
      </div>
      {editing && <MonitorEditor monitor={editing} plan={plan} onClose={() => setEditing(null)} />}
      {ui?.needsChooseActive && plan === "free" && <ChooseActive monitors={watches} />}
      <UpgradeSheet open={sheet.open} feature={sheet.feature} onClose={() => setSheet({ open: false })} />
    </UpgradeContext.Provider>
  );
}
