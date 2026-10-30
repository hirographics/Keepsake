// The tour: a guided first page. Each step asks for one thing, lights up where to do it,
// and a ghost finger shows the gesture. The next step starts when you do it, not when you tap Next.
// It runs once on the first open; "Show me around" on the home screen plays it again.
// It teaches only the basics. Discoveries stay hidden.
import { h } from './ui.js';
import { demo, stopDemo, forceTips, mid } from './tips.js';

const KEY = 'keepsake.tour';
const get = () => { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } };
const set = v => { try { localStorage.setItem(KEY, v); } catch (e) { /* ignore */ } };
export const tourSeen = () => !!get();

let ctxOf = () => ({});
let onEndHook = null;
export function initTour(getCtx, onEnd) { ctxOf = getCtx; onEndHook = onEnd; }

// ---------- helpers for steps ----------
const nodeFor = (ed, el) => el && document.querySelector(`.page .el[data-id="${el.id}"]`);
const toolBtn = name => [...document.querySelectorAll('.toolrow .tool')].find(b => b.textContent.replace(/\s+/g, ' ').includes(name)) || null;
const shape = ed => new Map(ed.page.els.map(e => [e.id, { x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot || 0 }]));
const count = (ed, f) => ed.page.els.filter(f).length;
// The piece to practise moving: a sticker if there is one, else a stamp or some writing.
// The one nearest the middle, so practising never pushes it off the page.
const practicePiece = ed => {
  const pool = ed.page.els.filter(e => e.type === 'sticker' || e.type === 'stamp');
  const list = pool.length ? pool : ed.page.els.filter(e => e.type !== 'paper');
  return list.sort((a, b) => Math.hypot(a.x - 425, a.y - 550) - Math.hypot(b.x - 425, b.y - 550))[0] || ed.page.els[0];
};

const typed = () => { const t = document.querySelector('#plan'); return !!t && t.value.trim().length > 2; };
const makeBtn = () => [...document.querySelectorAll('.sheet .btn.primary')].find(b => b.textContent.includes('Make my book')) || null;
const textOf = st => typeof st.text === 'function' ? st.text() : st.text;

