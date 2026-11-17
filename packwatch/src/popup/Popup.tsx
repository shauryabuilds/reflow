import { useEffect, useState } from "react";
import { t } from "../shared/i18n";
import { getLocal, setLocal } from "../shared/storage";
import { APP } from "../config/app";
import { useLocal, usePlan } from "../ui/hooks";
import { Disclaimer, Logo, UpgradeContext } from "../ui/kit";
import { WelcomeCard } from "../ui/WelcomeCard";
import { UpgradeSheet } from "../ui/UpgradeSheet";
import { NudgeCard } from "../ui/NudgeCard";
import { StaleCard } from "../ui/StaleCard";
import { PlanChip } from "../ui/PlanChip";
import type { Feature } from "../shared/entitlements";
import { PageWatch } from "./PageWatch";
import { SimpleRefreshPanel } from "./SimpleRefreshPanel";

export function Popup() {
  const plan = usePlan();
  const monitors = useLocal("pw.monitors") ?? {};
  const ui = useLocal("pw.ui");
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [mode, setMode] = useState<"watch" | "simple">("watch");
  const [picked, setPicked] = useState(false); // the user chose a tab themselves: never switch it for them
  const [sheet, setSheet] = useState<{ open: boolean; feature?: Feature }>({ open: false });

  useEffect(() => {
    // Dev builds: ?tab=<id> lets automated tests open the popup against a specific tab.
    const forced = __PW_DEV__ ? Number(new URLSearchParams(location.search).get("tab")) : 0;
    if (forced) chrome.tabs.get(forced).then(setTab, () => setTab(null));
    else chrome.tabs.query({ active: true, currentWindow: true }).then(([x]) => setTab(x ?? null));
  }, []);
  useEffect(() => {
    // Opening Simple Refresh first if this tab is already being refreshed.
    if (tab?.id !== undefined) {
      chrome.storage.session.get("pw.tabs").then((d) => {
        const map = (d["pw.tabs"] as Record<string, number>) || {};
        if (!picked && Object.entries(map).some(([id, tid]) => tid === tab.id && monitors[id]?.kind === "simple")) setMode("simple");
      });
    }
  }, [tab?.id, Object.keys(monitors).length]);

  const watches = Object.values(monitors).filter((m) => m.kind !== "simple");
  const active = watches.filter((m) => m.state !== "paused").length;
  const live = watches.filter((m) => m.kind === "product" && (m.stableState === "in" || m.stableState === "preorder") && m.state !== "paused").length;

  const openPanel = () => {
    // sidePanel.open must be called synchronously inside the click (user gesture): no await before it.
    const fallback = () => chrome.tabs.create({ url: chrome.runtime.getURL("src/sidepanel/index.html") });
    const p = tab?.windowId !== undefined ? chrome.sidePanel.open({ windowId: tab.windowId }) : Promise.reject();
    p.catch(fallback).finally(() => window.close());
  };
  const dismissWelcome = async () => {
    const u = await getLocal("pw.ui");
    await setLocal({ "pw.ui": { ...u, welcomePending: false } });
  };

  return (
    <UpgradeContext.Provider value={(feature) => setSheet({ open: true, feature })}>
      <div className="w-[360px] min-h-[200px]">
        <header className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2"><Logo /><span className="font-semibold tracking-tight">Packwatch</span><PlanChip plan={plan} /></div>
          <div className="flex items-center gap-1">
            <button className="btn-ghost h-7 px-2" onClick={openPanel} title={t("openMonitors")}>{t("monitorsShort")}</button>
            <button className="btn-ghost h-7 px-2" onClick={() => chrome.runtime.openOptionsPage()} title={t("settings")} aria-label={t("settings")}>⚙</button>
          </div>
        </header>
        <main className="p-3 space-y-3">
          {ui?.welcomePending && <WelcomeCard onDismiss={dismissWelcome} />}
          <NudgeCard plan={plan} />
          <StaleCard onOpen={openPanel} />
          {ui?.needsChooseActive && (
            <button className="card w-full p-2.5 text-left text-[12px] border-amber-500/50" onClick={openPanel}>{t("chooseActiveBanner")}</button>
          )}
          <div className="grid grid-cols-2 gap-1 p-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-[12px] font-semibold">
            <button className={`h-7 rounded ${mode === "watch" ? "bg-white dark:bg-zinc-800 shadow-sm" : "text-zinc-500"}`} onClick={() => { setPicked(true); setMode("watch"); }}>{t("modeWatch")}</button>
            <button className={`h-7 rounded ${mode === "simple" ? "bg-white dark:bg-zinc-800 shadow-sm" : "text-zinc-500"}`} onClick={() => { setPicked(true); setMode("simple"); }}>{t("modeSimple")}</button>
          </div>
          {tab && mode === "watch" && (
            <PageWatch tab={tab} plan={plan} monitors={monitors} openPanel={openPanel}
              onUnreadable={() => { if (!picked) setMode("simple"); }} onAutoRefresh={() => { setPicked(true); setMode("simple"); }} />
          )}
          {tab && mode === "simple" && <SimpleRefreshPanel tab={tab} monitors={monitors} />}
        </main>
        <footer className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
          <div className="flex justify-between text-[11px] text-zinc-500">
            <span>{plan === "free" ? t("footerFree", String(active), String(APP.FREE_MONITOR_LIMIT)) : t("footerPro", String(active))}</span>
            <span>{live ? t("footerLive", String(live)) : ""}</span>
          </div>
          <Disclaimer />
        </footer>
      </div>
      <UpgradeSheet open={sheet.open} feature={sheet.feature} onClose={() => setSheet({ open: false })} />
    </UpgradeContext.Provider>
  );
}
