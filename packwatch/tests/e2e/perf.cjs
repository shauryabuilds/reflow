// Soak test: 20 monitors for PERF_MINUTES (default 60) on the fixture shop in auto mode.
// Samples JS heap of the service worker and the offscreen document via CDP, counts checks,
// and verifies there are zero duplicate alerts. Writes the results to PERF.md.
// Usage: npm run perf      (PERF_MINUTES=10 npm run perf for a shorter run)
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const EXT = path.join(ROOT, "dist-dev");
const PORT = 8792;
const CDP_PORT = 9333;
const MINUTES = Number(process.env.PERF_MINUTES || 60);
const FLIP = 200; // seconds per stock phase: restocks every 800 s per product (> the 10 min cooldown)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (q) => fetch(`http://localhost:${PORT}/__control/${q}`).then((r) => r.json());

async function cdp(wsUrl, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const call = (m, p) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
    ws.onmessage = (e) => { const d = JSON.parse(e.data); if (pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); } };
    ws.onerror = (e) => reject(e);
    ws.onopen = async () => {
      try {
        await call("HeapProfiler.enable");
        await call("HeapProfiler.collectGarbage");
        const r = await call(method, params);
        ws.close();
        resolve(r);
      } catch (e) { reject(e); }
    };
  });
}

async function heaps() {
  const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const sw = targets.find((t) => t.type === "service_worker" && t.url.includes("service-worker-loader"));
  const off = targets.find((t) => t.url.includes("offscreen.html"));
  const out = {};
  if (sw) out.sw = (await cdp(sw.webSocketDebuggerUrl, "Runtime.getHeapUsage")).usedSize;
  if (off) out.offscreen = (await cdp(off.webSocketDebuggerUrl, "Runtime.getHeapUsage")).usedSize;
  out.tabs = targets.filter((t) => t.type === "page").length;
  return out;
}

const MONITORS = [
  ...Array.from({ length: 8 }, (_, i) => ({ host: `s${i + 1}.localhost`, path: `/products/booster-box-${i + 1}`, kind: "product", strategy: "shopify", currencyHint: "USD" })),
  ...Array.from({ length: 4 }, (_, i) => ({ host: `sgj${i + 1}.localhost`, path: `/ld/elite-trainer-${i + 1}`, kind: "product", strategy: "jsonld" })),
  ...Array.from({ length: 3 }, (_, i) => ({ host: `p${i + 1}.localhost`, path: `/plain/tin-${i + 1}`, kind: "product", strategy: "heuristic" })),
  ...Array.from({ length: 3 }, (_, i) => ({ host: `l${i + 1}.localhost`, path: `/collections/set-${i + 1}`, kind: "listing", strategy: "shopify", keywords: ["new set"] })),
  ...Array.from({ length: 2 }, (_, i) => ({ host: `t${i + 1}.localhost`, path: `/spa/play-booster-${i + 1}`, kind: "product", strategy: "heuristic" })),
];

