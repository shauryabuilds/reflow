import { t } from "../shared/i18n";
import { gameLabel } from "../shared/data";
import { useLocal } from "../ui/hooks";
import { Section } from "./Options";

/** Local-only counters. Nothing here ever leaves the browser. */
export function StatsSettings() {
  const c = useLocal("pw.counters");
  if (!c) return null;
  const games = Object.entries(c.monitorsByGame).sort((a, b) => b[1] - a[1]);
  return (
    <Section title={t("secStats")}>
      <p className="text-[11px] text-zinc-500">{t("statsNote")}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card p-2"><div className="text-[18px] font-semibold">{games.reduce((s, [, n]) => s + n, 0)}</div><div className="text-[11px] text-zinc-500">{t("statMonitors")}</div></div>
        <div className="card p-2"><div className="text-[18px] font-semibold">{c.alertsFired}</div><div className="text-[11px] text-zinc-500">{t("statAlerts")}</div></div>
        <div className="card p-2"><div className="text-[18px] font-semibold">{c.proConversions}</div><div className="text-[11px] text-zinc-500">{t("statConversions")}</div></div>
      </div>
      {games.length > 0 && (
        <div className="text-[12px] space-y-0.5">
          {games.map(([g, n]) => <div key={g} className="flex justify-between"><span>{gameLabel(g) || g}</span><span className="text-zinc-500">{n}</span></div>)}
        </div>
      )}
    </Section>
  );
}
