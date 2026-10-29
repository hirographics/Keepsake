// Tool sounds, made on the spot with Web Audio (no sound files to load).
// Real recorded sounds can replace these later, the same way a scrap pack replaces art.
let ctx = null, noiseBuf = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// iOS only lets sound start inside a touch, so wake the audio on the first one.
window.addEventListener('pointerdown', () => ac(), { once: true, capture: true });

function noise(c, t, dur, { type = 'bandpass', freq = 3000, q = 1, gain = 0.4, attack = 0.002 } = {}) {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
  return { src, f, g };
}

function tone(c, t, { from, to, dur, gain = 0.6, type = 'sine' }) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sound = {
  snip() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.035, { type: 'highpass', freq: 4500, gain: 0.35 });
    noise(c, t + 0.03, 0.05, { type: 'bandpass', freq: 2600, q: 3, gain: 0.25 });
  },
  thock() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    tone(c, t, { from: 140, to: 48, dur: 0.16, gain: 0.9 });
    noise(c, t, 0.06, { type: 'lowpass', freq: 900, gain: 0.5 });
    noise(c, t + 0.005, 0.02, { type: 'bandpass', freq: 2200, q: 2, gain: 0.15 });
  },
  pat() { // ink pad
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.07, { type: 'lowpass', freq: 500, gain: 0.45 });
    tone(c, t, { from: 90, to: 60, dur: 0.08, gain: 0.3 });
  },
  tear() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 6; i++) noise(c, t + i * 0.018 + Math.random() * 0.01, 0.03, { type: 'bandpass', freq: 1800 + Math.random() * 2500, q: 2, gain: 0.3 });
  },
  swoosh() { // a sheet of paper sliding
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const n = noise(c, t, 0.35, { type: 'bandpass', freq: 900, q: 0.8, gain: 0.3, attack: 0.08 });
    n.f.frequency.exponentialRampToValueAtTime(2400, t + 0.3);
  },
  press() { // setting a piece down
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.05, { type: 'lowpass', freq: 700, gain: 0.35 });
  },
  peel() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const n = noise(c, t, 0.22, { type: 'bandpass', freq: 3500, q: 1.5, gain: 0.2, attack: 0.03 });
    n.f.frequency.exponentialRampToValueAtTime(1200, t + 0.2);
  },
  glue() { // a dab from a glue tape runner
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.09, { type: 'bandpass', freq: 700, q: 0.7, gain: 0.35, attack: 0.01 });
    tone(c, t + 0.02, { from: 220, to: 120, dur: 0.06, gain: 0.08 });
  },
  write() { // a pencil scratching for a moment
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 9; i++) noise(c, t + i * 0.09 + Math.random() * 0.03, 0.07, { type: 'bandpass', freq: 3000 + Math.random() * 1500, q: 2.5, gain: 0.12, attack: 0.02 });
  },
  scribble() { // one quick pencil stroke
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.06 + Math.random() * 0.04, { type: 'bandpass', freq: 2800 + Math.random() * 1800, q: 2.2, gain: 0.14, attack: 0.015 });
  },
  scratch() { // a fingernail on foil
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    noise(c, t, 0.05 + Math.random() * 0.03, { type: 'highpass', freq: 3800 + Math.random() * 1500, q: 0.8, gain: 0.16, attack: 0.005 });
    noise(c, t + 0.01, 0.03, { type: 'bandpass', freq: 1800, q: 3, gain: 0.06 });
  },
  coin() { // a soft two-note clink
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    tone(c, t, { from: 1568, to: 1568, dur: 0.12, gain: 0.1, type: 'triangle' });
    tone(c, t + 0.07, { from: 2093, to: 2093, dur: 0.22, gain: 0.09, type: 'triangle' });
  },
  done() { // a small bright chime
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    [660, 880, 1320].forEach((f, i) => tone(c, t + i * 0.09, { from: f, to: f, dur: 0.35, gain: 0.12, type: 'triangle' }));
  },
  // Tape unrolling: a hiss that follows how fast the finger moves.
  unroll() {
    const c = ac(); if (!c) return { speed() {}, stop() {} };
    const src = c.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(c.destination);
    src.start();
    return {
      speed(v) { // v in screen px per frame
        const k = Math.min(1, v / 25);
        g.gain.setTargetAtTime(0.28 * k, c.currentTime, 0.03);
        f.frequency.setTargetAtTime(1600 + 2400 * k, c.currentTime, 0.05);
      },
      stop() { g.gain.setTargetAtTime(0, c.currentTime, 0.02); src.stop(c.currentTime + 0.1); },
    };
  },
};
