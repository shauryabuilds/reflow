import { useState } from "react";
import type { Plan } from "../shared/types";
import { TRIAL_DAYS } from "../config/plans";
import { t } from "../shared/i18n";
import { sendBg } from "../shared/messages";
import { useLocal } from "../ui/hooks";
import { useUpgrade } from "../ui/kit";
import { extpay } from "../ui/extpay";
import { Section } from "./Options";

export function PlanSettings({ plan }: { plan: Plan }) {
  const upgrade = useUpgrade();
  const ent = useLocal("pw.entitlement");
  const [busy, setBusy] = useState(false);
  const daysLeft = ent?.trialStartedAt ? Math.max(0, Math.ceil((ent.trialStartedAt + TRIAL_DAYS * 86_400_000 - Date.now()) / 86_400_000)) : 0;
  const refresh = async () => { setBusy(true); await sendBg({ type: "pw:refreshPlan" }); setBusy(false); };
  return (
    <Section title={t("secPlan")}>
      <div className="text-[13px]">
        {plan === "pro" && t("planIsPro")}
        {plan === "trial" && t("planIsTrial", String(daysLeft))}
        {plan === "free" && t("planIsFree")}
        {ent?.email && <span className="text-zinc-500"> · {ent.email}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {plan !== "pro" && <button className="btn-primary" onClick={() => upgrade()}>{t("seePro")}</button>}
        <button className="btn" onClick={() => extpay().openLoginPage().catch(() => {})}>{plan === "pro" ? t("manageSubscription") : t("restorePurchase")}</button>
        <button className="btn-ghost" disabled={busy} onClick={refresh}>{t("refreshStatus")}</button>
      </div>
      {__PW_DEV__ && (
        <div className="rounded-md border border-dashed border-amber-500/60 p-2 space-y-1">
          <div className="label text-amber-600">{t("devPlanTitle")}</div>
          <div className="flex gap-1">
            {(["free", "trial", "pro"] as const).map((p) => (
              <button key={p} className={`btn h-7 ${ent?.devOverride === p ? "bg-amber-400/20" : ""}`} onClick={() => sendBg({ type: "pw:devPlan", plan: p })}>{t(`plan_${p}`)}</button>
            ))}
            <button className={`btn h-7 ${!ent?.devOverride ? "bg-amber-400/20" : ""}`} onClick={() => sendBg({ type: "pw:devPlan", plan: null })}>{t("devPlanReal")}</button>
          </div>
        </div>
      )}
    </Section>
  );
}
