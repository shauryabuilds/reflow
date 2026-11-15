// Element picker flow, and finishing drafts after a permission grant if the popup closed.
import pickerScript from "../content/picker.ts?script";
import type { Draft } from "../shared/types";
import type { Reply } from "../shared/messages";
import { getLocal, setLocal } from "../shared/storage";
import { originPattern } from "../shared/url";
import { createMonitor } from "./monitors";
import { withLock } from "./lock";

async function park(draft: Draft) {
  await withLock(async () => {
    const pending = await getLocal("pw.pending");
    pending[draft.id] = draft;
    await setLocal({ "pw.pending": pending });
  });
}

export async function startPicker(tabId: number, draft: Draft): Promise<Reply> {
  await park({ ...draft, strategy: "selector" });
  try {
    await chrome.scripting.executeScript({ target: { tabId }, args: [draft.id], func: (id: string) => {
      (window as unknown as { __pwPicker?: { draftId: string } }).__pwPicker = { draftId: id };
    } });
    await chrome.scripting.executeScript({ target: { tabId }, files: [pickerScript] });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
}

export async function onPicked(draftId: string, selector: string, _text: string): Promise<Reply> {
  const pending = await getLocal("pw.pending");
  const draft = pending[draftId];
  if (!draft) return { ok: false, error: "This pick expired. Open Packwatch and try again." };
  return createMonitor({ ...draft, strategy: "selector", selector });
}

const creating = new Map<string, Promise<unknown>>();

/** permissions.onAdded: create parked drafts for these origins (picker drafts wait for their pick). */
export async function finalizePendingFor(origins: string[]): Promise<void> {
  const pending = await getLocal("pw.pending");
  const now = Date.now();
  for (const d of Object.values(pending)) {
    if (now - d.createdAt > 10 * 60_000) continue;
    if (d.strategy === "selector" && !d.selector) continue;
    if (!origins.includes(originPattern(d.url))) continue;
    if (creating.has(d.id)) continue;
    // Give the popup a moment to do it itself; createMonitor is idempotent either way.
    const p = new Promise((r) => setTimeout(r, 1500)).then(() => createMonitor(d)).finally(() => creating.delete(d.id));
    creating.set(d.id, p);
  }
}
