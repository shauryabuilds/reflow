// Versioned storage migrations. Each step takes the raw local + sync stores and
// returns the keys to write and remove. Steps are pure so they can be unit tested.
import type { SimplePref } from "./types";
import { SCHEMA_VERSION, LOCAL_DEFAULTS } from "./storage";

export interface MigrationIO {
  local: Record<string, unknown>;
}

export interface MigrationResult {
  set: Record<string, unknown>;
  remove: string[];
  reflowUpgrade: boolean;
}

interface ReflowPref {
  interval?: number;
  hardRefresh?: boolean;
  preserveScroll?: boolean;
  randomize?: boolean;
}

const toSimple = (p: ReflowPref): SimplePref => ({
  intervalSec: Math.max(5, Math.round(Number(p.interval) || 30)),
  randomize: !!p.randomize,
  hardRefresh: p.hardRefresh ?? true,
  keepScroll: p.preserveScroll ?? true,
});

/** v0 → v1: Reflow (v1.x/v2.x) keys move into the pw.* namespace. */
export function migrateV0toV1(io: MigrationIO): MigrationResult {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];
  const reflowKeys = ["reflow_domains", "reflow_last", "reflow_state"].filter((k) => k in io.local);
  const reflowUpgrade = reflowKeys.length > 0;

  const domains = (io.local["reflow_domains"] as Record<string, ReflowPref> | undefined) || {};
  const simplePrefs: Record<string, SimplePref> = {};
  for (const [host, p] of Object.entries(domains)) {
    if (host && p && typeof p === "object") simplePrefs[host] = toSimple(p);
  }
  if (Object.keys(simplePrefs).length) set["pw.simplePrefs"] = simplePrefs;

  const last = io.local["reflow_last"] as ReflowPref | undefined;
  if (last && typeof last === "object") set["pw.simpleLast"] = toSimple(last);

  // reflow_state held tab ids from a previous browser session; they are meaningless now.
  remove.push(...reflowKeys);

  if (reflowUpgrade) {
    const ui = { ...LOCAL_DEFAULTS["pw.ui"], ...((io.local["pw.ui"] as object) || {}), welcomePending: true };
    set["pw.ui"] = ui;
  }
  set["pw.schema"] = 1;
  return { set, remove, reflowUpgrade };
}

const STEPS: Array<(io: MigrationIO) => MigrationResult> = [migrateV0toV1];

/** Runs every pending step against chrome.storage. Safe to call on every startup. */
export async function runMigrations(): Promise<{ from: number; to: number; reflowUpgrade: boolean }> {
  const local = await chrome.storage.local.get(null);
  const from = Number(local["pw.schema"] || 0);
  let reflowUpgrade = false;
  let current = { ...local };
  for (let v = from; v < SCHEMA_VERSION; v++) {
    const step = STEPS[v];
    if (!step) break;
    const r = step({ local: current });
    reflowUpgrade ||= r.reflowUpgrade;
    if (r.remove.length) await chrome.storage.local.remove(r.remove);
    await chrome.storage.local.set(r.set);
    for (const k of r.remove) delete current[k];
    current = { ...current, ...r.set };
  }
  return { from, to: Math.max(from, SCHEMA_VERSION), reflowUpgrade };
}
