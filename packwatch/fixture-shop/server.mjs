#!/usr/bin/env node
// Local test shop for Packwatch. `npm run fixture-shop` → http://shop-a.localhost:8787/
//
// Every *.localhost hostname is its own shop (Chrome resolves *.localhost to 127.0.0.1),
// so polite-mode limits apply per subdomain. Hosts starting with "sg" price in SGD.
//
// Pages (stock flips on a timer in --auto mode, or via the control API):
//   /products/<handle>             Shopify-like product page (+ /products/<handle>.js)
//   /collections/<c>               Shopify-like collection (+ /collections/<c>/products.json)
//   /ld/<handle>                   JSON-LD product page
//   /plain/<handle>                plain HTML product page (button text only)
//   /spa/<handle>                  JS-rendered product page (needs tab mode)
//   /listing/<c>                   plain HTML listing page
//   /queue                         fake Queue-it waiting room
// Control API (used by tests):
//   /__control/set?host=&handle=&state=in|out|preorder&price=12.5
//   /__control/add?host=&collection=&title=        adds a product to a collection
//   /__control/auto?on=1                            timer-driven flips on/off
//   /__control/stats                                request counts per host
//   POST /__sink/...  then  /__control/sink          records POSTs (fake ntfy server for tests)
//   /__control/reset
import http from "node:http";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? "1"]));
const PORT = Number(args.port || process.env.PORT || 8787);
const FLIP_SEC = Number(args.flip || 90);
let auto = args.auto === "1";

const STATES = ["out", "in", "out", "preorder"];
const state = new Map(); // `${host}|${handle}` → { state, price }
const collections = new Map(); // `${host}|${collection}` → [{ id, handle, title, price }]
const stats = new Map(); // host → { total, paths: {path: n} }
const sink = []; // POST bodies received on /__sink* (stands in for ntfy / webhooks in tests)
let nextId = 1000;
const started = Date.now();

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const currencyOf = (host) => (host.startsWith("sg") ? "SGD" : "USD");
const titleOf = (handle) => handle.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function productState(host, handle) {
  const key = `${host}|${handle}`;
  if (state.has(key)) return state.get(key);
  const base = { state: "out", price: 50 + (hash(handle) % 100) + 0.99 };
  if (!auto) return base;
  const phase = Math.floor((Date.now() - started) / 1000 / FLIP_SEC + (hash(key) % 4));
  return { ...base, state: STATES[phase % STATES.length] };
}

function collection(host, c) {
  const key = `${host}|${c}`;
  if (!collections.has(key)) {
    collections.set(key, ["Booster Box", "Elite Trainer Box", "Starter Deck"].map((t, i) => ({
      id: nextId++, handle: `${c}-${t.toLowerCase().replace(/ /g, "-")}`, title: `${titleOf(c)} ${t}`, price: 20 + i * 30 + 0.9,
    })));
  }
  const list = collections.get(key);
  if (auto) {
    // a new product every 3 flip periods
    const want = 3 + Math.floor((Date.now() - started) / 1000 / (FLIP_SEC * 3));
    while (list.length < want) list.push({ id: nextId++, handle: `${c}-new-${list.length}`, title: `${titleOf(c)} New Set Booster Box #${list.length}`, price: 129.9 });
  }
  return list;
}

