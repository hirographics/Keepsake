// The page editor: draws one page and handles touch.
// One finger moves a piece. The round corner handle turns and resizes it.
// Two fingers pinch to resize and turn. Tap a selected piece to edit it.
import { asset } from './packs.js';
import { uid } from './db.js';
import { photoUrl } from './look.js';
import { PAGE_W, PAGE_H } from './templates.js';
import { sound } from './audio.js';
import { tried } from './tried.js';

export const FONTS = [
  { id: 'caveat', name: 'Caveat', css: "'Caveat', cursive" },
  { id: 'patrick-hand', name: 'Patrick Hand', css: "'Patrick Hand', cursive" },
  { id: 'indie-flower', name: 'Indie Flower', css: "'Indie Flower', cursive" },
  { id: 'gloria-hallelujah', name: 'Gloria', css: "'Gloria Hallelujah', cursive" },
  { id: 'reenie-beanie', name: 'Reenie Beanie', css: "'Reenie Beanie', cursive" },
  { id: 'homemade-apple', name: 'Homemade Apple', css: "'Homemade Apple', cursive" },
  { id: 'permanent-marker', name: 'Marker', css: "'Permanent Marker', cursive" },
  { id: 'special-elite', name: 'Typewriter', css: "'Special Elite', monospace" },
];
export const fontCss = id => (FONTS.find(f => f.id === id) || FONTS[0]).css;

const MIN = 36; // smallest a piece can get, in page units

