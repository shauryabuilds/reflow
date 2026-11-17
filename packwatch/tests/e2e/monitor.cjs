// Auto refresh + page monitor ("alert me when this text appears / disappears"), end to end.
// Usage: npm run build:dev && node tests/e2e/monitor.cjs
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist-dev");
const PORT = 8795;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (q) => fetch(`http://localhost:${PORT}/__control/${q}`).then((r) => r.json());
let failures = 0;
const check = (c, m) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) failures++; };

(async () => {
  const shop = spawn(process.execPath, [path.join(ROOT, "fixture-shop/server.mjs"), `--port=${PORT}`], { stdio: "ignore" });
  await sleep(500);
  const ctx = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker");
    const extId = sw.url().split("/")[2];
    const simple = async () => Object.values((await sw.evaluate(() => chrome.storage.local.get("pw.monitors")))["pw.monitors"] || {}).filter((m) => m.kind === "simple");
    const alerts = async () => ((await sw.evaluate(() => chrome.storage.local.get("pw.alerts")))["pw.alerts"] || []).filter((a) => a.event === "text-match");
    const tabIdFor = (host) => sw.evaluate(async (h) => (await chrome.tabs.query({})).find((t) => t.url && t.url.includes(h)).id, host);

    async function startFromPopup(host, text, mode) {
      const tabId = await tabIdFor(host);
      const popup = await ctx.newPage();
      await popup.goto(`chrome-extension://${extId}/src/popup/index.html?tab=${tabId}`);
      await popup.getByRole("button", { name: "Auto refresh", exact: true }).click();
      await popup.getByLabel("Alert me when this text… (optional)").fill(text);
      await popup.getByLabel("appears or disappears").selectOption(mode);
      await popup.locator("button:has-text('5') >> nth=0").click();
      await sleep(500);
      return popup;
    }

    // 1. "appears": wait for "Add to cart" while the item is sold out, then restock it.
    await ctl("set?host=m1.localhost&handle=tin&state=out");
    const page1 = await ctx.newPage();
    await page1.goto(`http://m1.localhost:${PORT}/plain/tin`);
    const popup1 = await startFromPopup("m1.localhost", "Add to cart", "appears");
    await sleep(7000);
    check((await alerts()).length === 0, "no alert while the text is absent");
    await ctl("set?host=m1.localhost&handle=tin&state=in");
    await sleep(9000);
    let a = await alerts();
    let s = (await simple()).find((m) => m.url.includes("m1.localhost"));
    check(a.length === 1 && a[0].title !== undefined && a[0].channels.includes("desktop"), `one desktop alert when the text appears (${a.length})`);
    check(s?.pausedReason === "matched", `refreshing stopped after the match (${s?.state}/${s?.pausedReason})`);
    const hl = await page1.evaluate(() => CSS.highlights && CSS.highlights.has("packwatch"));
    check(hl, "the match is highlighted on the page");
    const count = s?.refreshCount;
    await sleep(7000);
    s = (await simple()).find((m) => m.url.includes("m1.localhost"));
    check(s?.refreshCount === count && (await alerts()).length === 1, "no more refreshes or alerts after the match");
    await popup1.reload();
    await popup1.getByRole("button", { name: "Auto refresh", exact: true }).click().catch(() => {});
    await sleep(500);
    await popup1.screenshot({ path: path.join(process.env.SHOTS ?? "/tmp", "monitor-matched.png") });
    check(await popup1.getByText("Found “Add to cart”").count() > 0, "popup shows the match");
    await popup1.getByRole("button", { name: "Keep refreshing" }).click();
    await sleep(7000);
    s = (await simple()).find((m) => m.url.includes("m1.localhost"));
    check(!s?.watchText && (s?.refreshCount ?? 0) > count, "“Keep refreshing” resumes plain auto refresh");

    // 2. "disappears": alert when "Sold out" is gone (needs two misses in a row).
    await ctl("set?host=m2.localhost&handle=box&state=out");
    const page2 = await ctx.newPage();
    await page2.goto(`http://m2.localhost:${PORT}/plain/box`);
    await startFromPopup("m2.localhost", "sold out", "disappears");
    await sleep(6500);
    check((await alerts()).length === 1, "no alert while “Sold out” is still there");
    await ctl("set?host=m2.localhost&handle=box&state=in");
    await sleep(17000);
    a = await alerts();
    check(a.length === 2 && /gone/.test(((await simple()).find((m) => m.url.includes("m2.localhost")) || {}).evidence || ""), `alert when the text disappears (${a.length})`);

    // 3. Already on the page when starting: alert immediately, no waiting for an interval.
    await ctl("set?host=m3.localhost&handle=etb&state=in");
    const page3 = await ctx.newPage();
    await page3.goto(`http://m3.localhost:${PORT}/plain/etb`);
    const t0 = Date.now();
    await startFromPopup("m3.localhost", "add to cart", "appears");
    await sleep(1500);
    check((await alerts()).length === 3, `text already present alerts right away (${Math.round((Date.now() - t0) / 1000)}s)`);
  } finally {
    await ctx.close();
    shop.kill();
  }
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
