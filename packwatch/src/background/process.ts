// Turns a check result into state transitions, history events and (deduplicated) alerts.
// Pure: no chrome.* calls, so every rule here is unit tested.
import { APP } from "../config/app";
import type {
  AlertEvent, CheckResult, HistoryEvent, ListingProduct, Money, Monitor, MonitorRuntime, Plan, StableState,
} from "../shared/types";
import { can } from "../shared/entitlements";
import { sameCurrency } from "../shared/price";
import { diffListing, matchesKeywords } from "../detect/listing";
import { effectiveIntervalSec, jitterMs } from "../shared/intervals";
import { isRateLimitStatus } from "./polite";

export interface PendingAlert {
  event: AlertEvent;
  monitorId: string;
  title: string;
  url: string;
  shopDomain: string;
  game?: string;
  price?: Money;
  evidence: string;
  latencyMs?: number;
  products?: ListingProduct[];
  priority: Monitor["priority"];
}

export interface ProcessInput {
  monitor: Monitor;
  runtime: MonitorRuntime;
  result: CheckResult;
  plan: Plan;
  now: number;
  seen?: Record<string, string>;
  siteMinSec?: number;
  cooldownMs?: number;
  rnd?: number;
}

export interface ProcessOutput {
  monitor: Monitor;
  runtime: MonitorRuntime;
  seen?: Record<string, string>;
  events: HistoryEvent[];
  alerts: PendingAlert[];
  /** How the domain should be treated after this check (backoff duration, 0 = none). */
  domainBackoffMs: number;
}

const TYPING_RETRY_MS = 5_000;

