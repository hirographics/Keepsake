// Ghost-finger demos: a see-through fingertip shows a gesture right where it happens.
// Each hands-on gesture is shown once, the first time it comes up. During the tour every one shows.
// Touch the screen and the demo gets out of the way.
import { h } from './ui.js';

const KEY = 'keepsake.tips';
let seen = new Set();
try { seen = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { /* ignore */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...seen])); } catch (e) { /* ignore */ } };

// During the tour each gesture shows once per tour, even if you have seen it before.
let force = false, thisRun = new Set();
export const forceTips = on => { force = on; thisRun = new Set(); };
const already = name => force ? thisRun.has(name) : seen.has(name);
const mark = name => { seen.add(name); thisRun.add(name); save(); };

const box = sel => {
  const n = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!n) return null;
  const r = n.getBoundingClientRect();
  return r.width > 2 && r.height > 2 ? r : null;
};
const mid = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
const inset = (r, k) => ({ left: r.left + r.width * k, top: r.top + r.height * k, width: r.width * (1 - 2 * k), height: r.height * (1 - 2 * k) });
function zigzag(r, rows = 3) {
  const q = inset(r, 0.18), pts = [];
  for (let j = 0; j <= rows; j++) {
    const y = q.top + q.height * j / rows;
    pts.push(j % 2 ? { x: q.left + q.width, y } : { x: q.left, y });
  }
  return pts;
}
function loop(r, k = 0.62) {
  const c = mid(r), pts = [];
  for (let j = 0; j <= 24; j++) { const a = j / 24 * Math.PI * 2 - Math.PI / 2; pts.push({ x: c.x + Math.cos(a) * r.width * k / 2, y: c.y + Math.sin(a) * r.height * k / 2 }); }
  return pts;
}
function along(r) {
  const c = mid(r), q = inset(r, 0.06);
  return r.width >= r.height ? [{ x: q.left, y: c.y }, { x: q.left + q.width, y: c.y }] : [{ x: c.x, y: q.top }, { x: c.x, y: q.top + q.height }];
}

// Each gesture: where to look, and what the finger does there.
const GESTURES = {
  glue: () => { const r = box('.piece-back'); return r && { kind: 'path', pts: zigzag(r) }; },
  smooth: () => { const r = box('.bubble'); return r && { kind: 'path', pts: loop({ left: r.left - 12, top: r.top - 12, width: r.width + 24, height: r.height + 24 }, 1) }; },
  peel: () => { const r = box('.peel-holder'); return r && { kind: 'path', pts: [{ x: r.left + 10, y: r.top + 10 }, { x: r.left + r.width * 0.95, y: r.top + r.height * 0.95 }] }; },
  press: () => { const r = box('.floater'); return r && { kind: 'hold', at: mid(r) }; },
  tape: () => { const r = box('.asm-svg .ghost.on'); return r && { kind: 'path', pts: along(r) }; },
  dab: () => { const r = box('.pad.big'); return r && { kind: 'tap', at: mid(r), times: 2 }; },
  stamp: () => { const r = box('.asm-svg .ghost.on'); return r && { kind: 'hold', at: mid(r) }; },
  scratch: () => { const r = box('.asm-svg .ghost.on'); return r && { kind: 'path', pts: zigzag(r, 4) }; },
  cut: t => { const r = (t && box(t)) || box('.sel'); return r && { kind: 'path', pts: loop(r) }; },
  'tape-mode': () => { const r = box('.page'); return r && { kind: 'path', pts: [{ x: r.left + r.width * 0.25, y: r.top + r.height * 0.45 }, { x: r.left + r.width * 0.75, y: r.top + r.height * 0.42 }] }; },
  'stamp-mode': () => {
    const pad = box('.modebar .pad'), r = box('.page');
    return pad && r && { kind: 'seq', parts: [{ kind: 'tap', at: mid(pad), times: 2 }, { kind: 'hold', at: mid(r) }] };
  },
};

// Shows a gesture's demo the first time it comes up (always during the tour).
export function cue(name, delay = 450, target = null) {
  if (already(name)) return;
  const make = GESTURES[name];
  if (!make) return;
  let acted = false;
  const onTouch = () => { acted = true; };
  window.addEventListener('pointerdown', onTouch, { capture: true, once: true });
  setTimeout(() => {
    window.removeEventListener('pointerdown', onTouch, { capture: true });
    if (acted) { mark(name); return; } // already doing it: no demo needed
    const g = make(target);
    if (!g) return;
    mark(name);
    demo(g);
  }, delay);
}

