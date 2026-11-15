import { useEffect, useState } from "react";
import type { SoundId } from "../shared/types";
import { t } from "../shared/i18n";
import { setPrefs } from "../shared/storage";
import { sendBg } from "../shared/messages";
import { playSound } from "../offscreen/sounds";
import { usePrefs, usePlan } from "../ui/hooks";
import { Field, Toggle } from "../ui/kit";
import { IntervalSelect } from "../ui/IntervalSelect";
import { Section } from "./Options";

export function AlertSettings() {
  const prefs = usePrefs();
  const plan = usePlan();
  const [shortcut, setShortcut] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => { chrome.commands.getAll((c) => setShortcut(c.find((x) => x.name === "toggle-refresh")?.shortcut || t("noShortcut"))); }, []);
  if (!prefs) return null;
  return (
    <Section title={t("secAlerts")}>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("sound")}>
          <div className="flex gap-1">
            <select className="input flex-1" value={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.value as SoundId })}>
              <option value="chime">{t("soundChime")}</option>
              <option value="ping">{t("soundPing")}</option>
              <option value="alarm">{t("soundAlarm")}</option>
            </select>
            <button className="btn" onClick={() => playSound(prefs.sound, prefs.volume)}>{t("play")}</button>
          </div>
        </Field>
        <Field label={t("volume", String(Math.round(prefs.volume * 100)))}>
          <input type="range" min="0" max="1" step="0.05" className="w-full accent-emerald-500" value={prefs.volume}
            onChange={(e) => setPrefs({ volume: Number(e.target.value) })} onMouseUp={() => playSound(prefs.sound, prefs.volume)} />
        </Field>
      </div>
      <Toggle on={prefs.autoOpen} onChange={(v) => setPrefs({ autoOpen: v })} label={t("autoOpen")} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("defaultInterval")}><IntervalSelect value={prefs.defaultIntervalSec} onChange={(v) => setPrefs({ defaultIntervalSec: v })} plan={plan} /></Field>
        <Field label={t("shortcut")}>
          <button className="btn w-full justify-between" onClick={() => chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>
            <span className="font-mono">{shortcut}</span><span className="text-zinc-500">{t("change")}</span>
          </button>
        </Field>
      </div>
      <button className="btn" onClick={async () => { await sendBg({ type: "pw:testAlert" }); setSent(true); setTimeout(() => setSent(false), 3000); }}>
        {sent ? t("testSent") : t("sendTestAlert")}
      </button>
    </Section>
  );
}
