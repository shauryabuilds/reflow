// Regenerates extension icons and Chrome Web Store graphics.
// Usage: node tools/build-assets.js   (needs `playwright` with Chromium)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const STORE = path.join(ROOT, "store-assets");
const LOGO = fs.readFileSync(path.join(__dirname, "logo.svg"), "utf8").match(/d="([^"]+)"/)[1];
const MOCK = fs.readFileSync(path.join(__dirname, "popup-mock.js"), "utf8");
const svg = (fill, size = "100%") => `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><path fill="${fill}" d="${LOGO}"/></svg>`;

// Toolbar/app icon: your logo on an off-white tile (reads on light and dark toolbars).
function iconHTML(px, pad) {
  const tile = px - pad * 2;
  const r = Math.round(tile * 0.22);
  const inset = Math.round(tile * (px <= 16 ? 0.09 : 0.13));
  const border = px >= 32 ? `box-shadow:inset 0 0 0 ${px >= 96 ? 1.5 : 1}px rgba(0,0,0,.10);` : "";
  return `<body style="margin:0;background:transparent"><div style="position:absolute;left:${pad}px;top:${pad}px;width:${tile}px;height:${tile}px;border-radius:${r}px;background:#f6f5f0;${border}display:flex;align-items:center;justify-content:center"><div style="width:${tile - inset * 2}px;height:${tile - inset * 2}px">${svg("#0a0a0a")}</div></div></body>`;
}

const now = Date.now();
const scenes = {
  setup: { pref: { interval: 30, watchText: "", remembered: true }, url: "https://www.example-tickets.com/events/arena-tour" },
  watching: {
    url: "https://shop.example.com/console-pro",
    pref: { interval: 10, watchText: "In stock", remembered: true },
    all: {
      1: { interval: 10, left: 6, count: 214, startedAt: now - 2 * 3600e3, watch: { text: "In stock", mode: "appears" } },
      7: { interval: 60, left: 41, count: 37, startedAt: now, url: "https://jobs.example.org/remote" },
      9: { interval: 300, left: 172, count: 12, startedAt: now, url: "https://dash.example.io/metrics" },
    },
    others: [{ id: 7, url: "https://jobs.example.org/remote", windowId: 1 }, { id: 9, url: "https://dash.example.io/metrics", windowId: 1 }],
  },
  paused: {
    url: "https://portal.example.com/application",
    all: { 1: { interval: 30, left: 30, count: 18, startedAt: now - 1800e3, paused: true } },
  },
};

async function popupShot(browser, scene, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, deviceScaleFactor: 2, colorScheme: "dark" });
  const p = await ctx.newPage();
  await p.addInitScript(`window.__scene=${JSON.stringify(scene)};` + MOCK);
  await p.goto("file://" + path.join(EXT, "popup.html"));
  await p.waitForTimeout(300);
  if (opts.act) await opts.act(p);
  const h = Math.ceil(await p.evaluate(() => document.body.getBoundingClientRect().height));
  const buf = await p.screenshot({ clip: { x: 0, y: 0, width: 320, height: h } });
  await ctx.close();
  return { src: "data:image/png;base64," + buf.toString("base64"), h };
}

const FONT = `ui-monospace,'SF Mono',Menlo,'DejaVu Sans Mono',Consolas,monospace`;
const SANS = `system-ui,-apple-system,'Segoe UI','DejaVu Sans',sans-serif`;
const base = (w, h, body) => `<!doctype html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#09090b;
  background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);background-size:24px 24px;color:#fafafa;font-family:${SANS};position:relative">${body}</body>`;

function screenshotHTML(pop, { title, sub, bullets, extra = "" }) {
  const scale = Math.min(1.45, 680 / pop.h);
  const w = 320 * scale, h = pop.h * scale;
  return base(1280, 800, `
    <div style="position:absolute;left:110px;top:${(800 - h) / 2}px;width:${w}px;height:${h}px;border-radius:12px;overflow:hidden;
      box-shadow:0 0 0 1px rgba(255,255,255,.08),0 30px 80px rgba(0,0,0,.6)"><img src="${pop.src}" style="width:100%;height:100%"></div>
    ${extra}
    <div style="position:absolute;left:${110 + w + 90}px;right:80px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
      <div style="font:700 46px/1.12 ${FONT};letter-spacing:-1.5px">${title}</div>
      <div style="margin-top:18px;font-size:20px;line-height:1.5;color:#a1a1aa">${sub}</div>
      <div style="margin-top:34px;display:grid;gap:16px">${bullets.map(([b, d]) =>
        `<div style="display:flex;gap:12px"><span style="width:7px;height:7px;border-radius:50%;background:#4ade80;margin-top:8px;flex:none"></span>
        <div><div style="font:600 16px ${FONT}">${b}</div><div style="color:#71717a;font-size:15px;margin-top:2px">${d}</div></div></div>`).join("")}</div>
    </div>`);
}

