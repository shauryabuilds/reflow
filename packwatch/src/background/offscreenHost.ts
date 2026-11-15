// The offscreen document is the 1 s ticker, the HTML parser and the sound player.
const URL_PATH = "src/offscreen/offscreen.html";
let creating: Promise<void> | null = null;

export async function hasOffscreen(): Promise<boolean> {
  const ctx = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  return ctx.length > 0;
}

export async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen.createDocument({
    url: URL_PATH,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: "Parses shop pages to detect stock, keeps the check schedule ticking, and plays alert sounds.",
  }).catch((e: unknown) => { if (!String(e).includes("Only a single offscreen")) throw e; })
    .finally(() => { creating = null; });
  await creating;
}

export async function closeOffscreen(): Promise<void> {
  if (await hasOffscreen()) await chrome.offscreen.closeDocument().catch(() => {});
}
