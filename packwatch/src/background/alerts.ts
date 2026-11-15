// Alert delivery: desktop notification, sound, auto-open tab (Free); phone push and Discord (Pro).
import { APP } from "../config/app";
import type { AlertRecord, Monitor, Plan } from "../shared/types";
import { can } from "../shared/entitlements";
import { getLocal, getPrefs, setLocal } from "../shared/storage";
import { gameLabel } from "../shared/data";
import { formatMoney } from "../shared/price";
import { inQuietHours, fmtDuration } from "../shared/time";
import { t, uiLocale } from "../shared/i18n";
import { newId } from "../shared/monitor";
import { sendOffscreen } from "../shared/messages";
import { ensureOffscreen } from "./offscreenHost";
import { pushChannels } from "./push";
import type { PendingAlert } from "./process";
import { withLock } from "./lock";

export interface AlertText { title: string; message: string; context: string }

export function alertText(a: PendingAlert): AlertText {
  const price = a.price ? formatMoney(a.price, uiLocale()) : "";
  const game = gameLabel(a.game);
  const latency = a.latencyMs ? t("detectedWithin", fmtDuration(Math.max(1, Math.round(a.latencyMs / 1000)))) : "";
  const line = [price, a.shopDomain, game].filter(Boolean).join(" · ");
  const ctx = [a.evidence, latency].filter(Boolean).join(" · ");
  switch (a.event) {
    case "restock": return { title: t("alertRestockTitle", a.title), message: line, context: ctx };
    case "preorder": return { title: t("alertPreorderTitle", a.title), message: line, context: ctx };
    case "price-drop": return { title: t("alertPriceTitle", a.title), message: line, context: ctx };
    case "new-listing":
      return (a.products?.length ?? 0) > 1
        ? { title: t("alertListingManyTitle", String(a.products!.length), a.shopDomain), message: a.products!.slice(0, 4).map((p) => p.title).join("\n"), context: ctx }
        : { title: t("alertListingTitle", a.title), message: line, context: ctx };
    case "queue":
      return /queue|waiting|line/i.test(a.evidence)
        ? { title: t("alertQueueTitle", a.shopDomain), message: t("alertQueueBody"), context: a.title }
        : { title: t("alertChallengeTitle", a.shopDomain), message: t("alertChallengeBody"), context: a.title };
    case "stall": return { title: t("alertStallTitle", a.title), message: t("alertStallBody"), context: a.evidence };
    default: return { title: t("alertTestTitle"), message: t("alertTestBody"), context: line };
  }
}

const BUY_EVENTS = new Set(["restock", "preorder", "new-listing", "price-drop"]);

async function chromeFocused(): Promise<boolean> {
  try { return !!(await chrome.windows.getLastFocused()).focused; } catch { return false; }
}

export async function focusOrOpen(url: string) {
  const strip = (u: string) => u.split("#")[0];
  const tabs = await chrome.tabs.query({});
  const hit = tabs.find((x) => x.url && strip(x.url) === strip(url) && !x.pinned) ?? tabs.find((x) => x.url && strip(x.url) === strip(url));
  if (hit?.id !== undefined) {
    await chrome.tabs.update(hit.id, { active: true });
    if (hit.windowId !== undefined) await chrome.windows.update(hit.windowId, { focused: true }).catch(() => {});
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

export async function playAlertSound(soundOverride?: "alarm") {
  const prefs = await getPrefs();
  await ensureOffscreen();
  await sendOffscreen({ type: "pw:sound", sound: soundOverride ?? prefs.sound, volume: prefs.volume }).catch(() => {});
}

export async function dispatchAlert(a: PendingAlert, plan: Plan, monitor?: Monitor): Promise<AlertRecord> {
  const now = Date.now();
  const [prefs, settings] = await Promise.all([getPrefs(), getLocal("pw.settings")]);
  const priority = can(plan, "priority") ? a.priority : "normal";
  const quietHours = monitor?.quietHours ?? settings.defaultQuietHours;
  const quiet = a.event !== "test" && priority !== "wake-me" && can(plan, "quietHours") && inQuietHours(quietHours, now);
  const silent = priority === "silent" && a.event !== "test";
  const rec: AlertRecord = {
    id: newId(), monitorId: a.monitorId, event: a.event, title: a.title, shopDomain: a.shopDomain, url: a.url, at: now,
    latencyMs: a.latencyMs, price: a.price, chromeFocused: await chromeFocused(), channels: [], quiet,
  };
  if (!silent) {
    const text = alertText(a);
    chrome.notifications.create(`pw:${rec.id}`, {
      type: "basic", iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: text.title, message: text.message || a.shopDomain, contextMessage: text.context,
      priority: priority === "wake-me" ? 2 : 1,
      requireInteraction: a.event !== "test" && a.event !== "stall",
      silent: quiet,
    });
    rec.channels.push("desktop");
    if (!quiet && a.event !== "stall") {
      await playAlertSound(priority === "wake-me" ? "alarm" : undefined);
      rec.channels.push("sound");
    }
    if (!quiet && prefs.autoOpen && BUY_EVENTS.has(a.event)) {
      await focusOrOpen(a.url).catch(() => {});
      rec.channels.push("tab");
    }
    if (!quiet || a.event === "test") rec.channels.push(...(await pushChannels(a, plan, settings, priority)));
  }
  await withLock(async () => {
    const [alerts, counters] = await Promise.all([getLocal("pw.alerts"), getLocal("pw.counters")]);
    alerts.push(rec);
    if (a.event !== "test") counters.alertsFired += 1;
    await setLocal({ "pw.alerts": alerts.slice(-APP.ALERT_LOG_CAP), "pw.counters": counters });
  });
  return rec;
}
