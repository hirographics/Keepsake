// Hands-on tools: scissors and pattern scissors, paper sheets, the tape roll and the stamp.
import { uid } from './db.js';
import { asset } from './packs.js';
import { sound } from './audio.js';
import { tried } from './tried.js';
import { PAGE_W, PAGE_H } from './templates.js';
import { fitPhoto, photoBox } from './editor.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const rad = d => d * Math.PI / 180;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- geometry of a piece and its sheet ----------
// An uncut piece is its own sheet. A cut piece keeps the sheet it came from,
// so cutting again or uncutting never loses any of the picture.
function sheetOf(el) {
  if (!el.cut) return { W: el.w, H: el.h, ox: 0, oy: 0 };
  const s = el.cut.sheet;
  return { W: s.sw * el.w, H: s.sh * el.h, ox: s.ox * el.w, oy: s.oy * el.h };
}
function pageToSheet(el, p) {
  const t = rad(el.rot || 0), dx = p.x - el.x, dy = p.y - el.y;
  const lx = dx * Math.cos(t) + dy * Math.sin(t), ly = -dx * Math.sin(t) + dy * Math.cos(t);
  const S = sheetOf(el);
  return [lx + el.w / 2 + S.ox, ly + el.h / 2 + S.oy];
}
function localToPage(el, ex, ey) {
  const t = rad(el.rot || 0), dx = ex - el.w / 2, dy = ey - el.h / 2;
  return { x: el.x + dx * Math.cos(t) - dy * Math.sin(t), y: el.y + dx * Math.sin(t) + dy * Math.cos(t) };
}
function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
  return a / 2;
}
function setCut(el, poly) {
  const S = sheetOf(el);
  poly = poly.map(([x, y]) => [Math.min(S.W, Math.max(0, x)), Math.min(S.H, Math.max(0, y))]);
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const w = bx1 - bx0, h = by1 - by0;
  const c = localToPage(el, (bx0 + bx1) / 2 - S.ox, (by0 + by1) / 2 - S.oy);
  el.x = c.x; el.y = c.y; el.w = w; el.h = h;
  el.cut = { pts: poly.map(([x, y]) => [x / S.W, y / S.H]), sheet: { sw: S.W / w, sh: S.H / h, ox: bx0 / w, oy: by0 / h } };
}
export function uncut(el) {
  if (!el.cut) return;
  const S = sheetOf(el);
  const c = localToPage(el, S.W / 2 - S.ox, S.H / 2 - S.oy);
  el.x = c.x; el.y = c.y; el.w = S.W; el.h = S.H; el.cut = null;
}

// ---------- pattern scissors ----------
export const EDGES = [
  { id: 'straight', name: 'Straight' },
  { id: 'zigzag', name: 'Zigzag', a: 9, period: 20 },
  { id: 'scallop', name: 'Scallop', a: 10, period: 30 },
  { id: 'wave', name: 'Wave', a: 7, period: 44 },
  { id: 'deckle', name: 'Deckle', a: 5, period: 5 },
];

function resample(pts, step) {
  const out = [];
  const n = pts.length;
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const len = Math.hypot(x2 - x1, y2 - y1);
    let t = carry;
    while (t < len) { out.push([x1 + (x2 - x1) * t / len, y1 + (y2 - y1) * t / len]); t += step; }
    carry = t - len;
  }
  return out;
}
function smoothRing(pts, passes = 2) {
  for (let k = 0; k < passes; k++) {
    pts = pts.map((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], b = pts[(i + 1) % pts.length];
      return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
    });
  }
  return pts;
}
// Shapes the cut line. The pattern always bites inward, so the piece never grows past the line drawn.
export function edgeIt(pts, edgeId) {
  const edge = EDGES.find(e => e.id === edgeId) || EDGES[0];
  if (!edge.a) return resample(pts, 6);
  const step = Math.min(3, edge.period / 6);
  const ring = resample(pts, step);
  const sign = polyArea(ring) > 0 ? 1 : -1;
  let jitter = 0.5;
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length], b = ring[(i + 1) % ring.length];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    const nx = sign * ty, ny = sign * -tx; // outward
    const d = i * step;
    let f;
    const ph = (d / edge.period) % 1;
    if (edge.id === 'zigzag') f = 1 - Math.abs(ph * 2 - 1);
    else if (edge.id === 'scallop') f = Math.sqrt(Math.abs(Math.sin(Math.PI * ph)));
    else if (edge.id === 'wave') f = 0.5 + 0.5 * Math.sin(2 * Math.PI * ph);
    else { jitter = Math.min(1, Math.max(0, jitter + (Math.random() - 0.5) * 0.7)); f = jitter; }
    const off = -edge.a * (1 - f);
    out.push([ring[i][0] + nx * off, ring[i][1] + ny * off]);
  }
  return out;
}

