// Ticker, fetch-mode checks and sounds. Holds no monitor state.
import { fetchUrlFor, runDetection, type DetectConfig } from "../detect";
import { detectQueue } from "../detect/queue";
import type { CheckResult } from "../shared/types";
import { playSound } from "./sounds";

const tick = () => chrome.runtime.sendMessage({ target: "bg", type: "pw:tick" }).catch(() => {});
try {
  const w = new Worker(new URL("./ticker.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = tick;
} catch {
  setInterval(tick, 1000);
}

const MAX_BODY = 4_000_000;

async function check(cfg: DetectConfig, html?: string, finalUrl?: string): Promise<CheckResult> {
  const checkedAt = Date.now();
  if (html !== undefined) {
    return { ok: true, ...runDetection(cfg, html, finalUrl ?? cfg.url), finalUrl, checkedAt };
  }
  const url = fetchUrlFor(cfg);
  const json = /\.js$|\.json(\?|$)/.test(new URL(url).pathname + new URL(url).search);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      credentials: "include", cache: "no-store", redirect: "follow", signal: ctrl.signal,
      headers: { Accept: json ? "application/json, text/javascript, */*;q=0.1" : "text/html,application/xhtml+xml,*/*;q=0.8" },
    });
    const body = (await res.text()).slice(0, MAX_BODY);
    if (!res.ok) {
      const q = detectQueue(body, res.url, cfg.inStockRule.locale);
      if (q) return { ok: true, state: "queue", evidence: q.evidence, httpStatus: res.status, finalUrl: res.url, checkedAt };
      return { ok: false, state: "unknown", evidence: `HTTP ${res.status}`, error: `HTTP ${res.status}`, httpStatus: res.status, checkedAt };
    }
    return { ok: true, ...runDetection(cfg, body, res.url), httpStatus: res.status, finalUrl: res.url, checkedAt };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return { ok: false, state: "unknown", evidence: aborted ? "Timed out" : "Network error", error: aborted ? "Timed out" : "Network error", checkedAt };
  } finally {
    clearTimeout(timer);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== "offscreen") return false;
  if (msg.type === "pw:check") { check(msg.cfg, msg.html, msg.finalUrl).then(reply); return true; }
  if (msg.type === "pw:sound") { try { playSound(msg.sound, msg.volume); } catch { /* audio unavailable */ } reply(); return false; }
  return false;
});
