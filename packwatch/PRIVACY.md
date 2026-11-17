# Packwatch privacy policy

Effective date: November 17, 2026

Packwatch is a browser extension that watches the shop pages you choose and alerts you when an item restocks, opens for preorder, drops in price or is newly listed. This policy explains what data Packwatch handles. Host it at a public URL (GitHub Pages works) and link it in the Chrome Web Store listing.

## The short version

- Packwatch has **no server** and **no analytics**. Your monitors, history and settings stay in your browser.
- Packwatch only reads the shop pages **you** add, after **you** grant permission for that shop.
- Data leaves your browser only when **you** turn on a channel that needs it: phone alerts (ntfy), Discord, or paying for Pro (ExtensionPay / Stripe).

## What is stored, and where

All of this is stored with Chrome's storage APIs on your device:

| Data | Where | Purpose |
|---|---|---|
| Monitors: page URL, title, shop domain, tags, check settings, last stock state and price | `chrome.storage.local` | Checking the pages you chose |
| Restock history: event type, time, price, shop, title | `chrome.storage.local` (capped at 5,000 events) | History and pattern insights |
| Product IDs and titles already seen on listing pages you watch | `chrome.storage.local` | Alerting only on new listings |
| Recent alerts (time, title, whether you clicked) | `chrome.storage.local` (last 300) | Click handling and the in-app "you missed a restock" card |
| ntfy topic and Discord webhook URL, if you set them | `chrome.storage.local` | Sending your alerts |
| Sound, volume, auto-open, default interval | `chrome.storage.sync` | Preferences across your browsers (synced by Chrome to your Google account if Chrome sync is on) |
| Auto refresh settings per site (interval, options, alert text) | `chrome.storage.local` | Remembering your auto-refresh choices |
| Local counters (monitors created per game, alerts fired, upgrades) | `chrome.storage.local` | Shown to you on the settings page. Never sent anywhere |

Uninstalling Packwatch deletes all of it.

## Website content

When a monitor checks a page, Packwatch downloads that page (or the shop's public product JSON) **with your browser's cookies for that shop**, so it sees what you would see, and reads it locally to find the stock state, price, seller and product list. Packwatch does not store page content beyond the fields listed above, and never sends it anywhere.

Packwatch can only read shops you granted access to. It asks for each shop's permission when you add a monitor ("Allow Packwatch to check shop.com?"), and never asks for access to all sites at install. Some JavaScript-heavy pages are checked in a small pinned "watcher" tab, which you can see in your tab strip.

If you set an Auto refresh text alert ("alert me when … appears"), Packwatch checks the visible text of that tab for your words after each refresh, on your device only, and highlights the match.

The element picker, typing guard and scroll memory run only on tabs you are watching or refreshing. The typing guard checks *whether* you are typing or have unsaved form input, never *what* you typed.

## Data sent to third parties (only if you turn it on)

- **ntfy (phone alerts, Pro).** When an alert fires, Packwatch sends the alert text (product title, price, shop, link, and detection time) to the ntfy server you configured (default `ntfy.sh`) under your random topic. Anyone who knows your topic can read those messages, so keep it private. See ntfy's privacy policy at https://ntfy.sh.
- **Discord (Pro).** The same alert text is posted to the Discord webhook URL you entered, so it appears in your server. See Discord's privacy policy.
- **ExtensionPay / Stripe (payments).** If you start a trial or subscribe, ExtensionPay (extensionpay.com) and Stripe handle your email address and payment details. Packwatch itself never sees your card details. Packwatch asks ExtensionPay whether your account is paid or on a trial. See https://extensionpay.com/privacy.
- **Uninstall feedback.** If the developer configures one, Chrome opens a feedback page when you uninstall. Nothing is sent unless you fill it in.

## What Packwatch never does

- No ads, analytics, tracking pixels, fingerprinting or selling of data.
- No auto-checkout, no auto add-to-cart, no filling in payment forms.
- No CAPTCHA solving or bot-protection bypass. When a shop shows a waiting room or a bot check, Packwatch stops reloading and tells you.

## Permissions

| Permission | Why |
|---|---|
| `storage` | Saving your monitors, history and settings on your device |
| `alarms` | A once-a-minute watchdog that keeps checks running and spots stalled monitors |
| `notifications` | Desktop alerts |
| `offscreen` | A hidden page that parses shop pages, keeps the check schedule ticking and plays alert sounds |
| `scripting` | Reading the page you are on when you click Watch, the element picker, and watcher-tab checks |
| `activeTab` | Reading the current page only when you open the popup |
| `tabs` | Watcher tabs, Auto refresh, focusing a product tab when you click an alert |
| `sidePanel` | The monitor list |
| Optional host access (per shop) | Checking the specific shops you add, requested one shop at a time |

## Contact

Questions: use the support link on the Packwatch Chrome Web Store page. If this policy changes, the new version will be posted at the same URL with a new effective date.
