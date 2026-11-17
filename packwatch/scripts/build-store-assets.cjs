// Builds Chrome Web Store graphics from the real extension UI.
//   PW_TEST_HOSTS="http://cardshop.example" npm run build:dev && node scripts/build-store-assets.cjs
// Shop names are fictional (.example). Game names appear only as plain-text tags.
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "dist-dev");
const OUT = path.join(ROOT, "store-assets");
const PORT = 8797;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b64 = (buf) => "data:image/png;base64," + buf.toString("base64");
const LOGO = fs.readFileSync(path.join(ROOT, "public/logo.svg"), "utf8");
const SANS = "system-ui,-apple-system,'Segoe UI','DejaVu Sans',sans-serif";
const MONO = "ui-monospace,'SF Mono',Menlo,'DejaVu Sans Mono',monospace";

const now = Date.now();
const MIN = 60_000;
const mon = (o) => ({
  kind: "product", mode: "fetch", strategy: "shopify", inStockRule: { locale: "en" }, alertOn: { restock: true, preorder: true },
  intervalSec: 15, priority: "normal", consecutiveErrors: 0, createdAt: now - 3 * 86_400_000, lastCheckedAt: now - 6000, ...o,
});
const MONITORS = {
  a: mon({ id: "a", title: "Prismatic Evolutions Elite Trainer Box", url: "https://cardshop.example/products/pe-etb", shopDomain: "cardshop.example", region: "US", game: "pokemon", productType: "elite-trainer-box", state: "in", stableState: "in", lastPrice: { amount: 59.99, currency: "USD" }, evidence: "Shopify product available = true" }),
  b: mon({ id: "b", title: "Surging Sparks Booster Bundle", url: "https://tcgdepot.example/p/ssp-bundle", shopDomain: "tcgdepot.example", region: "US", game: "pokemon", productType: "booster-bundle", strategy: "jsonld", state: "out", stableState: "out", lastPrice: { amount: 32.99, currency: "USD" }, evidence: "JSON-LD availability = OutOfStock" }),
  c: mon({ id: "c", kind: "listing", title: "One Piece pre-orders", url: "https://sealed-corner.example/collections/one-piece", shopDomain: "sealed-corner.example", region: "SG", game: "one-piece", keywords: ["OP-15", "booster box"], state: "in", stableState: "unknown", evidence: "48 products, watching for new ones" }),
  d: mon({ id: "d", title: "OP-15 Booster Box (Japanese)", url: "https://sealed-corner.example/products/op15-jp", shopDomain: "sealed-corner.example", region: "SG", game: "one-piece", productType: "booster-box", state: "preorder", stableState: "preorder", lastPrice: { amount: 139, currency: "SGD" }, evidence: "Shopify product available, tagged preorder" }),
  e: mon({ id: "e", title: "Lorcana Booster Box", url: "https://cardshop.example/products/lorcana-box", shopDomain: "cardshop.example", region: "US", game: "lorcana", productType: "booster-box", state: "out", stableState: "out", lastPrice: { amount: 144, currency: "USD" }, evidence: "Shopify product available = false" }),
};
const RUNTIME = Object.fromEntries(Object.keys(MONITORS).map((id, i) => [id, { nextCheckAt: now + (9 + i * 3) * 1000, lastSuccessAt: now - (4 + i * 2) * 1000, lastAlertAt: {} }]));
function history() {
  const h = [];
  for (let w = 0; w < 4; w++) for (const dow of [2, 3, 4]) {
    const d = new Date(now - (w * 7 + 1) * 86_400_000);
    d.setDate(d.getDate() - ((d.getDay() - dow + 7) % 7)); d.setHours(10, 8 + w * 3, 0, 0);
    const base = { monitorId: "a", shopDomain: "cardshop.example", title: "Prismatic Evolutions Elite Trainer Box", game: "pokemon", productType: "elite-trainer-box" };
    h.push({ ...base, event: "restock", at: d.getTime(), price: { amount: 59.99, currency: "USD" }, latencyMs: 9000 + w * 2000 });
    h.push({ ...base, event: "out", at: d.getTime() + (3 + w) * MIN + 40_000 });
  }
  h.push({ monitorId: "c", shopDomain: "sealed-corner.example", title: "OP-15 Booster Box (Pre-order)", game: "one-piece", event: "new-listing", at: now - 2 * 3600_000, price: { amount: 189, currency: "SGD" }, latencyMs: 12_000 });
  return h.sort((x, y) => x.at - y.at);
}

const frame = (w, h, body) => `<!doctype html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;color:#fafafa;font-family:${SANS};position:relative;
  background:#0b0b0f;background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);background-size:24px 24px">${body}</body>`;
