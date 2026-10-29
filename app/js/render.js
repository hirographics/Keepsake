// Draws a page to a canvas for sharing and printing, from the same data the editor uses.
// Units are page units (850 x 1100 = 8.5 x 11 in); `s` is pixels per unit (3 = 300 dpi).
import { asset } from './packs.js';
import { photoUrl } from './look.js';
import { fontCss, tornPoints, photoBox } from './editor.js';
import { PAGE_W, PAGE_H } from './templates.js';

const imgCache = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise(resolve => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => resolve(null);
      i.src = src;
    }));
  }
  return imgCache.get(src);
}
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
// A repeating fill whose tile is `tile` units wide when drawn with ctx scaled by s.
function pattern(ctx, img, tileW, tileH, s, ox = 0, oy = 0) {
  const t = canvas(tileW * s, tileH * s);
  t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
  const p = ctx.createPattern(t, 'repeat');
  if (p.setTransform) p.setTransform(new DOMMatrix().translate(ox, oy).scale(1 / s));
  return p;
}

export async function renderPage(page, s = 2) {
  const out = canvas(PAGE_W * s, PAGE_H * s);
  const ctx = out.getContext('2d');
  ctx.scale(s, s);
  ctx.fillStyle = '#f6eedd';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const paper = asset(page.paper);
  const pimg = paper && await loadImage(paper.url);
  if (pimg) {
    const tile = paper.tile || 300;
    ctx.fillStyle = pattern(ctx, pimg, tile, tile * pimg.naturalHeight / pimg.naturalWidth, s);
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  }
  for (const el of page.els) await drawEl(ctx, el, s);
  return out;
}

async function drawEl(ctx, el, s) {
  const cut = el.cut;
  const sheet = cut ? { W: cut.sheet.sw * el.w, H: cut.sheet.sh * el.h, ox: cut.sheet.ox * el.w, oy: cut.sheet.oy * el.h } : { W: el.w, H: el.h, ox: 0, oy: 0 };
  const h = el.type === 'text' ? el.h : sheet.H;
  // Draw the body (the whole sheet) into its own canvas, clip it, then place it with its shadow.
  const pad = 0;
  const body = canvas(sheet.W * s, h * s);
  const b = body.getContext('2d');
  b.scale(s, s);
  if (cut) {
    b.beginPath();
    cut.pts.forEach(([u, v], i) => (i ? b.lineTo : b.moveTo).call(b, u * sheet.W, v * sheet.H));
    b.closePath();
    b.clip();
  }
  const shadow = await drawBody(b, el, sheet.W, h, s);
  ctx.save();
  ctx.translate(el.x, el.y);
  ctx.rotate((el.rot || 0) * Math.PI / 180);
  ctx.translate(-el.w / 2 - sheet.ox, -(el.type === 'text' ? el.h : el.h) / 2 - sheet.oy);
  if (el.type === 'stamp') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.88 * (el.inkLevel == null ? 1 : 0.62 + 0.38 * el.inkLevel);
  }
  if (el.type === 'tape') ctx.globalAlpha = 0.84;
  const sh = cut ? { blur: 8, y: 4, a: 0.22 } : shadow;
  if (sh) {
    ctx.shadowColor = `rgba(0,0,0,${sh.a})`;
    ctx.shadowBlur = sh.blur * s;
    ctx.shadowOffsetY = sh.y * s;
  }
  ctx.drawImage(body, 0, 0, sheet.W, h);
  ctx.restore();
}

