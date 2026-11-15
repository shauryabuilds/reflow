import { useEffect, useMemo, useState } from "react";
import type { Draft, ListingProduct, Monitor, Plan, Strategy } from "../shared/types";
import { t, uiLocale } from "../shared/i18n";
import { autoDetect, type DetectResult } from "../detect";
import { classifyPage, type PageClass } from "../detect/classify";
import { detectShopifyCollection, shopifyCurrency } from "../detect/shopify";
import { extractListing, matchesKeywords, parseKeywords } from "../detect/listing";
import { suggestTags } from "../shared/tags";
import { presetFor } from "../shared/data";
import { formatMoney } from "../shared/price";
import { guessRegion, shopDomainOf, shopifyCollectionHandle } from "../shared/url";
import { newId } from "../shared/monitor";
import { can } from "../shared/entitlements";
import { getPrefs } from "../shared/storage";
import { planMinInterval } from "../shared/intervals";
import { agoSec, fmtDuration } from "../shared/time";
import { inspectTab, isRestricted, type PageSnapshot } from "./inspect";
import { requestAndCreate, requestAndPick } from "./createFlow";
import { Field, ProChip, StatePill, Toggle, useUpgrade } from "../ui/kit";
import { TagSelects } from "../ui/TagSelects";
import { IntervalSelect } from "../ui/IntervalSelect";
import { useNow } from "../ui/hooks";

type View = "loading" | "restricted" | "product" | "listing" | "done";

interface Props { tab: chrome.tabs.Tab; plan: Plan; monitors: Record<string, Monitor>; openPanel: () => void }

const stripHash = (u: string) => u.split("#")[0];

