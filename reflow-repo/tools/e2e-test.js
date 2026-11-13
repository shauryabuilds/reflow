// End-to-end check against a real Chromium with the unpacked extension.
// Usage: node tools/e2e-test.js   (needs `playwright` with Chromium)
const { chromium } = require('playwright');
const http = require('http');
const EXT = require('path').join(__dirname, '..', 'extension');
let hits = 0, lastHeaders = {}, stockAt = Infinity;
const srv = http.createServer((req, res) => {
  if (req.url !== '/') { res.end(); return; }
  hits++; lastHeaders = req.headers;
  res.setHeader('Content-Type', 'text/html'); res.setHeader('Cache-Control', 'max-age=3600');
  res.end(`<!doctype html><body style="height:4000px"><h1>Hit ${hits}</h1><input id="q"><p>${hits >= stockAt ? 'Status: In Stock now' : 'Status: sold out'}</p></body>`);
}).listen(8765);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const ctx = await chromium.launchPersistentContext('', { channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  sw.on?.('console', m => console.log('SW:', m.text()));
  await page.goto('http://localhost:8765/');
  await page.bringToFront();
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8765/*' }))[0].id);
  const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);

  // 1. sub-30s refresh + hard refresh
  let h0 = hits;
  await sw.evaluate(({ tabId }) => start(tabId, 2, { smartPause: true, preserveScroll: true }), { tabId });
  await sleep(7000);
  ok(hits - h0 >= 3, `2s interval refreshed ${hits - h0}x in 7s`);
  ok(/no-cache/.test(lastHeaders['cache-control'] || '') || /no-cache/.test(lastHeaders['pragma'] || ''), `hard refresh headers: cache-control=${lastHeaders['cache-control']} pragma=${lastHeaders['pragma']}`);
  const pill = await page.evaluate(() => !!document.querySelector('reflow-pill'));
  ok(pill, 'countdown pill mounted');
  const badge = await sw.evaluate(({ tabId }) => chrome.action.getBadgeText({ tabId }), { tabId });
  ok(/^\d$/.test(badge), `badge countdown "${badge}"`);

  // 2. scroll preservation
  await page.evaluate(() => scrollTo(0, 1500));
  await sleep(3500);
  const y = await page.evaluate(() => scrollY);
  ok(Math.abs(y - 1500) < 5, `scroll kept after refresh (y=${y})`);

  // 3. smart pause while typing
  await page.waitForLoadState('load');
  await page.click('#q'); await page.keyboard.type('hello');
  h0 = hits;
  await sleep(5000);
  const st = await sw.evaluate(({ tabId }) => tabs[tabId], { tabId });
  ok(hits === h0 && st.paused, `paused while form has typed text (hits +${hits - h0}, paused=${st.paused})`);
  await page.evaluate(() => document.activeElement.blur());
  await sleep(6500);
  ok(hits > h0, `resumed after leaving the field (hits +${hits - h0})`);

  // 4. keyword watch
  await sw.evaluate(({ tabId }) => stop(tabId), { tabId });
  stockAt = hits + 2;
  await sw.evaluate(({ tabId }) => start(tabId, 2, { watchText: 'in stock', watchMode: 'appears', sound: true }), { tabId });
  await sleep(9000);
  const s2 = await sw.evaluate(({ tabId }) => ({ t: tabs[tabId] || null, a: alerts[tabId] || null }), { tabId });
  ok(!s2.t && s2.a && s2.a.text === 'in stock', `alert fired and refreshing stopped: ${JSON.stringify(s2.a)}`);
  h0 = hits; await sleep(4000); ok(hits === h0, 'no refresh after match');
  const hl = await page.evaluate(() => CSS.highlights.has('reflow-match'));
  ok(hl, 'match highlighted in page');

  // 5. disappears mode
  stockAt = Infinity; // page now says sold out... flip: watch for "sold out" disappearing
  await page.reload();
  stockAt = hits + 2;
  await sw.evaluate(({ tabId }) => start(tabId, 2, { watchText: 'sold out', watchMode: 'disappears' }), { tabId });
  await sleep(10000);
  const s3 = await sw.evaluate(({ tabId }) => ({ t: tabs[tabId] || null, a: alerts[tabId] || null }), { tabId });
  ok(!s3.t && s3.a && s3.a.mode === 'disappears', `disappears alert: ${JSON.stringify(s3.a)}`);

  // 6. shortcut toggle uses remembered settings
  await sw.evaluate(async ({ tabId }) => toggle(await chrome.tabs.get(tabId)), { tabId });
  const s4 = await sw.evaluate(({ tabId }) => tabs[tabId], { tabId });
  ok(s4 && s4.interval === 2, 'toggle started with remembered interval');
  await sw.evaluate(async ({ tabId }) => toggle(await chrome.tabs.get(tabId)), { tabId });
  ok(!(await sw.evaluate(({ tabId }) => tabs[tabId], { tabId })), 'toggle stopped');
  // 7. popup page loads in real extension context
  const extId = sw.url().split('/')[2];
  const pp = await ctx.newPage(); const perr = []; pp.on('pageerror', e => perr.push(e.message));
  await pp.goto(`chrome-extension://${extId}/popup.html`); await sleep(500);
  ok(perr.length === 0, 'popup loads without errors ' + perr.join(';'));
  ok(errs.length === 0, 'no page errors ' + errs.join(';'));
  await ctx.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
