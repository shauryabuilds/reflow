// Plays the keyword-alert chime. Lives only for a few seconds.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "RF_CHIME") return;
  const ctx = new AudioContext();
  const t = ctx.currentTime;
  [[880, 0], [1320, 0.16], [1760, 0.32]].forEach(([f, d]) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.35, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start(t + d); o.stop(t + d + 0.55);
  });
});