const page = (title, head, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">${head}
<style>body{font:15px system-ui;max-width:760px;margin:40px auto;padding:0 16px}button{font:inherit;padding:10px 18px}.price{font-size:20px;margin:8px 0}a{display:block;margin:6px 0}</style>
</head><body>${body}</body></html>`;

const button = (s) => s === "in" ? `<button type="submit" name="add">Add to cart</button>`
  : s === "preorder" ? `<button type="submit" name="add">Pre-order now</button>`
  : `<button type="submit" name="add" disabled>Sold out</button>`;
const availability = { in: "https://schema.org/InStock", out: "https://schema.org/OutOfStock", preorder: "https://schema.org/PreOrder" };
const money = (p, cur) => `${cur === "SGD" ? "S$" : "$"}${p.toFixed(2)}`;

function route(req, res) {
  if (req.method === "POST" && req.url.startsWith("/__sink")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { sink.push({ path: req.url, body: JSON.parse(body), at: Date.now() }); } catch { sink.push({ path: req.url, body, at: Date.now() }); }
      res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
      res.end('{"ok":true}');
    });
    return;
  }
  const host = (req.headers.host || "localhost").split(":")[0];
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const s = stats.get(host) ?? { total: 0, paths: {} };
  if (!p.startsWith("/__control")) { s.total++; s.paths[p] = (s.paths[p] || 0) + 1; stats.set(host, s); }
  const cur = currencyOf(host);
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type, "cache-control": "max-age=60" }); res.end(body); };
  const json = (o) => send(200, "application/json", JSON.stringify(o));
  let m;

  if (p === "/__control/set") {
    const key = `${url.searchParams.get("host")}|${url.searchParams.get("handle")}`;
    const prev = state.get(key) ?? { price: 59.99 };
    state.set(key, { state: url.searchParams.get("state") || "out", price: Number(url.searchParams.get("price") || prev.price) });
    return json({ ok: true, key, ...state.get(key) });
  }
  if (p === "/__control/add") {
    const list = collection(url.searchParams.get("host"), url.searchParams.get("collection"));
    const title = url.searchParams.get("title") || `New product ${nextId}`;
    const item = { id: nextId++, handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), title, price: 129.9 };
    list.push(item);
    return json({ ok: true, item });
  }
  if (p === "/__control/auto") { auto = url.searchParams.get("on") === "1"; return json({ ok: true, auto }); }
  if (p === "/__control/stats") return json(Object.fromEntries(stats));
  if (p === "/__control/sink") return json(sink);
  if (p === "/__control/reset") { state.clear(); collections.clear(); stats.clear(); sink.length = 0; return json({ ok: true }); }

  if ((m = p.match(/^\/products\/([^/]+)\.js$/))) {
    const st = productState(host, m[1]);
    return send(200, "application/javascript", JSON.stringify({
      id: hash(m[1]), title: titleOf(m[1]), handle: m[1], available: st.state !== "out",
      tags: st.state === "preorder" ? ["Pre-Order"] : ["sealed"], price: Math.round(st.price * 100),
      variants: [{ id: 1, title: "Default Title", available: st.state !== "out", price: Math.round(st.price * 100) }],
    }));
  }
  if ((m = p.match(/^\/products\/([^/.]+)$/))) {
    const st = productState(host, m[1]);
    return send(200, "text/html", page(titleOf(m[1]),
      `<link rel="stylesheet" href="https://cdn.shopify.com/s/files/theme.css" disabled><script>window.Shopify={shop:"${host}"};Shopify.currency={"active":"${cur}","rate":"1.0"};</script>`,
      `<h1>${titleOf(m[1])}</h1><div class="price">${money(st.price, cur)}</div><form action="/cart/add" method="post">${button(st.state)}</form><p><a href="/collections/all">Back to shop</a></p>`));
  }
  if ((m = p.match(/^\/collections\/([^/]+)\/products\.json$/))) {
    return json({ products: collection(host, m[1]).map((x) => ({ id: x.id, title: x.title, handle: x.handle, variants: [{ id: x.id, available: true, price: x.price.toFixed(2) }] })) });
  }
  if ((m = p.match(/^\/collections\/([^/]+)$/))) {
    return send(200, "text/html", page(titleOf(m[1]), `<script>window.Shopify={};Shopify.currency={"active":"${cur}"};</script><link href="https://cdn.shopify.com/x.css" rel="preload">`,
      `<h1>${titleOf(m[1])}</h1>${collection(host, m[1]).map((x) => `<div class="card"><a href="/products/${x.handle}">${x.title}</a><span class="price">${money(x.price, cur)}</span></div>`).join("")}`));
  }
  if ((m = p.match(/^\/listing\/([^/]+)$/))) {
    return send(200, "text/html", page(titleOf(m[1]), "", `<h1>${titleOf(m[1])}</h1>${collection(host, m[1]).map((x) => `<div class="card"><a href="/product/${x.handle}">${x.title}</a><span class="price">${money(x.price, cur)}</span></div>`).join("")}`));
  }
  if ((m = p.match(/^\/ld\/([^/]+)$/))) {
    const st = productState(host, m[1]);
    const ld = { "@context": "https://schema.org", "@type": "Product", name: titleOf(m[1]), offers: { "@type": "Offer", price: st.price.toFixed(2), priceCurrency: cur, availability: availability[st.state] } };
    return send(200, "text/html", page(titleOf(m[1]), `<script type="application/ld+json">${JSON.stringify(ld)}</script>`, `<h1>${titleOf(m[1])}</h1><div class="price">${money(st.price, cur)}</div>${button(st.state)}`));
  }
  if ((m = p.match(/^\/plain\/([^/]+)$/))) {
    const st = productState(host, m[1]);
    return send(200, "text/html", page(titleOf(m[1]), "", `<h1>${titleOf(m[1])}</h1><div class="price">${money(st.price, cur)}</div><div id="buy">${button(st.state)}</div><p><label>Note to seller <input id="note"></label></p>`));
  }
  if ((m = p.match(/^\/spa\/([^/]+)$/))) {
    const st = productState(host, m[1]);
    return send(200, "text/html", page(titleOf(m[1]), "", `<div id="app">Loading…</div><script>
      setTimeout(() => { document.getElementById("app").innerHTML = ${JSON.stringify(`<h1>${titleOf(m[1])}</h1><div class="price">${money(st.price, cur)}</div><div id="buy">${button(st.state)}</div>`)}; }, 300);
    </script>`));
  }
  if (p === "/queue") {
    return send(200, "text/html", page("Queue", `<script src="https://static.queue-it.net/script/queueclient.min.js" async></script>`, `<h1>You are now in line</h1><p>Your estimated wait time is 4 minutes. Please don't refresh.</p>`));
  }
  if (p === "/") {
    return send(200, "text/html", page("Packwatch fixture shop", "", `<h1>Fixture shop: ${host}</h1><p>auto=${auto} · flip every ${FLIP_SEC}s · currency ${cur}</p>
      <a href="/products/prismatic-etb">Shopify product</a><a href="/collections/one-piece">Shopify collection</a>
      <a href="/ld/lorcana-booster-box">JSON-LD product</a><a href="/plain/ygo-tin">Plain HTML product</a>
      <a href="/spa/mtg-play-booster-box">JS-rendered product</a><a href="/listing/pokemon">Plain listing</a><a href="/queue">Queue page</a>`));
  }
  send(404, "text/html", page("Not found", "", "<h1>404</h1>"));
}

http.createServer(route).listen(PORT, () => {
  console.log(`Packwatch fixture shop on http://shop-a.localhost:${PORT}/ (auto=${auto}, flip=${FLIP_SEC}s)`);
});