export function PageWatch({ tab, plan, monitors, openPanel }: Props) {
  const upgrade = useUpgrade();
  const now = useNow();
  const [snap, setSnap] = useState<PageSnapshot | null>(null);
  const [cls, setCls] = useState<PageClass | null>(null);
  const [view, setView] = useState<View>("loading");
  const [det, setDet] = useState<{ strategy: Strategy; result: DetectResult } | null>(null);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<{ game?: string; productType?: string }>({});
  const [restock, setRestock] = useState(true);
  const [preorder, setPreorder] = useState(true);
  const [priceOn, setPriceOn] = useState(false);
  const [priceTarget, setPriceTarget] = useState("");
  const [variantId, setVariantId] = useState("");
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [interval, setIntervalSec] = useState(60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Monitor | null>(null);

  const url = stripHash(tab.url ?? "");
  const domain = shopDomainOf(url);
  const preset = presetFor(domain);
  const existing = Object.values(monitors).filter((m) => m.kind !== "simple" && stripHash(m.url) === url);

  useEffect(() => {
    if (isRestricted(tab.url) || tab.id === undefined) { setView("restricted"); return; }
    getPrefs().then((p) => setIntervalSec(Math.max(p.defaultIntervalSec, planMinInterval(plan, "fetch"))));
    inspectTab(tab.id).then((s) => {
      if (!s) { setView("restricted"); return; }
      setSnap(s);
      const c = classifyPage(s.html, s.url);
      setCls(c);
      const d = autoDetect(s.html, s.url, { shopifyJson: c.type === "product" ? s.json ?? undefined : undefined });
      setDet(d);
      const name = (c.type === "product" && s.json && typeof (s.json as { title?: string }).title === "string" ? (s.json as { title: string }).title : s.title) || domain;
      setTitle(name);
      setTags(suggestTags(name, preset?.games));
      const v = new URL(s.url).searchParams.get("variant");
      if (v) setVariantId(v);
      setView(c.type === "listing" ? "listing" : "product");
    });
  }, [tab.id]);

  const variants = useMemo(() => {
    const j = snap?.json as { variants?: Array<{ id: number; title: string; available: boolean }> } | null;
    return cls?.type === "product" && Array.isArray(j?.variants) && j!.variants.length > 1 ? j!.variants : [];
  }, [snap, cls]);

  const listing: ListingProduct[] = useMemo(() => {
    if (!snap || view !== "listing") return [];
    const cur = shopifyCurrency(snap.html);
    if (cls?.shopify && snap.json && shopifyCollectionHandle(snap.url)) {
      return detectShopifyCollection(snap.json, new URL(snap.url).origin, cur).products ?? [];
    }
    return extractListing(snap.html, snap.url, { currencyHint: cur });
  }, [snap, view, cls]);
  const inc = parseKeywords(include), exc = parseKeywords(exclude);
  const matching = listing.filter((p) => matchesKeywords(p.title, inc, exc));

  const draftBase = (kind: Draft["kind"], forUrl = url): Draft => {
    const price = det?.result.price;
    const target = Number(priceTarget);
    const listingStrategy: Strategy = cls?.shopify && shopifyCollectionHandle(forUrl) ? "shopify" : "jsonld";
    return {
      id: newId(), kind, url: forUrl, title: title || domain, createdAt: Date.now(),
      strategy: kind === "listing" ? listingStrategy : det?.strategy ?? "heuristic",
      game: tags.game, productType: tags.productType, region: preset?.region ?? guessRegion(domain),
      alertOn: {
        restock, preorder,
        ...(priceOn && can(plan, "priceAlerts") && target > 0 && price ? { priceAtOrBelow: { amount: target, currency: price.currency } } : {}),
      },
      keywords: kind === "listing" ? inc : undefined,
      excludeKeywords: kind === "listing" ? exc : undefined,
      intervalSec: interval,
      currencyHint: price?.currency ?? (snap ? shopifyCurrency(snap.html) : undefined),
      variantId: kind === "product" && variantId ? variantId : undefined,
    };
  };

  const submit = async (draft: Draft) => {
    setBusy(true); setError("");
    const r = await requestAndCreate(draft);
    setBusy(false);
    if (r.ok && r.data) { setCreated(r.data); setView("done"); return; }
    if (!r.ok && r.code === "limit") { upgrade("unlimitedMonitors"); setError(t("errLimit")); return; }
    if (!r.ok && r.code === "denied") { setError(t("errDenied", domain)); return; }
    if (!r.ok && r.code === "duplicate") { setError(t("errDuplicate")); return; }
    setError(r.ok ? "" : r.error);
  };

  const pick = async () => {
    if (tab.id === undefined) return;
    setBusy(true);
    const r = await requestAndPick(tab.id, { ...draftBase("product"), strategy: "selector" });
    setBusy(false);
    if (r.ok) window.close();
    else setError(r.code === "denied" ? t("errDenied", domain) : r.error);
  };

  if (view === "restricted") return <p className="text-zinc-500 py-6 text-center">{t("openShopPage")}</p>;
  if (view === "loading") return <p className="text-zinc-500 py-6 text-center">{t("reading")}</p>;

  if (view === "done" && created) {
    return (
      <div className="card p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold truncate">{t("nowWatching")}</span>
          <StatePill state={created.state} kind={created.kind} />
        </div>
        <div className="text-[12px] truncate">{created.title}</div>
        <div className="text-[11px] text-zinc-500">{created.evidence}</div>
        {created.mode === "tab" && <div className="text-[11px] text-zinc-500">{t("tabModeNote")}</div>}
        <button className="btn w-full" onClick={openPanel}>{t("openMonitors")}</button>
      </div>
    );
  }

  const r = det?.result;
  const less = det?.strategy === "heuristic";
  return (
    <div className="space-y-3">
      {existing.length > 0 && (
        <div className="card p-2.5 space-y-1">
          {existing.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate">{m.kind === "listing" ? t("watchingListings") : t("watchingThis")}</span>
              <span className="flex items-center gap-2 shrink-0 text-zinc-500">
                {t("checkedAgo", fmtDuration(agoSec(m.lastCheckedAt, now) ?? 0))}
                <StatePill state={m.state} kind={m.kind} />
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1 text-[12px]">
        <button className={`btn h-7 ${view === "product" ? "bg-zinc-100 dark:bg-zinc-800" : "btn-ghost"}`} onClick={() => setView("product")}>{t("tabProduct")}</button>
        <button className={`btn h-7 ${view === "listing" ? "bg-zinc-100 dark:bg-zinc-800" : "btn-ghost"}`} onClick={() => setView("listing")}>{t("tabListings")}</button>
      </div>

      <input className="input w-full" value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t("title")} />

      {view === "product" && r && (
        <div className="card p-2.5 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <StatePill state={r.state === "queue" ? "queue" : r.state} />
            <span className="font-semibold">{r.price ? formatMoney(r.price, uiLocale()) : ""}</span>
          </div>
          <div className="text-[11px] text-zinc-500">{r.evidence}</div>
          {less && <div className="text-[11px] text-amber-600 dark:text-amber-400">{t("lessReliable")}</div>}
        </div>
      )}

      <Field label={t("tags")}><TagSelects game={tags.game} productType={tags.productType} onChange={setTags} /></Field>

      {view === "product" ? (
        <>
          {variants.length > 0 && (
            <Field label={t("variant")}>
              <select className="input w-full" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
                <option value="">{t("anyVariant")}</option>
                {variants.map((v) => <option key={v.id} value={String(v.id)}>{v.title}{v.available ? "" : ` · ${t("state_out")}`}</option>)}
              </select>
            </Field>
          )}
          <Field label={t("alertMeOn")}>
            <div className="space-y-1.5">
              <Toggle on={restock} onChange={setRestock} label={t("alertRestock")} />
              <Toggle on={preorder} onChange={setPreorder} label={t("alertPreorder")} />
              <div className="flex items-center gap-2">
                <Toggle on={priceOn && can(plan, "priceAlerts")} onChange={(v) => (can(plan, "priceAlerts") ? setPriceOn(v) : upgrade("priceAlerts"))}
                  label={t("alertPrice")} chip={!can(plan, "priceAlerts") ? <ProChip feature="priceAlerts" /> : undefined} />
                {priceOn && can(plan, "priceAlerts") && (
                  <input className="input w-24" type="number" min="0" step="0.01" placeholder={r?.price ? String(r.price.amount) : "0.00"}
                    value={priceTarget} onChange={(e) => setPriceTarget(e.target.value)} aria-label={t("priceTarget")} />
                )}
                {priceOn && r?.price && <span className="text-[11px] text-zinc-500">{r.price.currency}</span>}
              </div>
            </div>
          </Field>
        </>
      ) : (
        <>
          <Field label={t("keywordsInclude")}>
            <input className="input w-full" placeholder={t("keywordsIncludePh")} value={include} onChange={(e) => setInclude(e.target.value)} />
          </Field>
          <Field label={t("keywordsExclude")}>
            <input className="input w-full" placeholder={t("keywordsExcludePh")} value={exclude} onChange={(e) => setExclude(e.target.value)} />
          </Field>
          <div className="card p-2 max-h-36 overflow-y-auto">
            <div className="label mb-1">{t("previewMatches", String(matching.length), String(listing.length))}</div>
            {matching.slice(0, 12).map((p) => (
              <div key={p.id} className="flex justify-between gap-2 text-[11px] py-0.5">
                <span className="truncate">{p.title}</span>
                <span className="text-zinc-500 shrink-0">{p.price ? formatMoney(p.price, uiLocale()) : ""}</span>
              </div>
            ))}
            {!listing.length && <div className="text-[11px] text-zinc-500">{t("noProductsFound")}</div>}
          </div>
        </>
      )}

      <Field label={t("checkEvery")}><IntervalSelect value={interval} onChange={setIntervalSec} plan={plan} /></Field>

      {error && <p className="text-[12px] text-red-600 dark:text-red-400">{error}</p>}

      {view === "product" ? (
        <div className="space-y-1.5">
          <button className="btn-primary w-full h-9" disabled={busy} onClick={() => submit(draftBase("product"))}>{t("watchProduct")}</button>
          <button className="btn-ghost w-full text-zinc-600 dark:text-zinc-400" disabled={busy} onClick={pick}>{t("pickButton")}</button>
        </div>
      ) : (
        <button className="btn-primary w-full h-9" disabled={busy} onClick={() => submit(draftBase("listing"))}>{t("watchListings")}</button>
      )}

      {preset?.listingUrls?.length ? (
        <div className="space-y-1">
          <div className="label">{t("presetListings", preset.name)}</div>
          {preset.listingUrls.map((l) => (
            <button key={l.url} className="btn w-full justify-start" disabled={busy}
              onClick={() => submit({ ...draftBase("listing", l.url), title: `${preset.name}: ${l.label}`, strategy: preset.platform === "shopify" ? "shopify" : "jsonld" })}>
              {t("watchNewListingsAt", l.label)}
            </button>
          ))}
        </div>
      ) : null}
      {cls && <p className="text-[10px] text-zinc-500">{t("detectedAs", cls.evidence)}</p>}
    </div>
  );
}
