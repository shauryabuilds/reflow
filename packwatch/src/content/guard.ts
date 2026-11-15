// Injected into watcher tabs and Simple Refresh tabs only. Tracks typing and unsaved
// form input (typing guard) and restores scroll position after a refresh.
interface Guard { lastKey: number; dirty: boolean; installed: true }
declare global { interface Window { __pwGuard?: Guard } }

if (!window.__pwGuard) {
  const g: Guard = { lastKey: 0, dirty: false, installed: true };
  window.__pwGuard = g;
  addEventListener("keydown", () => { g.lastKey = Date.now(); }, true);
  addEventListener("input", (e) => {
    g.lastKey = Date.now();
    const t = e.target as HTMLInputElement;
    if (t && (t.form || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) g.dirty = true;
  }, true);
  addEventListener("submit", () => { g.dirty = false; }, true);
  try {
    const raw = sessionStorage.getItem("__pw_scroll");
    if (raw) {
      sessionStorage.removeItem("__pw_scroll");
      const { x, y, t } = JSON.parse(raw);
      if (Date.now() - t < 120_000) {
        scrollTo(x, y);
        setTimeout(() => { if (Math.abs(scrollY - y) > 40) scrollTo(x, y); }, 600);
      }
    }
  } catch { /* storage blocked */ }
}
export {};
