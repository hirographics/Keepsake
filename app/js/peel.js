// Peeling a sticker's backing off, drawn on a canvas so the backing can fold where your finger is.
// The backing is cut to the sticker's shape with a small margin, like a kiss-cut sticker.
// The part you have pulled folds back over itself along a crease halfway between where you
// grabbed and where your finger is now, showing the backing's pale underside with a soft curl.
import { sound } from './audio.js';

function loadImage(src) {
  return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}

export async function makePeel(holder, src, { onPeeled } = {}) {
  const W = 132, H = 112, dpr = Math.min(3, window.devicePixelRatio || 2);
  const c = document.createElement('canvas');
  c.width = W * dpr; c.height = H * dpr;
  c.className = 'peel-canvas';
  holder.append(c);
  const ctx = c.getContext('2d');
  const img = await loadImage(src);
  if (!img) { onPeeled && onPeeled(); return; }

  // Fit the sticker with room for the backing's margin.
  const k = Math.min((W - 26) / img.naturalWidth, (H - 26) / img.naturalHeight);
  const sw = img.naturalWidth * k, sh = img.naturalHeight * k, sx = (W - sw) / 2, sy = (H - sh) / 2;

  // A filled silhouette of the sticker, grown by r pixels.
  function silhouette(r, color) {
    const o = document.createElement('canvas');
    o.width = c.width; o.height = c.height;
    const g = o.getContext('2d');
    g.scale(dpr, dpr);
    const steps = r ? 16 : 1;
    for (let i = 0; i < steps; i++) { const t = i / steps * Math.PI * 2; g.drawImage(img, sx + r * Math.cos(t), sy + r * Math.sin(t), sw, sh); }
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    return o;
  }
  const back = silhouette(0, '#fbf9f4');      // the sticky side of the sticker
  const liner = silhouette(6, '#e9eef2');      // the backing, cut to shape
  const linerUnder = silhouette(6, '#f8fafb'); // the backing's pale underside
  // A faint sheen on the backing so it reads as glossy paper.
  { const g = liner.getContext('2d'); g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, c.width, c.height);
    gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(.45, 'rgba(255,255,255,0)'); gr.addColorStop(.55, 'rgba(160,175,190,.18)'); gr.addColorStop(1, 'rgba(255,255,255,.4)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height); }
  const face = silhouette(4, '#ffffff');
  { const g = face.getContext('2d'); g.globalCompositeOperation = 'source-over'; g.drawImage(img, sx * dpr, sy * dpr, sw * dpr, sh * dpr); }

  const diag = Math.hypot(sw, sh) + 12;
  const flap = document.createElement('canvas');
  flap.width = c.width; flap.height = c.height;
  let grab = null, finger = null, done = false, hiss = null, lastX = 0, anim = 0;

  function draw(showFace) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    if (showFace) { ctx.drawImage(face, 0, 0); return; }
    ctx.drawImage(back, 0, 0);
    if (!grab || !finger || Math.hypot(finger.x - grab.x, finger.y - grab.y) < 1) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 3 * dpr; ctx.shadowOffsetY = 1 * dpr;
      ctx.drawImage(liner, 0, 0); ctx.restore();
      return;
    }
    const nx0 = finger.x - grab.x, ny0 = finger.y - grab.y, len = Math.hypot(nx0, ny0);
    const nx = nx0 / len, ny = ny0 / len;
    const mx = (grab.x + finger.x) / 2, my = (grab.y + finger.y) / 2;
    // Half planes on either side of the crease, as big polygons (in CSS pixels).
    const far = 2000, px = -ny, py = nx;
    const side = s => [[mx + px * far, my + py * far], [mx - px * far, my - py * far], [mx - px * far + s * nx * far, my - py * far + s * ny * far], [mx + px * far + s * nx * far, my + py * far + s * ny * far]];
    const clip = poly => { ctx.beginPath(); poly.forEach(([x, y], i) => (i ? ctx.lineTo(x * dpr, y * dpr) : ctx.moveTo(x * dpr, y * dpr))); ctx.closePath(); ctx.clip(); };
    // 1. The backing still stuck down: the part past the crease, away from where you grabbed.
    ctx.save(); clip(side(1)); ctx.shadowColor = 'rgba(0,0,0,.16)'; ctx.shadowBlur = 3 * dpr; ctx.drawImage(liner, 0, 0); ctx.restore();
    // 2. The flap: the grabbed part, mirrored over the crease and squeezed a little as it curls.
    // As a matrix: mirror across the crease, then scale along the pull by `curl`.
    const curl = 0.86 + 0.1 * Math.min(1, len / diag);
    const m11 = 1 - (1 + curl) * nx * nx, m12 = -(1 + curl) * nx * ny, m22 = 1 - (1 + curl) * ny * ny;
    const e = mx - (m11 * mx + m12 * my), f = my - (m12 * mx + m22 * my);
    const g = flap.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, flap.width, flap.height);
    g.save();
    g.setTransform(m11, m12, m12, m22, e * dpr, f * dpr);
    g.beginPath(); side(-1).forEach(([x, y], i) => (i ? g.lineTo(x * dpr, y * dpr) : g.moveTo(x * dpr, y * dpr))); g.closePath(); g.clip();
    g.drawImage(linerUnder, 0, 0);
    g.restore();
    // 3. Shading on the flap only: darker at the crease where it curls, brighter at the tip.
    const gr = g.createLinearGradient(mx * dpr, my * dpr, (mx + nx * len * 0.5) * dpr, (my + ny * len * 0.5) * dpr);
    gr.addColorStop(0, 'rgba(90,105,120,.34)'); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,.3)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = gr; g.fillRect(0, 0, flap.width, flap.height);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 6 * dpr; ctx.shadowOffsetX = nx * 3 * dpr; ctx.shadowOffsetY = ny * 3 * dpr;
    ctx.drawImage(flap, 0, 0);
    ctx.restore();
  }

  function pos(e) { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; }
  // You always grab the backing by the corner nearest your finger.
  function corner(p) {
    const cs = [[sx - 6, sy - 6], [sx + sw + 6, sy - 6], [sx - 6, sy + sh + 6], [sx + sw + 6, sy + sh + 6]];
    let best = cs[0], bd = 1e9;
    for (const q of cs) { const dd = Math.hypot(q[0] - p.x, q[1] - p.y); if (dd < bd) { bd = dd; best = q; } }
    return { x: best[0], y: best[1] };
  }
  function animateTo(target, ms, then) {
    cancelAnimationFrame(anim);
    const from = { ...finger }, t0 = performance.now();
    const tick = now => {
      const t = Math.min(1, (now - t0) / ms), ease = 1 - Math.pow(1 - t, 3);
      finger = { x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease };
      draw(false);
      if (t < 1) anim = requestAnimationFrame(tick); else then && then();
    };
    anim = requestAnimationFrame(tick);
  }

  c.addEventListener('pointerdown', e => {
    if (done) return;
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    const p = pos(e);
    grab = corner(p);
    finger = { ...grab };
    lastX = e.clientX;
    hiss = sound.unroll();
    sound.peel();
    animateTo(p, 90);
  });
  c.addEventListener('pointermove', e => {
    if (!grab || done) return;
    cancelAnimationFrame(anim);
    const p = pos(e);
    // Keep the pull within reason so the flap never tears off oddly.
    const dx = p.x - grab.x, dy = p.y - grab.y, L = Math.hypot(dx, dy), max = diag * 1.6;
    finger = L > max ? { x: grab.x + dx / L * max, y: grab.y + dy / L * max } : p;
    hiss.speed(Math.abs(e.clientX - lastX) * 1.4);
    lastX = e.clientX;
    draw(false);
  });
  const release = () => {
    if (!grab || done) return;
    hiss && hiss.stop();
    const L = Math.hypot(finger.x - grab.x, finger.y - grab.y);
    if (L > diag * 0.85) {
      // Pulled far enough: the backing comes away and the sticker flips over.
      done = true;
      sound.tear();
      const nx = (finger.x - grab.x) / L, ny = (finger.y - grab.y) / L;
      animateTo({ x: grab.x + nx * diag * 2.4, y: grab.y + ny * diag * 2.4 }, 260, () => {
        holder.classList.add('flipping');
        sound.peel();
        setTimeout(() => draw(true), 170);
        setTimeout(() => { holder.classList.remove('flipping'); onPeeled && onPeeled(); }, 340);
      });
    } else {
      animateTo(grab, 220, () => { grab = null; draw(false); });
    }
  };
  c.addEventListener('pointerup', release);
  c.addEventListener('pointercancel', release);
  draw(false);
}
