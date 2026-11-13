// Reflow — page helper. Injected only into tabs you are refreshing.
// Handles: countdown pill, scroll memory, smart pause, keyword watch.
if (!window.__reflow) {
  window.__reflow = true;

  const SCROLL_KEY = "reflow_scroll:" + location.pathname + location.search;
  const HL = "reflow-match";
  let host = null, txt = null, bar = null, ticker = null;
  let state = null;           // last RF_SYNC payload
  let observer = null, checkTimer = null, misses = 0, matched = false;
  let lastInput = 0;
  const dirty = new WeakSet();

  // ---- scroll memory ----
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    if (raw) {
      sessionStorage.removeItem(SCROLL_KEY);
      const { x, y, t } = JSON.parse(raw);
      if (Date.now() - t < 120000) {
        window.scrollTo(x, y);
        // Late-rendering pages: try once more after content settles.
        setTimeout(() => { if (Math.abs(window.scrollY - y) > 40) window.scrollTo(x, y); }, 600);
      }
    }
  } catch {}
  const saveScroll = () => {
    try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ x: scrollX, y: scrollY, t: Date.now() })); } catch {}
  };

  // ---- smart pause: never refresh away what you're typing or selecting ----
  const isEditable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  addEventListener("keydown", () => { lastInput = Date.now(); }, true);
  addEventListener("input", (e) => { lastInput = Date.now(); dirty.add(e.target); }, true);
  const isBusy = () => {
    if (Date.now() - lastInput < 4000) return true;
    const sel = getSelection();
    if (sel && String(sel).trim()) return true;
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
    return isEditable(el) && dirty.has(el);
  };

  // ---- countdown pill (shadow DOM so page CSS can't touch it) ----
  const fmt = (s) => {
    const p = (n) => String(n).padStart(2, "0");
    if (s >= 3600) return Math.floor(s / 3600) + ":" + p(Math.floor((s % 3600) / 60)) + ":" + p(s % 60);
    if (s >= 60) return Math.floor(s / 60) + ":" + p(s % 60);
    return String(s);
  };
  function mount() {
    if (host) return;
    host = document.createElement("reflow-pill");
    const root = host.attachShadow({ mode: "closed" });
    root.innerHTML = `<style>
      :host{all:initial;position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none}
      .p{position:relative;display:flex;align-items:center;gap:6px;height:24px;padding:0 9px;overflow:hidden;
        background:rgba(9,9,11,.86);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
        border:1px solid rgba(255,255,255,.12);border-radius:7px;color:rgba(228,228,231,.92);
        font:500 11px/1 ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.2px;
        opacity:.6;transition:opacity .3s;animation:in .3s ease;font-variant-numeric:tabular-nums}
      .p.hot{opacity:.95}.p.found{opacity:1;background:#15803d;border-color:#22c55e;color:#fff}
      svg{width:11px;height:11px;flex:none;fill:currentColor}
      .b{position:absolute;left:0;bottom:0;height:2px;width:0;background:rgba(255,255,255,.4);transition:width .3s linear}
      @keyframes in{from{opacity:0;transform:translateY(6px)}}
    </style><div class="p"><svg viewBox="0 0 100 100"><path d="M6.38 33.26A46.72 46.72 0 0 1 92.89 31.48L99.11 25.89L96.88 49.55L72.77 49.55L81.23 41.95A32.25 32.25 0 0 0 22.43 33.26ZM93.62 66.74A46.72 46.72 0 0 1 7.11 68.52L.89 74.11L3.12 50.45L27.23 50.45L18.77 58.05A32.25 32.25 0 0 0 77.57 66.74Z"/></svg><span></span><i class="b"></i></div>`;
    txt = root.querySelector("span");
    bar = root.querySelector(".b");
    document.documentElement.appendChild(host);
  }
  function unmount() {
    if (host) host.remove();
    host = txt = bar = null;
    clearInterval(ticker); ticker = null;
  }
  function tick() {
    if (!host || !state) return;
    const pill = txt.parentElement;
    if (matched) return;
    if (state.paused) { txt.textContent = "paused"; pill.classList.add("hot"); return; }
    const left = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
    txt.textContent = fmt(left);
    bar.style.width = Math.min(100, (1 - left / state.interval) * 100) + "%";
    pill.classList.toggle("hot", left <= 3);
  }

  // ---- keyword watch ----
  function highlight(needle) {
    if (!window.CSS || !CSS.highlights || !window.Highlight) return null;
    const ranges = [], n = needle.toLowerCase();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let first = null;
    for (let node; (node = walker.nextNode()) && ranges.length < 200;) {
      const hay = node.data.toLowerCase();
      for (let i = hay.indexOf(n); i !== -1; i = hay.indexOf(n, i + n.length)) {
        const r = new Range(); r.setStart(node, i); r.setEnd(node, i + n.length);
        ranges.push(r); first = first || node.parentElement;
      }
    }
    CSS.highlights.set(HL, new Highlight(...ranges));
    if (!document.getElementById("reflow-hl")) {
      const st = document.createElement("style");
      st.id = "reflow-hl";
      st.textContent = `::highlight(${HL}){background:#facc15;color:#000}`;
      document.head.appendChild(st);
    }
    return first;
  }
  function check() {
    checkTimer = null;
    if (!state || !state.watch || matched || !document.body) return;
    const { text, mode } = state.watch;
    const found = document.body.innerText.toLowerCase().includes(text.toLowerCase());
    let hit = false;
    if (mode === "appears") hit = found;
    else { misses = found ? 0 : misses + 1; hit = misses >= 2; if (!found && !hit) schedule(1500); }
    if (!hit) return;
    matched = true;
    stopWatch();
    chrome.runtime.sendMessage({ type: "RF_MATCH" }).catch(() => {});
    if (mode === "appears") {
      const el = highlight(text);
      if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    mount();
    txt.textContent = mode === "appears" ? "found" : "gone";
    bar.style.width = "0";
    txt.parentElement.classList.add("found");
    setTimeout(unmount, 8000);
  }
  function schedule(ms = 800) { if (!checkTimer) checkTimer = setTimeout(check, ms); }
  function startWatch() {
    if (observer) return;
    observer = new MutationObserver(() => schedule());
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    schedule(0);
  }
  function stopWatch() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(checkTimer); checkTimer = null;
  }

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    switch (msg.type) {
      case "RF_SYNC":
        state = msg;
        if (state.showTimer) { mount(); clearInterval(ticker); ticker = setInterval(tick, 250); tick(); }
        else if (!matched) unmount();
        if (state.watch) startWatch(); else stopWatch();
        break;
      case "RF_STOP":
        state = null; stopWatch();
        if (!matched) unmount();
        break;
      case "RF_SAVE_SCROLL": saveScroll(); reply({}); break;
      case "RF_BUSY": reply({ busy: isBusy() }); break;
    }
  });
}
