import { useEffect, useState } from "react";
import type { Monitor, SimplePref } from "../shared/types";
import { t } from "../shared/i18n";
import { getLocal, getSessionTabs } from "../shared/storage";
import { sendBg } from "../shared/messages";
import { originPattern, shopDomainOf } from "../shared/url";
import { fmtDuration, fmtInterval } from "../shared/time";
import { APP } from "../config/app";
import { useLocal, useNow } from "../ui/hooks";

const PRESETS = [5, 10, 30, 60, 120, 300, 900, 1800];
const DEFAULT: SimplePref = { intervalSec: 30, randomize: false, hardRefresh: true, keepScroll: true };

export function SimpleRefreshPanel({ tab, monitors }: { tab: chrome.tabs.Tab; monitors: Record<string, Monitor> }) {
  const now = useNow(250);
  const runtime = useLocal("pw.runtime") ?? {};
  const [boundId, setBoundId] = useState<string | null>(null);
  const [pref, setPref] = useState<SimplePref>(DEFAULT);
  const [custom, setCustom] = useState("");
  const [unit, setUnit] = useState(60);
  const [remembered, setRemembered] = useState(false);
  const [shortcut, setShortcut] = useState("Alt+Shift+R");
  const [watchText, setWatchText] = useState("");
  const [watchMode, setWatchMode] = useState<"appears" | "disappears">("appears");
  const domain = shopDomainOf(tab.url ?? "");
  const web = /^https?:/.test(tab.url ?? "");

  useEffect(() => {
    getSessionTabs().then((map) => setBoundId(Object.keys(map).find((k) => map[k] === tab.id && monitors[k]?.kind === "simple") ?? null));
  }, [tab.id, monitors]);
  useEffect(() => {
    Promise.all([getLocal("pw.simplePrefs"), getLocal("pw.simpleLast")]).then(([prefs, last]) => {
      const p = prefs[domain] ?? last;
      if (p) setPref(p);
      if (prefs[domain]?.watchText) { setWatchText(prefs[domain].watchText!); setWatchMode(prefs[domain].watchMode ?? "appears"); }
      setRemembered(!!prefs[domain]);
    });
    chrome.commands.getAll((c) => setShortcut(c.find((x) => x.name === "toggle-refresh")?.shortcut || t("noShortcut")));
  }, [domain]);

  const m = boundId ? monitors[boundId] : null;
  const rt = boundId ? runtime[boundId] : undefined;

  const start = async (seconds: number) => {
    const p: SimplePref = { ...pref, intervalSec: Math.max(APP.SIMPLE_MIN_SEC, Math.round(seconds)), watchText: watchText.trim() || undefined, watchMode };
    setPref(p);
    // Optional: lets the typing guard, scroll memory and queue guard run on this site.
    if (web) await chrome.permissions.request({ origins: [originPattern(tab.url!)] }).catch(() => false);
    if (tab.id !== undefined) await sendBg({ type: "pw:simpleStart", tabId: tab.id, url: tab.url ?? "", pref: p });
  };
  const stop = () => tab.id !== undefined && sendBg({ type: "pw:simpleStop", tabId: tab.id });
  const customSec = () => { const v = parseFloat(custom); return v > 0 ? v * unit : 0; };

  if (m?.pausedReason === "matched") {
    return (
      <div className="space-y-3">
        <div className="card p-4 text-center space-y-1 border-emerald-500/60 bg-emerald-500/10">
          <div className="text-[15px] font-semibold text-emerald-700 dark:text-emerald-300">{m.evidence}</div>
          <div className="text-[11px] text-zinc-500">{t("matchedStopped")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn h-9" onClick={() => tab.id !== undefined && sendBg({ type: "pw:simpleKeepRefreshing", tabId: tab.id })}>{t("keepRefreshing")}</button>
          <button className="btn-primary h-9" onClick={stop}>{t("done")}</button>
        </div>
      </div>
    );
  }

  if (m) {
    const left = rt && rt.nextCheckAt < Number.MAX_SAFE_INTEGER ? Math.max(0, Math.ceil((rt.nextCheckAt - now) / 1000)) : 0;
    const pct = Math.min(100, (1 - left / m.intervalSec) * 100);
    return (
      <div className="space-y-3">
        <div className="card p-4 text-center space-y-1">
          {m.state === "queue" ? (
            <div className="text-amber-600 dark:text-amber-400 font-semibold">{t("simpleQueue")}</div>
          ) : (
            <div className="text-[40px] leading-none font-medium font-mono tabular-nums">{fmtDuration(left)}</div>
          )}
          <div className="text-[11px] text-zinc-500">
            {t("simpleEvery", fmtInterval(m.intervalSec))}{m.randomize ? " ±25%" : ""} · {t("simpleCount", String(m.refreshCount ?? 0))}
          </div>
          {m.watchText && <div className="text-[11px]">{t(m.watchMode === "disappears" ? "watchingGone" : "watchingFor", m.watchText)}</div>}
          {(rt?.skippedTyping ?? 0) > 0 && <div className="text-[11px] text-zinc-500">{t("simpleTypingNote")}</div>}
          <div className="h-0.5 bg-zinc-200 dark:bg-zinc-800 rounded overflow-hidden mt-2"><div className="h-full bg-zinc-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
        <button className="btn w-full h-9 text-red-600 border-red-500/30" onClick={stop}>{t("stop")}</button>
        <p className="text-[10px] text-zinc-500 text-center">{t("shortcutHint", shortcut)}</p>
      </div>
    );
  }

  const chip = (k: keyof Omit<SimplePref, "intervalSec">, label: string, title: string) => (
    <button title={title} onClick={() => setPref({ ...pref, [k]: !pref[k] })}
      className={`chip ${pref[k] ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${pref[k] ? "bg-emerald-500" : "bg-zinc-400"}`} />{label}
    </button>
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">{t("simpleIntro")}</p>
      <div className="space-y-1">
        <div className="label">{t("alertWhenOptional")}</div>
        <div className="flex gap-1">
          <input className="input flex-1" placeholder={t("watchTextPh")} value={watchText} maxLength={200} spellCheck={false}
            onChange={(e) => setWatchText(e.target.value)} aria-label={t("alertWhenOptional")} />
          <select className="input" value={watchMode} onChange={(e) => setWatchMode(e.target.value as "appears" | "disappears")} aria-label={t("watchModeLabel")}>
            <option value="appears">{t("appears")}</option>
            <option value="disappears">{t("disappears")}</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {PRESETS.map((s) => (
          <button key={s} onClick={() => start(s)}
            className={`card h-11 font-mono hover:border-zinc-400 ${pref.intervalSec === s && remembered ? "ring-2 ring-emerald-500/40" : ""}`}>
            <div className="text-[14px] font-semibold leading-none">{s >= 60 ? s / 60 : s}</div>
            <div className="text-[9px] uppercase text-zinc-500">{s >= 60 ? t("unitMin") : t("unitSec")}</div>
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <input className="input flex-1" type="number" min="1" placeholder={t("customInterval")} value={custom}
          onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && customSec() && start(customSec())} />
        <select className="input" value={unit} onChange={(e) => setUnit(Number(e.target.value))}>
          <option value={1}>{t("unitSec")}</option><option value={60}>{t("unitMin")}</option><option value={3600}>{t("unitHr")}</option>
        </select>
        <button className="btn-primary" disabled={!customSec()} onClick={() => start(customSec())}>{t("start")}</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {chip("hardRefresh", t("optHard"), t("optHardTip"))}
        {chip("keepScroll", t("optScroll"), t("optScrollTip"))}
        {chip("randomize", t("optRandom"), t("optRandomTip"))}
      </div>
      <p className="text-[10px] text-zinc-500">{remembered ? t("rememberedFor", domain) + " · " : ""}{t("shortcutHint", shortcut)}</p>
    </div>
  );
}
