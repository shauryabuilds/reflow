import { useLocal, useNow, usePlan } from "./hooks";
import { isStale } from "../shared/intervals";
import { siteRuleFor } from "../shared/data";
import { t } from "../shared/i18n";

export function StaleCard({ onOpen }: { onOpen: () => void }) {
  const monitors = useLocal("pw.monitors") ?? {};
  const runtime = useLocal("pw.runtime") ?? {};
  const plan = usePlan();
  const now = useNow(5000);
  const stale = Object.values(monitors).filter((m) => m.kind !== "simple" && isStale(m, runtime[m.id], plan, now, siteRuleFor(m.shopDomain).minIntervalSec));
  if (!stale.length) return null;
  return (
    <button className="card w-full p-2.5 text-left border-red-500/50 bg-red-500/5" onClick={onOpen}>
      <div className="text-[12px] font-semibold text-red-600 dark:text-red-400">{t("staleTitle", String(stale.length))}</div>
      <div className="text-[11px] text-zinc-500 truncate">{stale.map((m) => m.title).join(", ")}</div>
    </button>
  );
}