// Same id, same torn ends, every time.
function seeded(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}
// Torn tape ends as points in percent of the strip (shared with the print renderer).
// The far end depends on how the tape was let go: 'clean' is a neat tear, 'rag' a ripped,
// uneven one from a quick flick. Older tape keeps the small torn ends it always had.
export function tornPoints(el) {
  const id = typeof el === 'string' ? el : el.id;
  const end = typeof el === 'string' ? null : el.end;
  const w = (typeof el === 'string' ? 0 : el.w) || 200;
  const r = seeded(id);
  const n = 7;
  const left = [], right = [];
  for (let i = 0; i <= n; i++) left.push([r() * 2.2, (i / n) * 100]);
  if (end === 'clean') {
    right.push([100 - 0.4, 100], [100, 0]);
  } else if (end === 'rag') {
    // About 16 units of ragged bite, with a few deeper notches.
    const m = 13, depth = Math.min(30, 1600 / w);
    for (let i = 0; i <= m; i++) {
      const deep = r() < 0.25 ? 1 : 0.45;
      right.push([100 - r() * depth * deep, 100 - (i / m) * 100]);
    }
  } else {
    for (let i = 0; i <= n; i++) right.push([100 - r() * 2.2, 100 - (i / n) * 100]);
  }
  return [...left, ...right];
}
function tornClip(el) {
  return `polygon(${tornPoints(el).map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(1)}%`).join(',')})`;
}

// The fold for a curled sticker corner, in the piece's own units (0..w, 0..h).
// The corner is the corner of the art itself (`box`, fractions of the piece), not of its
// see-through margin, so the fold always bites into the sticker.
// keep: the piece minus the folded part. tri: the folded part. m: the CSS matrix that mirrors
// it over the fold line, so it lies on top showing the sticker's back.
function halfPlane(poly, A, B, sgn) {
  const nx = -(B[1] - A[1]), ny = B[0] - A[0];
  const side = q => ((q[0] - A[0]) * nx + (q[1] - A[1]) * ny) * sgn;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = side(p), sq = side(q);
    if (sp >= 0) out.push(p);
    if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out;
}
export function curlGeometry(el) {
  const { w, h } = el, d = el.curl.d, c = el.curl.c, bx = el.curl.box || [0, 0, 1, 1];
  const X0 = bx[0] * w, Y0 = bx[1] * h, X1 = bx[2] * w, Y1 = bx[3] * h;
  let A, B, C;
  if (c === 'tl') { C = [X0, Y0]; A = [X0 + d, Y0]; B = [X0, Y0 + d]; }
  if (c === 'tr') { C = [X1, Y0]; A = [X1 - d, Y0]; B = [X1, Y0 + d]; }
  if (c === 'bl') { C = [X0, Y1]; A = [X0, Y1 - d]; B = [X0 + d, Y1]; }
  if (c === 'br') { C = [X1, Y1]; A = [X1, Y1 - d]; B = [X1 - d, Y1]; }
  const rect = [[0, 0], [w, 0], [w, h], [0, h]];
  const nx = -(B[1] - A[1]), ny = B[0] - A[0];
  const cs = Math.sign((C[0] - A[0]) * nx + (C[1] - A[1]) * ny) || 1;
  const tri = halfPlane(rect, A, B, cs), keep = halfPlane(rect, A, B, -cs);
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L;
  const r11 = 2 * ux * ux - 1, r12 = 2 * ux * uy, r22 = 2 * uy * uy - 1;
  const tx = A[0] - (r11 * A[0] + r12 * A[1]), ty = A[1] - (r12 * A[0] + r22 * A[1]);
  const shadeAngle = Math.atan2((X0 + X1) / 2 - C[0], -((Y0 + Y1) / 2 - C[1])) * 180 / Math.PI;
  return { keep, tri, C, m: [r11, r12, r12, r22, tx, ty], shadeAngle };
}

// Where the art actually is inside a sticker image, as fractions: [x0, y0, x1, y1].
const boxes = new Map();
export function artBox(img) {
  if (!img || !img.naturalWidth) return [0, 0, 1, 1];
  if (boxes.has(img.src)) return boxes.get(img.src);
  const N = 64, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, N, N);
  const d = g.getImageData(0, 0, N, N).data;
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (d[(y * N + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1); }
  const box = x1 > x0 ? [x0 / N, y0 / N, x1 / N, y1 / N] : [0, 0, 1, 1];
  boxes.set(img.src, box);
  return box;
}

const CAMERA_ICON = '<svg viewBox="0 0 24 24" width="22%" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';

export class Editor {
  constructor(host, book, { onChange, onTapSelected, onSelect }) {
    this.host = host;
    this.book = book;
    this.pageIndex = 0;
    this.sel = null;
    this.onChange = onChange;
    this.onTapSelected = onTapSelected;
    this.onSelect = onSelect;
    this.undoStack = [];
    this.redoStack = [];
    this.pointers = new Map();
    this.gesture = null;
    this.nodes = new Map();
    this.mode = null;
    this.build();
  }

  get page() { return this.book.pages[this.pageIndex]; }
  get selEl() { return this.page.els.find(e => e.id === this.sel) || null; }

  build() {
    this.host.innerHTML = '';
    this.stage = document.createElement('div');
    this.stage.className = 'stage';
    this.wrap = document.createElement('div');
    this.wrap.className = 'page-wrap';
    this.pageNode = document.createElement('div');
    this.pageNode.className = 'page';
    this.pageNode.style.width = PAGE_W + 'px';
    this.pageNode.style.height = PAGE_H + 'px';
    this.layer = document.createElement('div');
    this.layer.className = 'layer';
    this.selNode = document.createElement('div');
    this.selNode.className = 'sel';
    this.selNode.innerHTML = '<div class="h h-del" data-h="del">✕</div><div class="h h-turn" data-h="turn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/></svg></div>';
    this.fx = document.createElement('div');
    this.fx.className = 'fx';
    this.pageNode.append(this.layer, this.fx, this.selNode);
    this.wrap.append(this.pageNode);
    this.stage.append(this.wrap);
    this.host.append(this.stage);

    const s = this.stage;
    s.addEventListener('pointerdown', e => this.down(e));
    s.addEventListener('pointermove', e => this.move(e));
    s.addEventListener('pointerup', e => this.up(e));
    s.addEventListener('pointercancel', e => this.up(e));
    // Stop iOS from scrolling or zooming the page under a gesture.
    s.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    s.addEventListener('gesturestart', e => e.preventDefault());

    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.stage);
    this.render();
  }

  destroy() { this.ro.disconnect(); }

  fit() {
    const pad = 22;
    const w = this.stage.clientWidth - pad * 2;
    const h = this.stage.clientHeight - pad * 2;
    if (w <= 0 || h <= 0) return;
    this.scale = Math.min(w / PAGE_W, h / PAGE_H);
    this.wrap.style.width = PAGE_W * this.scale + 'px';
    this.wrap.style.height = PAGE_H * this.scale + 'px';
    this.pageNode.style.transform = `scale(${this.scale})`;
    this.placeSel();
  }

  // ---------- drawing ----------
  // Each piece is an outer box (position, turn, shadow) holding a body (the art).
  // A cut piece keeps its whole sheet in the body; the body is clipped to the cut shape
  // and shifted so only the kept part sits inside the outer box.
  render() {
    const pg = this.page;
    const paper = asset(pg.paper);
    this.pageNode.style.backgroundImage = paper ? `url(${paper.url})` : 'none';
    this.pageNode.style.backgroundSize = paper ? `${paper.tile || 300}px` : '';
    this.layer.innerHTML = '';
    this.nodes.clear();
    this.lifted = null; // a redraw lets any lifted photo fall back
    for (const el of pg.els) {
      const n = this.makeNode(el);
      if (el.id === this.sel) n.classList.add('selected');
      this.layer.append(n);
      this.nodes.set(el.id, n);
      this.place(n, el);
    }
    this.measureTexts();
    this.placeSel();
  }

  measureTexts() {
    for (const el of this.page.els) {
      if (el.type !== 'text') continue;
      const n = this.nodes.get(el.id);
      const h = Math.max(n.firstChild.offsetHeight, el.size * 0.9);
      if (Math.abs(h - el.h) > 0.5) { el.h = h; this.place(n, el); }
    }
  }

  makeNode(el) {
    const n = document.createElement('div');
    n.className = 'el t-' + el.type;
    n.dataset.id = el.id;
    const b = document.createElement('div');
    b.className = 'b el-' + el.type;
    n.append(b);
    const a = el.ref ? asset(el.ref) : null;
    if (el.type === 'sticker') {
      const img = document.createElement('img');
      img.src = a ? a.url : '';
      img.draggable = false;
      img.alt = '';
      b.append(img);
      if (el.holo && a) {
        const sh = document.createElement('div');
        sh.className = 'holo-sheen';
        sh.style.webkitMaskImage = sh.style.maskImage = `url(${a.url})`;
        b.append(sh);
      }
    } else if (el.type === 'stamp') {
      const ink = document.createElement('div');
      ink.className = 'ink';
      this.fillInk(ink, el, a);
      b.append(ink);
    } else if (el.type === 'tape') {
      b.style.backgroundImage = a ? `url(${a.url})` : '';
      b.style.clipPath = b.style.webkitClipPath = tornClip(el);
      if (el.holo) { const sh = document.createElement('div'); sh.className = 'holo-sheen'; b.append(sh); }
    } else if (el.type === 'paper') {
      b.style.backgroundImage = a ? `url(${a.url})` : '';
      b.style.backgroundSize = `${(a && a.tile) || 300}px`;
    } else if (el.type === 'text') {
      b.classList.add('txt');
      this.fillText(b, el);
    } else if (el.type === 'photo') {
      b.classList.add('frame-' + (el.frame || 'polaroid'));
      const win = document.createElement('div');
      win.className = 'win';
      b.append(win);
      this.fillPhoto(win, el);
    }
    this.applyCut(n, el);
    if (el.type === 'sticker' && el.curl && !el.cut) this.applyCurl(n, el);
    return n;
  }

  // ---------- a curled sticker corner ----------
  // The corner is folded back along a line across it. The sticker loses that triangle, and the
  // triangle shows again, mirrored over the fold, as the white back of the sticker.
  applyCurl(n, el) {
    const b = n.firstChild;
    let flap = n.querySelector(':scope > .curl-flap');
    if (!el.curl || el.cut || el.curl.d < 2) {
      flap && flap.remove();
      if (!el.cut) b.style.clipPath = b.style.webkitClipPath = '';
      return;
    }
    const g = curlGeometry(el);
    const pc = q => q.map(([x, y]) => `${(x / el.w * 100).toFixed(2)}% ${(y / el.h * 100).toFixed(2)}%`).join(',');
    b.style.clipPath = b.style.webkitClipPath = `polygon(${pc(g.keep)})`;
    if (!flap) {
      flap = document.createElement('div');
      flap.className = 'curl-flap';
      const back = document.createElement('div');
      back.className = 'curl-back';
      const a = asset(el.ref);
      back.style.webkitMaskImage = back.style.maskImage = a ? `url(${a.url})` : '';
      flap.append(back);
      n.append(flap);
    }
    flap.style.transform = `matrix(${g.m.map(v => v.toFixed(4)).join(',')})`;
    const back = flap.firstChild;
    back.style.clipPath = back.style.webkitClipPath = `polygon(${pc(g.tri)})`;
    back.style.setProperty('--fold', `${g.shadeAngle}deg`);
  }

  // ---------- torn paper and inked edges, drawn over the body ----------
  drawFiber(el) {
    const n = this.nodes.get(el.id);
    if (!n) return;
    const b = n.firstChild;
    let svg = b.querySelector(':scope > .fiber');
    const f = el.cut && el.cut.fiber;
    if (!f) { svg && svg.remove(); return; }
    const W = el.cut.sheet.sw * el.w, H = el.cut.sheet.sh * el.h;
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'fiber');
      svg.innerHTML = '<polyline fill="none" stroke="#fffdf6" stroke-linejoin="round" stroke-width="9" stroke-opacity=".55"/><polyline fill="none" stroke="#fffefa" stroke-linejoin="round" stroke-width="4.5"/>';
      b.append(svg);
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const pts = f.map(([u, v]) => `${(u * W).toFixed(1)},${(v * H).toFixed(1)}`).join(' ');
    for (const p of svg.children) p.setAttribute('points', pts);
  }

  // ---------- hinged photos ----------
  // A photo held only by tape along its top edge can be lifted like a flap.
  isHinged(el) {
    if (el.type !== 'photo') return false;
    const t = (el.rot || 0) * Math.PI / 180;
    const tapes = this.page.els.filter(e => e.type === 'tape' && e !== el && Math.hypot(e.x - el.x, e.y - el.y) < (el.w + el.h + e.w) / 2);
    let any = false;
    for (const tp of tapes) {
      const dx = tp.x - el.x, dy = tp.y - el.y;
      const lx = dx * Math.cos(t) + dy * Math.sin(t), ly = -dx * Math.sin(t) + dy * Math.cos(t);
      const reach = tp.w / 2 + tp.h / 2;
      const touches = Math.abs(lx) < el.w / 2 + reach && Math.abs(ly) < el.h / 2 + tp.h;
      if (!touches) continue;
      if (ly > -el.h / 2 + el.h * 0.22) return false; // tape lower down: it is stuck, not hinged
      any = true;
    }
    return any;
  }
  setLift(el, a, animate) {
    const n = this.nodes.get(el.id);
    if (!n) return;
    const b = n.firstChild;
    b.style.transition = animate ? 'transform .35s cubic-bezier(.3,.8,.3,1)' : 'none';
    b.style.transformOrigin = '50% 0';
    b.style.transform = a ? `perspective(1600px) rotateX(${a}deg)` : '';
    b.classList.toggle('flipped', a > 90);
    n.classList.toggle('lifted', a > 0);
    let note = this.layer.querySelector(`.flap-note[data-for="${el.id}"]`);
    if (a > 0 && !note) {
      note = document.createElement('div');
      note.className = 'flap-note';
      note.dataset.for = el.id;
      this.layer.insertBefore(note, n);
    }
    if (note) {
      note.style.left = el.x - el.w / 2 + 'px'; note.style.top = el.y - el.h / 2 + 'px';
      note.style.width = el.w + 'px'; note.style.height = el.h + 'px';
      note.style.transform = `rotate(${el.rot || 0}deg)`;
      note.textContent = el.note || 'Tap to write something only lifters will see.';
      note.classList.toggle('empty', !el.note);
      note.style.fontSize = Math.max(26, Math.min(el.w, el.h) * 0.09) + 'px';
      if (!a) setTimeout(() => { if (!this.lifted || this.lifted.id !== el.id) note.remove(); }, animate ? 360 : 0);
    }
    this.lifted = a > 0 ? { id: el.id, a } : null;
    this.placeSel();
  }

  // Ink rubbed along a paper or photo edge: soft strokes along the outline, clipped to the piece.
  drawEdgeInk(el) {
    const n = this.nodes.get(el.id);
    if (!n) return;
    const b = n.firstChild;
    let svg = b.querySelector(':scope > .edge-ink');
    if (!el.edgeInk) { svg && svg.remove(); return; }
    const W = el.cut ? el.cut.sheet.sw * el.w : el.w, H = el.cut ? el.cut.sheet.sh * el.h : el.h;
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'edge-ink');
      b.append(svg);
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // Each short stretch of edge gets its own strength, so the ink sits only where it was rubbed.
    const { pts, a, c } = el.edgeInk;
    if (!pts) { svg.remove(); return; }
    let out = '';
    for (let j = 0; j < pts.length; j++) {
      const k = (j + 1) % pts.length, o = (a[j] + a[k]) / 2;
      if (o < 0.02) continue;
      const [x1, y1, x2, y2] = [pts[j][0] * W, pts[j][1] * H, pts[k][0] * W, pts[k][1] * H].map(v => v.toFixed(1));
      for (const [w, op] of [[30, 0.16], [18, 0.24], [8, 0.36]]) out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-opacity="${(op * o).toFixed(3)}"/>`;
    }
    svg.innerHTML = out;
  }

  fillInk(ink, el, a) {
    if (a) {
      // Two masks: the stamp's shape, then a blotchy texture so the ink lands unevenly.
      const s = el.inkSeed || 0;
      ink.style.webkitMaskImage = ink.style.maskImage = `url(${a.url}), url(img/ink-noise.png)`;
      ink.style.webkitMaskPosition = ink.style.maskPosition = `0 0, ${(s * 37) % 100}% ${(s * 61) % 100}%`;
    }
    ink.style.background = el.ink2 ? `linear-gradient(100deg, ${el.ink} 0 38%, ${el.ink2} 62% 100%)` : (el.ink || '#b5322c');
    ink.style.opacity = el.inkLevel == null ? 1 : 0.62 + 0.38 * el.inkLevel;
  }

  applyCut(n, el) {
    const b = n.firstChild;
    n.classList.toggle('is-cut', !!el.cut);
    if (!el.cut) { b.style.clipPath = b.style.webkitClipPath = el.type === 'tape' ? tornClip(el) : ''; return; }
    const pts = el.cut.pts.map(([u, v]) => `${(u * 100).toFixed(2)}% ${(v * 100).toFixed(2)}%`).join(',');
    b.style.clipPath = b.style.webkitClipPath = `polygon(${pts})`;
  }

  fillText(t, el) {
    t.textContent = el.text;
    t.style.fontFamily = fontCss(el.font);
    t.style.fontSize = el.size + 'px';
    t.style.color = el.color;
    t.style.textAlign = el.align || 'center';
  }

  async fillPhoto(win, el) {
    win.innerHTML = '';
    win.classList.toggle('empty', !el.blob);
    if (!el.blob) {
      const p = document.createElement('div');
      p.className = 'prompt';
      p.innerHTML = CAMERA_ICON;
      const t = document.createElement('div');
      t.textContent = el.prompt || 'Add a photo';
      t.style.fontSize = Math.max(22, Math.min(el.w, el.h) * 0.085) + 'px';
      p.append(t);
      win.append(p);
      return;
    }
    const img = document.createElement('img');
    img.className = 'main';
    img.draggable = false;
    img.alt = '';
    win.append(img);
    win.classList.add('developing');
    img.onload = () => { win.classList.remove('developing'); fitPhoto(win, el); };
    img.src = await photoUrl(el);
  }

  place(n, el) {
    n.style.left = el.x - el.w / 2 + 'px';
    n.style.top = el.y - el.h / 2 + 'px';
    n.style.width = el.w + 'px';
    n.style.height = el.type === 'text' ? 'auto' : el.h + 'px';
    n.style.transform = `rotate(${el.rot || 0}deg)`;
    if (el.holo) n.style.setProperty('--hue', `${((el.x + el.y) * 0.45 + (el.rot || 0) * 3) % 360}deg`); // the sheen shifts as the piece moves
    const b = n.firstChild;
    if (el.cut) {
      const s = el.cut.sheet;
      b.style.left = -s.ox * el.w + 'px';
      b.style.top = -s.oy * el.h + 'px';
      b.style.width = s.sw * el.w + 'px';
      b.style.height = s.sh * el.h + 'px';
      b.style.setProperty('--w', s.sw * el.w + 'px');
    } else {
      b.style.left = b.style.top = b.style.width = b.style.height = '';
      b.style.setProperty('--w', el.w + 'px');
    }
    if (el.type === 'photo' && el.blob) fitPhoto(b.firstChild, el);
    if (el.edgeInk) this.drawEdgeInk(el);
    if (el.cut && el.cut.fiber) this.drawFiber(el);
    if (el.type === 'sticker' && el.curl) this.applyCurl(n, el);
  }

  placeSel() {
    const el = this.selEl;
    const s = this.selNode;
    if (!el || !this.scale || this.mode || this.lifted) { s.style.display = 'none'; return; }
    s.style.display = 'block';
    const pad = 8 / this.scale;
    s.style.left = el.x - el.w / 2 - pad + 'px';
    s.style.top = el.y - el.h / 2 - pad + 'px';
    s.style.width = el.w + pad * 2 + 'px';
    s.style.height = el.h + pad * 2 + 'px';
    s.style.transform = `rotate(${el.rot || 0}deg)`;
    s.style.setProperty('--k', 1 / this.scale);
  }

  refresh(el) {
    const n = this.nodes.get(el.id);
    if (!n) return;
    const b = n.firstChild;
    if (el.type === 'text') {
      this.fillText(b, el);
      this.measureTexts();
    }
    if (el.type === 'photo') {
      b.className = 'b el-photo frame-' + (el.frame || 'polaroid');
      this.fillPhoto(b.firstChild, el);
    }
    if (el.type === 'stamp') this.fillInk(b.firstChild, el, asset(el.ref));
    this.applyCut(n, el);
    this.place(n, el);
    this.placeSel();
  }

  select(id) {
    this.sel = id;
    for (const [nid, n] of this.nodes) n.classList.toggle('selected', nid === id);
    this.placeSel();
    this.onSelect && this.onSelect(this.selEl);
  }

  // Applies a big change (like a new layout) and lets every piece glide to its new spot.
  glide(fn) {
    const before = this.snap();
    fn();
    this.sel = null;
    this.onSelect && this.onSelect(null);
    this.commit(before);
    this.layer.classList.add('glide');
    for (const el of this.page.els) {
      const n = this.nodes.get(el.id);
      if (!n) continue;
      if (el.type === 'text') this.fillText(n.firstChild, el);
      if (el.type === 'photo') n.firstChild.className = 'b el-photo frame-' + (el.frame || 'polaroid');
      this.place(n, el);
    }
    this.placeSel();
    setTimeout(() => { this.layer.classList.remove('glide'); this.render(); }, 520);
  }

  // A tool takes over the page's touches until it is put down.
  setMode(mode) {
    if (this.mode && this.mode.exit) this.mode.exit();
    this.mode = mode;
    this.fx.innerHTML = '';
    this.stage.classList.toggle('in-mode', !!mode);
    if (mode && mode.enter) mode.enter(this);
    this.placeSel();
  }

  // ---------- touch ----------
  pt(e) {
    const r = this.pageNode.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.scale, y: (e.clientY - r.top) / this.scale };
  }

  down(e) {
    this.stage.setPointerCapture(e.pointerId);
    if (this.mode) { this.mode.down && this.mode.down(e, this.pt(e)); return; }
    // A lifted photo: tap the note under it to write, tap anywhere else to let it fall back.
    if (this.lifted && this.pointers.size === 0) {
      const le = this.page.els.find(x => x.id === this.lifted.id);
      if (le && e.target.closest('.flap-note')) { this.onFlapNote && this.onFlapNote(le); return; }
      if (le) { this.setLift(le, 0, true); sound.pat(); return; }
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.pointers.size === 1) {
      const handle = e.target.closest('[data-h]');
      if (handle && this.selEl) {
        if (handle.dataset.h === 'del') { this.deleteSelected(); this.gesture = null; return; }
        const el = this.selEl;
        const p = this.pt(e);
        this.gesture = { mode: 'turn', el, v0: { x: p.x - el.x, y: p.y - el.y }, orig: { ...el }, before: this.snap() };
        return;
      }
      const node = e.target.closest('.el');
      if (node) {
        const id = node.dataset.id;
        const wasSelected = this.sel === id;
        this.select(id);
        const el = this.selEl;
        const g = this.gesture = { mode: 'drag', el, start: this.pt(e), orig: { ...el }, wasSelected, moved: false, before: this.snap() };
        // Hold still for a moment on a sticker corner, or the bottom edge of a hinged photo,
        // and you get hold of the paper itself instead of moving the piece.
        const hold = this.holdTarget(el, g.start);
        if (hold) g.holdTimer = setTimeout(() => {
          if (this.gesture !== g || g.moved) return;
          g.mode = hold.type; g.hold = hold; g.moved = false;
          this.selNode.style.display = 'none';
          if (navigator.vibrate) navigator.vibrate(8);
          sound.peel();
          if (hold.type === 'curl') g.d0 = (el.curl && el.curl.c === hold.corner) ? el.curl.d : 0;
        }, 380);
      } else {
        this.select(null);
        this.gesture = null;
      }
    } else if (this.pointers.size === 2 && this.selEl) {
      const el = this.selEl;
      const [a, b] = [...this.pointers.values()];
      const before = this.gesture ? this.gesture.before : this.snap();
      const pa = this.clientToPage(a), pb = this.clientToPage(b);
      this.gesture = {
        mode: 'pinch', el, before, orig: { ...el },
        d0: Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1,
        a0: Math.atan2(pb.y - pa.y, pb.x - pa.x),
        m0: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
      };
    }
  }

  // Where a hold can grab: a sticker's corner, or the bottom of a photo that is hinged at the top.
  holdTarget(el, p) {
    const t = (el.rot || 0) * Math.PI / 180, dx = p.x - el.x, dy = p.y - el.y;
    const lx = dx * Math.cos(t) + dy * Math.sin(t), ly = -dx * Math.sin(t) + dy * Math.cos(t);
    if (el.type === 'sticker' && !el.cut) {
      const img = this.nodes.get(el.id)?.querySelector('img');
      const box = artBox(img);
      const X0 = (box[0] - 0.5) * el.w, X1 = (box[2] - 0.5) * el.w, Y0 = (box[1] - 0.5) * el.h, Y1 = (box[3] - 0.5) * el.h;
      const r = Math.min(X1 - X0, Y1 - Y0) * 0.32;
      for (const c of ['tl', 'tr', 'bl', 'br']) {
        const cx = c[1] === 'l' ? X0 : X1, cy = c[0] === 't' ? Y0 : Y1;
        if (Math.abs(lx - cx) < r && Math.abs(ly - cy) < r) return { type: 'curl', corner: c, box };
      }
    }
    if (el.type === 'photo' && ly > el.h / 2 - el.h * 0.24 && this.isHinged(el)) return { type: 'lift', ly0: ly };
    return null;
  }
  localOf(el, p) {
    const t = (el.rot || 0) * Math.PI / 180, dx = p.x - el.x, dy = p.y - el.y;
    return { x: dx * Math.cos(t) + dy * Math.sin(t), y: -dx * Math.sin(t) + dy * Math.cos(t) };
  }

  clientToPage(c) {
    const r = this.pageNode.getBoundingClientRect();
    return { x: (c.x - r.left) / this.scale, y: (c.y - r.top) / this.scale };
  }

  move(e) {
    if (this.mode) { this.mode.move && this.mode.move(e, this.pt(e)); return; }
    const p0 = this.pointers.get(e.pointerId);
    if (!p0) return;
    p0.x = e.clientX; p0.y = e.clientY;
    const g = this.gesture;
    if (!g) return;
    const el = g.el;
    if (g.mode === 'curl') {
      // Drag the corner in toward the middle: it folds back, further the further you go.
      const lp = this.localOf(el, this.pt(e)), c = g.hold.corner, bx = g.hold.box;
      const sx = c[1] === 'l' ? -1 : 1, sy = c[0] === 't' ? -1 : 1;
      const cx = ((c[1] === 'l' ? bx[0] : bx[2]) - 0.5) * el.w, cy = ((c[0] === 't' ? bx[1] : bx[3]) - 0.5) * el.h;
      const proj = ((cx - lp.x) * sx + (cy - lp.y) * sy) / Math.SQRT2;
      const d = Math.max(0, Math.min(Math.min(el.w * (bx[2] - bx[0]), el.h * (bx[3] - bx[1])) * 0.6, g.d0 + proj / Math.SQRT2 - (g.p0 ?? (g.p0 = proj / Math.SQRT2))));
      el.curl = { c, d, box: g.hold.box };
      g.moved = true;
      this.applyCurl(this.nodes.get(el.id), el);
      return;
    }
    if (g.mode === 'lift') {
      const lp = this.localOf(el, this.pt(e));
      const up = g.hold.ly0 - lp.y;
      this.setLift(el, Math.max(0, Math.min(165, up / el.h * 200)), false);
      return;
    }
    if (g.mode === 'drag') {
      if (Math.hypot(e.clientX - p0.sx, e.clientY - p0.sy) > 6) { g.moved = true; clearTimeout(g.holdTimer); }
      if (!g.moved) return;
      const p = this.pt(e);
      el.x = g.orig.x + (p.x - g.start.x);
      el.y = g.orig.y + (p.y - g.start.y);
    } else if (g.mode === 'turn') {
      const p = this.pt(e);
      const v = { x: p.x - g.orig.x, y: p.y - g.orig.y };
      const k = Math.hypot(v.x, v.y) / (Math.hypot(g.v0.x, g.v0.y) || 1);
      const da = Math.atan2(v.y, v.x) - Math.atan2(g.v0.y, g.v0.x);
      this.resize(el, g.orig, k);
      el.rot = snapAngle(g.orig.rot + da * 180 / Math.PI);
      g.moved = true;
    } else if (g.mode === 'pinch') {
      const [a, b] = [...this.pointers.values()];
      const pa = this.clientToPage(a), pb = this.clientToPage(b);
      const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
      const ang = Math.atan2(pb.y - pa.y, pb.x - pa.x);
      const m = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      this.resize(el, g.orig, d / g.d0);
      el.rot = snapAngle(g.orig.rot + (ang - g.a0) * 180 / Math.PI);
      el.x = g.orig.x + (m.x - g.m0.x);
      el.y = g.orig.y + (m.y - g.m0.y);
      g.moved = true;
    }
    const n = this.nodes.get(el.id);
    if (el.type === 'text' && g.mode !== 'drag') { n.firstChild.style.fontSize = el.size + 'px'; }
    this.place(n, el);
    if (el.type === 'text' && g.mode !== 'drag') this.measureTexts();
    this.placeSel();
  }

  resize(el, orig, k) {
    if (el.type === 'tape') {
      el.w = Math.max(MIN, orig.w * k); // tape keeps its width; only the length changes
      return;
    }
    const kMin = Math.max(MIN / orig.w, MIN / Math.max(orig.h, 1), 0.05);
    k = Math.max(k, Math.min(kMin, 1));
    el.w = orig.w * k;
    if (el.type === 'text') el.size = Math.max(14, orig.size * k);
    else el.h = orig.h * k;
  }

  up(e) {
    if (this.mode) { this.mode.up && this.mode.up(e, this.pt(e)); return; }
    this.pointers.delete(e.pointerId);
    const g = this.gesture;
    if (!g) return;
    if (g.mode === 'pinch' && this.pointers.size === 1) {
      // One finger still down after a pinch: keep holding, but do not jump.
      this.gesture = { ...g, mode: 'hold' };
      return;
    }
    if (this.pointers.size > 0) return;
    this.gesture = null;
    clearTimeout(g.holdTimer);
    if (g.mode === 'lift') {
      const a = this.lifted ? this.lifted.a : 0;
      if (a > 60) { this.setLift(g.el, 150, true); tried('flap'); sound.peel(); }
      else { this.setLift(g.el, 0, true); sound.pat(); }
      this.placeSel();
      return;
    }
    if (g.mode === 'curl') {
      if (!g.el.curl || g.el.curl.d < 6) { delete g.el.curl; this.applyCurl(this.nodes.get(g.el.id), g.el); }
      else { tried('curl'); sound.press(); }
      g.el.mine = true;
      this.commit(g.before);
      return;
    }
    if (g.moved) {
      if (g.el) g.el.mine = true; // you moved it yourself, so it counts as your own touch
      this.commit(g.before);
    } else if (g.mode === 'drag' && g.wasSelected) {
      this.onTapSelected && this.onTapSelected(g.el);
    }
  }

  // ---------- history ----------
  snap() { return JSON.stringify(this.page); }

  commit(before) {
    if (before && before !== this.snap()) {
      this.undoStack.push({ index: this.pageIndex, page: before });
      if (this.undoStack.length > 60) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    this.onChange && this.onChange(this.book);
  }

  // Wrap any change made from a sheet or button so it can be undone.
  change(fn) {
    const before = this.snap();
    fn();
    this.commit(before);
  }

  undo() { this.swap(this.undoStack, this.redoStack); }
  redo() { this.swap(this.redoStack, this.undoStack); }
  swap(from, to) {
    const item = from.pop();
    if (!item) return;
    this.pageIndex = item.index;
    to.push({ index: item.index, page: this.snap() });
    this.book.pages[item.index] = JSON.parse(item.page);
    this.sel = null;
    this.render();
    this.onSelect && this.onSelect(null);
    this.onChange && this.onChange(this.book);
  }

  // ---------- actions ----------
  add(props) {
    const el = { id: uid('e'), x: PAGE_W / 2, y: PAGE_H / 2, w: 200, h: 200, rot: Math.round((Math.random() - 0.5) * 12), cut: null, ...props };
    this.change(() => this.page.els.push(el));
    this.render();
    this.select(el.id);
    return el;
  }

  update(el, fn) {
    this.change(fn);
    this.refresh(el);
  }

  deleteSelected() {
    const el = this.selEl;
    if (!el) return;
    this.change(() => { this.page.els = this.page.els.filter(e => e !== el); });
    this.sel = null;
    this.render();
    this.onSelect && this.onSelect(null);
  }

  duplicate() {
    const el = this.selEl;
    if (!el) return;
    const copy = { ...structuredClone(el), id: uid('e'), x: el.x + 30, y: el.y + 30 };
    this.change(() => this.page.els.push(copy));
    this.render();
    this.select(copy.id);
  }

  toFront() { this.restack(1); }
  toBack() { this.restack(-1); }
  restack(dir) {
    const el = this.selEl;
    if (!el) return;
    this.change(() => {
      const rest = this.page.els.filter(e => e !== el);
      this.page.els = dir > 0 ? [...rest, el] : [el, ...rest];
    });
    this.render();
    this.select(el.id);
  }

  setPaper(ref) {
    this.change(() => { this.page.paper = ref; });
    this.render();
  }

  goPage(i) {
    if (i < 0 || i >= this.book.pages.length) return;
    this.pageIndex = i;
    this.sel = null;
    this.render();
    this.onSelect && this.onSelect(null);
  }
}