const notifCard = `<div style="position:absolute;right:56px;top:44px;width:330px;padding:14px 16px;border-radius:12px;background:#1c1c1f;
  box-shadow:0 0 0 1px rgba(255,255,255,.1),0 20px 50px rgba(0,0,0,.5);display:flex;gap:12px;align-items:center">
  <div style="width:40px;height:40px;border-radius:9px;background:#f6f5f0;display:flex;align-items:center;justify-content:center;flex:none">${svg("#0a0a0a", 28)}</div>
  <div style="min-width:0"><div style="font:600 14px ${SANS}">Found “In stock”</div><div style="color:#a1a1aa;font-size:13px;margin-top:2px">Console Pro · refreshing stopped</div></div></div>`;

function promoHTML(w, h) {
  const big = w > 1000;
  const L = big ? 150 : 64, word = big ? 104 : 46, gap = big ? 30 : 16;
  return base(w, h, `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:${gap}px;flex-direction:${big ? "row" : "column"}">
    <div style="width:${L}px;height:${L}px;border-radius:${L * 0.22}px;background:#f6f5f0;display:flex;align-items:center;justify-content:center;flex:none">${svg("#0a0a0a", L * 0.74)}</div>
    <div style="text-align:${big ? "left" : "center"}">
      <div style="font:700 ${word}px/1 ${FONT};letter-spacing:${big ? -4 : -2}px">reflow</div>
      <div style="margin-top:${big ? 14 : 8}px;font:${big ? 24 : 14}px ${FONT};color:#a1a1aa">Auto-refresh. Get alerted. ${big ? "One click." : ""}</div>
      ${big ? `<div style="margin-top:28px;display:flex;gap:8px">${["Keyword alerts", "Smart pause", "Any interval, even 1s", "Hard refresh"].map((t) =>
        `<span style="font:14px ${FONT};color:#d4d4d8;background:#18181b;border:1px solid #27272a;padding:7px 12px;border-radius:6px">${t}</span>`).join("")}</div>` : ""}
    </div></div>`);
}

async function render(browser, html, w, h, out, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  await p.setContent(html);
  await p.screenshot({ path: out, omitBackground: true });
  await ctx.close();
  console.log("wrote", path.relative(ROOT, out));
}

(async () => {
  const browser = await chromium.launch();
  for (const px of [16, 32, 48, 128]) {
    const pad = px === 128 ? 16 : 0; // store guideline: 96px artwork inside a 128 canvas
    await render(browser, iconHTML(px, pad), px, px, path.join(EXT, `icons/icon${px}.png`));
  }
  await render(browser, iconHTML(128, 16), 128, 128, path.join(STORE, "store-icon-128.png"));

  const setup = await popupShot(browser, scenes.setup);
  const watching = await popupShot(browser, scenes.watching, { act: (p) => p.click("#count") });
  const paused = await popupShot(browser, scenes.paused);

  const s1 = screenshotHTML(setup, {
    title: "One click.<br>It just starts.",
    sub: "Tap an interval and the page refreshes. No setup, no account, no ads.",
    bullets: [["Any interval, even 1 second", "Works reliably in the background"], ["Hard refresh + scroll memory", "Fresh data, same spot on the page"], ["Remembers every site", "Your settings come back automatically"]],
  });
  await render(browser, s1, 1280, 800, path.join(STORE, "screenshot-1280x800.png"));
  await render(browser, s1, 1280, 800, path.join(STORE, "screenshot-640x400.png"), 0.5);
  await render(browser, screenshotHTML(watching, {
    title: "Know the second<br>it changes.",
    sub: "Type a word. Reflow refreshes until it appears (or disappears), then stops and alerts you.",
    bullets: [["Desktop alert + chime", "Even when the tab is in the background"], ["Highlights the match", "Scrolls right to it on the page"], ["Every running tab, one list", "Jump to or stop any of them"]],
    extra: notifCard,
  }), 1280, 800, path.join(STORE, "screenshot-alerts-1280x800.png"));
  await render(browser, screenshotHTML(paused, {
    title: "Never lose what<br>you're typing.",
    sub: "Smart pause holds the refresh while you fill a form or select text, then picks up where it left off.",
    bullets: [["Shortcut: Alt+Shift+R", "Start or stop on any tab without opening the popup"], ["Light & dark", "Follows your system theme"], ["Private by design", "No tracking. Nothing leaves your browser."]],
  }), 1280, 800, path.join(STORE, "screenshot-pause-1280x800.png"));
  await render(browser, promoHTML(440, 280), 440, 280, path.join(STORE, "promo-small-440x280.png"));
  await render(browser, promoHTML(1400, 560), 1400, 560, path.join(STORE, "promo-marquee-1400x560.png"));
  await browser.close();
})();
