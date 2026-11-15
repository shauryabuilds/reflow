// Tab mode: a dedicated, pinned, inactive watcher tab per monitor for JS-rendered pages.
import { APP } from "../config/app";
import type { CheckResult, Monitor } from "../shared/types";
import { getSessionTabs } from "../shared/storage";
import { detectConfigOf } from "../shared/monitor";
import { sendOffscreen } from "../shared/messages";
import { ensureOffscreen } from "./offscreenHost";
import { bindTab, getTabMeta, injectGuard, nextLoad, probe, readPage, setTabMeta, tabExists, unbindTab, waitComplete } from "./tabs";

const SETTLE_MS = 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openWatcher(m: Monitor): Promise<number> {
  // After a browser restart Chrome may restore our pinned tab: adopt it instead of duplicating.
  const restored = (await chrome.tabs.query({ pinned: true })).find((t) => t.url === m.url);
  const tab = restored ?? (await chrome.tabs.create({ url: m.url, active: false, pinned: true }));
  if (tab.id === undefined) throw new Error("Could not open a watcher tab");
  await chrome.tabs.update(tab.id, { autoDiscardable: false }).catch(() => {});
  await bindTab(m.id, tab.id);
  return tab.id;
}

export async function ensureWatcherTab(m: Monitor): Promise<{ tabId: number; fresh: boolean }> {
  const tabs = await getSessionTabs();
  const existing = await tabExists(tabs[m.id]);
  if (existing?.id !== undefined) return { tabId: existing.id, fresh: false };
  return { tabId: await openWatcher(m), fresh: true };
}

export async function closeWatcherTab(monitorId: string) {
  const tabs = await getSessionTabs();
  const id = tabs[monitorId];
  await unbindTab(monitorId);
  if (id !== undefined) await chrome.tabs.remove(id).catch(() => {});
}

export async function checkInTab(m: Monitor): Promise<CheckResult> {
  const checkedAt = Date.now();
  let { tabId, fresh } = await ensureWatcherTab(m);
  const meta = await getTabMeta();
  const mm = meta[m.id] ?? { openedAt: checkedAt, reloads: 0 };

  // Memory hygiene: recycle the tab every 2 h or after many reloads.
  if (!fresh && (checkedAt - mm.openedAt > APP.TAB_RECYCLE_MS || mm.reloads >= APP.TAB_RECYCLE_RELOADS)) {
    await closeWatcherTab(m.id);
    tabId = await openWatcher(m);
    fresh = true;
  }

  if (fresh) {
    await waitComplete(tabId);
  } else {
    await injectGuard(tabId);
    const p = await probe(tabId, { typingMs: APP.TYPING_GUARD_MS, saveScroll: false, html: 0 });
    if (p?.busy) return { ok: true, state: "unknown", evidence: "Paused while you type", skipped: "typing", checkedAt };
    const loaded = nextLoad(tabId);
    await chrome.tabs.reload(tabId, { bypassCache: true });
    if (!(await loaded)) return { ok: false, state: "unknown", evidence: "Page load timed out", error: "Page load timed out", checkedAt };
    const meta2 = await getTabMeta();
    meta2[m.id] = { ...(meta2[m.id] ?? mm), reloads: (meta2[m.id]?.reloads ?? mm.reloads) + 1 };
    await setTabMeta(meta2);
  }
  await sleep(SETTLE_MS); // let client-side rendering finish
  await injectGuard(tabId);
  const page = await readPage(tabId);
  if (!page) return { ok: false, state: "unknown", evidence: "Could not read the page", error: "Could not read the page", checkedAt };
  await ensureOffscreen();
  return sendOffscreen({ type: "pw:check", cfg: detectConfigOf(m), html: page.html, finalUrl: page.url });
}
