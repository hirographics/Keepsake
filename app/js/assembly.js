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

export function assembly(editor, { panel, onExit, onShare, onFinished }) {
  let hand = 0;
  const page = editor.page;
  const queue = page.els.map((el, z) => ({ el, z }))
    .sort((a, b) => (ORDER[a.el.type] ?? 9) - (ORDER[b.el.type] ?? 9) || a.z - b.z)
    .map(x => x.el);
  let scrib = null;
  let i = 0, ready = false, svg, ghosts = new Map(), tapeDrag = null, st = null, inkLevel = 0, aiming = null;

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
      for (const n of editor.nodes.values()) n.classList.remove('unplaced', 'settle', 'writing', 'scribbling');
    },
    // Touches on the page: pulling tape along its outline, or pressing a stamp on its spot.
    down(e, p) {
      const el = current();
      if (!el || !ready) return;
      if (el.type === 'tape') startTape(el, p);
      if (el.type === 'text' && scrib) { scrib.down = true; scrib.last = p; scratchAt(p); }
      if (el.type === 'stamp') { aiming = p; st.hover(p); }
    },
    move(e, p) {
      if (tapeDrag) moveTape(p);
      if (scrib && scrib.down) scratchAt(p);
      if (aiming) { aiming = p; st.hover(p); }
    },
    up(e, p) {
      const el = current();
      if (tapeDrag) { endTape(); return; }
      if (scrib && scrib.down) { scrib.down = false; scrib.last = null; }
      if (el && el.type === 'stamp' && aiming) {
        // Lands where you aimed; it snaps onto its outline only if you are close.
        const at = aiming; aiming = null;
        const close = dist(at, el) < Math.max(70, el.w * 0.5);
        st.press(close ? { x: el.x, y: el.y } : at, () => {
          if (!close) { sound.pat(); pulse(); return; }
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
      const piece = trayPiece(el, tray, true);
      let dots = 0;
      say.textContent = 'Tap the back to add glue.';
      piece.addEventListener('pointerdown', e => {
        if (ready) return;
        const r = piece.getBoundingClientRect();
        piece.append(h('span', { class: 'glue-dot', style: `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px` }));
        sound.glue();
        dots++;
        if (dots === 1) act.append(h('button', { class: 'btn small', onclick: flip }, 'Flip it over'));
        if (dots >= 4) flip();
      });
      function flip() {
        if (ready) return;
        piece.classList.add('flipping');
        setTimeout(() => { piece.classList.remove('backside'); piece.querySelectorAll('.glue-dot').forEach(d => d.remove()); }, 160);
        setTimeout(() => piece.classList.remove('flipping'), 330);
        act.innerHTML = '';
        say.textContent = 'Drag it onto its outline.';
        ready = true;
        draggable(piece, el);
      }
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
        ready = true;
        say.textContent = 'Drag it onto its outline.';
        draggable(piece, el);
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
        say.textContent = inkLevel < 1 ? 'One more dab for a full print, or hold over the outline to aim.' : 'Inked. Hold over its outline to aim, then lift to stamp.';
      } }, level);
      act.append(pad);
    } else if (el.type === 'text') {
      trayPiece(el, tray, false);
      say.textContent = 'Scratch inside the outline. The words come up in foil where you scratch.';
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

  // ---------- writing: letters made of scratcher foil ----------
  // Only the letters are foil. Nothing covers the page: scratching inside the outline makes
  // the letters appear right where your finger goes, with a little glint. When most of each
  // word is showing, the rest shimmers in and the foil settles into ink.
  function foilFill(g, W, H) {
    const gr = g.createLinearGradient(0, 0, W, H * 1.6);
    gr.addColorStop(0, '#8e949d'); gr.addColorStop(0.3, '#e6e9ee'); gr.addColorStop(0.48, '#a1a7b0');
    gr.addColorStop(0.7, '#f1f3f6'); gr.addColorStop(1, '#949aa3');
    return gr;
  }
  function startScratch(el) {
    const n = nodeOf(el);
    n.classList.remove('unplaced');
    n.style.visibility = 'hidden';
    const k = 2, pad = 5;
    const W = Math.max(20, Math.ceil(el.w)), H = Math.max(20, Math.ceil(el.h + pad * 2));
    const mk = () => { const c = document.createElement('canvas'); c.width = W * k; c.height = H * k; const g = c.getContext('2d'); g.scale(k, k); return [c, g]; };
    // The foil letters, laid out exactly like the finished text.
    const [letters, lg] = mk();
    lg.font = `${el.size}px ${fontCss(el.font)}`;
    lg.textBaseline = 'middle';
    const align = el.align || 'center';
    lg.textAlign = align;
    const lh = el.size * 1.12, x = align === 'left' ? 0 : align === 'right' ? W : W / 2;
    const lines = wrap(lg, el.text || '', W);
    lg.fillStyle = foilFill(lg, W, H);
    lines.forEach((line, j) => lg.fillText(line, x, pad + j * lh + lh / 2));
    // Specks of glitter inside the letters, and a thin darker rim so silver reads on light paper.
    lg.globalCompositeOperation = 'source-atop';
    for (let j = 0; j < W * H / 40; j++) {
      lg.fillStyle = Math.random() < 0.6 ? 'rgba(255,255,255,.9)' : 'rgba(90,95,105,.45)';
      lg.fillRect(Math.random() * W, Math.random() * H, 1.1, 1.1);
    }
    lg.globalCompositeOperation = 'source-over';
    lg.strokeStyle = 'rgba(70,74,82,.55)'; lg.lineWidth = Math.max(0.6, el.size / 60);
    lines.forEach((line, j) => lg.strokeText(line, x, pad + j * lh + lh / 2));
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
    if (s.travel > 22) { sound.scratch(); s.travel = 0; glint(p); }
    s.last = p;
    if (++s.checks % 6 === 0) checkScratch();
  }
  // A small twinkle where the foil comes up.
  function glint(p) {
    if (scrib.glints > 12) return;
    const f = document.createElement('div');
    f.className = 'glint';
    f.style.left = p.x + (Math.random() - 0.5) * 26 + 'px';
    f.style.top = p.y + (Math.random() - 0.5) * 18 + 'px';
    editor.fx.append(f);
    scrib.glints++;
    setTimeout(() => { f.remove(); if (scrib) scrib.glints--; }, 520);
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
    // The rest of the letters shimmer in, then the foil settles into ink.
    s.c.getContext('2d').setTransform(1, 0, 0, 1, 0, 0);
    s.c.getContext('2d').clearRect(0, 0, s.c.width, s.c.height);
    s.c.getContext('2d').drawImage(s.letters, 0, 0);
    s.c.classList.add('shimmer');
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
