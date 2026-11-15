import { useEffect, useState } from "react";
import type { Plan } from "../shared/types";
import { t } from "../shared/i18n";
import { can } from "../shared/entitlements";
import { sendBg } from "../shared/messages";
import { DISCORD_WEBHOOK } from "../shared/channels";
import { useLocal } from "../ui/hooks";
import { ProChip, Toggle, useUpgrade } from "../ui/kit";
import { Section } from "./Options";
import { saveSettings } from "./PhoneSettings";

export function DiscordSettings({ plan }: { plan: Plan }) {
  const s = useLocal("pw.settings");
  const upgrade = useUpgrade();
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (s) setUrl(s.discordWebhook); }, [s?.discordWebhook]);
  if (!s) return null;
  const pro = can(plan, "discord");
  const valid = DISCORD_WEBHOOK.test(url.trim());

  const save = async () => {
    if (!pro) return upgrade("discord");
    if (!valid) { setMsg(t("discordInvalid")); return; }
    const origin = new URL(url.trim()).origin + "/*";
    if (!(await chrome.permissions.request({ origins: [origin] }))) return;
    await saveSettings({ discordWebhook: url.trim(), discordEnabled: true });
    await sendBg({ type: "pw:testAlert" });
    setMsg(t("discordSaved"));
  };

  return (
    <Section title={t("secDiscord")} extra={!pro ? <ProChip feature="discord" /> : undefined}>
      <p className="text-[12px] text-zinc-500">{t("discordIntro")}</p>
      <div className="flex gap-2">
        <input className="input flex-1 font-mono" placeholder="https://discord.com/api/webhooks/…" value={url} disabled={!pro}
          onChange={(e) => { setUrl(e.target.value); setMsg(""); }} />
        <button className="btn" onClick={save} disabled={pro && !url}>{t("saveAndTest")}</button>
      </div>
      {s.discordWebhook && pro && <Toggle on={s.discordEnabled} onChange={(v) => saveSettings({ discordEnabled: v })} label={t("discordEnable")} />}
      {msg && <p className="text-[12px] text-zinc-500">{msg}</p>}
    </Section>
  );
}
