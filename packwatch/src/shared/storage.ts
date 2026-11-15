// Typed access to chrome.storage. Every key Packwatch owns is declared here.
import type {
  AlertRecord, Counters, Draft, DomainState, EntitlementCache, HistoryEvent, Monitor,
  MonitorRuntime, Prefs, Settings, SimplePref, UiState,
} from "./types";
import { APP } from "../config/app";

export const SCHEMA_VERSION = 1;

export interface LocalSchema {
  "pw.schema": number;
  "pw.monitors": Record<string, Monitor>;
  "pw.runtime": Record<string, MonitorRuntime>;
  "pw.domains": Record<string, DomainState>;
  "pw.history": HistoryEvent[];
  "pw.alerts": AlertRecord[];
  "pw.settings": Settings;
  "pw.entitlement": EntitlementCache;
  "pw.ui": UiState;
  "pw.counters": Counters;
  "pw.simplePrefs": Record<string, SimplePref>;
  "pw.simpleLast": SimplePref | null;
  "pw.pending": Record<string, Draft>;
}

export interface SyncSchema {
  "pw.prefs": Prefs;
}

export interface SessionSchema {
  "pw.tabs": Record<string, number>;
}

export const DEFAULT_PREFS: Prefs = { sound: "chime", volume: 0.7, autoOpen: false, defaultIntervalSec: 60 };

export const DEFAULT_SETTINGS: Settings = {
  ntfyEnabled: false,
  ntfyTopic: "",
  ntfyServer: APP.NTFY_SERVER,
  discordEnabled: false,
  discordWebhook: "",
  stallToPhone: true,
};

export const LOCAL_DEFAULTS: LocalSchema = {
  "pw.schema": 0,
  "pw.monitors": {},
  "pw.runtime": {},
  "pw.domains": {},
  "pw.history": [],
  "pw.alerts": [],
  "pw.settings": DEFAULT_SETTINGS,
  "pw.entitlement": { plan: "free", checkedAt: 0 },
  "pw.ui": { welcomePending: false, nudgedAlertIds: [], needsChooseActive: false },
  "pw.counters": { monitorsByGame: {}, alertsFired: 0, proConversions: 0 },
  "pw.simplePrefs": {},
  "pw.simpleLast": null,
  "pw.pending": {},
};

type LocalKey = keyof LocalSchema;

export async function getLocal<K extends LocalKey>(key: K): Promise<LocalSchema[K]> {
  const d = await chrome.storage.local.get(key);
  const v = d[key] as LocalSchema[K] | undefined;
  if (v === undefined) return structuredClone(LOCAL_DEFAULTS[key]);
  // Merge object defaults so new fields appear after an update.
  const def = LOCAL_DEFAULTS[key];
  if (def && typeof def === "object" && !Array.isArray(def) && v && typeof v === "object" && !Array.isArray(v)
      && (key === "pw.settings" || key === "pw.ui" || key === "pw.counters" || key === "pw.entitlement")) {
    return { ...structuredClone(def), ...v } as LocalSchema[K];
  }
  return v;
}

export async function getLocalMany<K extends LocalKey>(keys: K[]): Promise<Pick<LocalSchema, K>> {
  const d = await chrome.storage.local.get(keys);
  const out = {} as Pick<LocalSchema, K>;
  for (const k of keys) {
    const v = d[k] as LocalSchema[K] | undefined;
    out[k] = v === undefined ? structuredClone(LOCAL_DEFAULTS[k]) : v;
  }
  return out;
}

export async function setLocal(values: Partial<LocalSchema>): Promise<void> {
  await chrome.storage.local.set(values);
}

export async function getPrefs(): Promise<Prefs> {
  try {
    const d = await chrome.storage.sync.get("pw.prefs");
    return { ...DEFAULT_PREFS, ...((d["pw.prefs"] as Partial<Prefs>) || {}) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setPrefs(p: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...p };
  try { await chrome.storage.sync.set({ "pw.prefs": next }); }
  catch { /* sync quota or disabled: preferences are best-effort */ }
  return next;
}

export async function getSessionTabs(): Promise<Record<string, number>> {
  const d = await chrome.storage.session.get("pw.tabs");
  return (d["pw.tabs"] as Record<string, number>) || {};
}

export async function setSessionTabs(tabs: Record<string, number>): Promise<void> {
  await chrome.storage.session.set({ "pw.tabs": tabs });
}

export const seenKey = (monitorId: string) => `pw.seen.${monitorId}`;

export async function getSeen(monitorId: string): Promise<Record<string, string>> {
  const k = seenKey(monitorId);
  const d = await chrome.storage.local.get(k);
  return (d[k] as Record<string, string>) || {};
}

export async function setSeen(monitorId: string, seen: Record<string, string>): Promise<void> {
  const entries = Object.entries(seen);
  const capped = entries.length > APP.SEEN_CAP ? Object.fromEntries(entries.slice(-APP.SEEN_CAP)) : seen;
  await chrome.storage.local.set({ [seenKey(monitorId)]: capped });
}

export async function removeSeen(monitorId: string): Promise<void> {
  await chrome.storage.local.remove(seenKey(monitorId));
}
