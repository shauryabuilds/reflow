// End-to-end smoke test: loads the unpacked dev build in Chromium, adds a product watch and a
// listing watch through the real popup, flips stock / adds a listing on the fixture shop, and
// asserts exactly one notification fires per event. Usage: npm run test:e2e
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist-dev");
const PORT = 8791;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (q) => fetch(`http://localhost:${PORT}/__control/${q}`).then((r) => r.json());
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"} ${msg}`); if (!cond) failures++; };

async function waitFor(fn, timeoutMs, stepMs = 1000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(stepMs); }
  return fn();
}

(async () => {
  const shop = spawn(process.execPath, [path.join(ROOT, "fixture-shop/server.mjs"), `--port=${PORT}`], { stdio: "ignore" });
  await sleep(500);
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker");
    const extId = sw.url().split("/")[2];
    const store = (keys) => sw.evaluate((k) => chrome.storage.local.get(k), keys);
    const errors = [];

    // Pro (dev plan simulator) so checks run every 15 s and the test stays short.
    await sw.evaluate(() => chrome.storage.local.set({ "pw.entitlement": { plan: "free", checkedAt: 0, devOverride: "pro" } }));
    await ctl(`set?host=shop-a.localhost&handle=elite-trainer-box&state=out&price=64.99`);

    // 1. Product watch through the popup.
    const shopTab = await ctx.newPage();
    await shopTab.goto(`http://shop-a.localhost:${PORT}/products/elite-trainer-box`);
    const tabA = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://shop-a.localhost/*" }))[0].id);
    const popup = await ctx.newPage();
    popup.on("pageerror", (e) => errors.push(e.message));
    await popup.goto(`chrome-extension://${extId}/src/popup/index.html?tab=${tabA}`);
    await popup.getByRole("button", { name: "Watch this product" }).click();
    await popup.getByText("Now watching").waitFor({ timeout: 10_000 });
    await popup.getByRole("combobox", { name: "Check every" }).count(); // popup stays open

    // 2. Listing watch through the popup, with keywords.
    await shopTab.goto(`http://shop-b.localhost:${PORT}/collections/one-piece`);
    const tabB = await sw.evaluate(async () => (await chrome.tabs.query({ url: "http://shop-b.localhost/*" }))[0].id);
    await popup.goto(`chrome-extension://${extId}/src/popup/index.html?tab=${tabB}`);
    await popup.getByRole("button", { name: "New listings", exact: true }).click();
    await popup.getByPlaceholder("e.g. OP-15, booster box, elite trainer").fill("OP-15");
    await popup.getByRole("button", { name: "Watch for new listings" }).click();
    await popup.getByText("Now watching").waitFor({ timeout: 10_000 });

    // Use 15 s intervals for both monitors.
    const mons = Object.values((await store("pw.monitors"))["pw.monitors"]);
    check(mons.length === 2, `two monitors created (${mons.map((m) => `${m.kind}/${m.mode}/${m.strategy}`).join(", ")})`);
    const product = mons.find((m) => m.kind === "product");
    const listing = mons.find((m) => m.kind === "listing");
    check(product?.stableState === "out" && product?.mode === "fetch", `product starts out of stock, fetch mode (${product?.evidence})`);
    for (const m of mons) await popup.evaluate((id) => chrome.runtime.sendMessage({ target: "bg", type: "pw:updateMonitor", id, patch: { intervalSec: 15 } }), m.id);

    // 3. Flip stock and add a matching listing (plus a non-matching one).
    await ctl(`set?host=shop-a.localhost&handle=elite-trainer-box&state=in&price=64.99`);
    await ctl(`add?host=shop-b.localhost&collection=one-piece&title=${encodeURIComponent("OP-15 Booster Box Pre-order")}`);
    await ctl(`add?host=shop-b.localhost&collection=one-piece&title=${encodeURIComponent("Card Sleeves Black")}`);

    const alertsFor = async (id, event) => ((await store("pw.alerts"))["pw.alerts"] || []).filter((a) => a.monitorId === id && a.event === event);
    await waitFor(async () => (await alertsFor(product.id, "restock")).length && (await alertsFor(listing.id, "new-listing")).length, 45_000);
    // Keep watching for duplicates over several more check cycles.
    await sleep(40_000);

    const restock = await alertsFor(product.id, "restock");
    const fresh = await alertsFor(listing.id, "new-listing");
    check(restock.length === 1, `exactly one restock alert (${restock.length})`);
    check(fresh.length === 1, `exactly one new-listing alert (${fresh.length})`);
    check(restock[0]?.channels.includes("desktop") && fresh[0]?.channels.includes("desktop"), "both alerts were desktop notifications");
    const notes = await sw.evaluate(() => new Promise((r) => chrome.notifications.getAll(r)));
    const ids = Object.keys(notes);
    check(ids.includes(`pw:${restock[0]?.id}`) && ids.includes(`pw:${fresh[0]?.id}`) && ids.length === 2, `exactly two notifications on screen (${ids.length})`);
    check(fresh[0]?.title === "OP-15 Booster Box Pre-order", `listing alert names the new product (${fresh[0]?.title})`);
    check(typeof restock[0]?.latencyMs === "number", `restock alert reports detection latency (${Math.round((restock[0]?.latencyMs ?? 0) / 1000)}s)`);

    // 4. Polite mode: no domain was hit more often than the 10 s minimum gap allows.
    const stats = await ctl("stats");
    const elapsed = 120; // generous upper bound of the run in seconds
    for (const host of ["shop-a.localhost", "shop-b.localhost"]) {
      check((stats[host]?.total ?? 0) <= elapsed / 10 + 3, `${host}: ${stats[host]?.total} requests, within polite limits`);
    }
    check(errors.length === 0, `no popup errors ${errors.join("; ")}`);
  } finally {
    await ctx.close();
    shop.kill();
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
