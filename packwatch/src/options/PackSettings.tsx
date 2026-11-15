import { useState } from "react";
import type { Plan } from "../shared/types";
import { t } from "../shared/i18n";
import { can } from "../shared/entitlements";
import { exportPack, packToText, parsePack, type WatchlistPack } from "../shared/packs";
import { originPattern, shopDomainOf } from "../shared/url";
import { sendBg } from "../shared/messages";
import { TAGS } from "../shared/data";
import type { ImportResult } from "../background/packsImport";
import { useLocal } from "../ui/hooks";
import { Field, ProChip, useUpgrade } from "../ui/kit";
import { Section } from "./Options";

export function PackSettings({ plan }: { plan: Plan }) {
  const upgrade = useUpgrade();
  const monitors = useLocal("pw.monitors") ?? {};
  const [text, setText] = useState("");
  const [pack, setPack] = useState<WatchlistPack | null>(null);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [game, setGame] = useState("");
  const [copied, setCopied] = useState(false);
  const watches = Object.values(monitors).filter((m) => m.kind !== "simple");

  const preview = (s: string) => {
    setText(s); setResult(null);
    if (!s.trim()) { setPack(null); setErr(""); return; }
    try { setPack(parsePack(s)); setErr(""); } catch (e) { setPack(null); setErr((e as Error).message); }
  };
  const onFile = async (f?: File) => { if (f) preview(await f.text()); };
  const doImport = async () => {
    if (!pack) return;
    // One permission prompt for every shop in the pack.
    const origins = [...new Set(pack.monitors.map((m) => originPattern(m.url)))];
    const granted = await chrome.permissions.request({ origins });
    if (!granted) { setErr(t("packDenied")); return; }
    const r = await sendBg<ImportResult>({ type: "pw:importPack", pack });
    if (r.ok && r.data) { setResult(r.data); setPack(null); setText(""); if (r.data.skipped.some((s) => s.reason === "limit")) upgrade("unlimitedMonitors"); }
    else if (!r.ok) setErr(r.error);
  };
  const built = () => exportPack(watches, { name: name || t("packDefaultName"), description: desc, game: game || undefined });
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(built(), null, 2)], { type: "application/json" }));
    a.download = `${(name || "watchlist").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.packwatch.json`;
    a.click();
  };

  return (
    <Section title={t("secPacks")}>
      <p className="text-[12px] text-zinc-500">{t("packsIntro")}</p>
      <div className="space-y-2">
        <div className="label">{t("packImport")}</div>
        <div className="flex gap-2">
          <input type="file" accept=".json,application/json" className="text-[12px]" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        <textarea className="input w-full h-16 py-1 font-mono text-[11px]" placeholder={t("packPastePh")} value={text} onChange={(e) => preview(e.target.value)} />
        {err && <p className="text-[12px] text-red-600">{err}</p>}
        {pack && (
          <div className="card p-2 space-y-1">
            <div className="font-semibold text-[12px]">{pack.name}</div>
            {pack.description && <div className="text-[11px] text-zinc-500">{pack.description}</div>}
            <ul className="text-[11px] max-h-32 overflow-y-auto">
              {pack.monitors.map((m, i) => <li key={i} className="truncate">{m.kind === "listing" ? "🆕 " : "• "}{m.title} <span className="text-zinc-500">({shopDomainOf(m.url)})</span></li>)}
            </ul>
            <button className="btn-primary" onClick={doImport}>{t("packImportN", String(pack.monitors.length))}</button>
          </div>
        )}
        {result && <p className="text-[12px] text-zinc-500">{t("packResult", String(result.created), String(result.skipped.length))}</p>}
      </div>
      <div className="space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
        <div className="label flex items-center gap-1.5">{t("packExport")}{!can(plan, "packExport") && <ProChip feature="packExport" />}</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("packName")}><input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("packNamePh")} /></Field>
          <Field label={t("game")}>
            <select className="input w-full" value={game} onChange={(e) => setGame(e.target.value)}>
              <option value="">{t("gameAny")}</option>
              {TAGS.games.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </Field>
        </div>
        <input className="input w-full" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("packDescPh")} />
        <p className="text-[11px] text-zinc-500">{t("packExportNote", String(watches.length))}</p>
        <div className="flex gap-2">
          <button className="btn" disabled={!watches.length} onClick={() => (can(plan, "packExport") ? download() : upgrade("packExport"))}>{t("packDownload")}</button>
          <button className="btn" disabled={!watches.length} onClick={async () => {
            if (!can(plan, "packExport")) return upgrade("packExport");
            await navigator.clipboard.writeText(packToText(built()));
            setCopied(true); setTimeout(() => setCopied(false), 2000);
          }}>{copied ? t("copied") : t("packCopy")}</button>
        </div>
      </div>
    </Section>
  );
}
