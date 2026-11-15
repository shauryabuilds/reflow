// Element picker overlay. Injected on demand into the active tab only.
import { buildSelector, normalizeTarget } from "../shared/selector";

declare global { interface Window { __pwPicker?: { draftId: string; active?: boolean } } }

const msg = (k: string, ...s: string[]) => chrome.i18n.getMessage(k, s) || k;

(function start() {
  const cfg = window.__pwPicker;
  if (!cfg || cfg.active) return;
  cfg.active = true;

  const host = document.createElement("packwatch-picker");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .box{position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #10b981;background:rgba(16,185,129,.12);border-radius:4px;transition:all .05s}
    .bar{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147483647;background:#0b0b0f;color:#fafafa;
      font:500 13px/1.4 system-ui,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.35);max-width:min(520px,90vw)}
    .bar b{color:#34d399}.muted{color:#a1a1aa;font-size:12px}
    .tip{position:fixed;z-index:2147483647;background:#0b0b0f;color:#fafafa;font:12px system-ui;padding:4px 8px;border-radius:6px;pointer-events:none;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    button{font:inherit;margin-left:8px;background:#27272a;color:#fafafa;border:0;border-radius:6px;padding:3px 8px;cursor:pointer}
    .shield{position:fixed;inset:0;z-index:2147483645;cursor:crosshair;background:transparent}
  </style><div class="shield"></div><div class="box"></div><div class="tip"></div><div class="bar"></div>`;
  document.documentElement.appendChild(host);
  const box = root.querySelector<HTMLDivElement>(".box")!;
  const tip = root.querySelector<HTMLDivElement>(".tip")!;
  const bar = root.querySelector<HTMLDivElement>(".bar")!;
  // A transparent shield receives every click: disabled "Sold out" buttons fire no click events themselves.
  const shield = root.querySelector<HTMLDivElement>(".shield")!;
  const under = (x: number, y: number) => {
    shield.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    shield.style.pointerEvents = "auto";
    return el && el !== host ? normalizeTarget(el) : null;
  };
  bar.innerHTML = `${msg("pickerHint")} <span class="muted">${msg("pickerEsc")}</span><button data-x>${msg("cancel")}</button>`;

  let current: Element | null = null;
  const textOf = (el: Element) => ((el as HTMLInputElement).value || el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 60);

  const onMove = (e: MouseEvent) => {
    const el = under(e.clientX, e.clientY);
    if (!el) return;
    current = el;
    const r = current.getBoundingClientRect();
    Object.assign(box.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
    tip.textContent = `“${textOf(current) || current.tagName.toLowerCase()}”`;
    Object.assign(tip.style, { left: `${Math.min(r.left, innerWidth - 330)}px`, top: `${r.bottom + 6 > innerHeight - 30 ? r.top - 28 : r.bottom + 6}px` });
  };

  const cleanup = () => {
    removeEventListener("mousemove", onMove, true);
    removeEventListener("click", onClick, true);
    removeEventListener("keydown", onKey, true);
    shield.remove();
    cfg.active = false;
  };
  const done = (html: string, ms = 5000) => {
    cleanup();
    box.remove(); tip.remove();
    bar.innerHTML = html;
    setTimeout(() => host.remove(), ms);
  };

  const onClick = async (e: MouseEvent) => {
    if (e.composedPath().some((n) => (n as Element).hasAttribute?.("data-x"))) return; // cancel button handles itself
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    current = under(e.clientX, e.clientY) ?? current;
    if (!current) return;
    const selector = buildSelector(current);
    const text = textOf(current);
    bar.textContent = msg("pickerSaving");
    try {
      const r = await chrome.runtime.sendMessage({ target: "bg", type: "pw:picked", draftId: cfg.draftId, selector, text });
      if (r?.ok) {
        const state = msg(`state_${r.data?.state ?? "unknown"}`);
        done(`<b>${msg("pickerSaved")}</b> · ${state}<div class="muted">${(r.data?.evidence ?? "").replace(/</g, "&lt;")}</div>`, 6000);
      } else {
        done(`${msg("pickerFailed")} <span class="muted">${String(r?.error ?? "").replace(/</g, "&lt;")}</span>`, 6000);
      }
    } catch {
      done(msg("pickerFailed"), 5000);
    }
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); done(msg("pickerCancelled"), 1500); } };

  addEventListener("mousemove", onMove, true);
  addEventListener("click", onClick, true);
  addEventListener("keydown", onKey, true);
  root.addEventListener("click", (e) => { if ((e.target as Element).closest("[data-x]")) done(msg("pickerCancelled"), 1500); });
})();
export {};
