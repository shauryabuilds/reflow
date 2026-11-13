<img src="tools/logo.svg" width="56" alt="Reflow logo">

# Reflow

Auto-refresh any page in one click, and get alerted the moment it changes.

A Chrome extension for traders, developers, job seekers, ticket buyers, and anyone who needs live data without hitting F5.

## Install (from source)

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked** → select the `extension/` folder
5. Pin Reflow to your toolbar

## Features

- **One-click presets**: tap 5s, 10s, 30s, 1m, 2m, 5m, 15m or 30m and it starts right away. Custom intervals go down to 1 second.
- **Keyword alerts**: "Alert me when *In stock* appears" (or *Sold out* disappears). Reflow keeps refreshing until it happens, then stops, sends a desktop notification with a chime, and highlights the match on the page.
- **Smart pause**: never refreshes away what you're typing. It holds off while you fill in a form or select text.
- **Hard refresh**: skips the browser cache so you always see live data.
- **Scroll memory**: you stay at the same spot on the page after each refresh.
- **Site memory**: remembers your interval, alert text and options for each website.
- **Keyboard shortcut**: `Alt+Shift+R` starts or stops refreshing on the current tab with that site's settings.
- **All running tabs in one list**: see each countdown, jump to a tab, or stop it.
- **Reliable in the background**: an in-worker scheduler plus an alarm backstop. Refreshing tabs are also protected from Chrome's Memory Saver.
- **Badge + page timer**: a live countdown on the icon and an optional small pill on the page.
- **Randomize**: varies each interval by ±25% so refreshes look less robotic.
- **Light & dark**: follows your system theme.
- **Private and tiny**: about 24 KB zipped. No tracking, no analytics, no account, no remote code. The page helper is only injected into tabs you turn on.

## Repo Structure

```
reflow/
├── extension/          ← Chrome extension (load this folder)
│   ├── manifest.json
│   ├── background.js   ← Service worker (alarms, state, badge)
│   ├── popup.html      ← Popup UI
│   ├── popup.js        ← Popup logic
│   ├── content.js      ← Page helper: countdown pill, scroll memory, smart pause, keyword watch
│   ├── offscreen.*     ← Plays the alert chime
│   └── icons/          ← Extension icons (16, 32, 48, 128)
├── store-assets/       ← Chrome Web Store listing graphics
│   ├── store-icon-128.png
│   ├── screenshot-1280x800.png
│   ├── screenshot-alerts-1280x800.png
│   ├── screenshot-pause-1280x800.png
│   ├── screenshot-640x400.png
│   ├── promo-small-440x280.png
│   └── promo-marquee-1400x560.png
├── tools/
│   ├── logo.svg            ← Vector logo (source for every icon)
│   ├── build-assets.js     ← Regenerates icons + store graphics (node + playwright)
│   └── e2e-test.js         ← Real-browser test: intervals, hard refresh, alerts, smart pause
├── docs/
│   ├── PUBLISHING-GUIDE.md   ← Step-by-step Chrome Web Store submission
│   └── privacy-policy.html   ← Host this publicly and link in the store
└── README.md
```

## Publishing to Chrome Web Store

See [`docs/PUBLISHING-GUIDE.md`](docs/PUBLISHING-GUIDE.md) for the complete step-by-step guide including store description, permission justifications, and asset checklist.

## Privacy

Reflow stores all data locally in your browser. Nothing is collected, transmitted, or shared. See the full [privacy policy](docs/privacy-policy.html).

## License

MIT
