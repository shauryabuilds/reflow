let pill = null, ticker = null, nextAt = 0, totalInterval = 0;
const SCROLL_KEY = "reflow_scroll_" + location.href;

function mount() {
  if (pill) return;
  pill = document.createElement("div"); pill.id = "reflow-pill";
  const bar = document.createElement("div"); bar.id = "reflow-bar"; pill.appendChild(bar);
  const text = document.createElement("span"); text.id = "reflow-text"; pill.appendChild(text);
  document.documentElement.appendChild(pill);
}
function unmount() { if (pill) { pill.remove(); pill = null; } if (ticker) { clearInterval(ticker); ticker = null; } }
function fmt(s) {
  if (s >= 3600) { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h+":"+String(m).padStart(2,"0")+":"+String(s%60).padStart(2,"0"); }
  if (s >= 60) return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");
  return String(s);
}
function tick() {
  if (!pill) return;
  const left = Math.max(0, Math.round((nextAt - Date.now()) / 1000));
  const txt = pill.querySelector("#reflow-text"), bar = pill.querySelector("#reflow-bar");
  if (txt) txt.textContent = fmt(left);
  if (bar && totalInterval > 0) bar.style.width = (Math.min(1, 1 - left / totalInterval) * 100) + "%";
  if (left <= 3) pill.classList.add("rf-imminent"); else pill.classList.remove("rf-imminent");
}
function saveScroll() { try { sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ x: window.scrollX, y: window.scrollY, t: Date.now() })); } catch(e){} }
function restoreScroll() { try { const raw = sessionStorage.getItem(SCROLL_KEY); if (!raw) return; const {x,y,t} = JSON.parse(raw); if (Date.now()-t < 30000) window.scrollTo(x,y); sessionStorage.removeItem(SCROLL_KEY); } catch(e){} }

chrome.runtime.onMessage.addListener((msg) => {
  switch (msg.type) {
    case "RF_START": totalInterval = msg.interval; nextAt = msg.nextAt; mount(); if (ticker) clearInterval(ticker); tick(); ticker = setInterval(tick, 250); if (msg.preserveScroll) restoreScroll(); break;
    case "RF_STOP": unmount(); break;
    case "RF_SAVE_SCROLL": saveScroll(); break;
    case "RF_RESTORE_SCROLL": restoreScroll(); break;
  }
});
