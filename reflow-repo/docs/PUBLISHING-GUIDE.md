# Chrome Web Store — Publishing Guide

Everything you need to publish Reflow. Copy-paste each section into the Developer Dashboard.

## 1. Developer Account

- Go to: https://chrome.google.com/webstore/devconsole
- Pay the $5 one-time registration fee
- Verify your email, select **Non-trader**

## 2. Upload

Upload the contents of `extension/` as a ZIP. Make sure `manifest.json` is at the root.

```bash
cd extension && zip -r ../reflow.zip . && cd ..
```

## 3. Store Listing

**Name** (from manifest, max 75 chars):
```
Reflow — Auto Refresh & Page Monitor
```

**Summary** (max 132 chars, from manifest `description`):
```
Auto-refresh any page in one click. Get alerted when a word appears. Never lose what you're typing.
```

**Description**:
```
Reflow auto-refreshes any web page in one click, and tells you the moment the thing you're waiting for shows up. No account, no ads, no upsells.

WHAT MAKES REFLOW DIFFERENT

→ One click, it starts
Tap a preset (5s, 10s, 30s, 1m, 2m, 5m, 15m, 30m) and it starts refreshing right away. Custom intervals go down to 1 second.

→ Keyword alerts
"Alert me when 'In stock' appears." Reflow refreshes until it happens, then stops, sends a desktop notification with a chime, and highlights the match on the page. Works the other way too: get alerted when "Sold out" disappears.

→ Never lose what you're typing
Smart pause holds the refresh while you're filling in a form or selecting text, then picks up again. No more half-written messages wiped out by a reload.

→ Reliable in the background
Short intervals keep working even when the tab is in the background. Tabs you're refreshing are protected from Chrome's Memory Saver, so they don't get put to sleep.

→ Hard refresh + scroll memory
Each refresh skips the cache so you get live data, and you stay at the same spot on the page.

→ Remembers every site
Your interval, alert text and options come back automatically. Press Alt+Shift+R on any tab to start or stop with that site's settings.

→ Private and tiny
About 24 KB. No tracking, no analytics, no remote code. Reflow only runs on tabs you turn it on for.

FEATURES

• One-click presets plus custom intervals (seconds, minutes, hours)
• Keyword alerts: appears or disappears, with notification, chime and highlight
• Smart pause while typing or selecting
• Hard refresh (cache bypass), on by default
• Scroll position memory
• Per-site settings memory
• Keyboard shortcut: Alt+Shift+R
• List of every refreshing tab: jump to or stop any of them
• Countdown on the toolbar badge, plus an optional page timer
• Randomized intervals (±25%)
• Light and dark themes

USE CASES

• Catch restocks, ticket drops, appointment slots and price changes
• Monitor stock, crypto and analytics dashboards
• Watch job boards and freelance platforms for new listings
• Keep internal tools and portals from timing out
• Auto-reload during web development and QA

Reflow is free and private. No data leaves your browser.
```

**Category**: `Productivity` (sub-category: Tools)

## 4. Graphics

All files in `store-assets/` (regenerate with `node tools/build-assets.js`):

| Asset | File | Size |
|-------|------|------|
| Store icon | `store-icon-128.png` | 128×128 |
| Screenshot 1: one click | `screenshot-1280x800.png` | 1280×800 |
| Screenshot 2: keyword alerts | `screenshot-alerts-1280x800.png` | 1280×800 |
| Screenshot 3: smart pause | `screenshot-pause-1280x800.png` | 1280×800 |
| Screenshot (small, optional) | `screenshot-640x400.png` | 640×400 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560 |

## 5. Privacy Tab

**Single Purpose**:
```
Automatically refreshes web pages at user-configured intervals, optionally alerting the user when chosen text appears or disappears on the refreshed page.
```

**Permission Justifications**:

| Permission | Justification |
|-----------|---------------|
| `alarms` | Backstop timer so a scheduled refresh still happens if the service worker was suspended. |
| `storage` | Saves user settings per site locally and keeps the list of running timers in session storage. Nothing is sent anywhere. |
| `tabs` | Reloads tabs (with cache bypass), reads the tab URL for per-site settings, cleans up when a tab closes, and stops Memory Saver from discarding a tab the user is refreshing. |
| `scripting` | Injects the page helper (countdown, scroll memory, smart pause, keyword check), only into tabs where the user turned refreshing on. |
| `notifications` | Shows a desktop alert when the user's keyword appears or disappears. |
| `offscreen` | Plays a short alert chime (AUDIO_PLAYBACK) when a keyword alert fires. |
| `<all_urls>` | Lets the user refresh and monitor any site they choose. The helper only runs on tabs the user turned on. Page text is checked locally for the user's keyword and never stored or sent. |

**Remote code**: No, I am not using remote code.

**Data disclosure**: Select "I certify that my extension does not collect or use any user data." (Website content is processed locally only for the user-facing keyword alert feature and never leaves the device.)

## 6. Privacy Policy

Host `docs/privacy-policy.html` at a public URL (GitHub Pages works) and paste the URL in the dashboard.

## 7. Distribution

- Visibility: **Public**
- Pricing: **Free**
- Distribution: **All regions**

## 8. Test Instructions

```
1. Install the extension and open any webpage.
2. Click the Reflow icon and tap "10 sec". The page starts refreshing right away; the badge counts down and a small timer appears in the bottom-right of the page.
3. Click into a text box on the page and type something. The refresh pauses ("II" on the badge) until you leave the field.
4. Stop, type a word that is on the page into "Alert me when" (for example a word from the page title), and tap "5 sec". Refreshing stops right away, you get a desktop notification with a chime, and the word is highlighted.
5. Press Alt+Shift+R to start or stop refreshing with that site's saved settings.
6. Start refreshing on a second tab, then click "2 running" in the popup to see both, jump to one, or stop one.
```