// ---------- stencil shapes, in -1..1 ----------
function shapePoints(id) {
  const pts = [];
  if (id === 'circle') for (let i = 0; i < 72; i++) { const t = i / 72 * 2 * Math.PI; pts.push([Math.cos(t), Math.sin(t)]); }
  if (id === 'heart') for (let i = 0; i < 90; i++) {
    const t = i / 90 * 2 * Math.PI;
    pts.push([16 * Math.sin(t) ** 3 / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 - 0.1]);
  }
  if (id === 'star') for (let i = 0; i < 10; i++) { const t = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.45 : 1; pts.push([r * Math.cos(t), r * Math.sin(t) + 0.08]); }
  if (id === 'tag') pts.push([-1, -0.25], [-0.55, -0.62], [1, -0.62], [1, 0.62], [-0.55, 0.62], [-1, 0.25]);
  if (id === 'ticket') {
    const arc = (cx, from, to) => { for (let i = 0; i <= 10; i++) { const t = rad(from + (to - from) * i / 10); pts.push([cx + 0.18 * Math.cos(t), 0.18 * Math.sin(t)]); } };
    pts.push([-1, -0.6], [1, -0.6]);
    arc(1, 270, 90); // notch bites into the right side
    pts.push([1, 0.6], [-1, 0.6]);
    arc(-1, 90, -90); // and the left side
  }
  if (id === 'oval') for (let i = 0; i < 72; i++) { const t = i / 72 * 2 * Math.PI; pts.push([Math.cos(t), 0.66 * Math.sin(t)]); }
  if (id === 'cloud') {
    const bumps = [[-0.55, 0.15, 0.42], [-0.15, -0.2, 0.5], [0.35, -0.12, 0.45], [0.62, 0.22, 0.36], [0.1, 0.32, 0.4], [-0.35, 0.36, 0.34]];
    for (let i = 0; i < 120; i++) {
      const t = i / 120 * 2 * Math.PI, dx = Math.cos(t), dy = Math.sin(t);
      let r = 0.2;
      for (const [cx, cy, br] of bumps) { const b = cx * dx + cy * dy, c = cx * cx + cy * cy - br * br, disc = b * b - c; if (disc >= 0) r = Math.max(r, b + Math.sqrt(disc)); }
      pts.push([dx * r, dy * r]);
    }
  }
  if (id === 'banner') pts.push([-1, -0.42], [1, -0.42], [0.72, 0], [1, 0.42], [-1, 0.42], [-0.72, 0]);
  if (id === 'arch') { pts.push([-0.7, 1], [0.7, 1]); for (let i = 0; i <= 36; i++) { const t = i / 36 * Math.PI; pts.push([0.7 * Math.cos(t), -0.3 - 0.7 * Math.sin(t)]); } }
  if (id === 'bubble') {
    for (let i = 0; i < 64; i++) { const t = Math.PI * 0.62 + i / 64 * Math.PI * 1.88; pts.push([Math.cos(t), -0.12 + 0.72 * Math.sin(t)]); }
    pts.push([-0.55, 0.62], [-0.78, 1]);
  }
  return pts;
}
export const SHAPES = [
  { id: 'circle', name: 'Circle', glyph: '○' },
  { id: 'heart', name: 'Heart', glyph: '♡' },
  { id: 'star', name: 'Star', glyph: '☆' },
  { id: 'tag', name: 'Tag', glyph: '⌂' },
  { id: 'ticket', name: 'Ticket', glyph: '🎟' },
  { id: 'oval', name: 'Oval', glyph: '⬭' },
  { id: 'cloud', name: 'Cloud', glyph: '☁' },
  { id: 'banner', name: 'Banner', glyph: '⚑' },
  { id: 'arch', name: 'Arch', glyph: '⌓' },
  { id: 'bubble', name: 'Speech bubble', glyph: '💬' },
];

