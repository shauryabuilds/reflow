import { t } from "../shared/i18n";

export function WelcomeCard({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="card p-3 border-emerald-500/50 bg-emerald-500/5" role="status">
      <div className="font-semibold">{t("welcomeTitle")}</div>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">{t("welcomeBody")}</p>
      <ul className="mt-2 list-disc pl-4 text-zinc-600 dark:text-zinc-400 space-y-0.5">
        <li>{t("welcomeBullet1")}</li>
        <li>{t("welcomeBullet2")}</li>
        <li>{t("welcomeBullet3")}</li>
      </ul>
      <button className="btn-primary mt-3" onClick={onDismiss}>{t("gotIt")}</button>
    </div>
  );
}
