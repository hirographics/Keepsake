// The assembly step: every piece lifts off, then you put the page back together by hand,
// back to front, with the step each piece needs. It never changes the page itself:
// skip a piece or the whole thing and the page looks the same.
import { h } from './ui.js';
import { sound } from './audio.js';
import { sheetOf, localToPage, tapeFlap, makeStampTool } from './tools.js';
import { uid } from './db.js';
import { wrap } from './render.js';
import { makePeel } from './peel.js';
import { asset } from './packs.js';
import { fontCss } from './editor.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const ORDER = { paper: 0, photo: 1, tape: 2, sticker: 3, text: 4, stamp: 5 };
const KIND = { paper: 'Paper', photo: 'Photo', tape: 'Tape', sticker: 'Sticker', text: 'Writing', stamp: 'Stamp' };

function outline(el) {
  const S = sheetOf(el);
  const pts = el.cut ? el.cut.pts.map(([u, v]) => [u * S.W, v * S.H]) : [[0, 0], [S.W, 0], [S.W, S.H], [0, S.H]];
  return pts.map(([x, y]) => localToPage(el, x - S.ox, y - S.oy));
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function assembly(editor, { panel, onExit, onShare, onFinished, onDone }) {
  let hand = 0;
  const page = editor.page;
  const queue = page.els.map((el, z) => ({ el, z }))
    .sort((a, b) => (ORDER[a.el.type] ?? 9) - (ORDER[b.el.type] ?? 9) || a.z - b.z)
    .map(x => x.el);
  let scrib = null;
  let i = 0, ready = false, svg, ghosts = new Map(), tapeDrag = null, st = null, inkLevel = 0, aiming = null;
  // Where each piece goes was decided while planning, so nothing is placed twice here:
  // each piece flies to its own spot and you only do the satisfying part.
  let stage = null, floater = null, bubbles = [];

  const nodeOf = el => editor.nodes.get(el.id);
  const current = () => queue[i];

  const mode = {
    enter() {
      svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${editor.pageNode.offsetWidth} ${editor.pageNode.offsetHeight}`);
      svg.setAttribute('class', 'asm-svg');
      for (const el of queue) {
        const g = document.createElementNS(SVGNS, 'polygon');
        g.setAttribute('class', 'ghost');
        g.setAttribute('points', outline(el).map(q => `${q.x},${q.y}`).join(' '));
        svg.append(g);
        ghosts.set(el.id, g);
      }
      editor.fx.append(svg);
      st = makeStampTool(editor);
      for (const el of queue) nodeOf(el)?.classList.add('unplaced');
      sound.peel();
      step();
    },
    exit() {
      if (scrib) endScratch();
      if (tapeDrag) { tapeDrag.flap.remove(); tapeDrag.node.remove(); tapeDrag.hiss.stop(); tapeDrag = null; }
      clearPiece();
      for (const n of editor.nodes.values()) n.classList.remove('unplaced', 'settle', 'writing', 'scribbling');
    },
    // Touches on the page: pulling tape along its outline, or pressing a stamp on its spot.
    down(e, p) {
      const el = current();
      if (!el || !ready) return;
      if (stage === 'smooth') { smoothAt(p); return; }
      if (stage === 'glue' && glue) { glueAt(p, true); return; }
      if (stage === 'press' && floater) {
        floater.classList.remove('flying'); floater.classList.add('squish');
        floater.style.transform = `${floater._at} scale(${floater._s * 1.01})`;
        sound.peel(); return;
      }
      if (el.type === 'tape') startTape(el, p);
      if (el.type === 'text' && scrib) { scrib.down = true; scrib.last = p; scratchAt(p); }
      if (el.type === 'stamp') { aiming = { x: el.x, y: el.y }; st.hover(aiming); st.tool.classList.add('bearing'); }
    },
    move(e, p) {
      if (stage === 'smooth') { smoothAt(p); return; }
      if (stage === 'glue' && glue && glue.last) { glueAt(p, false); return; }
      if (tapeDrag) moveTape(p);
      if (scrib && scrib.down) scratchAt(p);
    },
    up(e, p) {
      const el = current();
      if (stage === 'press' && floater && floater.classList.contains('squish')) { pressDown(el); return; }
      if (stage === 'glue') { glueLift(); return; }
      if (tapeDrag) { endTape(); return; }
      if (scrib && scrib.down) { scrib.down = false; scrib.last = null; }
      if (el && el.type === 'stamp' && aiming) {
        // The stamp is already over its spot: hold anywhere to bear down, let go to stamp.
        aiming = null;
        st.press({ x: el.x, y: el.y }, () => {
          sound.thock();
          inkLevel = 0;
          place(el);
        });
      }
    },
  };

  // ---------- one piece at a time ----------
  function step() {
    ready = false;
    for (const [id, g] of ghosts) g.classList.toggle('on', queue[i] && queue[i].id === id);
    const el = current();
    if (!el) return finished();
    const tray = h('div', { class: 'tray' });
    const say = h('div', { class: 'asm-say' });
    const act = h('div', { class: 'asm-act' });
    panel.innerHTML = '';
    panel.append(h('div', { class: 'asm' },
      h('div', { class: 'asm-top' },
        h('span', { class: 'asm-count' }, `${i + 1} of ${queue.length} · ${KIND[el.type] || 'Piece'}`),
        h('button', { class: 'mchip', onclick: () => { place(el, true); } }, 'Skip'),
        h('button', { class: 'mchip', onclick: finishAll }, 'Finish'),
        h('button', { class: 'mchip done', onclick: exit }, 'Stop')),
      h('div', { class: 'asm-body' }, tray, h('div', { class: 'asm-text' }, say, act))));

    if (el.type === 'paper' || el.type === 'photo') {
      // The piece waits face down on its own spot. Run glue over its back, then it flips over and lands.
      let tool = glueTool();
      const pick = h('div', { class: 'glue-picks' });
      const drawPicks = () => {
        pick.innerHTML = '';
        for (const [id, name] of [['stick', 'Glue stick'], ['tape', 'Glue tape']]) pick.append(h('button', {
          class: 'glue-pick ' + id + (tool === id ? ' on' : ''), onclick: () => { tool = id; glueTool(id); if (glue) glue.tool = id; drawPicks(); },
        }, h('span', { class: 'glue-ic ' + id }), name));
      };
      drawPicks();
      tray.append(pick);
      say.textContent = 'Rub glue over the back, right on the page.';
      startGlue(el, tool, () => {
        say.textContent = 'Here it goes...';
        // It lands on its spot. Rub it down to push out the air bubbles.
        nodeOf(el)?.classList.remove('unplaced');
        sound.press();
        startSmooth(el);
        say.textContent = 'Rub it down to smooth out the bubbles.';
      });
      ready = true;
    } else if (el.type === 'sticker') {
      // Face down on its shaped backing. Pull the backing off from any corner; it folds back as you
      // drag, then the sticker flips face up.
      const holder = h('div', { class: 'tray-piece peel-holder' });
      tray.append(holder);
      say.textContent = 'Grab a corner and peel the backing off.';
      const a = el.ref && asset(el.ref);
      makePeel(holder, a ? a.url : '', { onPeeled: () => {
        holder.innerHTML = '';
        const piece = trayPiece(el, tray, false);
        holder.remove();
        say.textContent = 'Here it goes...';
        // It hovers over its spot, sticky side down. Press it on with your thumb.
        setTimeout(() => flyIn(piece, el, 1.07, () => {
          stage = 'press';
          ready = true;
          say.textContent = 'Press it down. Anywhere on the page works.';
        }), 200);
      } });
    } else if (el.type === 'tape') {
      trayRoll(el, tray);
      say.textContent = 'Start at one end of the outline and pull the tape along it.';
      ready = true;
    } else if (el.type === 'stamp') {
      trayPiece(el, tray, false);
      say.textContent = 'Dab the stamp on the ink pad. Twice makes a full print.';
      const a = el.ref && asset(el.ref);
      inkLevel = 0;
      st.paint(a && a.url, el.ink, 0);
      const level = h('span', { class: 'pad-level', style: 'height:0%' });
      const pad = h('button', { class: 'pad big', style: `--ink:${el.ink}`, 'aria-label': 'Ink pad', onclick: () => {
        inkLevel = Math.min(1, inkLevel + 0.5);
        sound.pat();
        pad.classList.remove('dabbed'); void pad.offsetWidth; pad.classList.add('dabbed');
        level.style.height = inkLevel * 100 + '%';
        st.paint(a && a.url, el.ink, inkLevel);
        ready = true;
        st.hover({ x: el.x, y: el.y });
        say.textContent = inkLevel < 1 ? 'One more dab for a full print, or hold the page to bear down and let go to stamp.' : 'Inked. Hold the page to bear down, then let go to stamp.';
      } }, level);
      act.append(pad);
    } else if (el.type === 'text') {
      trayPiece(el, tray, false);
      say.textContent = 'Scratch inside the outline. The words come up wherever you scratch.';
      startScratch(el);
      ready = true;
    } else {
      place(el, true);
    }
  }

  // A copy of the piece, fitted into the tray box.
  function trayPiece(el, tray, back) {
    const node = editor.makeNode(el);
    editor.place(node, { ...el, x: 0, y: 0, rot: 0 });
    const k = Math.min(118 / el.w, 104 / Math.max(el.h, 1), 1);
    const holder = h('div', { class: 'tray-piece' + (back ? ' backside' : '') });
    const inner = h('div', { class: 'tray-scale', style: `transform: scale(${k})` });
    inner.append(node);
    holder.append(inner);
    tray.append(holder);
    holder._k = k;
    return holder;
  }
  function trayRoll(el, tray) {
    const node = editor.makeNode(el);
    const a = node.firstChild.style.backgroundImage;
    tray.append(h('div', { class: 'tray-roll', style: `background-image:${a}` }));
  }

  // ---------- glue on the back ----------
  // Glue stick: a wide, glossy smear with a waxy squeak. Glue tape: a thin, crisp strip from a runner.
  let glue = null;
  function glueTool(set) {
    try { if (set) localStorage.setItem('keepsake.glue', set); return localStorage.getItem('keepsake.glue') || 'stick'; } catch (e) { return set || 'stick'; }
  }
  function startGlue(el, tool, then) {
    const k = 2, W = Math.max(20, Math.ceil(el.w)), H = Math.max(20, Math.ceil(el.h));
    const back = h('div', { class: 'piece-back ' + el.type });
    back.style.cssText = `left:${el.x - W / 2}px;top:${el.y - H / 2}px;width:${W}px;height:${H}px;transform:rotate(${el.rot || 0}deg);--rot:rotate(${el.rot || 0}deg)`;
    // A cut piece shows its cut shape from the back too.
    const o = outline(el).map(q => boxPt(el, q, W, H));
    back.style.clipPath = back.style.webkitClipPath = `polygon(${o.map(q => `${(q.x / W * 100).toFixed(2)}% ${(q.y / H * 100).toFixed(2)}%`).join(',')})`;
    const c = h('canvas', { class: 'glue-layer' }); c.width = W * k; c.height = H * k;
    back.append(c);
    const handle = h('div', { class: 'glue-hand ' + tool });
    editor.fx.append(back, handle);
    const g = c.getContext('2d'); g.scale(k, k); g.lineCap = 'round'; g.lineJoin = 'round';
    glue = { el, tool, back, c, g, W, H, k, handle, last: null, travel: 0, then, checks: 0, hiss: null };
    stage = 'glue';
  }
  function glueAt(p, down) {
    const G = glue, q = boxPt(G.el, p, G.W, G.H);
    G.handle.className = 'glue-hand ' + G.tool + ' on';
    G.handle.style.left = p.x + 'px'; G.handle.style.top = p.y + 'px';
    if (down || !G.last) { G.last = q; if (G.tool === 'tape') { G.hiss = sound.unroll(); } return; }
    const a = G.last, d = Math.hypot(q.x - a.x, q.y - a.y);
    if (d < 1.5) return;
    const g = G.g;
    if (G.tool === 'stick') {
      // Wide and glossy: a soft translucent band with a brighter core.
      g.strokeStyle = 'rgba(250, 248, 255, .42)'; g.lineWidth = 46;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(q.x, q.y); g.stroke();
      g.strokeStyle = 'rgba(255, 255, 255, .5)'; g.lineWidth = 16;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(q.x, q.y); g.stroke();
      G.travel += d;
      if (G.travel > 34) { G.travel = 0; sound.scribble(); }
    } else {
      // A crisp strip with a faint dotted adhesive pattern.
      g.strokeStyle = 'rgba(255, 255, 255, .62)'; g.lineWidth = 14;
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(q.x, q.y); g.stroke();
      g.strokeStyle = 'rgba(190, 200, 215, .55)'; g.lineWidth = 2; g.setLineDash([2, 5]);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
      G.hiss && G.hiss.speed(d * editor.scale * 1.4);
    }
    G.last = q;
    if (++G.checks % 5 === 0) glueCheck();
  }
  function glueLift() {
    if (!glue) return;
    glue.last = null; glue.handle.classList.remove('on');
    if (glue.hiss) { glue.hiss.stop(); glue.hiss = null; sound.tear(); }
    glueCheck();
  }
  // Enough glue: about half the back with a stick, or a few strips of tape.
  function glueCheck() {
    const G = glue; if (!G) return;
    const sm = document.createElement('canvas'), n = 40;
    sm.width = n; sm.height = Math.max(6, Math.round(n * G.H / G.W));
    const t = sm.getContext('2d'); t.drawImage(G.c, 0, 0, sm.width, sm.height);
    const d = t.getImageData(0, 0, sm.width, sm.height).data;
    let on = 0; for (let j = 3; j < d.length; j += 4) if (d[j] > 40) on++;
    const share = on / (sm.width * sm.height);
    if (share >= (G.tool === 'stick' ? 0.5 : 0.22)) glueDone();
  }
  function glueDone() {
    const G = glue; glue = null; stage = null;
    if (G.hiss) G.hiss.stop();
    G.handle.remove();
    G.back.classList.add('flip-over');
    sound.swoosh();
    setTimeout(() => { G.back.remove(); G.then(); }, 380);
  }
  // A page point in the piece's own box, 0..W and 0..H.
  function boxPt(el, p, W, H) {
    const t = (el.rot || 0) * Math.PI / 180, dx = p.x - el.x, dy = p.y - el.y;
    return { x: dx * Math.cos(t) + dy * Math.sin(t) + W / 2, y: -dx * Math.sin(t) + dy * Math.cos(t) + H / 2 };
  }

  // ---------- landing on its spot ----------
  // The tray copy lifts out and glides to where the piece was planned. `k` is how high it hovers.
  function flyIn(holder, el, k, then) {
    const s = editor.scale, r = editor.pageNode.getBoundingClientRect(), hr = holder.getBoundingClientRect();
    const node = editor.makeNode(el);
    editor.place(node, { ...el, x: 0, y: 0 });
    floater = h('div', { class: 'floater flying' });
    floater.append(node);
    document.body.append(floater);
    floater.style.transform = `translate(${hr.left + hr.width / 2}px, ${hr.top + hr.height / 2}px) scale(${s * 0.45})`;
    holder.classList.add('lifted');
    sound.swoosh();
    floater._at = `translate(${r.left + el.x * s}px, ${r.top + el.y * s}px)`;
    floater._s = s;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      floater.style.transform = `${floater._at} scale(${s * k})`;
    }));
    setTimeout(then, 430);
  }
  function pressDown(el) {
    const f = floater; floater = null; stage = null;
    f.classList.remove('squish'); f.classList.add('pressing');
    f.style.transform = `${f._at} scale(${f._s})`;
    sound.press();
    setTimeout(() => { f.remove(); place(el); }, 130);
  }
  // A few air bubbles under a freshly laid paper or photo; rub over them to push them out.
  function startSmooth(el) {
    stage = 'smooth';
    const n = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const lx = (Math.random() - 0.5) * el.w * 0.7, ly = (Math.random() - 0.5) * el.h * 0.7;
      const at = localToPage(el, lx + el.w / 2, ly + el.h / 2);
      const size = 26 + Math.random() * 30;
      const b = h('div', { class: 'bubble', style: `left:${at.x}px;top:${at.y}px;width:${size}px;height:${size}px` });
      editor.fx.append(b);
      bubbles.push({ b, x: at.x, y: at.y, r: size });
    }
  }
  function smoothAt(p) {
    for (const bb of bubbles) {
      if (bb.gone || dist(p, bb) > bb.r + 26) continue;
      bb.gone = true;
      bb.b.classList.add('pop');
      sound.pat();
      setTimeout(() => bb.b.remove(), 260);
    }
    if (bubbles.length && bubbles.every(bb => bb.gone)) {
      bubbles = []; stage = null;
      setTimeout(() => place(current()), 180);
    }
  }
  function clearPiece() {
    if (floater) { floater.remove(); floater = null; }
    if (glue) { if (glue.hiss) glue.hiss.stop(); glue.back.remove(); glue.handle.remove(); glue = null; }
    for (const bb of bubbles) bb.b.remove();
    bubbles = []; stage = null;
  }

  // Lets the tray copy be dragged out over the page and dropped on its outline.
  function draggable(holder, el) {
    holder.classList.add('grab');
    holder.addEventListener('pointerdown', e => {
      e.preventDefault();
      holder.setPointerCapture(e.pointerId);
      const s = editor.scale;
      const node = editor.makeNode(el);
      editor.place(node, { ...el, x: 0, y: 0 });
      const f = h('div', { class: 'floater' });
      f.append(node);
      document.body.append(f);
      holder.classList.add('lifted');
      const moveTo = (x, y, k = 1.06) => { f.style.transform = `translate(${x}px, ${y - 40}px) scale(${s * k})`; };
      moveTo(e.clientX, e.clientY);
      const mv = ev => moveTo(ev.clientX, ev.clientY);
      const up = ev => {
        holder.removeEventListener('pointermove', mv);
        holder.removeEventListener('pointerup', up);
        holder.removeEventListener('pointercancel', up);
        const r = editor.pageNode.getBoundingClientRect();
        const p = { x: (ev.clientX - r.left) / s, y: (ev.clientY - 40 - r.top) / s };
        const snapR = Math.max(70, Math.min(el.w, el.h) * 0.4);
        if (dist(p, el) < snapR) {
          // Glide onto the exact spot, then press it down.
          f.style.transition = 'transform .16s ease-out';
          f.style.transform = `translate(${r.left + el.x * s}px, ${r.top + el.y * s}px) scale(${s})`;
          setTimeout(() => { f.remove(); sound.press(); place(el); }, 170);
        } else {
          f.style.transition = 'transform .25s ease-in, opacity .25s';
          const hr = holder.getBoundingClientRect();
          f.style.transform = `translate(${hr.left + hr.width / 2}px, ${hr.top + hr.height / 2}px) scale(${s * 0.4})`;
          f.style.opacity = '0';
          setTimeout(() => { f.remove(); holder.classList.remove('lifted'); }, 260);
          pulse();
        }
      };
      holder.addEventListener('pointermove', mv);
      holder.addEventListener('pointerup', up);
      holder.addEventListener('pointercancel', up);
    });
  }

  // ---------- tape along its outline ----------
  function ends(el) {
    const t = (el.rot || 0) * Math.PI / 180, dx = Math.cos(t) * el.w / 2, dy = Math.sin(t) * el.w / 2;
    return [{ x: el.x - dx, y: el.y - dy }, { x: el.x + dx, y: el.y + dy }];
  }
  function startTape(el, p) {
    const [a, b] = ends(el);
    const near = Math.max(70, el.h * 1.5);
    let from, to;
    if (dist(p, a) < near) { from = a; to = b; } else if (dist(p, b) < near) { from = b; to = a; } else { pulse(); return; }
    const tmp = { ...el, id: uid('t') };
    const node = editor.makeNode(tmp);
    editor.layer.append(node);
    tapeDrag = { el, from, to, tmp, node, len: 0, hiss: sound.unroll(), last: p, flap: tapeFlap(editor, el.ref) };
    sound.peel();
    moveTape(p);
  }
  function moveTape(p) {
    const d = tapeDrag;
    const ux = (d.to.x - d.from.x) / d.el.w, uy = (d.to.y - d.from.y) / d.el.w;
    // You can pull past the end of the outline: the last bit of tape keeps laying down until it is all stuck.
    const along = Math.max(1, Math.min(d.el.w + 240, (p.x - d.from.x) * ux + (p.y - d.from.y) * uy));
    // The finger may wander a little off the line; the flap follows it, the stuck part stays on the line.
    const side = (p.x - d.from.x) * -uy + (p.y - d.from.y) * ux;
    const off = Math.max(-30, Math.min(30, side));
    const tip = { x: d.from.x + ux * along - uy * off, y: d.from.y + uy * along + ux * off };
    const laid = d.flap.update(d.from, tip, d.el.h, d.el.w);
    d.len = laid;
    d.tmp.w = Math.max(1, laid);
    d.tmp.x = d.from.x + ux * d.tmp.w / 2;
    d.tmp.y = d.from.y + uy * d.tmp.w / 2;
    editor.place(d.node, d.tmp);
    d.hiss.speed(dist(d.last, p) * editor.scale);
    d.last = p;
    if (laid >= d.el.w - 0.5) endTape(); // the whole piece is down
  }
  function endTape() {
    const d = tapeDrag;
    tapeDrag = null;
    d.hiss.stop();
    if (d.len >= d.el.w - 0.5) {
      // Fully laid by your finger: press it flat.
      d.flap.remove(); d.node.remove(); sound.press(); setTimeout(() => sound.tear(), 60); place(d.el);
    } else if (d.len >= d.el.w * 0.75) {
      // Nearly there: the last bit smooths down on its own.
      d.flap.lay(() => { d.node.remove(); sound.press(); setTimeout(() => sound.tear(), 60); place(d.el); });
    } else { d.flap.remove(); d.node.remove(); pulse(); }
  }

  // ---------- writing: a scratcher in reverse ----------
  // Nothing covers the page. Scratching inside the outline makes the words come up in their own
  // ink right where your finger goes, with crumbs falling away. When most of it shows, the rest fills in.
  function startScratch(el) {
    const n = nodeOf(el);
    n.classList.remove('unplaced');
    n.style.visibility = 'hidden';
    const k = 2, pad = 5;
    const W = Math.max(20, Math.ceil(el.w)), H = Math.max(20, Math.ceil(el.h + pad * 2));
    const mk = () => { const c = document.createElement('canvas'); c.width = W * k; c.height = H * k; const g = c.getContext('2d'); g.scale(k, k); return [c, g]; };
    // The letters, laid out exactly like the finished text.
    const [letters, lg] = mk();
    lg.font = `${el.size}px ${fontCss(el.font)}`;
    lg.textBaseline = 'middle';
    const align = el.align || 'center';
    lg.textAlign = align;
    const lh = el.size * 1.12, x = align === 'left' ? 0 : align === 'right' ? W : W / 2;
    const lines = wrap(lg, el.text || '', W);
    // The letters in their own ink. Scratching uncovers them, like a scratcher in reverse.
    lg.fillStyle = el.color || '#3a2e2a';
    lines.forEach((line, j) => lg.fillText(line, x, pad + j * lh + lh / 2));
    // Where you have scratched so far.
    const [mask, mg] = mk();
    mg.lineCap = 'round'; mg.lineJoin = 'round'; mg.strokeStyle = '#000';
    // What you see: the letters, only where you scratched.
    const [c, g] = mk();
    c.className = 'foil';
    c.style.width = W + 'px'; c.style.height = H + 'px';
    c.style.left = el.x - W / 2 + 'px'; c.style.top = el.y - H / 2 + 'px';
    c.style.transform = `rotate(${el.rot || 0}deg)`;
    editor.fx.append(c);
    // How many letter pixels there are, counted small, to know when most are showing.
    const sw = 96, sh = Math.max(8, Math.round(96 * H / W));
    const sm = document.createElement('canvas'); sm.width = sw; sm.height = sh;
    const st2 = sm.getContext('2d', { willReadFrequently: true });
    st2.drawImage(letters, 0, 0, sw, sh);
    const ink = st2.getImageData(0, 0, sw, sh).data;
    let total = 0;
    for (let j = 3; j < ink.length; j += 4) if (ink[j] > 60) total++;
    scrib = { el, n, c, g, letters, mask, mg, W, H, k, sm, st2, ink, total: Math.max(1, total), down: false, last: null, travel: 0, checks: 0, glints: 0 };
  }
  function drawFoil() {
    const s = scrib, g = s.g;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, s.c.width, s.c.height);
    g.drawImage(s.letters, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(s.mask, 0, 0);
    g.restore();
  }
  function localPt(q) {
    const s = scrib, el = s.el, t = (el.rot || 0) * Math.PI / 180;
    const dx = q.x - el.x, dy = q.y - el.y;
    return { x: dx * Math.cos(t) + dy * Math.sin(t) + s.W / 2, y: -dx * Math.sin(t) + dy * Math.cos(t) + s.H / 2 };
  }
  function scratchAt(p) {
    const s = scrib;
    const a = s.last ? localPt(s.last) : localPt(p), b = localPt(p);
    if (b.x < -30 || b.x > s.W + 30 || b.y < -30 || b.y > s.H + 30) { s.last = p; return; }
    s.mg.lineWidth = Math.max(20, s.el.size * 0.45);
    s.mg.beginPath(); s.mg.moveTo(a.x, a.y); s.mg.lineTo(b.x + 0.01, b.y); s.mg.stroke();
    drawFoil();
    const d = s.last ? dist(s.last, p) : 0;
    s.travel += d;
    if (s.travel > 22) { sound.scratch(); s.travel = 0; crumbs(p); }
    s.last = p;
    if (++s.checks % 6 === 0) checkScratch();
  }
  // A few crumbs that fall away where you scratch, like a scratcher, only the words come up instead.
  function crumbs(p) {
    if (scrib.glints > 24) return;
    for (let j = 0; j < 3; j++) {
      const f = document.createElement('div');
      f.className = 'crumb';
      f.style.left = p.x + (Math.random() - 0.5) * 28 + 'px';
      f.style.top = p.y + (Math.random() - 0.5) * 14 + 'px';
      editor.fx.append(f);
      scrib.glints++;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.transform = `translate(${(Math.random() - 0.5) * 50}px, ${50 + Math.random() * 60}px) rotate(${Math.random() * 300}deg)`;
        f.style.opacity = '0';
      }));
      setTimeout(() => { f.remove(); if (scrib) scrib.glints--; }, 650);
    }
  }
  function checkScratch() {
    const s = scrib;
    s.st2.clearRect(0, 0, s.sm.width, s.sm.height);
    s.st2.drawImage(s.mask, 0, 0, s.sm.width, s.sm.height);
    const m = s.st2.getImageData(0, 0, s.sm.width, s.sm.height).data;
    let shown = 0;
    for (let j = 3; j < m.length; j += 4) if (s.ink[j] > 60 && m[j] > 60) shown++;
    if (shown / s.total >= 0.72) finishScratch();
  }
  function finishScratch() {
    const s = scrib, el = s.el;
    scrib = null;
    // The rest of the letters come up, and the real text takes over.
    s.c.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
    s.c.getContext('2d').clearRect(0, 0, s.c.width, s.c.height);
    s.c.getContext('2d').drawImage(s.letters, 0, 0);
    s.c.classList.add('fill-in');
    sound.write();
    setTimeout(() => {
      s.n.style.visibility = '';
      s.n.classList.add('inking');
      s.c.classList.add('settling');
      setTimeout(() => { s.c.remove(); s.n.classList.remove('inking'); }, 520);
      place(el);
    }, 380);
  }
  function endScratch() { if (scrib) { scrib.c.remove(); scrib.n.style.visibility = ''; scrib = null; } }

  // ---------- finishing ----------
  function place(el, quiet) {
    if (scrib && scrib.el === el) endScratch();
    clearPiece();
    const n = nodeOf(el);
    if (!quiet) hand++;
    if (n) {
      n.classList.remove('unplaced');
      if (!quiet) { n.classList.remove('settle'); void n.offsetWidth; n.classList.add('settle'); }
    }
    ghosts.get(el.id)?.classList.add('done');
    i++;
    step();
  }
  function pulse() {
    const g = current() && ghosts.get(current().id);
    if (!g) return;
    g.classList.remove('pulse'); void g.getBoundingClientRect(); g.classList.add('pulse');
  }
  function finishAll() {
    if (scrib) place(scrib.el, true) ;
    for (; i < queue.length; i++) { nodeOf(queue[i])?.classList.remove('unplaced'); ghosts.get(queue[i].id)?.classList.add('done'); }
    finished();
  }
  function finished() {
    for (const g of ghosts.values()) g.classList.add('done');
    onFinished && onFinished(hand, queue.length);
    onDone && onDone();
    sound.done();
    panel.innerHTML = '';
    panel.append(h('div', { class: 'asm' },
      h('div', { class: 'asm-finish' },
        h('strong', {}, 'Page put together.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: exit }, 'Back to the page'),
          h('button', { class: 'btn small primary', onclick: () => { exit(); onShare && onShare(); } }, 'Share it')))));
  }
  function exit() { onExit && onExit(); }

  return mode;
}
