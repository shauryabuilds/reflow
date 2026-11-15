import type { BoostWindow, QuietHours } from "./types";

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Quiet hours may wrap midnight ("22:00"–"07:00"). */
export function inQuietHours(q: QuietHours | undefined, now: number): boolean {
  if (!q) return false;
  const d = new Date(now);
  const cur = d.getHours() * 60 + d.getMinutes();
  const s = toMin(q.start), e = toMin(q.end);
  if (s === e) return false;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e;
}

export function inBoostWindow(b: BoostWindow, now: number): boolean {
  const d = new Date(now);
  return b.days.includes(d.getDay()) && d.getHours() >= b.startHour && d.getHours() < b.endHour;
}

export function agoSec(ts: number | undefined, now = Date.now()): number | null {
  return ts ? Math.max(0, Math.round((now - ts) / 1000)) : null;
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) { const m = Math.floor(sec / 60), s = sec % 60; return s ? `${m}m ${s}s` : `${m}m`; }
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtInterval(sec: number): string {
  if (sec % 3600 === 0) return `${sec / 3600}h`;
  if (sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}
