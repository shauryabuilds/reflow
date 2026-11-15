import { useEffect, useState } from "react";
import type { LocalSchema } from "../shared/storage";
import { getLocal, getPrefs } from "../shared/storage";
import type { Plan, Prefs } from "../shared/types";
import { getPlan } from "../shared/entitlements";

/** Live view of one chrome.storage.local key. */
export function useLocal<K extends keyof LocalSchema>(key: K): LocalSchema[K] | undefined {
  const [v, setV] = useState<LocalSchema[K]>();
  useEffect(() => {
    let alive = true;
    getLocal(key).then((x) => alive && setV(x));
    const fn = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && key in changes) getLocal(key).then((x) => alive && setV(x));
    };
    chrome.storage.onChanged.addListener(fn);
    return () => { alive = false; chrome.storage.onChanged.removeListener(fn); };
  }, [key]);
  return v;
}

export function usePlan(): Plan {
  const [p, setP] = useState<Plan>("free");
  const ent = useLocal("pw.entitlement");
  useEffect(() => { getPlan().then(setP); }, [ent]);
  return p;
}

export function usePrefs(): Prefs | undefined {
  const [p, setP] = useState<Prefs>();
  useEffect(() => {
    getPrefs().then(setP);
    const fn = (_c: unknown, area: string) => { if (area === "sync") getPrefs().then(setP); };
    chrome.storage.onChanged.addListener(fn);
    return () => chrome.storage.onChanged.removeListener(fn);
  }, []);
  return p;
}

/** Re-renders every `ms` so "checked 12s ago" stays live. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}
