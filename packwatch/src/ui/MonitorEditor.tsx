import { useState } from "react";
import type { Monitor, Plan, Priority } from "../shared/types";
import { t } from "../shared/i18n";
import { can } from "../shared/entitlements";
import { sendBg } from "../shared/messages";
import { parseKeywords } from "../detect/listing";
import { Field, Modal, ProChip, Toggle, useUpgrade } from "./kit";
import { TagSelects } from "./TagSelects";
import { IntervalSelect } from "./IntervalSelect";

export function MonitorEditor({ monitor, plan, onClose }: { monitor: Monitor; plan: Plan; onClose: () => void }) {
  const upgrade = useUpgrade();
  const [m, setM] = useState<Monitor>(structuredClone(monitor));
  const [inc, setInc] = useState((monitor.keywords ?? []).join(", "));
  const [exc, setExc] = useState((monitor.excludeKeywords ?? []).join(", "));
  const [target, setTarget] = useState(monitor.alertOn.priceAtOrBelow ? String(monitor.alertOn.priceAtOrBelow.amount) : "");
  const [err, setErr] = useState("");
  const pro = (f: Parameters<typeof can>[1]) => can(plan, f);
  const set = (p: Partial<Monitor>) => setM((x) => ({ ...x, ...p }));
  const currency = m.lastPrice?.currency ?? m.currencyHint ?? "USD";

  const save = async () => {
    const amount = Number(target);
    const patch: Partial<Monitor> = {
      ...m,
      keywords: m.kind === "listing" ? parseKeywords(inc) : m.keywords,
      excludeKeywords: m.kind === "listing" ? parseKeywords(exc) : m.excludeKeywords,
      alertOn: { restock: m.alertOn.restock, preorder: m.alertOn.preorder, ...(pro("priceAlerts") && amount > 0 ? { priceAtOrBelow: { amount, currency } } : {}) },
    };
    const r = await sendBg({ type: "pw:updateMonitor", id: m.id, patch });
    if (r.ok) onClose(); else setErr(r.error);
  };

  return (
    <Modal open onClose={onClose} wide>
      <div className="space-y-3">
        <div className="text-[14px] font-semibold">{t("editMonitor")}</div>
        <Field label={t("title")}><input className="input w-full" value={m.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label={t("tags")}><TagSelects game={m.game} productType={m.productType} onChange={(v) => set(v)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("checkEvery")}><IntervalSelect value={m.intervalSec} onChange={(v) => set({ intervalSec: v })} plan={plan} mode={m.mode} /></Field>
          <Field label={t("checkMode")}>
            <select className="input w-full" value={m.mode} onChange={(e) => set({ mode: e.target.value as Monitor["mode"] })}>
              <option value="fetch">{t("modeFetch")}</option>
              <option value="tab">{t("modeTab")}</option>
            </select>
          </Field>
        </div>
        {m.strategy === "selector" && (
          <Field label={t("selector")}><input className="input w-full font-mono" value={m.selector ?? ""} onChange={(e) => set({ selector: e.target.value })} /></Field>
        )}
        {m.kind === "listing" ? (
          <>
            <Field label={t("keywordsInclude")}><input className="input w-full" value={inc} onChange={(e) => setInc(e.target.value)} placeholder={t("keywordsIncludePh")} /></Field>
            <Field label={t("keywordsExclude")}><input className="input w-full" value={exc} onChange={(e) => setExc(e.target.value)} placeholder={t("keywordsExcludePh")} /></Field>
          </>
        ) : (
          <Field label={t("alertMeOn")}>
            <div className="space-y-1.5">
              <Toggle on={m.alertOn.restock} onChange={(v) => set({ alertOn: { ...m.alertOn, restock: v } })} label={t("alertRestock")} />
              <Toggle on={m.alertOn.preorder} onChange={(v) => set({ alertOn: { ...m.alertOn, preorder: v } })} label={t("alertPreorder")} />
              <div className="flex items-center gap-2">
                <span className="text-[12px]">{t("alertPrice")}</span>
                {pro("priceAlerts") ? (
                  <><input className="input w-24" type="number" min="0" step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="—" /><span className="text-[11px] text-zinc-500">{currency}</span></>
                ) : <ProChip feature="priceAlerts" />}
              </div>
              <Toggle on={!!m.priceGuard && pro("priceAlerts")} onChange={(v) => (pro("priceAlerts") ? set({ priceGuard: v }) : upgrade("priceAlerts"))}
                label={t("priceGuard")} chip={!pro("priceAlerts") ? <ProChip feature="priceAlerts" /> : undefined} />
              <div className="flex items-center gap-2">
                <span className="text-[12px] shrink-0">{t("sellerMustContain")}</span>
                {pro("priceAlerts")
                  ? <input className="input flex-1" value={m.sellerMustContain ?? ""} onChange={(e) => set({ sellerMustContain: e.target.value || undefined })} placeholder={t("sellerPh")} />
                  : <ProChip feature="priceAlerts" />}
              </div>
            </div>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("priority")} extra={!pro("priority") ? <ProChip feature="priority" /> : undefined}>
            <select className="input w-full" disabled={!pro("priority")} value={m.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
              <option value="wake-me">{t("priorityWake")}</option>
              <option value="normal">{t("priorityNormal")}</option>
              <option value="silent">{t("prioritySilent")}</option>
            </select>
          </Field>
          <Field label={t("quietHours")} extra={!pro("quietHours") ? <ProChip feature="quietHours" /> : undefined}>
            <div className="flex items-center gap-1">
              <input type="time" className="input flex-1" disabled={!pro("quietHours")} value={m.quietHours?.start ?? ""}
                onChange={(e) => set({ quietHours: e.target.value ? { start: e.target.value, end: m.quietHours?.end ?? "07:00" } : undefined })} />
              <span>–</span>
              <input type="time" className="input flex-1" disabled={!pro("quietHours")} value={m.quietHours?.end ?? ""}
                onChange={(e) => set({ quietHours: m.quietHours ? { ...m.quietHours, end: e.target.value } : { start: "22:00", end: e.target.value } })} />
            </div>
          </Field>
        </div>
        {err && <p className="text-[12px] text-red-600">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("cancel")}</button>
          <button className="btn-primary" onClick={save}>{t("save")}</button>
        </div>
      </div>
    </Modal>
  );
}
