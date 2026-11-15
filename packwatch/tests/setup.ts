// Minimal in-memory chrome.* for unit tests.
import messages from "../public/_locales/en/messages.json";

type Store = Record<string, unknown>;
function area(store: Store) {
  return {
    async get(keys?: string | string[] | null) {
      if (keys == null) return structuredClone(store);
      const ks = Array.isArray(keys) ? keys : [keys];
      const out: Store = {};
      for (const k of ks) if (k in store) out[k] = structuredClone(store[k]);
      return out;
    },
    async set(v: Store) { Object.assign(store, structuredClone(v)); },
    async remove(keys: string | string[]) { for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k]; },
    async clear() { for (const k of Object.keys(store)) delete store[k]; },
    _store: store,
  };
}

const msgs = messages as Record<string, { message: string }>;
const chromeMock = {
  storage: { local: area({}), sync: area({}), session: area({}), onChanged: { addListener() {}, removeListener() {} } },
  i18n: {
    getMessage(key: string, subs?: string[]) {
      const m = msgs[key]?.message;
      if (!m) return "";
      return m.replace(/\$(\d)/g, (_, i) => subs?.[Number(i) - 1] ?? "");
    },
    getUILanguage: () => "en-US",
  },
  runtime: { id: "test", getURL: (p: string) => `chrome-extension://test/${p}` },
};
(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;

export function resetChromeStorage() {
  for (const a of [chromeMock.storage.local, chromeMock.storage.sync, chromeMock.storage.session]) {
    for (const k of Object.keys(a._store)) delete a._store[k];
  }
}
