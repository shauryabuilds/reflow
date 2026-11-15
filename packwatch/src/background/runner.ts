// CheckRunner is the seam for a future cloud runner (v1.1). LocalCheckRunner checks
// in this browser: fetch mode via the offscreen document, tab mode via watcher tabs.
import type { CheckResult, Monitor } from "../shared/types";
import { detectConfigOf } from "../shared/monitor";
import { sendOffscreen } from "../shared/messages";
import { ensureOffscreen } from "./offscreenHost";
import { hasHostPermission } from "./tabs";
import { checkInTab } from "./watcherTabs";

export interface CheckRunner {
  readonly id: string;
  run(m: Monitor): Promise<CheckResult>;
}

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export class LocalCheckRunner implements CheckRunner {
  readonly id = "local";
  async run(m: Monitor): Promise<CheckResult> {
    const checkedAt = Date.now();
    if (!(await hasHostPermission(m.url))) {
      return { ok: false, state: "unknown", evidence: "Permission needed", error: `Allow Packwatch to check ${m.shopDomain}`, checkedAt };
    }
    const timeout: CheckResult = { ok: false, state: "unknown", evidence: "Timed out", error: "Timed out", checkedAt };
    try {
      if (m.mode === "tab") return await withTimeout(checkInTab(m), 60_000, timeout);
      await ensureOffscreen();
      return await withTimeout(sendOffscreen({ type: "pw:check", cfg: detectConfigOf(m) }), 30_000, timeout);
    } catch (e) {
      return { ok: false, state: "unknown", evidence: String((e as Error)?.message ?? e), error: String((e as Error)?.message ?? e), checkedAt };
    }
  }
}

export const runner: CheckRunner = new LocalCheckRunner();