async function drawBody(b, el, W, H, s) {
  const a = el.ref ? asset(el.ref) : null;
  if (el.type === 'paper') {
    const img = a && await loadImage(a.url);
    b.fillStyle = '#f6eedd';
    b.fillRect(0, 0, W, H);
    if (img) { const t = a.tile || 300; b.fillStyle = pattern(b, img, t, t * img.naturalHeight / img.naturalWidth, s); b.fillRect(0, 0, W, H); }
    return { blur: 4, y: 2, a: 0.18 };
  }
  if (el.type === 'tape') {
    const img = a && await loadImage(a.url);
    b.beginPath();
    tornPoints(el.id).forEach(([x, y], i) => (i ? b.lineTo : b.moveTo).call(b, x / 100 * W, y / 100 * H));
    b.closePath();
    b.clip();
    if (img) { const tw = H * img.naturalWidth / img.naturalHeight; b.fillStyle = pattern(b, img, tw, H, s); b.fillRect(0, 0, W, H); }
    if (el.holo) { b.save(); b.globalCompositeOperation = 'multiply'; b.globalAlpha = 0.68; b.fillStyle = holoGradient(b, W, H, el); b.fillRect(0, 0, W, H); b.restore(); }
    return null;
  }
  if (el.type === 'sticker') {
    const img = a && await loadImage(a.url);
    if (!img) return null;
    // White edge: a white silhouette drawn around the sticker, then the sticker on top.
    const sil = canvas(W * s, H * s);
    const sc = sil.getContext('2d');
    sc.drawImage(img, 0, 0, sil.width, sil.height);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#fff';
    sc.fillRect(0, 0, sil.width, sil.height);
    const r = 4;
    for (let k = 0; k < 12; k++) { const t = k / 12 * 2 * Math.PI; b.drawImage(sil, r * Math.cos(t), r * Math.sin(t), W, H); }
    b.drawImage(img, 0, 0, W, H);
    if (el.holo) {
      const sheen = canvas(W * s, H * s), g = sheen.getContext('2d');
      g.fillStyle = holoGradient(g, W * s, H * s, el);
      g.fillRect(0, 0, sheen.width, sheen.height);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(img, 0, 0, sheen.width, sheen.height);
      b.save(); b.globalCompositeOperation = 'multiply'; b.globalAlpha = 0.68; b.drawImage(sheen, 0, 0, W, H); b.restore();
    }
    return { blur: 5, y: 4, a: 0.22 };
  }
  if (el.type === 'stamp') {
    const img = a && await loadImage(a.url);
    const noise = await loadImage('img/ink-noise.png');
    if (!img) return null;
    b.fillStyle = el.ink || '#b5322c';
    b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'destination-in';
    b.drawImage(img, 0, 0, W, H);
    if (noise) {
      const seed = el.inkSeed || 0;
      b.fillStyle = pattern(b, noise, 130, 130, s, (seed * 37) % 130, (seed * 61) % 130);
      b.fillRect(0, 0, W, H);
    }
    b.globalCompositeOperation = 'source-over';
    return null;
  }
  if (el.type === 'text') {
    b.fillStyle = el.color || '#3a2e2a';
    b.font = `${el.size}px ${fontCss(el.font)}`;
    b.textBaseline = 'middle';
    const align = el.align || 'center';
    b.textAlign = align;
    const lh = el.size * 1.12;
    const x = align === 'left' ? 0 : align === 'right' ? W : W / 2;
    wrap(b, el.text || '', W).forEach((line, i) => b.fillText(line, x, i * lh + lh / 2));
    return null;
  }
  if (el.type === 'photo') {
    const frame = el.frame || 'polaroid';
    const p = frame === 'polaroid' ? [0.05, 0.05, 0.17] : frame === 'border' ? [0.045, 0.045, 0.045] : [0, 0, 0];
    const side = p[0] * W, top = p[1] * W, bottom = p[2] * W;
    if (frame !== 'none') { b.fillStyle = '#fffdf8'; b.fillRect(0, 0, W, H); }
    const wx = side, wy = top, ww = W - side * 2, wh = H - top - bottom;
    const src = await photoUrl(el);
    const img = src && await loadImage(src);
    if (img) {
      const box = photoBox(ww, wh, img.naturalWidth, img.naturalHeight, el.crop);
      b.save();
      b.beginPath(); b.rect(wx, wy, ww, wh); b.clip();
      b.drawImage(img, wx + box.left, wy + box.top, box.dw, box.dh);
      b.restore();
    } else {
      b.fillStyle = '#efe9df';
      b.fillRect(wx, wy, ww, wh);
      b.setLineDash([9, 7]);
      b.strokeStyle = 'rgba(58,46,42,.35)';
      b.lineWidth = 3;
      b.strokeRect(wx + 10, wy + 10, ww - 20, wh - 20);
      b.setLineDash([]);
      const fs = Math.max(22, Math.min(el.w, el.h) * 0.085);
      b.font = `${fs}px ${fontCss('caveat')}`;
      b.fillStyle = 'rgba(58,46,42,.7)';
      b.textAlign = 'center';
      b.textBaseline = 'middle';
      wrap(b, el.prompt || 'Add a photo', ww * 0.8).forEach((line, i, all) => b.fillText(line, wx + ww / 2, wy + wh / 2 + (i - (all.length - 1) / 2) * fs * 1.05));
    }
    return frame === 'none' ? null : { blur: 14, y: 6, a: 0.2 };
  }
  return null;
}

// The holo sheen: soft pink, sky, mint and butter bands at an angle, offset by where the piece sits.
function holoGradient(g, W, H, el) {
  const shift = (((el.x || 0) + (el.y || 0)) % 200) / 200;
  const gr = g.createLinearGradient(-W * shift, 0, W * (1.6 - shift), H);
  const bands = ['#ffc4e4', '#ff9fd2', '#9fdcff', '#aef0b4', '#ffe98a', '#ffb0da', '#bcd3ff'];
  bands.forEach((c, i) => gr.addColorStop(i / (bands.length - 1), c));
  return gr;
}

// Breaks text into lines that fit `width`, keeping the line breaks someone typed.
export function wrap(ctx, text, width) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (line && ctx.measureText(test.trimEnd()).width > width) { lines.push(line.trimEnd()); line = word.trimStart(); }
      else line = test;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export const toBlob = (c, type = 'image/jpeg', q = 0.92) => new Promise(r => c.toBlob(r, type, q));

// A print-ready PDF: one 8.5 x 11 in page per book page, each a full-bleed JPEG.
export async function makePdf(jpegs) {
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = chunk => { const u = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(u); length += u.length; };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = jpegs.length;
  // 1 catalog, 2 pages, then per page: page, content, image
  const kids = jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  for (let i = 0; i < n; i++) {
    const { bytes, w, h } = jpegs[i];
    const p = 3 + i * 3;
    const draw = `q 612 0 0 792 0 0 cm /Im${i} Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im${i} ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`));
    obj(p + 1, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    obj(p + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`); push(bytes); push('\nendstream'); });
  }
  const xref = length;
  const count = 3 + n * 3;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let k = 1; k < count; k++) table += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
  push(table + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

export async function bookPdf(book, onProgress) {
  const jpegs = [];
  for (let i = 0; i < book.pages.length; i++) {
    onProgress && onProgress(i, book.pages.length);
    const c = await renderPage(book.pages[i], 3);
    const blob = await toBlob(c, 'image/jpeg', 0.9);
    jpegs.push({ bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
  }
  return makePdf(jpegs);
}
