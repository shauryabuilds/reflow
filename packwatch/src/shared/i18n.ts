// All UI strings go through chrome.i18n (public/_locales/<lang>/messages.json).
export function t(key: string, ...subs: Array<string | number>): string {
  const s = subs.map(String);
  let msg = "";
  try { msg = chrome.i18n.getMessage(key, s.length ? s : undefined); } catch { /* not in an extension context */ }
  return msg || key;
}

export function uiLocale(): string {
  try { return chrome.i18n.getUILanguage() || navigator.language || "en"; } catch { return "en"; }
}
