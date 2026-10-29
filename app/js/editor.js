// The page editor: draws one page and handles touch.
// One finger moves a piece. The round corner handle turns and resizes it.
// Two fingers pinch to resize and turn. Tap a selected piece to edit it.
import { asset } from './packs.js';
import { uid } from './db.js';
import { photoUrl } from './look.js';
import { PAGE_W, PAGE_H } from './templates.js';

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
export function tornPoints(id) {
  const r = seeded(id);
  const n = 7;
  const left = [], right = [];
  for (let i = 0; i <= n; i++) {
    const y = (i / n) * 100;
    left.push([r() * 2.2, y]);
    right.push([100 - r() * 2.2, 100 - y]);
  }
  return [...left, ...right];
}
function tornClip(id) {
  return `polygon(${tornPoints(id).map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(1)}%`).join(',')})`;
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
      b.style.clipPath = b.style.webkitClipPath = tornClip(el.id);
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
    return n;
  }

  fillInk(ink, el, a) {
    if (a) {
      // Two masks: the stamp's shape, then a blotchy texture so the ink lands unevenly.
      const s = el.inkSeed || 0;
      ink.style.webkitMaskImage = ink.style.maskImage = `url(${a.url}), url(img/ink-noise.png)`;
      ink.style.webkitMaskPosition = ink.style.maskPosition = `0 0, ${(s * 37) % 100}% ${(s * 61) % 100}%`;
    }
    ink.style.backgroundColor = el.ink || '#b5322c';
    ink.style.opacity = el.inkLevel == null ? 1 : 0.62 + 0.38 * el.inkLevel;
  }

  applyCut(n, el) {
    const b = n.firstChild;
    n.classList.toggle('is-cut', !!el.cut);
    if (!el.cut) { b.style.clipPath = b.style.webkitClipPath = el.type === 'tape' ? tornClip(el.id) : ''; return; }
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
  }

  placeSel() {
    const el = this.selEl;
    const s = this.selNode;
    if (!el || !this.scale || this.mode) { s.style.display = 'none'; return; }
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
        this.gesture = { mode: 'drag', el, start: this.pt(e), orig: { ...el }, wasSelected, moved: false, before: this.snap() };
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
    if (g.mode === 'drag') {
      if (Math.hypot(e.clientX - p0.sx, e.clientY - p0.sy) > 6) g.moved = true;
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