const shotBox = (src, w, x, y) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 30px 80px rgba(0,0,0,.6)"><img src="${src}" style="width:100%;display:block"></div>`;
const copy = (x, title, sub, bullets) => `<div style="position:absolute;left:${x}px;right:70px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
  <div style="font:700 44px/1.12 ${SANS};letter-spacing:-1px">${title}</div>
  <div style="margin-top:16px;font-size:19px;line-height:1.5;color:#a1a1aa">${sub}</div>
  <div style="margin-top:30px;display:grid;gap:14px">${bullets.map(([b, d]) => `<div style="display:flex;gap:12px"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;margin-top:8px;flex:none"></span><div><div style="font:600 16px ${SANS}">${b}</div><div style="color:#71717a;font-size:15px;margin-top:2px">${d}</div></div></div>`).join("")}</div></div>`;
const note = (title, line, ctx, x, y, w = 360) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;padding:14px 16px;border-radius:12px;background:#1c1c1f;box-shadow:0 0 0 1px rgba(255,255,255,.1),0 20px 50px rgba(0,0,0,.5);display:flex;gap:12px">
  <div style="width:40px;height:40px;flex:none">${LOGO.replace("<svg ", '<svg width="40" height="40" ')}</div>
  <div style="min-width:0"><div style="font:600 14px ${SANS}">${title}</div><div style="color:#d4d4d8;font-size:13px;margin-top:2px">${line}</div><div style="color:#71717a;font-size:12px;margin-top:2px">${ctx}</div></div></div>`;

async function render(browser, html, w, h, file, transparent = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.setContent(html);
  await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, file), omitBackground: transparent });
  await ctx.close();
  console.log("wrote", file);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shop = spawn(process.execPath, [path.join(ROOT, "fixture-shop/server.mjs"), `--port=${PORT}`], { stdio: "ignore" });
  await sleep(500);
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true, colorScheme: "dark", deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--host-resolver-rules=MAP cardshop.example 127.0.0.1"],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = sw.url().split("/")[2];
  await fetch(`http://localhost:${PORT}/__control/set?host=cardshop.example&handle=prismatic-evolutions-elite-trainer-box&state=out&price=59.99`);

  const ui = async (pagePath, w, h, act, scheme = "dark") => {
    const p = await ctx.newPage();
    await p.emulateMedia({ colorScheme: scheme });
    await p.setViewportSize({ width: w, height: h });
    await p.goto(`chrome-extension://${extId}/${pagePath}`);
    await sleep(1200);
    if (act) await act(p);
    const height = Math.min(h, Math.ceil(await p.evaluate(() => document.body.scrollHeight)));
    const buf = await p.screenshot({ clip: { x: 0, y: 0, width: w, height }, scale: "device" });
    await p.close();
    return b64(buf);
  };

  // 1. Popup on a product page (real detection on the fixture shop).
  const shopTab = await ctx.newPage();
  await shopTab.goto(`http://cardshop.example:${PORT}/products/prismatic-evolutions-elite-trainer-box`);
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({})).find((t) => t.url && t.url.includes("cardshop.example")).id);
  const popupProduct = await ui(`src/popup/index.html?tab=${tabId}`, 360, 600);

  // Seed realistic monitors + history for the side panel shots.
  await sw.evaluate(({ m, r, h }) => chrome.storage.local.set({ "pw.monitors": m, "pw.runtime": r, "pw.history": h, "pw.entitlement": { plan: "free", checkedAt: 0, devOverride: "pro" } }), { m: MONITORS, r: RUNTIME, h: history() });
  const panel = await ui("src/sidepanel/index.html", 400, 640);
  const hist = await ui("src/sidepanel/index.html", 400, 640, async (p) => { await p.getByRole("button", { name: "History" }).click(); await sleep(500); });
  await sw.evaluate(() => chrome.storage.local.set({ "pw.entitlement": { plan: "free", checkedAt: 0, devOverride: "free" } }));
  const upgrade = await ui(`src/popup/index.html?tab=${tabId}`, 360, 640, async (p) => { await p.locator("header button").first().click(); await sleep(400); });

  // Auto refresh with a text alert that has fired.
  await sw.evaluate(({ id }) => chrome.storage.local.set({
    "pw.monitors": { s: { id: "s", kind: "simple", url: "https://tickets.example/event", title: "Tickets", shopDomain: "tickets.example", mode: "tab", strategy: "heuristic", inStockRule: { locale: "en" }, alertOn: { restock: false, preorder: false }, intervalSec: 10, priority: "normal", state: "paused", stableState: "unknown", pausedReason: "matched", evidence: "Found “Tickets available”", consecutiveErrors: 0, createdAt: Date.now(), watchText: "Tickets available", watchMode: "appears", refreshCount: 37 } },
  }).then(() => chrome.storage.session.set({ "pw.tabs": { s: id } })), { id: tabId });
  const matched = await ui(`src/popup/index.html?tab=${tabId}`, 360, 330);
  await ctx.close();
  shop.kill();

  const browser = await chromium.launch();
  const left = 96;
  await render(browser, frame(1280, 800, shotBox(popupProduct, 470, left - 20, 110) + copy(left + 470 + 50,
    "One click.<br>Watch this product.",
    "Open any product page and click Watch. Packwatch reads the stock and price for you and starts checking.",
    [["Works on Shopify and most shops", "No setup: it finds the stock data itself"], ["Restock and preorder alerts", "Price-drop alerts with Pro"], ["Any country, any shop", "Including small card shops"]])), 1280, 800, "screenshot-1-watch.png");
  await render(browser, frame(1280, 800,
    note("Back in stock: Prismatic Evolutions Elite Trainer Box", "$59.99 · cardshop.example · Pokémon TCG", "Shopify product available = true · detected within 9s", left, 120, 420) +
    note("New listing: OP-15 Booster Box (Pre-order)", "S$189.00 · sealed-corner.example · One Piece", "detected within 12s", left, 230, 420) +
    note("Found “Tickets available”", "Tickets · tickets.example", "Auto refresh stopped. Click to open the page.", left, 340, 420) +
    shotBox(matched, 380, left + 20, 455) + copy(left + 420 + 90,
    "Know the second<br>it changes.",
    "Desktop alerts with a sound, the price, and how fast it was detected. Pro adds your phone and Discord.",
    [["Restocks, preorders, new listings", "Only for the items you choose"], ["Auto refresh any page", "…and get alerted when a word appears or disappears"], ["Phone + Discord alerts (Pro)", "Through the free ntfy app, no account needed"]])), 1280, 800, "screenshot-2-alerts.png");
  await render(browser, frame(1280, 800, shotBox(panel, 470, left - 20, 30) + copy(left + 470 + 50,
    "Every monitor,<br>grouped by game.",
    "A live “checked 6s ago” heartbeat on everything you watch. If anything stops, the icon turns red and you're told.",
    [["Filter by game, shop or region", "Pause, edit or check now in one click"], ["Polite by design", "Spaces out checks so shops don't block you"], ["Queue guard", "Stops refreshing in a waiting room so you keep your place"]])), 1280, 800, "screenshot-3-monitors.png");
  await render(browser, frame(1280, 800, shotBox(hist, 470, left - 20, 30) + copy(left + 470 + 50,
    "Learn when<br>shops restock.",
    "Packwatch keeps a history of every restock and finds the pattern for you (Pro).",
    [["“Most restocks: Tue–Thu, 10:00–11:00”", "Computed on your device"], ["Boost checks in that window", "One click, still polite"], ["How long items stay in stock", "CSV export with Pro"]])), 1280, 800, "screenshot-4-patterns.png");
  await render(browser, frame(1280, 800, shotBox(upgrade, 440, left - 10, 30) + copy(left + 440 + 60,
    "Free to start.<br>Pro when it counts.",
    "Free: 3 monitors, checks every minute, desktop and sound alerts, Auto refresh with text alerts. Pro: everything, faster, on your phone.",
    [["7-day free trial", "Cancel anytime"], ["$59.99/year (≈ $5/month)", "or $7.99/month"], ["Private by design", "No tracking. Your monitors stay in your browser"]])), 1280, 800, "screenshot-5-pro.png");

  const promo = (w, h, big) => frame(w, h, `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:${big ? 32 : 14}px;flex-direction:${big ? "row" : "column"}">
    <div style="width:${big ? 150 : 72}px;height:${big ? 150 : 72}px">${LOGO.replace("<svg ", `<svg width="${big ? 150 : 72}" height="${big ? 150 : 72}" `)}</div>
    <div style="text-align:${big ? "left" : "center"}"><div style="font:700 ${big ? 92 : 40}px/1 ${SANS};letter-spacing:-2px">Packwatch</div>
    <div style="margin-top:${big ? 14 : 8}px;font:${big ? 24 : 14}px ${SANS};color:#a1a1aa">Private restock alerts for trading cards</div>
    ${big ? `<div style="margin-top:26px;display:flex;gap:8px">${["Restock & preorder alerts", "New-listing alerts", "Auto refresh + text alerts", "Phone alerts"].map((x) => `<span style="font:14px ${SANS};color:#d4d4d8;background:#18181b;border:1px solid #27272a;padding:7px 12px;border-radius:6px">${x}</span>`).join("")}</div>` : ""}
    </div></div>`);
  await render(browser, promo(440, 280, false), 440, 280, "promo-small-440x280.png");
  await render(browser, promo(1400, 560, true), 1400, 560, "promo-marquee-1400x560.png");
  await render(browser, `<body style="margin:0;background:transparent"><div style="padding:16px">${LOGO.replace("<svg ", '<svg width="96" height="96" ')}</div></body>`, 128, 128, "store-icon-128.png", true);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