// Sizes and places a photo inside its window from its framing (crop):
// zoom 1 just covers the window; x and y say which part shows (0 = left/top edge, 1 = right/bottom).
export function photoBox(ww, wh, iw, ih, crop) {
  const c = crop || { x: 0.5, y: 0.5, zoom: 1 };
  const k = Math.max(ww / iw, wh / ih) * (c.zoom || 1);
  const dw = iw * k, dh = ih * k;
  return { dw, dh, left: (ww - dw) * c.x, top: (wh - dh) * c.y };
}
export function fitPhoto(win, el) {
  if (!win) return;
  const ww = win.offsetWidth, wh = win.offsetHeight;
  for (const img of win.querySelectorAll('img')) {
    if (!img.naturalWidth || !ww) continue;
    const b = photoBox(ww, wh, img.naturalWidth, img.naturalHeight, el.crop);
    img.style.width = b.dw + 'px'; img.style.height = b.dh + 'px';
    img.style.left = b.left + 'px'; img.style.top = b.top + 'px';
    if (img.classList.contains('main') && win.classList.contains('reframe')) {
      // While framing, the full photo shows faintly; this copy is cut back to the window.
      img.style.clipPath = `inset(${-b.top}px ${b.dw + b.left - ww}px ${b.dh + b.top - wh}px ${-b.left}px)`;
    } else img.style.clipPath = '';
  }
}

// Turning snaps to straight when close, so level pieces are easy.
function snapAngle(a) {
  a = ((a + 180) % 360 + 360) % 360 - 180;
  for (const s of [0, 90, -90, 180, -180]) if (Math.abs(a - s) < 2.5) return s;
  return a;
}
