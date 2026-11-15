# Chrome Web Store listing (draft)

Packwatch ships as an **update to the existing Reflow listing**: upload the new zip on the Reflow item's Package tab. Don't create a new item, so the extension ID, users and reviews carry over.

## Title (from the manifest, max 75 characters)

```text
Packwatch – TCG Restock Alerts & Auto Refresh
```

## Short description (max 132 characters, from the manifest)

```text
Private restock alerts for trading cards. Watch any shop, get pinged in seconds, never get locked out for refreshing.
```

## Long description

```text
Get alerted the moment YOUR product restocks or goes up for preorder, on any shop, in any country, and the alert goes only to you.

Paid alert groups ping thousands of people at once, often late, and mostly for big US retailers. Packwatch is your own private restock monitor. It watches the exact product pages and shops you choose, including small Shopify card shops, and tells you within seconds.

Works for: Pokémon TCG, One Piece, Lorcana, Magic: The Gathering, Yu-Gi-Oh!, sports cards and other sealed collectibles.

WATCH A PRODUCT IN ONE CLICK
Open a product page, click Watch this product. Packwatch detects the shop type (Shopify, schema.org product data, or the page's own buttons), shows you the current stock and price, and starts watching. Pages that need a browser to render get a small pinned watcher tab automatically.

NEW-LISTING ALERTS
New sets are the biggest moments in every card game. Watch a shop's collection or search page with keywords like "OP-15, booster box, elite trainer" and get alerted the second a matching product appears.

POLITE MODE: WON'T GET YOU BLOCKED
Packwatch spaces out requests to each shop, backs off automatically when a site rate-limits, and never hammers a page.

QUEUE GUARD
If a shop puts you in a waiting room or shows a bot check, Packwatch stops refreshing immediately and tells you: "You're in a queue. Don't refresh, you'll lose your place."

RELIABLE
A live "last checked" heartbeat for every monitor, a red badge if anything stalls, and checks that pick up again after a browser restart without you pressing Start.

NEVER LOSE WHAT YOU'RE TYPING
Refreshes wait while you type or have unsaved form input.

FREE
• 3 monitors (products and new-listing watches)
• Checks every 60 seconds
• Desktop and sound alerts, auto-open the product tab
• Restock history for the last 7 days
• Simple Refresh: plain auto-refresh for any tab, with random intervals

PRO (7-day free trial)
• Unlimited monitors, checks every 15 seconds (polite limits still apply)
• Phone alerts through the free ntfy app, and alerts to your own Discord server
• Price alerts: get pinged when the price drops to your target, skip restocks above it, and skip third-party sellers
• Restock patterns: "Most restocks on this shop: Tue–Thu, 10:00–11:00", plus one-click boosted checks in that window
• Full history and CSV export, shareable watchlist packs, priority levels and quiet hours

Pro Monthly $7.99/month or Pro Annual $59.99/year.

PRIVATE BY DESIGN
No account needed for Free, no analytics, no Packwatch server. Your monitors and history stay in your browser. Packwatch only reads the shops you add, after you allow each one.

Packwatch never checks out, adds to cart or solves CAPTCHAs for you. It tells you, and you buy.

Packwatch is independent and not affiliated with any game publisher or retailer.
```

## Screenshot captions (1280×800)

1. **One click: Watch this product.** Packwatch reads the page, shows stock, price and suggested tags.
2. **Alerts with price and "detected within 12s".** Desktop, phone (ntfy) and Discord.
3. **All your monitors, grouped by game, with a live heartbeat.** Filter by game, shop or region.
4. **Restock patterns.** "Most restocks on cards.example: Tue–Thu, 10:00–11:00", plus a one-click check boost.
5. **Free vs Pro.** Annual pre-selected: $59.99/year (≈ $5/month), save 37%.

## Category

Productivity → Tools (or "Shopping" if the dashboard offers it).

## Privacy tab

**Single purpose**

```text
Packwatch checks product and shop pages the user chooses and alerts the user when an item restocks, opens for preorder, drops to a target price or is newly listed. It also offers plain automatic page refresh.
```

**Permission justifications**

| Permission | Justification |
|---|---|
| storage | Stores the user's monitors, restock history and settings locally. |
| alarms | A one-minute watchdog that restarts the check scheduler if it stopped and detects stalled monitors. |
| notifications | Desktop alerts when a watched item restocks, opens for preorder, drops in price, or a monitor stalls. |
| offscreen | A hidden document (reason: DOM_PARSER) parses fetched shop pages, keeps the per-second check schedule ticking and plays alert sounds. |
| scripting | Reads the current page when the user clicks Watch, runs the element picker the user starts, and reads watcher tabs for JavaScript-rendered pages. |
| activeTab | Lets the popup read the page the user is on, only when they open it. |
| tabs | Opens and reloads pinned watcher tabs, runs Simple Refresh on the user's tab, and focuses the product tab when the user clicks an alert. |
| sidePanel | Shows the monitor list and history. |
| Optional host permissions | Requested per shop when the user adds a monitor, so Packwatch can check only that shop. Never requested for all sites. |
| Content script on extensionpay.com | Required by ExtensionPay to confirm payments and trials. |

**Remote code:** No.

**Data usage:** Website content is processed locally to detect stock and price. It is not collected or transmitted. Alert text is sent to ntfy or Discord only if the user enables those channels. ExtensionPay handles payment information. Tick the boxes that the data is not sold, not used for unrelated purposes, and not used for creditworthiness. Declare **Website content** as handled (the per-shop access is visible to reviewers), and **Personally identifiable information** (email, via ExtensionPay) if you enable payments.

## Trademarks

Game and retailer names appear only as plain-text descriptions ("works for Pokémon TCG restocks"). There are no logos, card art, characters, set symbols or brand colours in the extension, icons, screenshots or listing.
