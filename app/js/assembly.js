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
      say.textContent = 'Scratch the foil off to show the words.';
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
    const along = Math.max(1, Math.min(d.el.w, (p.x - d.from.x) * ux + (p.y - d.from.y) * uy));
    // The finger may wander a little off the line; the flap follows it, the stuck part stays on the line.
    const side = (p.x - d.from.x) * -uy + (p.y - d.from.y) * ux;
    const off = Math.max(-30, Math.min(30, side));
    const tip = { x: d.from.x + ux * along - uy * off, y: d.from.y + uy * along + ux * off };
    d.len = along;
    const laid = d.flap.update(d.from, tip, d.el.h);
    d.tmp.w = Math.max(1, laid);
    d.tmp.x = d.from.x + ux * d.tmp.w / 2;
    d.tmp.y = d.from.y + uy * d.tmp.w / 2;
    editor.place(d.node, d.tmp);
    d.hiss.speed(dist(d.last, p) * editor.scale);
    d.last = p;
  }
  function endTape() {
    const d = tapeDrag;
    tapeDrag = null;
    d.hiss.stop();
    if (d.len >= d.el.w * 0.7) {
      d.flap.lay(() => { d.node.remove(); sound.press(); setTimeout(() => sound.tear(), 60); place(d.el); });
    } else { d.flap.remove(); d.node.remove(); pulse(); }
  }

  // ---------- writing as a scratch-off ----------
  // A foil coating covers the words, like a lottery scratcher. Scratching wears it away right
  // where your finger goes, with flakes falling off. When most of it is gone, the rest flakes off.
  function startScratch(el) {
    const n = nodeOf(el);
    n.classList.remove('unplaced');
    const k = 2;
    const W = Math.max(20, Math.ceil(el.w)), H = Math.max(20, Math.ceil(el.h + 10));
    const c = document.createElement('canvas');
    c.width = W * k; c.height = H * k;
    c.className = 'foil';
    c.style.width = W + 'px'; c.style.height = H + 'px';
    c.style.left = el.x - W / 2 + 'px'; c.style.top = el.y - H / 2 + 'px';
    c.style.transform = `rotate(${el.rot || 0}deg)`;
    const g = c.getContext('2d');
    g.scale(k, k);
    // Silver foil with a soft sheen and a little sparkle.
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#c9cbd0'); gr.addColorStop(0.35, '#eceef2'); gr.addColorStop(0.55, '#b9bcc3'); gr.addColorStop(1, '#dfe1e6');
    g.fillStyle = gr;
    roundRect(g, 0, 0, W, H, 10); g.fill();
    for (let j = 0; j < W * H / 90; j++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.7)' : 'rgba(120,125,135,.35)';
      g.fillRect(Math.random() * W, Math.random() * H, 1.2, 1.2);
    }
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; roundRect(g, 3, 3, W - 6, H - 6, 8); g.stroke();
    g.fillStyle = 'rgba(110,115,125,.45)';
    g.font = `600 ${Math.min(22, H * 0.32)}px -apple-system, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('scratch here', W / 2, H / 2);
    editor.fx.append(c);
    scrib = { el, n, c, g, W, H, k, down: false, last: null, travel: 0, checks: 0, flakes: 0 };
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
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
    s.g.save();
    s.g.globalCompositeOperation = 'destination-out';
    s.g.lineCap = 'round'; s.g.lineJoin = 'round';
    s.g.lineWidth = Math.max(22, s.el.size * 0.5);
    s.g.beginPath(); s.g.moveTo(a.x, a.y); s.g.lineTo(b.x + 0.01, b.y); s.g.stroke();
    s.g.restore();
    const d = s.last ? dist(s.last, p) : 0;
    s.travel += d;
    if (s.travel > 22) { sound.scratch(); s.travel = 0; flake(p); }
    s.last = p;
    if (++s.checks % 6 === 0) checkScratch();
  }
  // A few foil flakes that fall off where you scratch.
  function flake(p) {
    if (scrib.flakes > 40) return;
    for (let j = 0; j < 3; j++) {
      const f = document.createElement('div');
      f.className = 'flake';
      f.style.left = p.x + (Math.random() - 0.5) * 30 + 'px';
      f.style.top = p.y + (Math.random() - 0.5) * 16 + 'px';
      editor.fx.append(f);
      scrib.flakes++;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        f.style.transform = `translate(${(Math.random() - 0.5) * 60}px, ${80 + Math.random() * 90}px) rotate(${Math.random() * 360}deg)`;
        f.style.opacity = '0';
      }));
      setTimeout(() => { f.remove(); if (scrib) scrib.flakes--; }, 800);
    }
  }
  function checkScratch() {
    const s = scrib, sm = document.createElement('canvas');
    sm.width = 48; sm.height = Math.max(6, Math.round(48 * s.H / s.W));
    const t = sm.getContext('2d');
    t.drawImage(s.c, 0, 0, sm.width, sm.height);
    const d = t.getImageData(0, 0, sm.width, sm.height).data;
    let left = 0;
    for (let j = 3; j < d.length; j += 4) if (d[j] > 90) left++;
    if (left / (sm.width * sm.height) < 0.3) finishScratch();
  }
  function finishScratch() {
    const s = scrib, el = s.el;
    s.c.classList.add('falling');
    sound.write();
    scrib = null;
    setTimeout(() => s.c.remove(), 500);
    place(el);
  }
  function endScratch() { if (scrib) { scrib.c.remove(); scrib = null; } }

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