// ---------- scissors ----------
export function cutMode(editor, el, ui) {
  let edge = 'straight', pts = null, travel = 0, lastSnip = 0, svg, path, scis, outline;
  const mode = {
    get edge() { return edge; },
    setEdge(e) { edge = e; },
    enter() {
      svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${PAGE_W} ${PAGE_H}`);
      svg.setAttribute('class', 'cut-svg');
      outline = document.createElementNS(SVGNS, 'polygon');
      outline.setAttribute('class', 'cut-outline');
      path = document.createElementNS(SVGNS, 'polyline');
      path.setAttribute('class', 'cut-line');
      svg.append(outline, path);
      scis = document.createElement('div');
      scis.className = 'scissors';
      scis.textContent = '✂';
      editor.fx.append(svg, scis);
      drawOutline();
      editor.nodes.get(el.id)?.classList.add('cutting');
    },
    exit() { editor.nodes.get(el.id)?.classList.remove('cutting'); },
    down(e, p) { pts = [p]; travel = 0; lastSnip = 0; moveScissors(p, 0); },
    move(e, p) {
      if (!pts) return;
      const last = pts[pts.length - 1];
      const d = dist(last, p);
      if (d < 3) return;
      pts.push(p);
      travel += d;
      if (travel - lastSnip > 26) { sound.snip(); lastSnip = travel; }
      path.setAttribute('points', pts.map(q => `${q.x},${q.y}`).join(' '));
      moveScissors(p, Math.atan2(p.y - last.y, p.x - last.x) * 180 / Math.PI);
    },
    up() {
      const drawn = pts; pts = null;
      path.setAttribute('points', '');
      scis.style.opacity = '0';
      if (!drawn || drawn.length < 8 || travel < 80) { ui.hint('Draw all the way around the part you want to keep.'); return; }
      let ring = drawn.map(q => pageToSheet(el, q));
      if (Math.abs(polyArea(ring)) < 900) { ui.hint('That piece is too small. Draw a bigger loop.'); return; }
      ring = smoothRing(resample(ring, 4));
      apply(ring);
      tried('cut-free');
    },
    async shape(id) {
      const S = sheetOf(el);
      const cx = S.ox + el.w / 2, cy = S.oy + el.h / 2, r = Math.min(el.w, el.h) * 0.44;
      const ring = shapePoints(id).map(([x, y]) => [cx + x * r, cy + y * r]);
      // Show the scissors going round before the piece comes free.
      const pagePts = ring.map(([x, y]) => localToPage(el, x - S.ox, y - S.oy));
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const k = Math.ceil(pagePts.length * i / steps);
        path.setAttribute('points', pagePts.slice(0, k).map(q => `${q.x},${q.y}`).join(' '));
        const q = pagePts[k - 1], q0 = pagePts[Math.max(0, k - 2)];
        moveScissors(q, Math.atan2(q.y - q0.y, q.x - q0.x) * 180 / Math.PI);
        if (i % 2) sound.snip();
        await new Promise(r => setTimeout(r, 38));
      }
      path.setAttribute('points', '');
      scis.style.opacity = '0';
      apply(resample(ring, 4));
      tried('cut-shape');
    },
    trim() {
      const S = sheetOf(el);
      if (edge === 'straight') { ui.hint('Pick a pattern edge first, like Zigzag or Scallop.'); return; }
      const ring = el.cut ? el.cut.pts.map(([u, v]) => [u * S.W, v * S.H]) : [[0, 0], [S.W, 0], [S.W, S.H], [0, S.H]];
      for (let i = 0; i < 4; i++) setTimeout(() => sound.snip(), i * 70);
      apply(ring);
    },
    uncut() {
      if (!el.cut) return;
      editor.change(() => uncut(el));
      editor.render();
      drawOutline();
      sound.press();
    },
  };

  function moveScissors(p, deg) {
    scis.style.opacity = '1';
    scis.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${deg}deg) scale(${1 / (editor.scale || 1) * 0.5})`;
  }
  function drawOutline() {
    const S = sheetOf(el);
    const corners = el.cut ? el.cut.pts.map(([u, v]) => [u * S.W, v * S.H]) : [[0, 0], [S.W, 0], [S.W, S.H], [0, S.H]];
    outline.setAttribute('points', corners.map(([x, y]) => { const q = localToPage(el, x - S.ox, y - S.oy); return `${q.x},${q.y}`; }).join(' '));
  }
  function apply(ring) {
    const shaped = edgeIt(ring, edge);
    if (edge !== 'straight') tried('edge-' + edge);
    const oldNode = editor.nodes.get(el.id);
    const S = sheetOf(el);
    const oldRing = el.cut ? el.cut.pts : [[0, 0], [1, 0], [1, 1], [0, 1]];
    const newRing = shaped.map(([x, y]) => [x / S.W, y / S.H]);
    // The scrap that falls away: the old outline with the new piece taken out of it.
    if (oldNode) {
      const ghost = oldNode.cloneNode(true);
      ghost.classList.add('scrap');
      const ring = r => r.map(([u, v]) => `${(u * 100).toFixed(2)}% ${(v * 100).toFixed(2)}%`).join(',');
      const b = ghost.firstChild;
      b.style.clipPath = b.style.webkitClipPath = `polygon(evenodd, ${ring(oldRing)}, ${ring([oldRing[0]])}, ${ring(newRing)}, ${ring([newRing[0]])})`;
      oldNode.after(ghost);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ghost.style.transform += ` translate(${(Math.random() - 0.5) * 120}px, 900px) rotate(${(Math.random() - 0.5) * 50}deg)`;
        ghost.style.opacity = '0';
      }));
      setTimeout(() => ghost.remove(), 900);
    }
    editor.change(() => setCut(el, shaped));
    const ghosts = [...editor.layer.querySelectorAll('.scrap')];
    editor.render();
    ghosts.forEach(g => editor.layer.append(g)); // keep the falling scrap on screen through the redraw
    editor.nodes.get(el.id)?.classList.add('cutting');
    sound.snip();
    drawOutline();
    ui.refresh && ui.refresh();
  }
  return mode;
}

