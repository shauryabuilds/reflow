// Typed runtime messages. `target` routes a message to the service worker or the offscreen document.
import type { DetectConfig } from "../detect";
import type { BoostWindow, CheckResult, Draft, Monitor, Plan, SimplePref, SoundId } from "./types";
import type { WatchlistPack } from "./packs";

export type BgMsg =
  | { type: "pw:tick" }
  | { type: "pw:createMonitor"; draft: Draft }
  | { type: "pw:updateMonitor"; id: string; patch: Partial<Monitor> }
  | { type: "pw:deleteMonitor"; id: string }
  | { type: "pw:setPaused"; id: string; paused: boolean }
  | { type: "pw:checkNow"; id: string }
  | { type: "pw:testAlert" }
  | { type: "pw:simpleStart"; tabId: number; url: string; pref: SimplePref }
  | { type: "pw:simpleStop"; tabId: number }
  | { type: "pw:simpleKeepRefreshing"; tabId: number }
  | { type: "pw:startPicker"; tabId: number; draft: Draft }
  | { type: "pw:picked"; draftId: string; selector: string; text: string }
  | { type: "pw:refreshPlan" }
  | { type: "pw:chooseActive"; ids: string[] }
  | { type: "pw:importPack"; pack: WatchlistPack }
  | { type: "pw:setBoost"; shopDomain: string; boost: BoostWindow | null }
  | { type: "pw:devPlan"; plan: Plan | null }
  | { type: "pw:alertClicked"; alertId: string };

export type OffscreenMsg =
  | { type: "pw:check"; cfg: DetectConfig; html?: string; finalUrl?: string }
  | { type: "pw:sound"; sound: SoundId; volume: number };

export type Reply<T = unknown> = { ok: true; data?: T } | { ok: false; error: string; code?: string };

export function sendBg<T = unknown>(msg: BgMsg): Promise<Reply<T>> {
  return chrome.runtime.sendMessage({ target: "bg", ...msg });
}

export function sendOffscreen(msg: { type: "pw:check"; cfg: DetectConfig; html?: string; finalUrl?: string }): Promise<CheckResult>;
export function sendOffscreen(msg: { type: "pw:sound"; sound: SoundId; volume: number }): Promise<void>;
export function sendOffscreen(msg: OffscreenMsg): Promise<unknown> {
  return chrome.runtime.sendMessage({ target: "offscreen", ...msg });
}