const STEPS = [
  {
    id: 'new', where: 'home',
    text: 'Let’s make your first page. Tap New book.',
    target: () => document.querySelector('.home-actions .btn.big'),
    gesture: 'tap',
    done: c => !!document.querySelector('#plan') || !!c.editor,
  },
  {
    id: 'plan', where: 'home', card: 'top',
    // Two parts on one step: type the plan, then the light moves to Make my book and brings it into view.
    text: () => typed() ? 'Now tap Make my book. You can also press return.' : 'Type what you are going to do, like “pizza night with friends.”',
    target: () => {
      if (!typed()) return document.querySelector('#plan');
      const b = makeBtn();
      if (b && document.activeElement !== document.querySelector('#plan') && !b._shown) { b._shown = true; b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      return b;
    },
    lost: c => !c.editor && !document.querySelector('#plan'), back: 'new',
    done: c => !!c.editor,
  },
  {
    id: 'move', plan: true,
    text: 'This is your page. Drag a piece with one finger to move it.',
    begin: (c, s) => { c.editor.select(null); s.shape = shape(c.editor); s.piece = practicePiece(c.editor); },
    target: (c, s) => nodeFor(c.editor, s.piece),
    gesture: 'drag',
    done: (c, s) => c.editor.page.els.some(e => { const o = s.shape.get(e.id); return o && Math.hypot(e.x - o.x, e.y - o.y) > 14; }),
  },
  {
    id: 'turn', plan: true,
    text: 'Now turn it or change its size. Pinch with two fingers, or drag the round handle on its corner.',
    begin: (c, s) => { s.shape = shape(c.editor); s.piece = c.editor.selEl || s.piece || practicePiece(c.editor); },
    target: (c, s) => nodeFor(c.editor, c.editor.selEl || s.piece),
    gesture: 'pinch',
    done: (c, s) => c.editor.page.els.some(e => { const o = s.shape.get(e.id); return o && (Math.abs((e.rot || 0) - o.rot) > 4 || Math.abs(e.w - o.w) > o.w * 0.06); }),
  },
  {
    id: 'photo', plan: true,
    text: 'Photos fill your page. Tap a photo spot two times. Then take the shot, or use a sample photo.',
    begin: (c, s) => { c.editor.select(null); s.filled = count(c.editor, e => e.type === 'photo' && e.blob); s.spot = c.editor.page.els.find(e => e.type === 'photo' && !e.blob); },
    skip: (c, s) => !s.spot,
    target: (c, s) => nodeFor(c.editor, s.spot),
    gesture: 'tap2',
    done: (c, s) => count(c.editor, e => e.type === 'photo' && e.blob) > s.filled,
  },
  {
    id: 'sticker', plan: true,
    text: 'Add something of your own. Tap Add, then pick a sticker.',
    begin: (c, s) => { c.editor.select(null); s.n = count(c.editor, e => e.type === 'sticker'); },
    target: () => toolBtn('Add'),
    gesture: 'tap',
    done: (c, s) => count(c.editor, e => e.type === 'sticker') > s.n,
  },
  {
    id: 'layout', plan: true,
    text: 'Tap Layout and pick a different one. Everything you placed comes with it.',
    begin: (c, s) => { c.editor.select(null); s.layout = c.editor.page.layoutId; },
    target: () => toolBtn('Layout'),
    gesture: 'tap',
    done: (c, s) => c.editor.page.layoutId !== s.layout,
  },
  {
    id: 'make', editor: true,
    text: 'That is the plan. Now tap Make for the hands-on part.',
    begin: c => c.editor.select(null),
    target: () => document.querySelector('.next-step'),
    gesture: 'tap',
    done: c => c.phase === 'make',
  },
  {
    id: 'together', editor: true, make: true,
    text: 'Tap Put it together. Every piece comes off, and you put it back by hand.',
    target: () => document.querySelector('.make-main'),
    gesture: 'tap',
    done: c => c.assembling || c.finished,
  },
  {
    id: 'build', editor: true, card: 'top', small: true,
    text: 'Follow the hint under the page. A ghost finger shows you how.',
    lost: c => !c.assembling && !c.finished, back: 'together',
    done: c => c.finished,
  },
  {
    id: 'end', editor: true, card: 'center', last: true,
    text: 'Your first page is done. Some tools do more than they show. Play around and see what you find.',
  },
];

// ---------- running it ----------
let run = null; // { i, state, card, hole, timer, shownAt }
export const tourActive = () => !!run;

export function startTour() {
  endTour(null);
  forceTips(true);
  const hole = h('div', { class: 'tour-hole' });
  const card = h('div', { class: 'tour-card' });
  document.body.append(hole, card);
  run = { i: 0, state: {}, hole, card, timer: null, demoAt: 0, demos: 0, began: false };
  run.timer = setInterval(tick, 220);
  show();
}

function endTour(how) {
  if (!run) return;
  clearInterval(run.timer);
  stopDemo();
  run.hole.remove(); run.card.remove();
  run = null;
  forceTips(false);
  if (how) { set(how); onEndHook && onEndHook(how); }
}

function go(id) {
  run.i = STEPS.findIndex(s => s.id === id);
  run.state = {}; run.began = false; run.demos = 0; run.demoAt = 0;
  stopDemo();
  show();
}
function next() {
  stopDemo();
  run.i++; run.state = {}; run.began = false; run.demos = 0; run.demoAt = 0;
  if (run.i >= STEPS.length) return endTour('done');
  show();
}

// Is the step's screen showing? Editor steps need the book open (and planning steps need Plan).
function away(st, c) {
  if (st.where === 'home') return null;
  if (!c.editor) return 'Open your new book to keep going.';
  if (st.plan && c.phase !== 'plan') return 'Tap Plan above the tools to keep going.';
  if (st.make && c.phase !== 'make' && !c.assembling) return 'Tap Make above the tools to keep going.';
  return null;
}

function show() {
  const st = STEPS[run.i], c = ctxOf();
  const n = STEPS.filter(s => !s.last).length;
  const say = away(st, c) || textOf(st);
  run.card.className = 'tour-card ' + (st.card || 'bottom') + (st.small ? ' small' : '') + (st.last ? ' last' : '');
  run.card.innerHTML = '';
  run.card.append(...[
    st.last || st.small ? null : h('div', { class: 'tour-n' }, `Step ${Math.min(run.i + 1, n)} of ${n}`),
    h('p', {}, say),
    st.last ? h('div', { class: 'row end' }, h('button', { class: 'btn primary', onclick: () => endTour('done') }, 'Start making'))
      : h('div', { class: 'row between' },
        h('button', { class: 'linkish', onclick: () => endTour('skipped') }, 'Skip the tour'),
        run.i > 1 && !st.small ? h('button', { class: 'linkish', onclick: () => next() }, 'Skip this step') : null)].filter(Boolean));
  run.card._say = say;
  if (st.last) onEndHook && onEndHook('reward');
}

// With the keyboard up, iPhone scrolls the visible area; the card follows it so it never hides off screen.
function fitCard() {
  const vv = window.visualViewport, c = run.card;
  if (!vv) return;
  if (c.classList.contains('top')) { c.style.top = vv.offsetTop + 12 + 'px'; c.style.bottom = 'auto'; }
  else if (c.classList.contains('bottom')) { c.style.top = Math.max(vv.offsetTop + 12, vv.offsetTop + vv.height - c.offsetHeight - 14) + 'px'; c.style.bottom = 'auto'; }
  else { c.style.top = ''; c.style.bottom = ''; }
}
function tick() {
  if (!run) return;
  fitCard();
  const st = STEPS[run.i], c = ctxOf();
  const awayText = away(st, c);
  // Keep the words right if you wander off and come back.
  const say = awayText || textOf(st);
  if (run.card._say !== say) show();
  // Full-screen camera and develop screens get the whole screen.
  const covered = !!document.querySelector('.cam, .dev');
  run.card.classList.toggle('hidden', covered);
  if (awayText) {
    const word = st.plan ? 'Plan' : 'Make';
    const t = !c.editor ? document.querySelector('.book-open') : [...document.querySelectorAll('.stepbar .step')].find(b => b.textContent.includes(word));
    place(covered ? null : t);
    return;
  }
  if (!run.began) {
    run.began = true;
    st.begin && st.begin(c, run.state);
    if (st.skip && st.skip(c, run.state)) return next();
  }
  if (st.lost && st.lost(c, run.state)) return go(st.back);
  if (st.done && st.done(c, run.state)) return next();
  const t = !covered && st.target ? st.target(c, run.state) : null;
  place(t);
  // The ghost finger shows the gesture, and again now and then while you have not done it yet.
  if (t && st.gesture && run.demos < 3 && Date.now() - run.demoAt > (run.demos ? 7000 : 700) && visible(t) && !document.querySelector('.ghost-layer')) {
    run.demoAt = Date.now(); run.demos++;
    const r = t.getBoundingClientRect(), m = mid(r);
    const g = st.gesture === 'tap' ? { kind: 'tap', at: m }
      : st.gesture === 'tap2' ? { kind: 'tap', at: m, times: 2 }
      : st.gesture === 'drag' ? { kind: 'path', pts: [m, { x: m.x + (m.x < innerWidth / 2 ? 60 : -60), y: m.y + (m.y < innerHeight / 2 ? 36 : -36) }] }
      : st.gesture === 'pinch' ? { kind: 'pinch', at: m, spread: Math.min(80, Math.max(40, r.width * 0.6)) } : null;
    if (g) demo(g, { repeat: 1 });
  }
}

// Is the element on top where it sits (not under a sheet or another screen)?
function visible(t) {
  const r = t.getBoundingClientRect();
  if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) return false;
  // The tour's own card never counts as covering it; it moves out of the way instead.
  if (run) run.card.style.visibility = 'hidden';
  const top = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
  if (run) run.card.style.visibility = '';
  return !!top && (t === top || t.contains(top) || top.contains(t));
}

// The light: everything dims except the place to touch. Nothing is blocked, so you can still wander.
function place(t) {
  const hole = run.hole;
  if (!t || !visible(t)) {
    hole.classList.remove('on');
    // Sheets rise from the bottom, so the card waits at the top.
    if (document.querySelector('.sheet-back') && !STEPS[run.i].card) { run.card.classList.add('top'); run.card.classList.remove('bottom'); }
    return;
  }
  const r = t.getBoundingClientRect(), pad = 8;
  hole.style.left = r.left - pad + 'px'; hole.style.top = r.top - pad + 'px';
  hole.style.width = r.width + pad * 2 + 'px'; hole.style.height = r.height + pad * 2 + 'px';
  hole.classList.add('on');
  // Keep the card out of the way of what it points at.
  const st = STEPS[run.i];
  if (!st.card) run.card.classList.toggle('top', r.top + r.height / 2 > innerHeight * 0.5), run.card.classList.toggle('bottom', r.top + r.height / 2 <= innerHeight * 0.5);
}