// ---------- paper sheets ----------
export function pullSheet(editor, ref) {
  const el = editor.add({ type: 'paper', ref, w: 620, h: 470, x: PAGE_W / 2, y: PAGE_H / 2, rot: (Math.random() - 0.5) * 4 });
  const n = editor.nodes.get(el.id);
  sound.swoosh();
  if (n) {
    const end = n.style.transform;
    n.style.transition = 'none';
    n.style.transform = `translateY(${PAGE_H}px) rotate(-6deg)`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      n.style.transition = 'transform .45s cubic-bezier(.2,.9,.3,1.05)';
      n.style.transform = end;
      setTimeout(() => { n.style.transition = ''; sound.press(); }, 450);
    }));
  }
  return el;
}

// ---------- tape roll ----------
// The tape's free end lifts off the page behind your finger, like the sticker backing:
// a curled flap with a shadow that lags when you swing, then presses flat when you let go.
export function tapeFlap(editor, ref) {
  const a = asset(ref);
  const node = document.createElement('div');
  node.className = 'tape-flap';
  node.style.backgroundImage = a ? `url(${a.url})` : '';
  editor.fx.append(node);
  let angle = null;
  return {
    // Takes where the tape starts and where the finger is; returns how much is stuck down.
    // With a piece length, the stuck part stops at that length and the lifted end shrinks
    // as you keep pulling, until the whole piece is down.
    update(start, finger, h, piece = Infinity) {
      const dx = finger.x - start.x, dy = finger.y - start.y;
      const len = Math.hypot(dx, dy) || 1;
      const dir = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle == null) angle = dir;
      let diff = ((dir - angle + 540) % 360) - 180;
      angle += diff * 0.3; // the flap trails a little behind quick swings
      diff = Math.max(-28, Math.min(28, ((dir - angle + 540) % 360) - 180));
      let lift = Math.min(len * 0.55, 105);
      let laid = len - lift;
      if (laid > piece) laid = piece;
      lift = Math.max(0, Math.min(lift, piece - laid));
      const cx = start.x + dx / len * laid, cy = start.y + dy / len * laid;
      node.style.width = lift + 'px';
      node.style.height = h * 1.05 + 'px';
      // Anchored at the crease, pointing at the finger.
      node.style.left = cx + 'px';
      node.style.top = cy - h * 1.05 / 2 + 'px';
      node.style.transform = `rotate(${dir - diff}deg)`;
      node.style.setProperty("--lift", Math.min(1, lift / 105));
      node.style.opacity = lift > 2 ? '1' : '0';
      return laid;
    },
    // Presses the flap down onto the page, then removes it.
    lay(then) {
      node.classList.add('pressing');
      setTimeout(() => { node.remove(); then && then(); }, 140);
    },
    remove() { node.remove(); },
  };
}

