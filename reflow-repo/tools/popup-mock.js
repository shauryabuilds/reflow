// window.__scene set before this runs
(() => {
  const S = window.__scene || {};
  const now = Date.now();
  const tab = { id: 1, url: S.url || "https://www.example-tickets.com/events/arena-tour", title: "Arena Tour — Tickets", windowId: 1 };
  const all = S.all ? Object.fromEntries(Object.entries(S.all).map(([k, v]) => [k, { ...v, nextAt: now + v.left * 1000 }])) : {};
  const config = all[1] || null;
  const listeners = [];
  window.chrome = {
    tabs: { query: async (q) => q.active ? [tab] : [tab, ...(S.others || [])], update: async () => ({}), create: () => {} },
    windows: { update: async () => {} },
    commands: { getAll: (cb) => cb([{ name: "toggle-refresh", shortcut: "Alt+Shift+R" }]) },
    storage: { onChanged: { addListener: (f) => listeners.push(f) } },
    runtime: { sendMessage: async (m) => {
      window.__sent = (window.__sent || []).concat([m]);
      if (m.type === "GET") return { config, alert: S.alert ? { ...S.alert, at: now - 60000 } : null, pref: S.pref || null, all };
      return { ok: true };
    } },
  };
})();
