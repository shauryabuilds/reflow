import { useState } from "react";
import { PLANS, DEFAULT_PLAN, TRIAL_DAYS, annualSavingsPct, annualPerMonth, type PaidPlan } from "../config/plans";
import { APP } from "../config/app";
import type { Feature } from "../shared/entitlements";
import { t } from "../shared/i18n";
import { Modal } from "./kit";
import { extpay } from "./extpay";

const PRO_LIST = ["proUnlimited", "proFast", "proPhone", "proDiscord", "proStall", "proPrice", "proHistory", "proPacks", "proPriority"] as const;

const FEATURE_KEY: Partial<Record<Feature, string>> = {
  unlimitedMonitors: "proUnlimited", fastInterval: "proFast", phonePush: "proPhone", discord: "proDiscord",
  stallToPhone: "proStall", priceAlerts: "proPrice", historyFull: "proHistory", patterns: "proHistory", csvExport: "proHistory",
  packExport: "proPacks", priority: "proPriority", quietHours: "proPriority", boost: "proHistory",
};

const usd = (n: number) => "$" + n.toFixed(2);

export function UpgradeSheet({ open, feature, onClose }: { open: boolean; feature?: Feature; onClose: () => void }) {
  const [sel, setSel] = useState<PaidPlan["id"]>(DEFAULT_PLAN);
  const [err, setErr] = useState("");
  const highlight = feature ? FEATURE_KEY[feature] : undefined;
  const go = async (fn: () => Promise<void>) => {
    setErr("");
    try { await fn(); } catch { setErr(t("upgradeError")); }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <div className="text-[15px] font-semibold">{t("upgradeTitle")}</div>
          <div className="text-[12px] text-zinc-500">{t("upgradeSub", String(TRIAL_DAYS))}</div>
        </div>
        <ul className="space-y-1 text-[12px]">
          {PRO_LIST.map((k) => (
            <li key={k} className={`flex gap-2 ${highlight === k ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""}`}>
              <span className="text-emerald-500">✓</span>{t(k, String(APP.FREE_MONITOR_LIMIT))}
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-2">
          {(["monthly", "annual"] as const).map((id) => {
            const p = PLANS[id];
            const on = sel === id;
            return (
              <button key={id} onClick={() => setSel(id)} aria-pressed={on}
                className={`relative rounded-lg border p-3 text-left ${on ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-zinc-300 dark:border-zinc-700"}`}>
                {id === "annual" && (
                  <span className="absolute -top-2 right-2 rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1.5">{t("savePct", String(annualSavingsPct()))}</span>
                )}
                <div className="text-[11px] font-semibold uppercase text-zinc-500">{t(id === "annual" ? "planAnnual" : "planMonthly")}</div>
                <div className="text-[16px] font-bold">{usd(p.price)}<span className="text-[11px] font-normal text-zinc-500">/{t(id === "annual" ? "perYear" : "perMonth")}</span></div>
                {id === "annual" && <div className="text-[11px] text-zinc-500">{t("aboutPerMonth", "$" + annualPerMonth())}</div>}
              </button>
            );
          })}
        </div>
        <button className="btn-primary w-full h-9" onClick={() => go(() => extpay().openTrialPage(TRIAL_DAYS + "-day"))}>{t("startTrial", String(TRIAL_DAYS))}</button>
        <button className="btn w-full" onClick={() => go(() => extpay().openPaymentPage(PLANS[sel].nickname))}>{t("upgradeNow")}</button>
        <div className="flex justify-between text-[11px]">
          <button className="text-zinc-500 underline" onClick={() => go(() => extpay().openLoginPage())}>{t("alreadyPaid")}</button>
          <button className="text-zinc-500" onClick={onClose}>{t("notNow")}</button>
        </div>
        {err && <p className="text-[11px] text-red-600">{err}</p>}
      </div>
    </Modal>
  );
}
