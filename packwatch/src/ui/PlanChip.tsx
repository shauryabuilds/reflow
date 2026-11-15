import type { Plan } from "../shared/types";
import { t } from "../shared/i18n";
import { useUpgrade } from "./kit";

export function PlanChip({ plan }: { plan: Plan }) {
  const open = useUpgrade();
  const cls = plan === "free"
    ? "border-zinc-300 dark:border-zinc-700 text-zinc-500"
    : "border-amber-500/50 text-amber-700 dark:text-amber-300 bg-amber-400/10";
  return (
    <button className={`h-5 px-1.5 rounded border text-[10px] font-bold uppercase tracking-wide ${cls}`} onClick={() => plan === "free" && open()}>
      {t(`plan_${plan}`)}
    </button>
  );
}