export function processResult(input: ProcessInput): ProcessOutput {
  const { result, plan, now } = input;
  const cooldown = input.cooldownMs ?? APP.ALERT_COOLDOWN_MS;
  const monitor: Monitor = { ...input.monitor };
  const runtime: MonitorRuntime = { ...input.runtime, lastAlertAt: { ...input.runtime.lastAlertAt } };
  delete runtime.inFlightSince;
  runtime.lastAttemptAt = now;
  const events: HistoryEvent[] = [];
  let alerts: PendingAlert[] = [];
  let seen = input.seen ? { ...input.seen } : undefined;
  const schedule = (errors = monitor.consecutiveErrors) => {
    const sec = effectiveIntervalSec(monitor, plan, now, input.siteMinSec ?? 0, errors);
    runtime.nextCheckAt = now + sec * 1000 + jitterMs(sec, input.rnd);
    return sec;
  };
  const base = (event: AlertEvent, evidence: string, extra: Partial<PendingAlert> = {}): PendingAlert => ({
    event, monitorId: monitor.id, title: monitor.title, url: monitor.url, shopDomain: monitor.shopDomain,
    game: monitor.game, evidence, priority: monitor.priority, ...extra,
  });

  // Skipped (user typing in a watcher tab, tab missing): try again shortly, change nothing.
  if (result.skipped) {
    runtime.nextCheckAt = now + TYPING_RETRY_MS;
    if (result.skipped === "typing") runtime.skippedTyping = (runtime.skippedTyping ?? 0) + 1;
    return { monitor, runtime, seen, events, alerts, domainBackoffMs: 0 };
  }

  // Errors: exponential backoff, no state transition.
  if (!result.ok) {
    monitor.consecutiveErrors += 1;
    monitor.state = "error";
    monitor.evidence = result.error || `HTTP ${result.httpStatus ?? "error"}`;
    monitor.lastCheckedAt = now;
    runtime.backingOff = true;
    const sec = schedule();
    const rateLimited = isRateLimitStatus(result.httpStatus) || !result.httpStatus;
    return { monitor, runtime, seen, events, alerts, domainBackoffMs: rateLimited ? sec * 1000 : 0 };
  }

  monitor.lastCheckedAt = now;
  const prevSuccess = runtime.lastSuccessAt;
  const latencyMs = prevSuccess ? now - prevSuccess : undefined;

  // Waiting room / bot check: stop checking immediately and tell the user.
  if (result.state === "queue") {
    const wasQueued = monitor.state === "queue";
    monitor.state = "queue";
    monitor.pausedReason = "queue";
    monitor.evidence = result.evidence;
    monitor.consecutiveErrors = 0;
    runtime.lastSuccessAt = now;
    runtime.backingOff = false;
    if (!wasQueued) alerts.push(base("queue", result.evidence));
    alerts = applyCooldown(alerts, runtime, now, cooldown);
    runtime.nextCheckAt = Number.MAX_SAFE_INTEGER; // resumes only when the user says so
    return { monitor, runtime, seen, events, alerts, domainBackoffMs: 0 };
  }

  monitor.consecutiveErrors = 0;
  runtime.lastSuccessAt = now;
  runtime.backingOff = false;
  delete runtime.stalledNotifiedAt;
  monitor.evidence = result.evidence;
  const ev = (event: HistoryEvent["event"], price?: Money, title = monitor.title): HistoryEvent => ({
    monitorId: monitor.id, shopDomain: monitor.shopDomain, title, game: monitor.game, productType: monitor.productType,
    event, at: now, price, latencyMs,
  });

  if (monitor.kind === "listing") {
    const products = result.products ?? [];
    if (!products.length) {
      monitor.state = "unknown";
      monitor.evidence = result.evidence || "No products found";
    } else if (!runtime.listingSeeded || !seen) {
      seen = Object.fromEntries(products.map((p) => [p.id, p.title]));
      runtime.listingSeeded = true;
      monitor.state = "in";
      monitor.evidence = `${products.length} products, watching for new ones`;
    } else {
      const d = diffListing(seen, products);
      const fresh = [
        ...d.added,
        ...d.retitled
          .filter((r) => !matchesKeywords(r.oldTitle, monitor.keywords, monitor.excludeKeywords))
          .map((r) => r.product),
      ].filter((p) => matchesKeywords(p.title, monitor.keywords, monitor.excludeKeywords));
      for (const p of [...d.added, ...d.retitled.map((r) => r.product)]) seen[p.id] = p.title;
      monitor.state = "in";
      monitor.evidence = `${products.length} products${fresh.length ? `, ${fresh.length} new match` : ""}`;
      for (const p of fresh) events.push(ev("new-listing", p.price, p.title));
      // One cooldown key per product: two different new products are two alerts' worth of news.
      const notYet = fresh.filter((p) => !withinCooldown(runtime.lastAlertAt[`new-listing:${p.id}`], now, cooldown));
      if (notYet.length) {
        for (const p of notYet) runtime.lastAlertAt[`new-listing:${p.id}`] = now;
        alerts.push(base("new-listing", notYet.length === 1 ? `New: ${notYet[0].title}` : `${notYet.length} new listings`, {
          products: notYet, price: notYet[0].price, url: notYet.length === 1 ? notYet[0].url : monitor.url,
          title: notYet.length === 1 ? notYet[0].title : monitor.title, latencyMs,
        }));
      }
    }
    prune(runtime, now, cooldown);
    schedule(0);
    return { monitor, runtime, seen, events, alerts, domainBackoffMs: 0 };
  }

  // Product watch.
  const prev = monitor.stableState;
  let next: StableState = result.state;
  let evidence = result.evidence;
  const sellerOk = !(can(plan, "priceAlerts") && monitor.sellerMustContain && result.seller
    && !result.seller.toLowerCase().includes(monitor.sellerMustContain.toLowerCase()));
  if (!sellerOk && (next === "in" || next === "preorder")) {
    evidence = `Seller “${result.seller}” skipped (must contain “${monitor.sellerMustContain}”)`;
    next = "out";
  }
  const price = result.price;
  if (next === "unknown") {
    // Never turn "can't tell" into a transition. Keep the last known stock state.
    monitor.state = "unknown";
  } else {
    monitor.state = next;
    if (next !== prev) {
      monitor.lastChangeAt = now;
      monitor.stableState = next;
      if (prev !== "unknown") {
        if (next === "in") events.push(ev("restock", price));
        else if (next === "preorder") events.push(ev("preorder", price));
        else if (next === "out") events.push(ev("out", price));
        const target = monitor.alertOn.priceAtOrBelow;
        const guardBlocks = can(plan, "priceAlerts") && monitor.priceGuard && target && price
          && sameCurrency(target, price) && price.amount > target.amount;
        if (next === "in" && monitor.alertOn.restock && !guardBlocks) alerts.push(base("restock", evidence, { price, latencyMs }));
        if (next === "preorder" && monitor.alertOn.preorder && !guardBlocks) alerts.push(base("preorder", evidence, { price, latencyMs }));
      }
    }
  }
  monitor.evidence = evidence;

  // Price crossing below the target (Pro). Compares only within one currency.
  const target = monitor.alertOn.priceAtOrBelow;
  const last = monitor.lastPrice;
  if (price && target && can(plan, "priceAlerts") && sameCurrency(price, target) && sameCurrency(last, price)
      && last!.amount > target.amount && price.amount <= target.amount) {
    events.push(ev("price-drop", price));
    alerts.push(base("price-drop", `Price ${last!.amount} → ${price.amount} ${price.currency}`, { price, latencyMs }));
  }
  if (price) monitor.lastPrice = price;

  alerts = applyCooldown(alerts, runtime, now, cooldown);
  prune(runtime, now, cooldown);
  schedule(0);
  return { monitor, runtime, seen, events, alerts, domainBackoffMs: 0 };
}

/** Drops alerts for events that already alerted within the cooldown, and stamps the rest. */
function applyCooldown(alerts: PendingAlert[], rt: MonitorRuntime, now: number, cooldown: number): PendingAlert[] {
  return alerts.filter((a) => {
    if (a.event === "new-listing") return true; // per-product keys handled above
    if (withinCooldown(rt.lastAlertAt[a.event], now, cooldown)) return false;
    rt.lastAlertAt[a.event] = now;
    return true;
  });
}

const withinCooldown = (last: number | undefined, now: number, cooldown: number) => last !== undefined && now - last < cooldown;

function prune(rt: MonitorRuntime, now: number, cooldown: number) {
  for (const [k, ts] of Object.entries(rt.lastAlertAt)) if (now - ts > cooldown * 6) delete rt.lastAlertAt[k];
}
