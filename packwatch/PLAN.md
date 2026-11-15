# Packwatch v1: plan

Packwatch is the rebuild of Reflow as a private restock monitor for trading-card collectors. It ships with a Free tier and a Pro tier. This file is the architecture and the milestone checklist.

## Architecture

```
            ┌───────────── popup (React) ─────────────┐
            │ page detection (rendered DOM via        │
            │ activeTab), watch / listing / picker,   │
            │ Simple Refresh, nudge + welcome cards   │
            └──────────────┬──────────────────────────┘
                           │ typed messages (shared/messages.ts)
 side panel (React) ───────┤                     options page (React)
 monitors, history,        │                     alerts, phone, Discord,
 patterns, packs           ▼                     plan, packs, stats
            ┌──────── service worker (background/) ───────┐
            │ the only writer of monitors/runtime/history │
            │ scheduler.tick() → polite gate → CheckRunner │
            │ process.ts: transitions, dedupe, events      │
            │ alerts.ts: desktop, sound, tab, ntfy, Discord│
            │ watchdog alarm (1 min): offscreen + stalls   │
            └───────┬──────────────────────────┬──────────┘
         pw:check   │                          │ tabs.reload + executeScript
                    ▼                          ▼
   offscreen document (offscreen/)       watcher tabs (tab mode)
   1 s ticker → pw:tick                  pinned, inactive,
   fetch(credentials:'include')          autoDiscardable:false,
   + detect/* (DOMParser) + sounds       recycled every 2 h
```

- **No long-lived state in the service worker.** Every tick reloads monitors, runtime, domain state and entitlement from `chrome.storage`. An in-memory promise lock only serializes writes inside one worker lifetime.
- **Ticker.** The offscreen document sends `pw:tick` every second, which also keeps the worker awake. A `chrome.alarms` watchdog runs every minute: it recreates the offscreen document if it died, and flags stale monitors.
- **CheckRunner** (`background/runner.ts`) is the seam for a future cloud runner. `LocalCheckRunner` sends fetch-mode checks to the offscreen document and tab-mode checks to the watcher-tab manager.
- **Detection** modules are pure functions: `detect/shopify.ts`, `jsonld.ts`, `selector.ts`, `heuristic.ts`, `listing.ts`, `queue.ts`. They take HTML/JSON and return `{ state, price?, products?, evidence }`. They run in the offscreen document, the popup and Vitest (happy-dom).
- **Data lives in JSON**, never in code: `src/data/tags.json`, `presets.json`, `siteRules.json`, `stockRules.json`. Each one is validated by a JSON schema in `src/data/schemas/` during tests.
- **Entitlements** (`shared/entitlements.ts`): `getPlan()` and `can(feature)` are the only gate. The plan is cached in storage and refreshed on startup, every 6 h and on ExtPay `onPaid` / `onTrialStarted`.

## Storage (schema v1, `shared/storage.ts`)

| Key | Area | Contents |
|---|---|---|
| `pw.schema` | local | schema version |
| `pw.monitors` | local | `Record<id, Monitor>` |
| `pw.runtime` | local | per-monitor schedule: next check, last success, in-flight, cooldowns, stall flag, tab counters |
| `pw.seen.<id>` | local | listing-watch memory: product id → title |
| `pw.domains` | local | polite-mode state per domain (gap, hourly count, backoff, in-flight) |
| `pw.history` | local | event log (capped at 5000) |
| `pw.alerts` | local | fired alerts (for the nudge, click tracking and tests) |
| `pw.settings` | local | ntfy topic, Discord webhook, quiet-hours default |
| `pw.prefs` | sync | sound, volume, auto-open, default interval |
| `pw.entitlement` | local | cached plan + dev override |
| `pw.ui` | local | welcome card, last nudge, choose-active-monitors flag |
| `pw.counters` | local | local-only stats |
| `pw.simplePrefs` | local | Simple Refresh settings per site (migrated from `reflow_domains`) |
| `pw.tabs` | session | monitor id → tab id (watcher and Simple Refresh tabs) |

Migrations (`shared/migrations.ts`): v0 → v1 moves `reflow_domains`, `reflow_last` and `reflow_state` into the `pw.*` namespace and sets the welcome card.

## File layout

```
packwatch/
  manifest.config.ts  vite.config.ts  vitest.config.ts  tsconfig.json
  public/_locales/en/messages.json   public/icons/
  src/
    config/        app.ts (ids, URLs, defaults)  plans.ts (prices, plan ids)
    data/          tags.json presets.json siteRules.json stockRules.json schemas/
    shared/        types, storage, migrations, entitlements, i18n, price, url,
                   tags, intervals, time, history, packs, csv, messages
    detect/        html, shopify, jsonld, selector, heuristic, listing, queue,
                   classify, index
    background/    index, scheduler, polite, process, runner, watcherTabs,
                   simpleRefresh, alerts, badge, watchdog, offscreenHost, create,
                   entitlementSync
    offscreen/     offscreen.html offscreen.ts sounds.ts
    content/       picker.ts guard.ts extpay.ts
    popup/ sidepanel/ options/ ui/
  tests/           *.test.ts  fixtures/  e2e/smoke.cjs  e2e/perf.cjs
  fixture-shop/    server.mjs
```

## Milestones

- [x] 1. Scaffold: MV3 + Vite + CRXJS + React + Tailwind + i18n, popup/options/side panel shells, typed storage + migrations (Reflow → Packwatch), welcome card.
- [x] 2. Data files + JSON schemas. Detection modules with fixture tests (Shopify product/collection, JSON-LD, selector, heuristic, multi-currency prices, queue/challenge pages).
- [x] 3. Scheduler (offscreen ticker + alarm watchdog), polite mode, backoff, dedupe incl. listing memory, restart survival, heartbeat badge + stall notifications.
- [x] 4. Monitor creation: Watch this product, Watch for new listings, tag suggestions, element picker, per-domain permission, grouped/filterable list.
- [x] 5. Free alerts: desktop, sound, auto-open tab. Simple Refresh with typing guard.
- [x] 6. Entitlements + ExtPay + upgrade sheet + missed-restock nudge + downgrade + dev plan toggle.
- [x] 7. Pro alerts: ntfy + QR, Discord, stall-to-phone, priority/quiet hours, price alerts, price guard, seller filter.
- [x] 8. History + filters, pattern insights, boost window, CSV export, watchlist packs.
- [x] 9. Fixture shop + Playwright smoke test.
- [x] 10. README, PRIVACY, STORE_LISTING, CHANGELOG, PERF.
