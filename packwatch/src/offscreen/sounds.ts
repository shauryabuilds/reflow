// Three built-in alert sounds, synthesized so no audio files ship with the extension.
import type { SoundId } from "../shared/types";

const PATTERNS: Record<SoundId, Array<[freq: number, start: number, dur: number, type: OscillatorType]>> = {
  chime: [[880, 0, 0.5, "sine"], [1320, 0.16, 0.5, "sine"], [1760, 0.32, 0.6, "sine"]],
  ping: [[1568, 0, 0.25, "triangle"], [1568, 0.3, 0.35, "triangle"]],
  alarm: [0, 1, 2, 3, 4, 5].map((i) => [i % 2 ? 660 : 990, i * 0.22, 0.18, "square"] as [number, number, number, OscillatorType]),
};

let ctx: AudioContext | null = null;

export function playSound(id: SoundId, volume: number) {
  ctx ??= new AudioContext();
  const t0 = ctx.currentTime + 0.02;
  const vol = Math.max(0, Math.min(1, volume)) * (id === "alarm" ? 0.25 : 0.4);
  for (const [f, s, d, type] of PATTERNS[id] ?? PATTERNS.chime) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + s);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + s + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + s + d);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + s); o.stop(t0 + s + d + 0.05);
  }
}