export function tapeMode(editor, ui) {
  let holo = false;
  let ref = null, start = null, tmp = null, node = null, roll = null, hiss = null, lastP = null, flap = null, finger = null;
  return {
    get ref() { return ref; },
    get holo() { return holo; },
    setRef(r, isHolo = false) { ref = r; holo = isHolo; },
    enter() {
      roll = document.createElement('div');
      roll.className = 'tape-roll';
      editor.fx.append(roll);
    },
    exit() { hiss && hiss.stop(); flap && flap.remove(); },
    down(e, p) {
      if (!ref) return;
      start = p; lastP = p; finger = p;
      tmp = { id: uid('e'), type: 'tape', ref, holo, x: p.x, y: p.y, w: 1, h: 56, rot: 0, cut: null };
      node = editor.makeNode(tmp);
      node.classList.add('laying');
      editor.layer.append(node);
      editor.place(node, tmp);
      flap = tapeFlap(editor, ref);
      const a = asset(ref);
      roll.style.backgroundImage = a ? `url(${a.url})` : '';
      hiss = sound.unroll();
      sound.peel();
      moveRoll(p, 0);
    },
    move(e, p) {
      if (!start) return;
      finger = p;
      const len = dist(start, p);
      const ang = Math.atan2(p.y - start.y, p.x - start.x) * 180 / Math.PI;
      const laid = flap.update(start, p, tmp.h);
      tmp.w = Math.max(1, laid); tmp.rot = ang;
      tmp.x = start.x + (p.x - start.x) / (len || 1) * laid / 2;
      tmp.y = start.y + (p.y - start.y) / (len || 1) * laid / 2;
      editor.place(node, tmp);
      moveRoll(p, ang);
      hiss.speed(dist(lastP, p) * (editor.scale || 1));
      lastP = p;
    },
    up() {
      if (!start) return;
      hiss.stop(); hiss = null;
      roll.style.opacity = '0';
      const s0 = start, p = finger;
      start = null;
      const len = dist(s0, p);
      if (len < 30) { node.remove(); flap.remove(); ui.hint('Drag farther to pull tape off the roll.'); return; }
      // The flap smooths down, then the tape tears off the roll.
      const el = tmp;
      el.w = len;
      el.x = (s0.x + p.x) / 2; el.y = (s0.y + p.y) / 2;
      tried('tape-roll');
      flap.lay(() => {
        node.remove();
        editor.change(() => editor.page.els.push(el));
        editor.render();
        sound.press();
        setTimeout(() => sound.tear(), 60);
      });
      editor.place(node, el);
    },
  };
  function moveRoll(p, ang) {
    roll.style.opacity = '1';
    roll.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${ang}deg)`;
  }
}

// ---------- stamp ----------
// The stamp hovers above its spot while you aim, so the spot stays in view.
// Every print needs ink: dab the stamp on the pad first (twice for a full, dark print).
// Then lift your finger: the stamp rises a touch, comes down hard, squashes, and lifts off the print.
export function makeStampTool(editor) {
  const tool = document.createElement('div');
  tool.className = 'stamp-tool';
  tool.innerHTML = '<div class="knob"></div><div class="neck"></div><div class="block"></div><div class="rubber"></div>';
  const aim = document.createElement('div');
  aim.className = 'stamp-aim';
  aim.innerHTML = '<div class="aim-print"></div>';
  editor.fx.append(aim, tool);
  const rubber = tool.querySelector('.rubber'), print = aim.querySelector('.aim-print');
  return {
    tool, aim,
    paint(url, ink, level) {
      for (const n of [rubber, print]) n.style.webkitMaskImage = n.style.maskImage = url ? `url(${url})` : '';
      rubber.style.backgroundColor = level > 0 ? ink : '#9b8f86';
      rubber.style.opacity = level > 0 ? 0.55 + 0.45 * level : 0.7;
      print.style.backgroundColor = ink;
    },
    hover(p) {
      tool.style.left = aim.style.left = p.x + 'px';
      tool.style.top = aim.style.top = p.y + 'px';
      tool.className = 'stamp-tool aiming';
      aim.className = 'stamp-aim on';
    },
    // Runs the press. `land` is called at the moment of impact.
    press(p, land) {
      aim.className = 'stamp-aim';
      tool.style.left = p.x + 'px'; tool.style.top = p.y + 'px';
      tool.className = 'stamp-tool pressing';
      setTimeout(() => {
        land();
        const pg = editor.pageNode.parentNode;
        pg.classList.remove('thud'); void pg.offsetWidth; pg.classList.add('thud');
      }, 300);
      setTimeout(() => { tool.className = 'stamp-tool gone'; }, 560);
    },
  };
}

export function stampMode(editor, ui) {
  let ref = null, ink = '#b5322c', level = 0, st = null, aiming = null, busy = false;
  const mode = {
    get ref() { return ref; },
    get ink() { return ink; },
    get level() { return level; },
    setRef(r, defaultInk) { ref = r; if (defaultInk && level === 0) ink = defaultInk; paint(); },
    // One dab gives a light print, two give a full one. A new color starts dry.
    dab(color) {
      if (color && color !== ink) { ink = color; level = 0; }
      level = Math.min(1, level + 0.5);
      sound.pat();
      paint();
      ui.refresh && ui.refresh();
    },
    reink(color) { mode.dab(color); },
    enter() { st = makeStampTool(editor); paint(); },
    exit() { st && st.tool.remove(); st && st.aim.remove(); },
    down(e, p) {
      if (!ref || busy) return;
      aiming = p;
      st.hover(p);
    },
    move(e, p) { if (aiming) { aiming = p; st.hover(p); } },
    up() {
      if (!aiming || busy) return;
      const p = aiming; aiming = null;
      busy = true;
      const inked = level;
      st.press(p, () => {
        if (inked <= 0) {
          sound.pat();
          ui.hint('Dry stamp. Dab it on the ink pad first.');
        } else {
          sound.thock();
          const el = { id: uid('e'), type: 'stamp', ref, ink, x: p.x, y: p.y, w: 170, h: 170, rot: (Math.random() - 0.5) * 8, cut: null, inkLevel: inked, inkSeed: (Math.random() * 1000) | 0 };
          editor.change(() => editor.page.els.push(el));
          editor.render();
          const n = editor.nodes.get(el.id);
          n && n.classList.add('inking');
        }
        level = 0; // the ink is used up; dab again for the next print
        paint();
        ui.refresh && ui.refresh();
      });
      setTimeout(() => { busy = false; }, 600);
    },
  };
  function paint() {
    if (!st) return;
    const a = ref && asset(ref);
    st.paint(a && a.url, ink, level);
  }
  return mode;
}

// ---------- framing a photo ----------
// Drag to move the photo inside its window, pinch or slide to zoom, double tap to reset.
export function reframeMode(editor, el, ui) {
  let node, win, ghost, before, base = null, lastTap = 0;
  const pointers = new Map();
  const crop = () => el.crop || (el.crop = { x: 0.5, y: 0.5, zoom: 1 });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mode = {
    onZoom: null,
    get zoom() { return crop().zoom || 1; },
    enter() {
      before = editor.snap();
      node = editor.nodes.get(el.id);
      win = node && node.firstChild.firstChild;
      const main = win && win.querySelector('img.main');
      if (!main) return;
      node.classList.add('reframing');
      win.classList.add('reframe');
      ghost = main.cloneNode();
      ghost.className = 'ghost';
      win.prepend(ghost);
      fitPhoto(win, el);
    },
    exit() {
      if (!win) return;
      win.classList.remove('reframe');
      ghost && ghost.remove();
      node.classList.remove('reframing');
      fitPhoto(win, el);
      editor.commit(before);
    },
    down(e) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) {
        const now = Date.now();
        if (now - lastTap < 300) { mode.reset(); lastTap = 0; return; }
        lastTap = now;
      }
      start();
    },
    move(e) {
      if (!pointers.has(e.pointerId) || !base) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];
      const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
      const c = crop();
      if (pts.length > 1 && base.d0) {
        const d = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        c.zoom = clamp(base.c.zoom * d / base.d0, 1, 5);
        mode.onZoom && mode.onZoom(c.zoom);
      }
      pan(mid.x - base.mid.x, mid.y - base.mid.y);
    },
    up(e) { pointers.delete(e.pointerId); start(); },
    setZoom(z) { crop().zoom = clamp(z, 1, 5); keepInside(); fitPhoto(win, el); },
    reset() { el.crop = { x: 0.5, y: 0.5, zoom: 1 }; mode.onZoom && mode.onZoom(1); fitPhoto(win, el); },
  };
  function start() {
    const pts = [...pointers.values()];
    if (!pts.length) { base = null; return; }
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    base = { c: { ...crop(), zoom: crop().zoom || 1 }, mid, d0: pts.length > 1 ? Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) : 0 };
  }
  // Finger movement on screen becomes movement of the photo inside its turned window.
  function pan(dxScreen, dyScreen) {
    const img = win && win.querySelector('img.main');
    if (!img || !img.naturalWidth) return;
    const s = editor.scale || 1, t = (el.rot || 0) * Math.PI / 180;
    const dx = dxScreen / s, dy = dyScreen / s;
    const lx = dx * Math.cos(t) + dy * Math.sin(t), ly = -dx * Math.sin(t) + dy * Math.cos(t);
    const ww = win.offsetWidth, wh = win.offsetHeight, c = crop();
    const startBox = photoBox(ww, wh, img.naturalWidth, img.naturalHeight, { ...base.c, zoom: c.zoom });
    const roomX = ww - startBox.dw, roomY = wh - startBox.dh;
    c.x = roomX ? clamp((startBox.left + lx) / roomX, 0, 1) : 0.5;
    c.y = roomY ? clamp((startBox.top + ly) / roomY, 0, 1) : 0.5;
    fitPhoto(win, el);
  }
  function keepInside() { const c = crop(); c.x = clamp(c.x, 0, 1); c.y = clamp(c.y, 0, 1); }
  return mode;
}
export { sheetOf, localToPage };