(async () => {
  const shop = spawn(process.execPath, [path.join(ROOT, "fixture-shop/server.mjs"), `--port=${PORT}`, "--auto=1", `--flip=${FLIP}`], { stdio: "ignore" });
  await sleep(500);
  const ctx = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, `--remote-debugging-port=${CDP_PORT}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = sw.url().split("/")[2];
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/src/options/index.html`);
  const bg = (msg) => page.evaluate((m) => chrome.runtime.sendMessage({ target: "bg", ...m }), msg);
  await bg({ type: "pw:devPlan", plan: "pro" });

  const created = [];
  for (const [i, m] of MONITORS.entries()) {
    const r = await bg({ type: "pw:createMonitor", draft: {
      id: `perf${i}`, kind: m.kind, url: `http://${m.host}:${PORT}${m.path}`, title: `${m.host}${m.path}`, strategy: m.strategy,
      alertOn: { restock: true, preorder: true }, keywords: m.keywords, intervalSec: 15, currencyHint: m.currencyHint, createdAt: Date.now() + i,
    } });
    created.push(r.ok ? `${r.data.kind}/${r.data.mode}` : `ERR ${r.error}`);
    if (process.env.PERF_DEBUG) console.log(i, m.host, r.ok ? `${r.data.state} ${r.data.evidence}` : r.error);
  }
  console.log("created:", created.join(" "));
  const startedAt = Date.now();
  await sleep(Number(process.env.PERF_WARMUP_SEC ?? 120) * 1000); // warm-up
  const samples = [{ min: 2, ...(await heaps()) }];
  console.log("sample", samples[0]);
  const total = MINUTES * 60_000;
  while (Date.now() - startedAt < total) {
    await sleep(Math.min(5 * 60_000, total - (Date.now() - startedAt)));
    const s = { min: Math.round((Date.now() - startedAt) / 60_000), ...(await heaps()) };
    samples.push(s);
    console.log("sample", s);
  }
  const elapsedSec = (Date.now() - startedAt) / 1000 + 5;

  const st = await sw.evaluate(() => chrome.storage.local.get(["pw.alerts", "pw.history", "pw.monitors", "pw.runtime"]));
  const alerts = st["pw.alerts"] || [], history = st["pw.history"] || [];
  const stats = await ctl("stats");
  // Duplicate = same monitor + event (or same listing product) twice within the 10 min cooldown,
  // or an alert with no matching transition in the history log.
  const COOLDOWN = 10 * 60_000;
  let dupes = 0;
  const lastBy = new Map();
  for (const a of alerts.filter((x) => x.monitorId.startsWith("perf")).sort((x, y) => x.at - y.at)) {
    const key = a.event === "new-listing" ? `${a.monitorId}|${a.title}` : `${a.monitorId}|${a.event}`;
    if (lastBy.has(key) && a.at - lastBy.get(key) < COOLDOWN) dupes++;
    lastBy.set(key, a.at);
  }
  const transitions = (id, ev) => history.filter((h) => h.monitorId === id && h.event === ev).length;
  let orphan = 0;
  for (const [i] of MONITORS.entries()) {
    const id = `perf${i}`;
    for (const ev of ["restock", "preorder", "new-listing"]) {
      const a = alerts.filter((x) => x.monitorId === id && x.event === ev).length;
      if (a > transitions(id, ev)) orphan += a - transitions(id, ev);
    }
  }
  const rows = MONITORS.map((m, i) => {
    const mon = st["pw.monitors"][`perf${i}`];
    const checks = stats[m.host]?.total ?? 0;
    const expected = Math.floor(elapsedSec / (mon?.mode === "tab" ? 30 : 15));
    return { id: `perf${i}`, host: m.host, kind: m.kind, mode: mon?.mode, state: mon?.state, checks, expected,
      alerts: alerts.filter((a) => a.monitorId === `perf${i}`).length, transitions: history.filter((h) => h.monitorId === `perf${i}` && h.event !== "out").length };
  });
  const first = samples[0], last = samples[samples.length - 1];
  const growth = (a, b) => (a && b ? ((b - a) / a) * 100 : NaN);
  const maxOf = (k) => Math.max(...samples.map((s) => s[k] || 0));
  const mb = (n) => (n / 1048576).toFixed(2);
  const swGrowth = growth(first.sw, last.sw), offGrowth = growth(first.offscreen, last.offscreen);
  const pass = swGrowth <= 20 && offGrowth <= 20 && dupes === 0 && orphan === 0;

  const md = `# Performance run

Generated by \`npm run perf\` (tests/e2e/perf.cjs) on ${new Date().toISOString().slice(0, 10)}.

- Duration: **${MINUTES} min** after a 2 min warm-up, 20 monitors (${created.join(", ")}).
- Fixture shop in auto mode, stock phase every ${FLIP} s (each product restocks every ${FLIP * 4} s), new listings every ${FLIP * 3} s.
- Plan: Pro (dev simulator), 15 s fetch interval / 30 s tab interval, every monitor on its own subdomain.
- Chromium ${ctx.browser()?.version?.() ?? ""} headless, unpacked dev build.

## Result: ${pass ? "PASS" : "FAIL"}

| Check | Target | Result |
|---|---|---|
| Service worker heap growth | ≤ 20% | ${swGrowth.toFixed(1)}% (${mb(first.sw)} → ${mb(last.sw)} MB, max ${mb(maxOf("sw"))} MB) |
| Offscreen document heap growth | ≤ 20% | ${offGrowth.toFixed(1)}% (${mb(first.offscreen)} → ${mb(last.offscreen)} MB, max ${mb(maxOf("offscreen"))} MB) |
| Duplicate alerts (same event within cooldown) | 0 | ${dupes} |
| Alerts without a matching transition | 0 | ${orphan} |
| Total alerts fired | | ${alerts.filter((a) => a.monitorId.startsWith("perf")).length} |
| Total checks served by the fixture shop | | ${rows.reduce((s, r) => s + r.checks, 0)} |

Heap is measured after a forced GC via CDP \`Runtime.getHeapUsage\`.

## Heap samples (MB)

| Minute | Service worker | Offscreen | Open pages |
|---|---|---|---|
${samples.map((s) => `| ${s.min} | ${mb(s.sw || 0)} | ${mb(s.offscreen || 0)} | ${s.tabs} |`).join("\n")}

## Per monitor

Checks vs. expected shows the scheduler keeps pace (expected = elapsed / interval; tab checks also include page sub-requests).

| Monitor | Kind | Mode | Final state | Checks | Expected | Transitions | Alerts |
|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.host} | ${r.kind} | ${r.mode} | ${r.state} | ${r.checks} | ~${r.expected} | ${r.transitions} | ${r.alerts} |`).join("\n")}
`;
  fs.writeFileSync(path.join(ROOT, "PERF.md"), md);
  console.log(md);
  await ctx.close();
  shop.kill();
  process.exit(pass ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
