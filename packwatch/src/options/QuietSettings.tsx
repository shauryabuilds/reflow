import type { Plan } from "../shared/types";
import { t } from "../shared/i18n";
import { can } from "../shared/entitlements";
import { useLocal } from "../ui/hooks";
import { ProChip } from "../ui/kit";
import { Section } from "./Options";
import { saveSettings } from "./PhoneSettings";

export function QuietSettings({ plan }: { plan: Plan }) {
  const s = useLocal("pw.settings");
  if (!s) return null;
  const pro = can(plan, "quietHours");
  const q = s.defaultQuietHours;
  return (
    <Section title={t("secQuiet")} extra={!pro ? <ProChip feature="quietHours" /> : undefined}>
      <p className="text-[12px] text-zinc-500">{t("quietIntro")}</p>
      <div className="flex items-center gap-2">
        <input type="time" className="input" disabled={!pro} value={q?.start ?? ""} onChange={(e) => saveSettings({ defaultQuietHours: e.target.value ? { start: e.target.value, end: q?.end ?? "07:00" } : undefined })} />
        <span>–</span>
        <input type="time" className="input" disabled={!pro} value={q?.end ?? ""} onChange={(e) => saveSettings({ defaultQuietHours: { start: q?.start ?? "22:00", end: e.target.value } })} />
        {q && pro && <button className="btn-ghost h-7" onClick={() => saveSettings({ defaultQuietHours: undefined })}>{t("clear")}</button>}
      </div>
    </Section>
  );
}
