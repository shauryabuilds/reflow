<img src="public/icons/icon128.png" width="56" alt="">

# Packwatch: TCG restock alerts & auto refresh

Your own private restock monitor for trading cards. Packwatch watches the exact product pages and shops **you** choose, in any country, including small Shopify card shops. It alerts only you, within seconds, without getting your accounts blocked.

It is game-agnostic: Pokémon TCG first, plus One Piece, Lorcana, Magic: The Gathering, Yu-Gi-Oh!, sports cards and other sealed collectibles. Games, product types, shops and site limits live in JSON data files, never in code.

Packwatch is the rebrand and rebuild of **Reflow**. Ship it as an update to the Reflow listing, so the extension ID, users and reviews carry over. Reflow's auto-refresh lives on as **Simple Refresh**.

## Setup

```bash
npm install
```

Requirements: Node 20+ and Chrome 116+. The end-to-end tests also need Playwright's Chromium (`npx playwright install chromium`, unless your machine already has it).

## Develop

```bash
npm run dev
```

Then load `dist-dev/` unpacked (below). Vite rebuilds on save, and pages reload automatically.

- **Dev builds** (`npm run dev`, `npm run build:dev`) include a **plan simulator** under Settings → Plan (Free / Trial / Pro / Real). They also pre-grant `http://*.localhost/*`, so the local fixture shop works without permission prompts.
- **Production builds** (`npm run build`) contain neither.

## Load it in Chrome

1. Build: `npm run build` (production, writes `dist/`) or `npm run build:dev` (dev, writes `dist-dev/`).
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose `dist/` or `dist-dev/`.
4. Pin Packwatch. Open the side panel from the popup's **Monitors** button.

## Try it with the fixture shop

```bash
npm run fixture-shop
```

Add `-- --auto=1 --flip=60` to flip stock every 60 seconds and add new listings on a timer.

The shop runs at `http://shop-a.localhost:8787/`. Every `*.localhost` subdomain is its own shop, and hosts starting with `sg` price in SGD. It has:

- Shopify-like product pages (`/products/<handle>`, plus `.js`)
- Collections (`/collections/<c>`, plus `products.json`)
- JSON-LD pages (`/ld/<handle>`)
- Plain HTML pages (`/plain/<handle>`)
- JS-rendered pages (`/spa/<handle>`, these need tab mode)
- A plain listing (`/listing/<c>`)
- A fake Queue-it page (`/queue`)

Flip stock by hand:

```text
http://localhost:8787/__control/set?host=shop-a.localhost&handle=elite-trainer-box&state=in
```

## Test Free vs Pro

1. Run `npm run build:dev` and load `dist-dev/`.
2. Open **Settings → Plan → Dev build: simulate plan** and click **Free**.
3. Add 3 monitors. The 4th opens the upgrade sheet. Intervals under 60 s, price alerts, phone/Discord, quiet hours, priority, CSV and pack export all show a **Pro** chip.
4. Click **Pro** (or **Trial**). Everything unlocks, and 15 s checks are allowed.
5. Add a few more monitors, then click **Free** again. Nothing is deleted. Monitors beyond 3 pause, and the side panel asks which 3 stay active.
6. Real payments go through ExtensionPay. Register the extension at extensionpay.com, set `EXTPAY_ID` in `src/config/app.ts`, and create plans with the nicknames from `src/config/plans.ts`.

## Tests

```bash
npm test
npm run typecheck
npm run test:e2e
npm run perf
```

- `npm test` runs the Vitest unit tests: detectors on fixtures, prices, polite mode, scheduler, dedupe, entitlements, history, packs and i18n.
- `npm run typecheck` runs strict TypeScript.
- `npm run test:e2e` runs the Playwright smoke test. It builds the dev build, adds a product watch and a listing watch through the real popup, then asserts exactly one notification per event.
- `npm run perf` runs the 1-hour soak test with 20 monitors and writes `PERF.md`. Use `PERF_MINUTES=10 npm run perf` for a shorter run.

## Release zip

```bash
npm run zip
```

This builds production and writes `packwatch-<version>.zip` with `manifest.json` at the root. Upload it on the existing Reflow item's **Package** tab. The listing copy is in `STORE_LISTING.md`; the privacy policy to host is `PRIVACY.md`.

## How it works

See `PLAN.md` for the architecture diagram and storage layout. In short:

- **Ticker.** An offscreen document ticks every second. A `chrome.alarms` watchdog (every minute) recreates it if it dies and flags stale monitors.
- **Service worker.** It holds no state between ticks: monitors, schedules and polite-mode state live in `chrome.storage` and are rebuilt on every wake.
- **Fetch mode** (default) fetches the page or Shopify JSON with your cookies in the offscreen document and parses it there, with no tab. **Tab mode** reloads a pinned, never-discarded watcher tab for JS-rendered pages.
- **Detection modules** (`src/detect/`) are pure functions with fixture tests: Shopify → JSON-LD → user-picked selector → heuristic.
- **CheckRunner** (`src/background/runner.ts`) is the seam for a future cloud runner (v1.1).

## Add a shop preset

Edit `src/data/presets.json`:

```json
"shops": {
  "cardshop.example": {
    "name": "Card Shop",
    "region": "SG",
    "platform": "shopify",
    "games": ["pokemon", "one-piece"],
    "strategy": "shopify",
    "listingUrls": [{ "label": "One Piece preorders", "url": "https://cardshop.example/collections/one-piece-preorder" }],
    "notes": "Restocks usually Thursday mornings"
  }
}
```

- Keys are domains without `www`; subdomains match their parent.
- Remove `"todo": true` from a placeholder to activate it.
- `npm test` validates the file against `src/data/schemas/presets.schema.json`.
- To slow Packwatch down on a shop, add an entry to `src/data/siteRules.json` (`minIntervalSec`, `minGapSec`, `maxPerHour`). Rules can only make Packwatch gentler.

## Add a game or product type

Add an entry to `src/data/tags.json`:

```json
{ "id": "digimon", "label": "Digimon", "keywords": ["digimon", "bt-\\d{2}"] }
```

It appears in tag suggestions, filters, grouping and history with no code change. A unit test proves this. Keywords are case-insensitive regexes matched against product titles. Use plain-text labels only: no logos or brand art.

## Translations

All UI strings are in `public/_locales/en/messages.json`. Add `public/_locales/<lang>/messages.json` to translate. `npm test` fails if the code uses a key that doesn't exist. Stock-button rules per language live in `src/data/stockRules.json`.

## Project layout

```text
src/
  background/  service worker: scheduler, polite mode, processing, alerts, monitors, picker, entitlements
  offscreen/   ticker worker, fetch-mode checks, sounds
  detect/      pure detection modules
  shared/      types, storage + migrations, entitlements, prices, tags, history, packs, i18n
  content/     element picker, typing guard, ExtensionPay bridge
  popup/ sidepanel/ options/ ui/   React + Tailwind UI
  data/        tags, presets, site rules, stock rules (+ JSON schemas)
  config/      app constants and paid plans
fixture-shop/  local test shop
tests/         unit tests, fixtures, e2e smoke + perf
```

Packwatch is independent and not affiliated with any game publisher or retailer.
