# Reflow

Auto-refresh any page. One click. No setup.

A Chrome extension that refreshes web pages at configurable intervals. Built for traders, developers, job seekers, and anyone who needs live data without hitting F5.

## Install (from source)

1. Clone this repo
2. Open `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked** → select the `extension/` folder
5. Pin Reflow to your toolbar

## Features

- **One-click presets** — tap 5s, 10s, 30s, 1m, 2m, 5m, 10m, or 30m and it starts immediately
- **Hard refresh** — bypasses browser cache by default so you always see live data
- **Scroll preservation** — saves and restores your scroll position across refreshes
- **Domain memory** — remembers your interval and settings per website
- **Badge countdown** — live countdown on the extension icon
- **In-page indicator** — subtle countdown pill in the bottom-right corner
- **Randomized intervals** — adds jitter to avoid bot detection on ticket/auction sites
- **Notifications** — optional desktop notification on each refresh
- **14KB total** — no tracking, no analytics, no account required

## Repo Structure

```
reflow/
├── extension/          ← Chrome extension (load this folder)
│   ├── manifest.json
│   ├── background.js   ← Service worker (alarms, state, badge)
│   ├── popup.html      ← Popup UI
│   ├── popup.js        ← Popup logic
│   ├── content.js      ← In-page countdown + scroll preservation
│   ├── content.css     ← In-page pill styles
│   └── icons/          ← Extension icons (16, 32, 48, 128)
├── store-assets/       ← Chrome Web Store listing graphics
│   ├── store-icon-128.png
│   ├── screenshot-1280x800.png
│   ├── screenshot-640x400.png
│   ├── promo-small-440x280.png
│   └── promo-marquee-1400x560.png
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
