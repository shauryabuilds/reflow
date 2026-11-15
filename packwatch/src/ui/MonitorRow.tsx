import type { Monitor, MonitorRuntime, Plan } from "../shared/types";
import { t, uiLocale } from "../shared/i18n";
import { formatMoney } from "../shared/price";
import { agoSec, fmtDuration, fmtInterval } from "../shared/time";
import { effectiveIntervalSec, isStale } from "../shared/intervals";
import { gameLabel, siteRuleFor } from "../shared/data";
import { originPattern } from "../shared/url";
import { sendBg } from "../shared/messages";
import { StatePill, useUpgrade } from "./kit";

interface Props { m: Monitor; rt?: MonitorRuntime; plan: Plan; now: number; onEdit: () => void }

export function MonitorRow({ m, rt, plan, now, onEdit }: Props) {
  const upgrade = useUpgrade();
  const siteMin = siteRuleFor(m.shopDomain).minIntervalSec;
  const stale = isStale(m, rt, plan, now, siteMin);
  const ago = agoSec(rt?.lastSuccessAt ?? m.lastCheckedAt, now);
  const eff = effectiveIntervalSec(m, plan, now, siteMin);
  const nextIn = rt && rt.nextCheckAt < Number.MAX_SAFE_INTEGER ? Math.max(0, Math.round((rt.nextCheckAt - now) / 1000)) : null;
  const needsPermission = m.state === "error" && /^Allow Packwatch/.test(m.evidence ?? "");

  const togglePause = async () => {
    const r = await sendBg({ type: "pw:setPaused", id: m.id, paused: m.state !== "paused" && m.state !== "queue" });
    if (!r.ok && r.code === "limit") upgrade("unlimitedMonitors");
  };
  const allow = async () => {
    if (await chrome.permissions.request({ origins: [originPattern(m.url)] })) await sendBg({ type: "pw:checkNow", id: m.id });
  };
  const remove = async () => { if (confirm(t("confirmDelete", m.title))) await sendBg({ type: "pw:deleteMonitor", id: m.id }); };

  return (
    <div className={`card p-2.5 space-y-1.5 ${stale ? "border-red-500/60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a href={m.url} target="_blank" rel="noreferrer" className="font-semibold text-[13px] hover:underline line-clamp-2">{m.title}</a>
          <div className="text-[11px] text-zinc-500 truncate">
            {[m.shopDomain, m.region, gameLabel(m.game), m.kind === "listing" ? t("kindListing") : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <StatePill state={m.state} kind={m.kind} />
          {m.lastPrice && <span className="text-[12px] font-semibold">{formatMoney(m.lastPrice, uiLocale())}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${stale ? "bg-red-500" : m.state === "paused" || m.state === "queue" ? "bg-zinc-400" : "bg-emerald-500 animate-pulse"}`} />
        <span>{ago === null ? t("notCheckedYet") : t("checkedAgo", fmtDuration(ago))}</span>
        <span>· {t("every", fmtInterval(eff))}</span>
        <span>· {m.mode === "tab" ? t("modeTabShort") : t("modeFetchShort")}</span>
        {nextIn !== null && m.state !== "paused" && <span>· {t("nextIn", fmtDuration(nextIn))}</span>}
      </div>
      {m.evidence && <div className="text-[11px] text-zinc-500 truncate" title={m.evidence}>{m.evidence}</div>}
      {rt?.backingOff && <div className="text-[11px] text-amber-600 dark:text-amber-400">{t("backingOff")}</div>}
      {m.state === "queue" && <div className="text-[11px] text-amber-600 dark:text-amber-400">{t("queueNote")}</div>}
      {stale && <div className="text-[11px] text-red-600 dark:text-red-400">{t("staleRow")}</div>}
      <div className="flex flex-wrap gap-1 pt-0.5">
        {needsPermission && <button className="btn-primary h-7" onClick={allow}>{t("allowShop", m.shopDomain)}</button>}
        <button className="btn h-7" onClick={togglePause}>{m.state === "paused" || m.state === "queue" ? t("resume") : t("pause")}</button>
        <button className="btn h-7" onClick={() => sendBg({ type: "pw:checkNow", id: m.id })} disabled={m.state === "paused"}>{t("checkNow")}</button>
        <button className="btn h-7" onClick={onEdit}>{t("edit")}</button>
        <button className="btn-ghost h-7 text-red-600" onClick={remove}>{t("delete")}</button>
      </div>
    </div>
  );
}
