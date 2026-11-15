// Shared helpers for watcher tabs (tab mode) and Simple Refresh tabs.
import guardScript from "../content/guard.ts?script";
import { originPattern } from "../shared/url";
import { getSessionTabs, setSessionTabs } from "../shared/storage";

export interface TabMeta { openedAt: number; reloads: number }

export async function hasHostPermission(url: string): Promise<boolean> {
  try { return await chrome.permissions.contains({ origins: [originPattern(url)] }); } catch { return false; }
}

export async function tabExists(tabId: number | undefined): Promise<chrome.tabs.Tab | null> {
  if (tabId === undefined) return null;
  try { return await chrome.tabs.get(tabId); } catch { return null; }
}

export async function getTabMeta(): Promise<Record<string, TabMeta>> {
  return ((await chrome.storage.session.get("pw.tabmeta"))["pw.tabmeta"] as Record<string, TabMeta>) || {};
}
export async function setTabMeta(meta: Record<string, TabMeta>) {
  await chrome.storage.session.set({ "pw.tabmeta": meta });
}

export async function bindTab(monitorId: string, tabId: number, now = Date.now()) {
  const tabs = await getSessionTabs();
  tabs[monitorId] = tabId;
  await setSessionTabs(tabs);
  const meta = await getTabMeta();
  meta[monitorId] = { openedAt: now, reloads: 0 };
  await setTabMeta(meta);
}

export async function unbindTab(monitorId: string) {
  const tabs = await getSessionTabs();
  delete tabs[monitorId];
  await setSessionTabs(tabs);
  const meta = await getTabMeta();
  delete meta[monitorId];
  await setTabMeta(meta);
}

/** Resolves on the tab's next "complete" load (register before triggering the navigation). */
export function nextLoad(tabId: number, timeoutMs = 30_000): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => { chrome.tabs.onUpdated.removeListener(fn); clearTimeout(timer); resolve(ok); };
    const fn = (id: number, info: { status?: string }) => { if (id === tabId && info.status === "complete") done(true); };
    const timer = setTimeout(() => done(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(fn);
  });
}

export async function waitComplete(tabId: number, timeoutMs = 30_000): Promise<boolean> {
  const t = await tabExists(tabId);
  if (t?.status === "complete") return true;
  return nextLoad(tabId, timeoutMs);
}

export async function injectGuard(tabId: number): Promise<boolean> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [guardScript] });
    return true;
  } catch { return false; }
}

export interface Probe { busy: boolean; html: string; url: string }

/** Typing guard: focused + typed in the last N ms, or a form field holding unsaved input. Optionally saves scroll. */
export async function probe(tabId: number, opts: { typingMs: number; saveScroll: boolean; html: number }): Promise<Probe | null> {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      args: [opts.typingMs, opts.saveScroll, opts.html],
      func: (typingMs: number, saveScroll: boolean, htmlCap: number) => {
        const g = (window as unknown as { __pwGuard?: { lastKey: number; dirty: boolean } }).__pwGuard;
        const typed = !!g && document.hasFocus() && Date.now() - g.lastKey < typingMs;
        const unsaved = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'textarea, input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="search"]',
        )).some((el) => el.value.trim() !== "" && el.value !== el.defaultValue);
        const busy = typed || unsaved;
        if (!busy && saveScroll) {
          try { sessionStorage.setItem("__pw_scroll", JSON.stringify({ x: scrollX, y: scrollY, t: Date.now() })); } catch { /* blocked */ }
        }
        return { busy, html: htmlCap ? document.documentElement.outerHTML.slice(0, htmlCap) : "", url: location.href };
      },
    });
    return (r?.result as Probe) ?? null;
  } catch { return null; }
}

export async function readPage(tabId: number): Promise<{ html: string; url: string } | null> {
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ html: document.documentElement.outerHTML.slice(0, 4_000_000), url: location.href }),
    });
    return (r?.result as { html: string; url: string }) ?? null;
  } catch { return null; }
}
