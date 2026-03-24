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

**Name** (keep under 30 chars):
```
Reflow — Auto Refresh Pages
```

**Summary** (keep under 85 chars):
```
Auto-refresh any page with one click. Hard refresh, scroll memory, domain recall. Minimal and reliable.
```

**Description**:
```
Reflow auto-refreshes any web page at the interval you choose. One click to start — tap a preset and it begins immediately. No setup wizard, no account, no bloat.

WHAT MAKES REFLOW DIFFERENT

→ One-click start
Tap a preset (5s, 10s, 30s, 1m, 2m, 5m, 10m, 30m) and it starts refreshing instantly. No "configure then click Start" two-step.

→ Hard refresh by default
Every refresh bypasses the browser cache, so you always see live data — not stale cached pages. Essential for dashboards, trading platforms, and data portals.

→ Scroll position preserved
Your scroll position is saved before each refresh and restored after. You won't lose your place in a long page or data table.

→ Domain memory
Reflow remembers your interval and settings for each website. Visit your trading dashboard tomorrow and it already knows your preferences.

→ Reliable — never stops
Built on Chrome's Alarms API with automatic recovery. The #1 complaint about other auto-refresh extensions is they randomly stop working. Reflow doesn't.

→ Lightweight
The entire extension is 14KB. No tracking, no analytics, no account required. Your preferences stay in your browser.

FEATURES

• Preset intervals: 5s, 10s, 30s, 1m, 2m, 5m, 10m, 30m
• Custom intervals in seconds, minutes, or hours
• Hard refresh (cache bypass) — on by default
• Scroll position preservation — on by default
• Randomized interval mode — adds jitter to avoid bot detection
• Per-domain settings memory
• Live countdown on extension badge
• In-page countdown pill (subtle, non-intrusive)
• Refresh counter
• Desktop notifications (optional)
• Works on all websites including localhost

USE CASES

• Monitor stock prices, crypto, forex, or commodity dashboards
• Track ticket availability (concerts, flights, appointments)
• Watch job boards and freelancing platforms for new listings
• Keep internal tools and portals from timing out
• Auto-reload during web development and QA testing
• Stay current on live news, sports scores, and auction sites

Reflow is free, open, and private. No data leaves your browser.
```

**Category**: `Productivity`

## 4. Graphics

All files in `store-assets/`:

| Asset | File | Size |
|-------|------|------|
| Store icon | `store-icon-128.png` | 128×128 |
| Screenshot (hi-res) | `screenshot-1280x800.png` | 1280×800 |
| Screenshot (standard) | `screenshot-640x400.png` | 640×400 |
| Small promo tile | `promo-small-440x280.png` | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.png` | 1400×560 |

## 5. Privacy Tab

**Single Purpose**:
```
Automatically refreshes web pages at user-configured time intervals.
```

**Permission Justifications**:

| Permission | Justification |
|-----------|---------------|
| `alarms` | Schedules page refresh intervals using Chrome's Alarms API. One alarm per active tab. |
| `storage` | Persists user preferences locally (intervals, domain settings, options). No data sent externally. |
| `activeTab` | Identifies the current tab when the popup opens to display/control refresh state. |
| `scripting` | Executes page reload and saves/restores scroll position before/after each refresh. |
| `tabs` | Detects tab close (cleanup), tab load complete (restore state), and reads URL for domain memory. |
| `notifications` | Optional desktop notifications when a page refreshes. Only active when user enables "Notify". |
| `<all_urls>` | Required to refresh any page and inject the in-page countdown. Does not read page content. |

**Data disclosure**: Select "I certify that my extension does not collect or use any user data."

## 6. Privacy Policy

Host `docs/privacy-policy.html` at a public URL (GitHub Pages works) and paste the URL in the dashboard.

## 7. Distribution

- Visibility: **Public**
- Pricing: **Free**
- Distribution: **All regions**

## 8. Test Instructions

```
1. Install the extension and navigate to any webpage
2. Click the Reflow icon in the toolbar
3. Click any preset (e.g. "10 sec") — page starts refreshing immediately
4. Open popup again to see live countdown and refresh count
5. Badge on extension icon counts down
6. Small pill appears in bottom-right of page
7. Click "Stop" to end
8. Visit a different site, start refresh, return to first — domain settings remembered
```
