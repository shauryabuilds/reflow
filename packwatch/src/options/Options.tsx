import { useState, type ReactNode } from "react";
import { t } from "../shared/i18n";
import type { Feature } from "../shared/entitlements";
import { usePlan } from "../ui/hooks";
import { Disclaimer, Logo, UpgradeContext } from "../ui/kit";
import { UpgradeSheet } from "../ui/UpgradeSheet";
import { PlanChip } from "../ui/PlanChip";
import { AlertSettings } from "./AlertSettings";
import { PhoneSettings } from "./PhoneSettings";
import { DiscordSettings } from "./DiscordSettings";
import { QuietSettings } from "./QuietSettings";
import { PlanSettings } from "./PlanSettings";
import { PackSettings } from "./PackSettings";
import { StatsSettings } from "./StatsSettings";

export function Section({ title, extra, children }: { title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="card p-4 space-y-3">
      <h2 className="text-[14px] font-semibold flex items-center gap-2">{title}{extra}</h2>
      {children}
    </section>
  );
}

export function Options() {
  const plan = usePlan();
  const [sheet, setSheet] = useState<{ open: boolean; feature?: Feature }>({ open: false });
  return (
    <UpgradeContext.Provider value={(feature) => setSheet({ open: true, feature })}>
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <header className="flex items-center gap-2">
          <Logo size={28} /><h1 className="text-[18px] font-semibold">{t("settingsTitle")}</h1><PlanChip plan={plan} />
        </header>
        <PlanSettings plan={plan} />
        <AlertSettings />
        <PhoneSettings plan={plan} />
        <DiscordSettings plan={plan} />
        <QuietSettings plan={plan} />
        <PackSettings plan={plan} />
        <StatsSettings />
        <Disclaimer />
      </div>
      <UpgradeSheet open={sheet.open} feature={sheet.feature} onClose={() => setSheet({ open: false })} />
    </UpgradeContext.Provider>
  );
}
