// Live backtest against real shop pages, through the real popup and the real scheduler.
// For each URL: open it, read what the popup detects, click Watch, then let one scheduled
// check run and compare. Needs network access to the shops and a dev build that pre-grants them:
//
//   PW_TEST_HOSTS="www.allbirds.com,kith.com" npm run build:dev
//   node tests/e2e/backtest-live.cjs https://www.allbirds.com/products/... https://kith.com/collections/...
//
// Real shops change constantly: this prints a report, it doesn't assert exact stock states.
const { chromium } = require("playwright");
const path = require("path");

const EXT = path.join(__dirname, "..", "..", "dist-dev");
const urls = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!urls.length) { console.error("Pass one or more shop URLs."); process.exit(2); }
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = sw.url().split("/")[2];
  await sw.evaluate(() => chrome.storage.local.set({ "pw.entitlement": { plan: "free", checkedAt: 0, devOverride: "pro" } }));
  const rows = [];
  for (const url of urls) {
    const row = { url, popup: "", created: "", afterCheck: "", ms: 0 };
    const t0 = Date.now();
    try {
      const tab = await ctx.newPage();
      await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await sleep(2500);
      const host = new URL(tab.url()).hostname;
      const tabId = await sw.evaluate(async (h) => (await chrome.tabs.query({})).find((t) => t.url && new URL(t.url).hostname === h)?.id, host);
      const popup = await ctx.newPage();
      await popup.setViewportSize({ width: 360, height: 900 });
      await popup.goto(`chrome-extension://${extId}/src/popup/index.html?tab=${tabId}`);
      await sleep(3000);
      row.popup = (await popup.locator("main").innerText()).split("\n").filter(Boolean).slice(0, 8).join(" | ").slice(0, 220);
      await popup.screenshot({ path: path.join(process.env.BACKTEST_SHOTS ?? "/tmp", `backtest-${rows.length}.png`) });
      const btn = popup.getByRole("button", { name: /^(Watch this product|Watch for new listings|Watch anyway)$/ }).first();
      if (await btn.count()) {
        await btn.click();
        await sleep(6000);
        const mons = Object.values((await sw.evaluate(() => chrome.storage.local.get("pw.monitors")))["pw.monitors"] || {});
        const m = mons.find((x) => x.url.split("#")[0] === url.split("#")[0] || x.url.startsWith(url.split("?")[0]));
        if (m) {
          row.created = `${m.kind}/${m.mode}/${m.strategy} ${m.state}${m.lastPrice ? ` ${m.lastPrice.amount} ${m.lastPrice.currency}` : ""} · ${m.evidence}`;
          await popup.evaluate((id) => chrome.runtime.sendMessage({ target: "bg", type: "pw:checkNow", id }), m.id);
          await sleep(m.mode === "tab" ? 25_000 : 8000);
          const m2 = (await sw.evaluate(() => chrome.storage.local.get("pw.monitors")))["pw.monitors"][m.id];
          row.afterCheck = `${m2.state} · ${m2.evidence}`;
        } else row.created = "(no monitor created)";
      } else row.created = "(no watch button)";
      await popup.close();
      await tab.close();
    } catch (e) {
      row.created = `ERROR ${String(e.message || e).split("\n")[0]}`;
    }
    row.ms = Date.now() - t0;
    rows.push(row);
    console.log(JSON.stringify(row, null, 1));
  }
  await ctx.close();
})().catch((e) => { console.error(e); process.exit(1); });
