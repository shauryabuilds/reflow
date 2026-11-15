import type { Draft, Monitor } from "../shared/types";
import { originPattern } from "../shared/url";
import { sendBg, type Reply } from "../shared/messages";

/**
 * Asks for this shop's permission (must be the first awaited call inside the click handler so the
 * user gesture survives), then creates the monitor. The draft is parked in storage first: if the
 * popup closes while Chrome shows the prompt, the service worker finishes the job on permissions.onAdded.
 */
export async function requestAndCreate(draft: Draft): Promise<Reply<Monitor>> {
  const parked = parkDraft(draft);
  const granted = await chrome.permissions.request({ origins: [originPattern(draft.url)] });
  await parked;
  if (!granted) return { ok: false, code: "denied", error: "denied" };
  return sendBg<Monitor>({ type: "pw:createMonitor", draft });
}

export async function requestAndPick(tabId: number, draft: Draft): Promise<Reply> {
  const parked = parkDraft(draft);
  const granted = await chrome.permissions.request({ origins: [originPattern(draft.url)] });
  await parked;
  if (!granted) return { ok: false, code: "denied", error: "denied" };
  return sendBg({ type: "pw:startPicker", tabId, draft });
}

async function parkDraft(draft: Draft) {
  const d = await chrome.storage.local.get("pw.pending");
  const pending = (d["pw.pending"] as Record<string, Draft>) || {};
  pending[draft.id] = draft;
  await chrome.storage.local.set({ "pw.pending": pending });
}
