import { useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import type { Plan, Settings } from "../shared/types";
import { t } from "../shared/i18n";
import { can } from "../shared/entitlements";
import { getLocal, setLocal } from "../shared/storage";
import { sendBg } from "../shared/messages";
import { newNtfyTopic, NTFY_TOPIC } from "../shared/channels";
import { useLocal } from "../ui/hooks";
import { Field, ProChip, Toggle, useUpgrade } from "../ui/kit";
import { Section } from "./Options";

export async function saveSettings(p: Partial<Settings>) {
  const s = await getLocal("pw.settings");
  await setLocal({ "pw.settings": { ...s, ...p } });
}

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  // Generated locally from our own string; contains no user-supplied markup.
  return <div className="w-36 h-36 bg-white p-1 rounded" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function PhoneSettings({ plan }: { plan: Plan }) {
  const s = useLocal("pw.settings");
  const upgrade = useUpgrade();
  const [sent, setSent] = useState("");
  if (!s) return null;
  const pro = can(plan, "phonePush");
  const url = `${s.ntfyServer.replace(/\/+$/, "")}/${s.ntfyTopic}`;

  const enable = async (on: boolean) => {
    if (!pro) return upgrade("phonePush");
    if (on) {
      const origin = new URL(s.ntfyServer).origin + "/*";
      if (!(await chrome.permissions.request({ origins: [origin] }))) return;
      await saveSettings({ ntfyEnabled: true, ntfyTopic: NTFY_TOPIC.test(s.ntfyTopic) ? s.ntfyTopic : newNtfyTopic() });
    } else await saveSettings({ ntfyEnabled: false });
  };
  const test = async () => { await sendBg({ type: "pw:testAlert" }); setSent(t("testSent")); setTimeout(() => setSent(""), 3000); };

  return (
    <Section title={t("secPhone")} extra={!pro ? <ProChip feature="phonePush" /> : undefined}>
      <p className="text-[12px] text-zinc-500">{t("phoneIntro")}</p>
      <Toggle on={s.ntfyEnabled && pro} onChange={enable} label={t("phoneEnable")} />
      {s.ntfyEnabled && pro && (
        <div className="flex gap-4 items-start">
          <Qr text={url} />
          <ol className="text-[12px] space-y-1.5 list-decimal pl-4 flex-1">
            <li>{t("phoneStep1")}</li>
            <li>{t("phoneStep2")}</li>
            <li>{t("phoneStep3")} <code className="font-mono text-[11px] break-all">{s.ntfyTopic}</code></li>
            <li className="list-none -ml-4 pt-1 flex gap-2">
              <button className="btn h-7" onClick={test}>{sent || t("sendTestAlert")}</button>
              <button className="btn-ghost h-7" onClick={() => saveSettings({ ntfyTopic: newNtfyTopic() })}>{t("newTopic")}</button>
            </li>
          </ol>
        </div>
      )}
      {s.ntfyEnabled && pro && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-zinc-500">{t("advanced")}</summary>
          <div className="pt-2">
            <Field label={t("ntfyServer")}>
              <input className="input w-full" value={s.ntfyServer} onChange={(e) => saveSettings({ ntfyServer: e.target.value })} />
            </Field>
          </div>
        </details>
      )}
      <Toggle on={s.stallToPhone && can(plan, "stallToPhone")} onChange={(v) => (can(plan, "stallToPhone") ? saveSettings({ stallToPhone: v }) : upgrade("stallToPhone"))}
        label={t("stallToPhone")} chip={!can(plan, "stallToPhone") ? <ProChip feature="stallToPhone" /> : undefined} />
      <p className="text-[11px] text-zinc-500">{t("phonePrivacy")}</p>
    </Section>
  );
}
