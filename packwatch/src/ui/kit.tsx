import { createContext, useContext, type ReactNode } from "react";
import { t } from "../shared/i18n";
import type { Monitor, StockState } from "../shared/types";
import type { Feature } from "../shared/entitlements";

export const UpgradeContext = createContext<(feature?: Feature) => void>(() => {});
export const useUpgrade = () => useContext(UpgradeContext);

export function Logo({ size = 18 }: { size?: number }) {
  return <img src={chrome.runtime.getURL("icons/icon48.png")} width={size} height={size} alt="" className="rounded-[4px]" />;
}

export function ProChip({ feature, onClick }: { feature?: Feature; onClick?: () => void }) {
  const open = useUpgrade();
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); (onClick ?? (() => open(feature)))(); }}
      className="inline-flex items-center rounded px-1.5 h-4 text-[9px] font-bold uppercase tracking-wide bg-amber-400/20 text-amber-700 dark:text-amber-300 border border-amber-500/40 hover:bg-amber-400/30"
      title={t("proChipTitle")}>Pro</button>
  );
}

const PILL: Record<StockState, string> = {
  in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  preorder: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/40",
  out: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  unknown: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30",
  queue: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40",
  error: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/40",
  paused: "bg-zinc-500/10 text-zinc-500 border-zinc-500/30",
};

export function stateLabel(s: StockState, kind: Monitor["kind"] = "product"): string {
  if (kind === "listing" && (s === "in" || s === "out")) return t("stateWatching");
  return t(`state_${s}`);
}

export function StatePill({ state, kind }: { state: StockState; kind?: Monitor["kind"] }) {
  return <span className={`inline-flex items-center h-5 px-2 rounded-full border text-[11px] font-semibold whitespace-nowrap ${PILL[state]}`}>{stateLabel(state, kind)}</span>;
}

export function Toggle({ on, onChange, label, disabled, chip }: { on: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean; chip?: ReactNode }) {
  return (
    <label className={`flex items-center gap-2 select-none ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}
        className={`relative w-7 h-4 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </button>
      <span className="text-[12px]">{label}</span>
      {chip}
    </label>
  );
}

export function Field({ label, children, extra }: { label: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="label flex items-center gap-1.5">{label}{extra}</div>
      {children}
    </div>
  );
}

export function Disclaimer() {
  return <p className="text-[10px] text-zinc-500 leading-snug">{t("disclaimer")}</p>;
}

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className={`card bg-white dark:bg-zinc-950 shadow-xl w-full ${wide ? "max-w-xl" : "max-w-sm"} p-4`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
