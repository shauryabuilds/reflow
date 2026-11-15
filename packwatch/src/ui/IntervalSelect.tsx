import { INTERVAL_CHOICES } from "../config/app";
import type { CheckMode, Plan } from "../shared/types";
import { planMinInterval } from "../shared/intervals";
import { fmtInterval } from "../shared/time";
import { t } from "../shared/i18n";
import { useUpgrade } from "./kit";

export function IntervalSelect({ value, onChange, plan, mode = "fetch" }: { value: number; onChange: (v: number) => void; plan: Plan; mode?: CheckMode }) {
  const min = planMinInterval(plan, mode);
  const upgrade = useUpgrade();
  return (
    <select className="input w-full" aria-label={t("checkEvery")} value={value}
      onChange={(e) => { const v = Number(e.target.value); if (v < min) upgrade("fastInterval"); else onChange(v); }}>
      {INTERVAL_CHOICES.map((s) => (
        <option key={s} value={s}>{t("every", fmtInterval(s))}{s < min ? ` · ${t("proOnly")}` : ""}</option>
      ))}
    </select>
  );
}
