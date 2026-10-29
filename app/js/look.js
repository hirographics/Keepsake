// The disposable-camera look. The original photo is never changed:
// a photo element keeps its original file plus a "look" (which effects are on),
// and the picture on the page is developed from both.
import { db } from './db.js';

export const EFFECTS = [
  { id: 'grain', name: 'Film grain' },
  { id: 'tint', name: 'Color tint' },
  { id: 'flash', name: 'Harsh flash' },
  { id: 'date', name: 'Date stamp' },
  { id: 'leaks', name: 'Light leaks' },
  { id: 'corners', name: 'Soft dark corners' },
];

export function disposableLook(dateMs = Date.now()) {
  return { grain: true, tint: true, flash: true, date: true, leaks: true, corners: true, seed: newSeed(), when: dateMs };
}
export function originalLook(dateMs = Date.now()) {
  return { grain: false, tint: false, flash: false, date: false, leaks: false, corners: false, seed: newSeed(), when: dateMs };
}
export const newSeed = () => (Math.random() * 1e9) | 0;
export const isPlain = look => !look || EFFECTS.every(e => !look[e.id]);

// The last look someone used becomes the starting point next time (this device only).
export function lastLook(dateMs) {
  try {
    const saved = JSON.parse(localStorage.getItem('keepsake.look') || 'null');
    if (saved) return { ...saved, seed: newSeed(), when: dateMs || Date.now() };
  } catch (e) { /* storage blocked: fall back to the preset */ }
  return disposableLook(dateMs);
}
export function rememberLook(look) {
  try { localStorage.setItem('keepsake.look', JSON.stringify({ ...look, seed: 0, when: 0 })); } catch (e) { /* ignore */ }
}

// "'26 10 29", the way a cheap camera prints it
export function stampText(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, ' ');
  return `'${String(d.getFullYear()).slice(2)} ${p(d.getMonth() + 1)} ${p(d.getDate())}`;
}

function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

// Tone curves for the tint: warm, slightly green, faded blacks, soft highlights.
const LUT = (() => {
  const r = new Uint8ClampedArray(256), g = new Uint8ClampedArray(256), b = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const s = x + 0.12 * Math.sin(Math.PI * x) * (x - 0.5) * -1; // gentle S-curve flattened in the highlights
    r[i] = 22 + s * 236;
    g[i] = 20 + s * 228;
    b[i] = 34 + s * 190;
  }
  return { r, g, b };
})();

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Develops a photo into a canvas, max long edge `max`.
export async function develop(src, look, max = 1600) {
  const img = await loadImage(src);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  if (isPlain(look)) return c;
  const rand = rng(look.seed || 1);

  // Softer edges: a blurred copy faded in toward the corners.
  if (look.corners) {
    const sm = document.createElement('canvas');
    sm.width = Math.max(8, W >> 3); sm.height = Math.max(8, H >> 3);
    sm.getContext('2d').drawImage(c, 0, 0, sm.width, sm.height);
    const soft = document.createElement('canvas');
    soft.width = W; soft.height = H;
    const sctx = soft.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(sm, 0, 0, W, H);
    const g = sctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.5, W / 2, H / 2, Math.hypot(W, H) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    sctx.globalCompositeOperation = 'destination-in';
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, W, H);
    ctx.drawImage(soft, 0, 0);
  }

  // One pass over the pixels: tint, flash, dark corners, grain.
  const data = ctx.getImageData(0, 0, W, H);
  const px = data.data;
  const cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
  const amp = look.grain ? 13 : 0;
  for (let y = 0; y < H; y++) {
    const dy = (y - cy) / R;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let r = px[i], g = px[i + 1], b = px[i + 2];
      if (look.tint) {
        r = LUT.r[r]; g = LUT.g[g]; b = LUT.b[b];
        const l = 0.3 * r + 0.59 * g + 0.11 * b; // pull color down a little
        r = l + (r - l) * 0.86; g = l + (g - l) * 0.86; b = l + (b - l) * 0.86;
      }
      if (look.flash || look.corners) {
        const dx = (x - cx) / R;
        const d = Math.sqrt(dx * dx + dy * dy) * 1.42; // 0 center, about 1 at the corners
        let f = 1;
        if (look.flash) {
          const near = 1 - smooth(0, 0.75, d);
          f *= 1 + 0.16 * near - 0.3 * smooth(0.3, 1.0, d); // bright subject, background falls off fast
          r += 4 * near; g += 4 * near; b += 7 * near; // flash runs a little cool and flat
        }
        if (look.corners) f *= 1 - 0.42 * smooth(0.55, 1.2, d);
        r *= f; g *= f; b *= f;
      }
      if (amp) {
        const n = (rand() + rand() - 1) * amp;
        r += n; g += n * 0.95; b += n * 1.05;
      }
      px[i] = r; px[i + 1] = g; px[i + 2] = b;
    }
  }
  ctx.putImageData(data, 0, 0);

  // Light leaks: warm glow bands coming in from an edge, different every shot.
  if (look.leaks) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const count = 1 + Math.floor(rand() * 2);
    for (let n = 0; n < count; n++) {
      const side = Math.floor(rand() * 4);
      const along = 0.15 + rand() * 0.7;
      const x = side === 0 ? 0 : side === 1 ? W : along * W;
      const y = side === 2 ? 0 : side === 3 ? H : along * H;
      const rad = Math.max(W, H) * (0.35 + rand() * 0.35);
      const hue = rand() < 0.5 ? [255, 110, 40] : [255, 60, 50];
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(${hue},0.85)`);
      g.addColorStop(0.35, `rgba(${hue[0]},${hue[1] + 60},${hue[2]},0.35)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // Date stamp: orange digits burned into the bottom right.
  if (look.date) {
    const size = Math.round(Math.min(W, H) * 0.055);
    ctx.save();
    ctx.font = `bold ${size}px 'Courier New', Courier, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ff9a3c';
    ctx.shadowColor = 'rgba(255,110,20,0.85)';
    ctx.shadowBlur = size * 0.35;
    ctx.globalAlpha = 0.92;
    ctx.fillText(stampText(look.when || Date.now()), W - size * 1.1, H - size * 0.9);
    ctx.restore();
  }
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Developed pictures for the page, made once per photo and look.
const cache = new Map();
const originals = new Map();
async function originalUrl(id) {
  if (originals.has(id)) return originals.get(id);
  const blob = await db.getBlob(id);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  originals.set(id, u);
  return u;
}
export async function photoUrl(el) {
  if (!el.blob) return null;
  const src = await originalUrl(el.blob);
  if (!src || isPlain(el.look)) return src;
  const key = el.blob + '|' + JSON.stringify(el.look);
  if (!cache.has(key)) {
    cache.set(key, develop(src, el.look).then(c => new Promise(r => c.toBlob(b => r(URL.createObjectURL(b)), 'image/jpeg', 0.88))));
  }
  return cache.get(key);
}
export { originalUrl };
