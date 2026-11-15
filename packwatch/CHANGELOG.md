# Changelog

## 3.0.0: Reflow is now Packwatch

Packwatch is the rebuild of Reflow as a private restock monitor for trading-card collectors. It's the same extension and the same listing, and your Reflow settings carry over.

### New
- **Product watch.** One click on a product page. Auto-detects Shopify (`/products/<handle>.js`), schema.org JSON-LD, or the page's buttons; supports Shopify variants. Alerts on restock, preorder opening and (Pro) price at or below a target.
- **New-listing watch.** Watch a collection, category or search page with include/exclude keywords and a live preview of matches. Remembers every product it has seen.
- **Element picker.** Point at the stock button when auto-detection isn't enough; Packwatch saves a robust selector.
- **Fetch mode** (no tab) with an automatic **watcher-tab fallback** for JavaScript-rendered pages.
- **Polite mode.** One request at a time per shop, a minimum gap, an hourly cap, and exponential backoff on 429/403/5xx.
- **Queue guard.** Detects Queue-it waiting rooms and Cloudflare, Imperva and other bot checks, stops reloading immediately, and tells you.
- **Heartbeat.** "Checked Xs ago" on every monitor, a red "!" badge and a desktop notice when a monitor stalls. Schedules rebuild themselves after a browser restart.
- **Alerts.** Desktop notifications with price, shop, game tag, evidence and "detected within Ns"; three built-in sounds with volume; optional auto-open of the product tab.
- **Side panel.** All monitors grouped and filterable by game, shop and region; pause, edit, delete and test alerts.
- **History.** Timeline of restocks, preorders, sell-outs, price drops and new listings, with how long each item stayed in stock.
- **Packwatch Pro** (7-day free trial; $7.99/month or $59.99/year):
  - unlimited monitors and 15-second checks
  - phone alerts via ntfy (QR setup) and Discord webhooks, plus stall alerts to the phone
  - price alerts, price guard and seller filter
  - priority levels and quiet hours
  - restock pattern insights with a check-boost window
  - full history and CSV export
  - watchlist pack export
- **Watchlist packs.** Import (Free) and export (Pro) shareable sets of monitors without any personal data.
- Light and dark themes; every UI string goes through `chrome.i18n`.

### Changed
- **Simple Refresh** is the old Reflow auto-refresh (presets, custom interval, hard refresh, keep scroll, randomize, Alt+Shift+R). It now also waits while you type and stops on waiting rooms. The minimum interval is 5 seconds.
- Access to sites is requested **per shop** when you add a monitor, instead of for all sites at install.

### Migration
- Reflow's per-site settings (`reflow_domains`) and last-used settings (`reflow_last`) move to Packwatch's Simple Refresh settings. Upgraded users see a one-time "Reflow is now Packwatch" card.
