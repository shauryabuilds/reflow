// Restart survival: monitors keep working after the browser restarts, without pressing Start.
// Usage: npm run build:dev && node tests/e2e/restart.cjs
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist-dev");
const PORT = 8794;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (q) => fetch(`http://localhost:${PORT}/__control/${q}`).then((r) => r.json());
let failures = 0;
const check = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) failures++; };
const launch = (dir) => chromium.launchPersistentContext(dir, { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
async function worker(ctx) { let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent("serviceworker"); return sw; }

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-restart-"));
  const shop = spawn(process.execPath, [path.join(ROOT, "fixture-shop/server.mjs"), `--port=${PORT}`], { stdio: "ignore" });
  await sleep(500);
  try {
    await ctl("set?host=r1.localhost&handle=box&state=out");
    await ctl("set?host=r2.localhost&handle=box&state=out");
    let ctx = await launch(dir);
    let sw = await worker(ctx);
    const extId = sw.url().split("/")[2];
    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/src/options/index.html`);
    const bg = (m) => page.evaluate((x) => chrome.runtime.sendMessage({ target: "bg", ...x }), m);
    await bg({ type: "pw:devPlan", plan: "pro" });
    const d = (id, url, strategy) => ({ id, kind: "product", url, title: id, strategy, alertOn: { restock: true, preorder: true }, intervalSec: 15, currencyHint: "USD", createdAt: Date.now() });
    await bg({ type: "pw:createMonitor", draft: d("fetch1", `http://r1.localhost:${PORT}/products/box`, "shopify") });
    await bg({ type: "pw:createMonitor", draft: d("tab1", `http://r2.localhost:${PORT}/spa/box`, "heuristic") });
    await sleep(20_000);
    const before = (await sw.evaluate(() => chrome.storage.local.get("pw.monitors")))["pw.monitors"];
    check(before.fetch1.stableState === "out" && before.tab1.mode === "tab" && before.tab1.stableState === "out", `both monitors checked before restart (tab1 ${before.tab1.mode}/${before.tab1.stableState})`);
    await ctx.close();

    // While the browser is closed, both items restock.
    await ctl("set?host=r1.localhost&handle=box&state=in");
    await ctl("set?host=r2.localhost&handle=box&state=in");

    ctx = await launch(dir);
    sw = await worker(ctx);
    await sleep(45_000);
    const s = await sw.evaluate(() => chrome.storage.local.get(["pw.monitors", "pw.alerts"]));
    const restocks = (id) => s["pw.alerts"].filter((a) => a.monitorId === id && a.event === "restock").length;
    check(restocks("fetch1") === 1, `fetch monitor alerted once after restart (${restocks("fetch1")})`);
    check(restocks("tab1") === 1, `tab monitor alerted once after restart (${restocks("tab1")})`);
    const pinned = await sw.evaluate(async () => (await chrome.tabs.query({ pinned: true })).map((t) => t.url));
    check(pinned.filter((u) => u.includes("/spa/box")).length === 1, `exactly one watcher tab after restart (${pinned.length} pinned)`);
    const offscreen = await sw.evaluate(async () => (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length);
    check(offscreen === 1, "ticker running again without pressing Start");
    await ctx.close();
  } finally {
    shop.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
