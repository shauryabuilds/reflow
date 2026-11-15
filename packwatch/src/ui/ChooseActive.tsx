import { useState } from "react";
import type { Monitor } from "../shared/types";
import { APP } from "../config/app";
import { t } from "../shared/i18n";
import { sendBg } from "../shared/messages";
import { Modal, StatePill, useUpgrade } from "./kit";

/** After a downgrade: pick which monitors stay active. Nothing is deleted. */
export function ChooseActive({ monitors }: { monitors: Monitor[] }) {
  const upgrade = useUpgrade();
  const [sel, setSel] = useState<string[]>(monitors.filter((m) => m.state !== "paused").slice(0, APP.FREE_MONITOR_LIMIT).map((m) => m.id));
  const [open, setOpen] = useState(true);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < APP.FREE_MONITOR_LIMIT ? [...s, id] : s));
  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <div className="space-y-3">
        <div className="text-[14px] font-semibold">{t("chooseTitle", String(APP.FREE_MONITOR_LIMIT))}</div>
        <p className="text-[12px] text-zinc-500">{t("chooseBody")}</p>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {monitors.map((m) => (
            <label key={m.id} className="flex items-center gap-2 card p-2 cursor-pointer">
              <input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m.id)} className="accent-emerald-500" />
              <span className="flex-1 min-w-0 truncate text-[12px]">{m.title}</span>
              <StatePill state={m.state} kind={m.kind} />
            </label>
          ))}
        </div>
        <div className="flex justify-between gap-2">
          <button className="btn" onClick={() => upgrade("unlimitedMonitors")}>{t("keepAllPro")}</button>
          <button className="btn-primary" onClick={async () => { await sendBg({ type: "pw:chooseActive", ids: sel }); setOpen(false); }}>
            {t("keepSelected", String(sel.length))}
          </button>
        </div>
      </div>
    </Modal>
  );
}