// ---------- the ghost finger ----------
let playing = null;
export function stopDemo() { if (playing) { playing.stop(); playing = null; } }

// Plays a gesture twice, then fades. g: { kind: 'tap'|'hold'|'path'|'pinch'|'seq', ... }
export function demo(g, { repeat = 2 } = {}) {
  stopDemo();
  const layer = h('div', { class: 'ghost-layer' });
  document.body.append(layer);
  let stopped = false, anims = [];
  const stop = () => {
    if (stopped) return; stopped = true;
    anims.forEach(a => a.cancel());
    layer.classList.add('out');
    setTimeout(() => layer.remove(), 250);
    window.removeEventListener('pointerdown', stop, { capture: true });
  };
  window.addEventListener('pointerdown', stop, { capture: true });
  playing = { stop };
  const finger = () => { const f = h('div', { class: 'ghost-finger' }, h('span', { class: 'ghost-ring' })); layer.append(f); return f; };

  // Keyframes for one finger: appear, press, follow the points, lift, vanish.
  function track(f, pts, { press = 260, travel = 900, hold = 0, taps = 0 } = {}) {
    const at = p => `translate(${p.x}px, ${p.y}px)`;
    const k = [];
    const t0 = 220, total = t0 + press + (taps ? taps * 340 : 0) + (pts.length > 1 ? travel : 0) + hold + 380;
    let t = 0;
    const add = (ms, p, s, o) => { t += ms; k.push({ offset: Math.min(1, t / total), transform: `${at(p)} scale(${s})`, opacity: o }); };
    k.push({ offset: 0, transform: `${at(pts[0])} scale(1.25)`, opacity: 0 });
    add(t0, pts[0], 1.15, 0.9);
    if (taps) for (let j = 0; j < taps; j++) { add(150, pts[0], 0.8, 1); add(190, pts[0], 1.1, 0.9); }
    else add(press, pts[0], 0.82, 1);
    if (pts.length > 1) { const seg = travel / (pts.length - 1); for (const p of pts.slice(1)) add(seg, p, 0.82, 1); }
    if (hold) add(hold, pts[pts.length - 1], 0.74, 1);
    add(380, pts[pts.length - 1], 1.2, 0);
    return { keys: k, total };
  }
  function play(part) {
    if (part.kind === 'seq') return part.parts.reduce((p, x) => p.then(() => !stopped && play(x)), Promise.resolve());
    const runs = [];
    if (part.kind === 'tap') runs.push(track(finger(), [part.at], { taps: part.times || 1 }));
    if (part.kind === 'hold') runs.push(track(finger(), [part.at], { hold: 900 }));
    if (part.kind === 'path') {
      const len = part.pts.slice(1).reduce((a, p, j) => a + Math.hypot(p.x - part.pts[j].x, p.y - part.pts[j].y), 0);
      runs.push(track(finger(), part.pts, { travel: Math.max(600, Math.min(1800, len * 4)) }));
    }
    if (part.kind === 'pinch') {
      const c = part.at, d = part.spread || 70;
      runs.push(track(finger(), [{ x: c.x - 18, y: c.y + 18 }, { x: c.x - d, y: c.y + d }], { travel: 700 }));
      runs.push(track(finger(), [{ x: c.x + 18, y: c.y - 18 }, { x: c.x + d, y: c.y - d }], { travel: 700 }));
    }
    const fingers = [...layer.children].slice(-runs.length);
    return Promise.all(runs.map((r, j) => {
      const a = fingers[j].animate(r.keys, { duration: r.total, easing: 'ease-in-out', fill: 'forwards' });
      anims.push(a);
      return a.finished.catch(() => {}).then(() => fingers[j].remove());
    }));
  }
  (async () => {
    for (let n = 0; n < repeat && !stopped; n++) { await play(g); await new Promise(r => setTimeout(r, 350)); }
    if (playing && playing.stop === stop) playing = null;
    stop();
  })();
  return stop;
}
export { box, mid };
