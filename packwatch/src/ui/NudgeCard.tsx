import { useEffect, useState } from "react";
import type { AlertRecord, Plan } from "../shared/types";
import { getLocal, setLocal } from "../shared/storage";
import { pickNudge } from "../shared/nudge";
import { t } from "../shared/i18n";
import { fmtDuration } from "../shared/time";
import { useUpgrade } from "./kit";

export function NudgeCard({ plan }: { plan: Plan }) {
  const [a, setA] = useState<AlertRecord | null>(null);
  const upgrade = useUpgrade();
  useEffect(() => {
    (async () => {
      const [alerts, ui] = await Promise.all([getLocal("pw.alerts"), getLocal("pw.ui")]);
      const pick = pickNudge(alerts, ui, plan, Date.now());
      if (!pick) return;
      setA(pick);
      await setLocal({ "pw.ui": { ...ui, lastNudgeAt: Date.now(), nudgedAlertIds: [...ui.nudgedAlertIds, pick.id].slice(-50) } });
    })();
  }, [plan]);
  if (!a) return null;
  const time = new Date(a.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const key = a.event === "preorder" ? "nudgePreorder" : a.event === "new-listing" ? "nudgeListing" : "nudgeRestock";
  const latency = a.latencyMs ? t("detectedWithin", fmtDuration(Math.round(a.latencyMs / 1000))) + ". " : "";
  return (
    <div className="card p-3 border-amber-500/50 bg-amber-400/5 space-y-1.5">
      <div className="text-[12px] font-semibold">{t(key, a.title, time)}</div>
      <div className="text-[11px] text-zinc-500">{latency}{t("nudgeBody")}</div>
      <div className="flex gap-2">
        <button className="btn-primary h-7" onClick={() => upgrade("phonePush")}>{t("upgrade")}</button>
        <button className="btn-ghost h-7" onClick={() => setA(null)}>{t("dismiss")}</button>
      </div>
    </div>
  );
}
