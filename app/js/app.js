import { db, uid } from './db.js';
import { $, h, sheet, confirmSheet } from './ui.js';
import { loadPacks, itemsOf, asset } from './packs.js';
import { SETS, setById, matchSet, whoFrom, LENGTHS, photoSlotsFor, nextPage, makeBook, LAYOUTS, relayout, setTheme, PAGE_W, PAGE_H } from './templates.js';
import { renderPage, toBlob, bookPdf } from './render.js';
import { assembly } from './assembly.js';
import { ownsHolo, holoCount, HOLO_KINDS, resetGift, loadRewards, scraps, catalog, owns, earn, buy, bundle, buyBundle, thisWeek, giftReady, openGift, onEarned, onRewards, markActive, EARN } from './rewards.js';
import { sound } from './audio.js';
import { initTilt, startTilt, lightOn } from './tilt.js';
import { tried } from './tried.js';
import { DISCOVERIES, found, foundCount, initDiscoveries, scanBook, DISCOVERY_PAY, hinted, giveHint, toolNote } from './discoveries.js';
import { Editor, FONTS, fontCss } from './editor.js';
import { lastLook, originalLook, originalUrl } from './look.js';
import { canLiveCamera, openCamera, openDevelop } from './camera.js';
import { cutMode, tapeMode, stampMode, pullSheet, reframeMode, EDGES, SHAPES, edgeInkAt } from './tools.js';

const app = $('#app');
const mine = kind => itemsOf(kind).filter(it => owns(it.ref));
// Every owned version of a kind: the plain one, plus the holo one if you found it.
const variants = kind => mine(kind).flatMap(it => [{ it, holo: false, key: it.ref }, ...(ownsHolo(it.ref) ? [{ it, holo: true, key: it.ref + '#holo' }] : [])]);
let drawerAll = false; // false: show the book's palette; true: show everything you own
let testHolo = false;
// What a drawer shows: the open book's palette, or everything when asked (or when the book has no palette).
function drawer(kind) {
  const all = variants(kind);
  const pal = editor && editor.book.palette;
  if (drawerAll || !pal) return all;
  const keep = new Set(pal);
  return all.filter(v => keep.has(v.key));
}
// A thumbnail with the holo sheen laid over it.
function holoWrap(node, maskUrl) {
  const sh = h('span', { class: 'holo-sheen' });
  if (maskUrl) sh.style.cssText = `-webkit-mask-image:url(${maskUrl});mask-image:url(${maskUrl});-webkit-mask-size:contain;mask-size:contain;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center`;
  return h('span', { class: 'holo-wrap' }, node, sh, h('span', { class: 'holo-badge' }, 'holo'));
}
// The theme's own art that you own, as a starting palette.
function themePalette(set) {
  const refs = [...set.stickers, ...set.tapes, ...set.stamps.map(x => x[0])].map(id => 'starter/' + id);
  if (set.paper) refs.push(set.paper);
  const out = refs.filter(owns);
  for (const r of refs) if (ownsHolo(r)) out.push(r + '#holo');
  return out;
}
const svgIcon = d => { const sp = h('span', { class: 'svg-ic' }); sp.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`; return sp; };
let editor = null;
let saveTimer = null;
let enterModeRef = null; // the open book's tool starter, so sheets outside it can start a tool

// ---------- photos ----------
function pickFile(capture) {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    if (capture) input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => { resolve(input.files[0] || null); input.remove(); });
    document.body.append(input);
    input.click();
  });
}

// Gets a photo from the camera or the library, saves the original, then opens the develop screen.
// Resolves { blob, look } or null.
async function getPhoto({ capture, prompt, aspect }) {
  let file = null, when = Date.now(), flash = true;
  noteFor('camera');
  if (capture && canLiveCamera()) {
    const shot = await openCamera({ prompt, aspect });
    if (!shot) return null;
    if (shot.error) file = await pickFile(true); // camera would not start: use the iPhone camera instead
    else { file = shot.blob; flash = shot.flash; }
  } else {
    file = await pickFile(capture);
    if (file && !capture && file.lastModified) when = file.lastModified;
  }
  if (!file) return null;
  const blob = await importPhoto(file);
  const look = { ...lastLook(when), when };
  if (capture) look.flash = flash;
  const chosen = await openDevelop({ src: await originalUrl(blob), look, fresh: !!capture });
  if (!chosen) { await db.deleteBlob(blob); return null; }
  return { blob, look: chosen };
}

async function importPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const max = 2400;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    const id = uid('b');
    await db.putBlob(id, blob);
    return id;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- home ----------
async function showHome() {
  if (editor) { editor.destroy(); editor = null; }
  const books = (await db.allBooks()).sort((a, b) => b.updated - a.updated);
  app.innerHTML = '';
  const list = h('div', { class: 'books' });
  if (!books.length) {
    list.append(h('div', { class: 'empty-home' },
      h('p', {}, 'No books yet.'),
      h('p', { class: 'note' }, 'Tell it what you are going to do, and it makes the page and the shot list.')));
  }
  for (const b of books) {
    const tilt = (b.id.charCodeAt(b.id.length - 1) % 5) - 2;
    list.append(h('div', { class: 'book', style: `--tilt:${tilt}deg` },
      h('button', { class: 'book-open', onclick: () => openBook(b.id) },
        h('div', { class: 'book-title' }, b.title),
        h('div', { class: 'book-meta' }, `${b.pages.length} page${b.pages.length > 1 ? 's' : ''} · ${new Date(b.updated).toLocaleDateString()}`)),
      h('button', { class: 'book-more', 'aria-label': 'Delete book', onclick: () => confirmSheet('Delete this book?',
        `"${b.title}" and its photos will be removed from this phone. This cannot be undone.`, 'Delete', async () => {
          for (const p of b.pages) for (const e of p.els) if (e.blob) await db.deleteBlob(e.blob);
          await db.deleteBook(b.id);
          showHome();
        }) }, '✕')));
  }
  const week = h('div', { class: 'week' }, h('span', { class: 'week-label' }, 'This week'),
    thisWeek().map(d => h('span', { class: 'day' + (d.on ? ' on' : '') + (d.today ? ' today' : ''), title: d.key }, d.label)));
  app.append(h('div', { class: 'home' },
    h('header', { class: 'home-head' },
      h('div', {}, h('h1', {}, 'Keepsake'), h('p', {}, 'plan it, shoot it, stick it down')),
      scrapsChip()),
    week,
    giftReady() ? parcelCard() : null,
    h('button', { class: 'btn big', onclick: newBook }, '+ New book'),
    list,
    h('footer', { class: 'home-foot' },
      window.KEEPSAKE_ARTIFACT ? h('span', { class: 'test-links' },
        h('button', { class: 'linkish', onclick: async () => { await resetGift(); showHome(); } }, 'Testing: new parcel'),
        h('button', { class: 'linkish', onclick: async () => { testHolo = true; await resetGift(); showHome(); } }, 'holo parcel')) : h('a', { href: 'templates/' }, 'Art templates for Procreate'),
      h('span', {}, 'v0.9.1 · holo tilt'))));
}

function newBook() {
  const input = h('textarea', { class: 'plan-input', id: 'plan', rows: 2, placeholder: "I'm going to play board games with my sister." });
  let setId = SETS[0].id, manualSet = false, length = LENGTHS[0], pages = LENGTHS[0].pages;
  const themeRow = h('div', { class: 'chips' });
  const themeNote = h('p', { class: 'note tight' });
  const lengthRow = h('div', { class: 'chips' });
  const count = h('span', { class: 'count' });
  const shots = h('div', { class: 'shot-preview' });
  const stepper = h('div', { class: 'stepper' },
    h('button', { class: 'icon sm', 'aria-label': 'Fewer pages', onclick: () => { pages = Math.max(1, pages - 1); draw(); } }, '−'),
    count,
    h('button', { class: 'icon sm', 'aria-label': 'More pages', onclick: () => { pages = Math.min(12, pages + 1); draw(); } }, '+'));

  function draw() {
    const plan = input.value.trim();
    const m = matchSet(plan);
    if (!manualSet) setId = m.set.id;
    themeRow.innerHTML = '';
    for (const set of SETS) themeRow.append(h('button', {
      class: 'chip' + (set.id === setId ? ' on' : ''), onclick: () => { setId = set.id; manualSet = true; draw(); },
    }, set.name));
    themeNote.textContent = manualSet ? 'You picked this theme.' : m.word ? `Matched from "${m.word}".` : plan ? 'No theme words found, so it starts as a family day. Pick any theme.' : 'Type your plan and a theme is picked for you.';
    lengthRow.innerHTML = '';
    for (const L of LENGTHS) lengthRow.append(h('button', {
      class: 'chip' + (L === length ? ' on' : ''), onclick: () => { length = L; pages = L.pages; draw(); },
    }, L.name));
    count.textContent = `${pages} page${pages > 1 ? 's' : ''}`;
    // Live preview of the shot list this book will start with.
    const preview = makeBook({ plan: plan || 'x', setId, pages });
    const list = preview.pages.flatMap(p => p.els.filter(e => e.type === 'photo').map(e => e.prompt));
    shots.innerHTML = '';
    shots.append(h('div', { class: 'label' }, `Shot list · ${photoSlotsFor(pages)} photos`),
      h('ol', {}, list.slice(0, 5).map(t => h('li', {}, t))),
      list.length > 5 ? h('div', { class: 'note tight' }, `and ${list.length - 5} more`) : null);
  }
  input.addEventListener('input', draw);

  const s = sheet('What are you going to do?', h('div', { class: 'stack' },
    input,
    h('div', { class: 'label' }, 'Theme'), themeRow, themeNote,
    h('div', { class: 'label' }, 'How long is it?'), lengthRow,
    h('div', { class: 'row between' }, h('span', { class: 'note tight' }, 'Suggested pages. Change it any time.'), stepper),
    shots,
    h('button', { class: 'btn primary', onclick: create }, 'Make my book')), { tall: true });
  draw();
  setTimeout(() => input.focus(), 250);

  async function create() {
    const plan = input.value.trim() || setById(setId).name;
    const book = makeBook({ plan, setId, pages });
    book.palette = themePalette(setById(setId));
    await db.putBook(book);
    s.close();
    openBook(book.id);
  }
}

// ---------- editor ----------
async function openBook(id) {
  const book = await db.getBook(id);
  if (!book) return showHome();
  app.innerHTML = '';
  const pager = h('div', { class: 'pager' });
  const tools = h('div', { class: 'tools' });
  const host = h('div', { class: 'stage-host' });
  app.append(h('div', { class: 'editor' },
    h('div', { class: 'topbar' },
      h('button', { class: 'icon', 'aria-label': 'Back to books', onclick: () => { flushSave(book); showHome(); } }, '‹'),
      h('div', { class: 'title' }, book.title),
      pager,
      h('button', { class: 'icon sm share-btn', 'aria-label': 'Share and print', onclick: () => openShare() },
        svgIcon('<path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6"/>'))),
    host, tools));

  editor = new Editor(host, book, {
    onChange: b => {
      queueSave(b);
      scanBook(b);
      if (!editor.mode) drawTools(editor.selEl);
      const pg = editor.page, photos = pg.els.filter(e => e.type === 'photo');
      if (photos.length && photos.every(e => e.blob)) earn('page:' + pg.id, EARN.page, 'Page finished');
    },
    onSelect: el => drawTools(el),
    onTapSelected: el => editPiece(el),
  });
  // Under a lifted photo: a hidden note only people who lift it will see. It never prints.
  editor.onFlapNote = el => {
    const ta = h('textarea', { class: 'line-input flap-input', rows: 4, placeholder: 'Something only lifters will see' });
    ta.value = el.note || '';
    sheet('Under the photo', h('div', { class: 'stack' }, ta,
      h('p', { class: 'note tight' }, 'This stays hidden under the photo. Shared pictures and prints never show it.')), {
      onClose: () => {
        const v = ta.value.trim();
        if (v !== (el.note || '')) editor.change(() => { el.note = v || undefined; });
        if (editor.lifted && editor.lifted.id === el.id) editor.setLift(el, 150, false);
      },
    });
    setTimeout(() => ta.focus(), 250);
  };

  function drawPager() {
    pager.innerHTML = '';
    const n = book.pages.length, i = editor.pageIndex;
    pager.append(
      h('button', { class: 'icon sm', disabled: i === 0 || null, onclick: () => { editor.goPage(i - 1); drawPager(); } }, '‹'),
      h('span', {}, `${i + 1}/${n}`),
      h('button', { class: 'icon sm', disabled: i === n - 1 || null, onclick: () => { editor.goPage(i + 1); drawPager(); } }, '›'),
      h('button', { class: 'icon sm', 'aria-label': 'Add page', onclick: () => {
        book.pages.push(nextPage(book));
        editor.goPage(book.pages.length - 1);
        queueSave(book);
        drawPager();
      } }, '+'));
  }

  function drawTools(el) {
    tools.innerHTML = '';
    if (!el) {
      const shots = book.pages.flatMap(p => p.els.filter(e => e.type === 'photo'));
      const done = shots.filter(e => e.blob).length;
      tools.append(
        tool('Add', '+', openAdd),
        tool('Tools', '✂', openTools),
        tool('Layout', '▦', openLayout),
        tool(`Shots ${done}/${shots.length}`, '◉', openShots),
        tool('Undo', '↶', () => { editor.undo(); drawPager(); }),
        tool('Redo', '↷', () => { editor.redo(); drawPager(); }));
    } else {
      const editable = ['text', 'photo', 'stamp'].includes(el.type);
      const cuttable = ['paper', 'photo'].includes(el.type);
      tools.append(...[
        el.type === 'photo' && el.blob ? tool('Crop', '⤡', () => enterMode('frame', el)) : null,
        cuttable ? tool('Cut', '✂', () => enterMode('cut', el)) : null,
        editable ? tool('Edit', '✎', () => editPiece(el)) : null,
        tool('Front', '⇧', () => editor.toFront()),
        tool('Back', '⇩', () => editor.toBack()),
        tool('Copy', '⧉', () => editor.duplicate()),
        tool('Delete', '✕', () => editor.deleteSelected()),
        tool('Done', '✓', () => editor.select(null))].filter(Boolean));
    }
  }
  // ---------- hands-on tools ----------
  const hintBox = h('div', { class: 'hint' });
  host.append(hintBox);
  let hintTimer = null;
  const ui = {
    hint(text) {
      hintBox.textContent = text;
      hintBox.classList.add('show');
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => hintBox.classList.remove('show'), 2600);
    },
    refresh() { modeBar && modeBar(); },
  };
  let modeBar = null;

  function openTools() {
    const s = sheet('Tools', h('div', { class: 'stack' },
      h('button', { class: 'tool-card big assemble', onclick: () => { s.close(); startAssemble(); } },
        h('span', { class: 'tool-card-glyph' }, '✋'), h('div', {}, h('strong', {}, 'Put this page together'), h('div', { class: 'note tight' }, 'Every piece lifts off. Glue, peel, tape and stamp it back down, one at a time.'))),
      h('div', { class: 'tool-card' },
        h('div', { class: 'tool-card-head' }, h('strong', {}, 'Paper sheets'), h('span', { class: 'note tight' }, 'Pull a fresh sheet, then cut a shape out of it.')),
        h('div', { class: 'sheet-stack' }, drawer('papers').map(v => v.it).map(it => h('button', {
          class: 'sheet-pick', style: `background-image:url(${it.url})`, 'aria-label': it.name,
          onclick: () => { s.close(); pullSheet(editor, it.ref); ui.hint('Tap Cut to cut a shape out of it.'); },
        })))),
      h('button', { class: 'tool-card big', onclick: () => { s.close(); enterMode('tape'); } },
        h('span', { class: 'tool-card-glyph' }, '◎'), h('div', {}, h('strong', {}, 'Tape roll'), h('div', { class: 'note tight' }, 'Drag on the page to pull tape off the roll. Let go to tear it.'))),
      h('button', { class: 'tool-card big', onclick: () => { s.close(); enterMode('stamp'); } },
        h('span', { class: 'tool-card-glyph' }, '▣'), h('div', {}, h('strong', {}, 'Stamp'), h('div', { class: 'note tight' }, 'Ink it, hold to aim, lift to stamp.'))),
      h('div', { class: 'tool-card' }, h('strong', {}, 'Scissors'),
        h('div', { class: 'note tight' }, 'Tap a paper or a photo on the page, then tap Cut. Pattern scissors are in there too.')),
    ), { tall: true });
  }

  enterModeRef = (k, e) => enterMode(k, e);

  function startAssemble() {
    editor.select(null);
    const mode = assembly(editor, {
      panel: tools,
      onExit: () => { editor.setMode(null); drawTools(null); },
      onShare: () => openShare(),
      onFinished: (hand, total) => { if (total && hand >= total / 2) earn('asm:' + editor.page.id, EARN.assemble, 'Put together by hand'); if (total >= 5 && hand >= total) tried('by-hand'); },
    });
    editor.setMode(mode);
  }

  function enterMode(kind, el) {
    let mode;
    noteFor(kind);
    if (kind === 'cut') mode = cutMode(editor, el, ui);
    if (kind === 'frame') mode = reframeMode(editor, el, ui);
    if (kind === 'tape') { mode = tapeMode(editor, ui); const t = (drawer('tapes')[0] || variants('tapes')[0]); mode.setRef(t.it.ref, t.holo); }
    if (kind === 'stamp') { mode = stampMode(editor, ui); const st = (drawer('stamps')[0] || variants('stamps')[0]).it; mode.setRef(st.ref, st.ink); }
    editor.setMode(mode);
    const done = () => { modeBar = null; editor.setMode(null); drawTools(editor.selEl); };
    modeBar = () => {
      tools.innerHTML = '';
      const bar = h('div', { class: 'modebar' });
      if (kind === 'cut') {
        bar.append(
          h('div', { class: 'mode-row' }, h('span', { class: 'mode-label' }, 'Edge'), EDGES.map(e => owns('edge/' + e.id) ? h('button', {
            class: 'mchip' + (mode.edge === e.id ? ' on' : ''), onclick: () => { mode.setEdge(e.id); modeBar(); },
          }, edgeIcon(e.id), e.name) : h('button', { class: 'mchip locked', onclick: () => openShop('edges', 'edge/' + e.id) }, edgeIcon(e.id), e.name, h('span', { class: 'lock' }, '🔒')))),
          h('div', { class: 'mode-row' }, h('span', { class: 'mode-label' }, 'Shape'),
            SHAPES.map(sh => owns('shape/' + sh.id)
              ? h('button', { class: 'mchip shape', 'aria-label': sh.name, onclick: () => mode.shape(sh.id) }, sh.glyph)
              : h('button', { class: 'mchip shape locked', 'aria-label': sh.name + ', in the shop', onclick: () => openShop('shapes', 'shape/' + sh.id) }, sh.glyph, h('span', { class: 'lock' }, '🔒'))),
            h('button', { class: 'mchip', onclick: () => mode.trim() }, 'Trim edges'),
            el.cut ? h('button', { class: 'mchip', onclick: () => { mode.uncut(); modeBar(); } }, 'Uncut') : null));
      }
      if (kind === 'frame') {
        const range = h('input', { type: 'range', class: 'zoom-range', min: 1, max: 5, step: 0.01, value: mode.zoom, 'aria-label': 'Zoom' });
        range.addEventListener('input', () => mode.setZoom(+range.value));
        mode.onZoom = z => { range.value = z; };
        bar.append(h('div', { class: 'mode-row' }, h('span', { class: 'mode-label' }, 'Zoom'), range,
          h('button', { class: 'mchip', onclick: () => mode.reset() }, 'Reset')));
      }
      if (kind === 'tape') {
        bar.append(h('div', { class: 'mode-row' },
          drawer('tapes').map(v => h('button', {
            class: 'roll' + (v.holo ? ' holo' : '') + (mode.ref === v.it.ref && mode.holo === v.holo ? ' on' : ''), style: `background-image:url(${v.it.url})`, 'aria-label': v.it.name + (v.holo ? ', holo' : ''),
            onclick: () => { mode.setRef(v.it.ref, v.holo); modeBar(); if (v.holo) offerTilt(); },
          })),
          allToggle()));
      }
      if (kind === 'stamp') {
        bar.append(
          h('div', { class: 'mode-row' }, drawer('stamps').map(v => v.it).map(t => h('button', {
            class: 'stamp-pick' + (mode.ref === t.ref ? ' on' : ''), 'aria-label': t.name,
            onclick: () => { mode.setRef(t.ref, t.ink); modeBar(); },
          }, h('span', { style: `-webkit-mask-image:url(${t.url});mask-image:url(${t.url});background:${mode.ink}` }))), allToggle()),
          h('div', { class: 'mode-row' }, h('span', { class: 'mode-label' }, 'Ink pad'),
            INKS.slice(0, 6).map(c => h('button', {
              class: 'pad' + (mode.ink === c ? ' on' : ''), style: `--ink:${c}`, 'aria-label': 'Ink ' + c,
              // Tap to dab the stamp. Or pick the pad up and rub it along a paper edge.
              onpointerdown: e => padDrag(e, c, () => { const b = e.target.closest('.pad'); b.classList.remove('dabbed'); void b.offsetWidth; b.classList.add('dabbed'); mode.dab(c); }),
            }, h('span', { class: 'pad-level', style: 'height:100%' })))),
          h('div', { class: 'mode-row' }, h('span', { class: 'mode-label' }, 'Stamp'),
            h('span', { class: 'ink-dots' }, [0.5, 1].map(v => h('span', { class: 'ink-dot' + (mode.level >= v ? ' on' : ''), style: `--ink:${mode.ink}` }))),
            h('span', { class: 'note tight' }, mode.level >= 1 ? 'Fully inked' : mode.level > 0 ? 'Lightly inked. Dab again for full.' : 'Dry. Dab a pad.')));
      }
      tools.append(h('div', { class: 'modewrap' }, bar, h('button', { class: 'mode-done', onclick: done }, '✓', h('span', {}, 'Done'))));
    };
    modeBar();
    if (kind === 'frame') { ui.hint('Drag to move the photo. Pinch or slide to zoom.'); return; }
    ui.hint(kind === 'cut' ? 'Draw around the part you want to keep, or tap a shape.' : kind === 'tape' ? 'Drag on the page to pull tape off the roll.' : 'Dab the stamp on a pad, hold to aim, then lift to stamp.');
  }
  // Picks an ink pad up off the bar. A tap is a dab; a drag carries the pad over the page,
  // and rubbing it along the edge of a paper or photo inks that edge.
  function padDrag(e, color, tap) {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let floater = null, before = null, rubbed = 0, last = null, inked = false;
    const mv = ev => {
      if (!floater && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 12) return;
      if (!floater) {
        floater = h('div', { class: 'pad-floater', style: `--ink:${color}` });
        document.body.append(floater);
        before = editor.snap();
        sound.peel();
      }
      floater.style.left = ev.clientX + 'px'; floater.style.top = ev.clientY + 'px';
      const p = editor.pt(ev);
      const hit = edgeInkAt(editor, p, color);
      if (hit) {
        inked = true;
        if (last) rubbed += Math.hypot(p.x - last.x, p.y - last.y);
        if (rubbed > 70) { sound.pat(); rubbed = 0; }
        last = p;
      } else last = null;
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!floater) { tap(); return; }
      floater.remove();
      if (inked) { editor.commit(before); tried('inked-edge'); }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // Switches the tool bar between the book's palette and everything you own.
  const allToggle = () => editor.book.palette ? h('button', { class: 'mchip', onclick: () => { drawerAll = !drawerAll; modeBar(); } }, drawerAll ? 'Palette' : 'All') : null;
  const edgeIcon = id => {
    const d = { straight: 'M2 9H22', zigzag: 'M2 11L5 6L8 11L11 6L14 11L17 6L20 11', scallop: 'M2 10Q5 3 8 10Q11 3 14 10Q17 3 20 10', wave: 'M2 9Q6 3 10 9T18 9T22 9', deckle: 'M2 9L4 7L5 10L7 8L9 10L10 7L12 9L14 8L15 10L17 7L19 9L20 8L22 9' }[id];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 16'); svg.setAttribute('class', 'edge-ic');
    svg.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;
    return svg;
  };

  // ---------- layout and theme ----------
  function openLayout() {
    const cur = editor.page.layoutId;
    const s = sheet('Layout', h('div', { class: 'stack' },
      h('div', { class: 'label' }, 'This page'),
      h('div', { class: 'layouts' }, LAYOUTS.map(L => h('button', {
        class: 'layout-pick' + (L.id === cur ? ' on' : ''),
        onclick: () => { s.close(); editor.glide(() => relayout(book, editor.pageIndex, L.id)); tried('layout-swap'); ui.hint('Everything you added came along.'); },
      }, layoutThumb(L), h('small', {}, L.name)))),
      h('div', { class: 'label' }, 'Theme for the whole book'),
      h('div', { class: 'chips' }, SETS.map(set => h('button', {
        class: 'chip' + (set.id === book.setId ? ' on' : ''),
        onclick: () => {
          s.close();
          setTheme(book, set.id);
          tried('theme-swap');
          editor.undoStack.length = 0; editor.redoStack.length = 0;
          editor.render(); queueSave(book); drawTools(null);
          ui.hint(`Now ${set.name.toLowerCase()}. Your photos and your own changes stay.`);
        },
      }, set.name))),
      h('p', { class: 'note tight' }, 'A new theme changes the paper, art, title and prompts the template made. Switch back any time.')), { tall: true });
  }
  function layoutThumb(L) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${PAGE_W} ${PAGE_H}`);
    svg.setAttribute('class', 'layout-svg');
    let inner = `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#fbf7ef"/>`;
    for (const e of L.els) {
      const w = e.w, hh = e.h || (e.size || 40) * 1.1;
      const t = `transform="rotate(${e.rot || 0} ${e.x} ${e.y})"`;
      if (e.role === 'photo') inner += `<rect x="${e.x - w / 2}" y="${e.y - hh / 2}" width="${w}" height="${hh}" fill="#fff" stroke="#3a2e2a" stroke-width="10" ${t}/><rect x="${e.x - w / 2 + w * .08}" y="${e.y - hh / 2 + w * .08}" width="${w * .84}" height="${hh - w * .25}" fill="#d9cfc0" ${t}/>`;
      else if (e.role === 'title') inner += `<rect x="${e.x - w * .4}" y="${e.y - 22}" width="${w * .8}" height="44" rx="22" fill="#3a2e2a" ${t}/>`;
      else if (e.role === 'caption' || e.role === 'date') inner += `<rect x="${e.x - w * .35}" y="${e.y - 10}" width="${w * .7}" height="20" rx="10" fill="#9a8a7e" ${t}/>`;
      else if (e.role === 'tape') inner += `<rect x="${e.x - w / 2}" y="${e.y - 26}" width="${w}" height="52" fill="#e4572e" opacity=".55" ${t}/>`;
      else inner += `<circle cx="${e.x}" cy="${e.y}" r="${w * .38}" fill="#f3a712" opacity=".75"/>`;
    }
    svg.innerHTML = inner;
    return svg;
  }

  // ---------- share and print ----------
  async function openShare() {
    flushSave(book);
    const preview = h('div', { class: 'share-preview working' });
    const status = h('p', { class: 'note tight share-status' });
    const n = book.pages.length;
    const s = sheet('Share and print', h('div', { class: 'stack' },
      preview, status,
      h('button', { class: 'btn primary', onclick: sharePage }, 'Share this page as a picture'),
      h('button', { class: 'btn', onclick: sharePdf }, `Print-ready PDF (${n} page${n > 1 ? 's' : ''}, 8.5 x 11 in)`),
      window.KEEPSAKE_ARTIFACT ? null : h('button', { class: 'btn', onclick: printBook }, 'Print'),
      h('p', { class: 'note tight' }, window.KEEPSAKE_ARTIFACT
        ? 'The PDF prints at full size from Files or any print shop. Printing straight from here comes with the installable version.'
        : 'The PDF is 300 dots per inch, sharp enough for a print shop.')), { tall: true });
    const c = await renderPage(editor.page, 0.6);
    c.className = 'share-pic';
    preview.append(c);
    preview.classList.remove('working');

    async function sharePage() {
      status.textContent = 'Making the picture...';
      const big = await renderPage(editor.page, 2);
      const blob = await toBlob(big, 'image/jpeg', 0.92);
      await shareFiles([new File([blob], fileName(`page-${editor.pageIndex + 1}.jpg`), { type: 'image/jpeg' })], big);
    }
    async function sharePdf() {
      const blob = await bookPdf(book, (i, total) => { status.textContent = `Rendering page ${i + 1} of ${total}...`; });
      await shareFiles([new File([blob], fileName('book.pdf'), { type: 'application/pdf' })]);
    }
    async function printBook() {
      status.textContent = 'Getting the pages ready...';
      const box = h('div', { id: 'print' });
      for (const page of book.pages) {
        const pc = await renderPage(page, 3);
        box.append(h('img', { src: URL.createObjectURL(await toBlob(pc, 'image/jpeg', 0.92)), alt: '' }));
      }
      document.body.append(box);
      await Promise.all([...box.querySelectorAll('img')].map(i => i.decode().catch(() => {})));
      status.textContent = '';
      window.print();
      setTimeout(() => box.remove(), 1000);
    }
    async function shareFiles(files, pic) {
      status.textContent = '';
      tried('shared');
      // Test copy: the page saves through the Claude app. Installed: the iPhone share sheet.
      if (window.KEEPSAKE_ARTIFACT && window.claude && window.claude.use) {
        const downloads = await window.claude.use('downloads');
        if (downloads) {
          try { for (const f of files) await downloads.save({ filename: f.name, data: f }); status.textContent = 'Saved.'; return; }
          catch (e) { if (e && e.code === 'declined') { status.textContent = ''; return; } }
        }
      } else if (navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      // Last resort: show it full screen to press and hold.
      if (pic) showPicture(pic);
      else { const a = h('a', { href: URL.createObjectURL(files[0]), target: '_blank', rel: 'noopener' }, 'Open the PDF'); status.textContent = ''; status.append(a); }
    }
  }
  const fileName = suffix => `${(book.title || 'keepsake').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40).toLowerCase() || 'keepsake'}-${suffix}`;
  function showPicture(c) {
    const img = h('img', { src: c.toDataURL('image/jpeg', 0.9), alt: 'Your page' });
    const v = h('div', { class: 'viewer', onclick: () => v.remove() }, img, h('p', {}, 'Press and hold the picture to save it. Tap to close.'));
    document.body.append(v);
  }

  function openShots() {
    const rows = [];
    book.pages.forEach((p, pi) => p.els.filter(e => e.type === 'photo').forEach(e => rows.push({ e, pi })));
    const done = rows.filter(r => r.e.blob).length;
    const s = sheet('Shot list', h('div', { class: 'stack' },
      h('p', { class: 'note tight' }, rows.length ? `${done} of ${rows.length} taken. Tap one to take it or choose it.` : 'This book has no photo spots yet.'),
      h('div', { class: 'shots' }, rows.map(({ e, pi }) => h('button', {
        class: 'shot' + (e.blob ? ' done' : ''),
        onclick: () => { s.close(); editor.goPage(pi); drawPager(); editor.select(e.id); editPiece(e); },
      }, h('span', { class: 'tick' }, e.blob ? '✓' : ''), h('span', { class: 'shot-text' }, e.prompt || 'Photo'), h('span', { class: 'shot-page' }, `p.${pi + 1}`))))), { tall: true });
  }
  const tool = (label, glyph, fn) => h('button', { class: 'tool', onclick: fn }, h('span', { class: 'g' }, glyph), h('span', {}, label));

  drawPager();
  drawTools(null);
  if (book.pages.some(pg => pg.els.some(e => e.holo))) offerTilt();
  // Give the stage its size before the first fit.
  requestAnimationFrame(() => editor.fit());
}

function queueSave(book) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => flushSave(book), 400);
}
function flushSave(book) {
  clearTimeout(saveTimer);
  book.updated = Date.now();
  db.putBook(book);
}

// ---------- add sheet ----------
function openAdd() {
  const tabs = [
    ['Stickers', () => vgrid('stickers', v => v.holo ? holoWrap(thumbImg(v.it.url), v.it.url) : thumbImg(v.it.url), v => { editor.add({ type: 'sticker', ref: v.it.ref, holo: v.holo, w: 160, h: 160 }); noteFor('sticker'); if (v.holo) offerTilt(); })],
    ['Stamps', () => vgrid('stamps', v => thumbStamp(v.it), v => editor.add({ type: 'stamp', ref: v.it.ref, ink: v.it.ink, w: 170, h: 170 }))],
    ['Tape', () => vgrid('tapes', v => { const t = h('div', { class: 'thumb-tape', style: `background-image:url(${v.it.url})` }); return v.holo ? holoWrap(t) : t; }, v => { editor.add({ type: 'tape', ref: v.it.ref, holo: v.holo, w: 260, h: 60 }); if (v.holo) offerTilt(); }, 'wide')],
    ['Page', () => h('div', {},
      h('p', { class: 'note' }, 'The paper the whole page is printed on.'),
      h('div', { class: 'grid' }, mine('papers').map(it =>
        h('button', { class: 'cell' + (editor.page.paper === it.ref ? ' on' : ''), onclick: () => { editor.setPaper(it.ref); s.close(); } },
          h('div', { class: 'thumb-paper', style: `background-image:url(${it.url})` }), h('small', {}, it.name)))))],
    ['Paper', () => h('div', {},
      h('p', { class: 'note' }, 'A piece of paper to layer under photos. Select it and tap Cut to shape it.'),
      vgrid('papers', v => h('div', { class: 'thumb-paper', style: `background-image:url(${v.it.url})` }), v => editor.add({ type: 'paper', ref: v.it.ref, w: 340, h: 260 })))],
    ['Text', () => grid(FONTS, f => h('div', { class: 'thumb-font', style: `font-family:${f.css}` }, 'Aa', h('small', {}, f.name)),
      f => editor.add({ type: 'text', text: 'Tap twice to edit', font: f.id, size: 48, color: '#3a2e2a', align: 'center', w: 420, h: 0 }))],
    ['Photo', () => h('div', { class: 'stack' },
      h('button', { class: 'btn', onclick: () => { s.close(); editor.add({ type: 'photo', w: 320, h: 360, prompt: 'Add a photo', frame: 'polaroid', blob: null, crop: { x: 0.5, y: 0.5, zoom: 1 } }); } }, 'Add an empty photo spot'),
      h('button', { class: 'btn', onclick: async () => {
        s.close();
        const got = await getPhoto({ capture: false });
        if (!got) return;
        editor.add({ type: 'photo', w: 320, h: 360, prompt: '', frame: 'polaroid', blob: got.blob, look: got.look, crop: { x: 0.5, y: 0.5, zoom: 1 } });
      } }, 'Add a photo from my library'))],
  ];
  const bar = h('div', { class: 'tabs' });
  const pane = h('div', { class: 'pane' });
  const scope = h('div', { class: 'scope' });
  let current = 0;
  function drawScope() {
    scope.innerHTML = '';
    const hasPal = !!editor.book.palette;
    scope.append(
      h('div', { class: 'seg' },
        h('button', { class: !drawerAll && hasPal ? 'on' : '', disabled: !hasPal || null, onclick: () => { drawerAll = false; drawScope(); show(current); } }, 'Palette'),
        h('button', { class: drawerAll || !hasPal ? 'on' : '', onclick: () => { drawerAll = true; drawScope(); show(current); } }, 'Everything')),
      h('button', { class: 'linkish', onclick: () => { s.close(); openPalette(); } }, hasPal ? 'Edit palette' : 'Make a palette'));
  }
  function show(i) {
    current = i;
    bar.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
    pane.innerHTML = '';
    pane.append(tabs[i][1]());
  }
  tabs.forEach(([name], i) => bar.append(h('button', { onclick: () => show(i) }, name)));
  const s = sheet('Add', h('div', {}, scope, bar, pane), { tall: true });
  drawScope();
  show(current);

  function vgrid(kind, thumb, onPick, cls = '') {
    const list = drawer(kind);
    if (!list.length) return h('div', { class: 'stack' },
      h('p', { class: 'note' }, 'Nothing from your palette here yet.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', onclick: () => { drawerAll = true; drawScope(); show(current); } }, 'Show everything'),
        h('button', { class: 'btn small', onclick: () => { s.close(); openPalette(kind); } }, 'Add to palette')));
    return h('div', { class: 'grid ' + cls }, list.map(v => h('button', { class: 'cell', onclick: () => { s.close(); onPick(v); } }, thumb(v))),
      h('button', { class: 'cell shop-cell', onclick: () => { s.close(); openShop(kind); } }, h('span', { class: 'g' }, '+'), h('small', {}, 'More in the shop')));
  }

  function grid(items, thumb, onPick, cls = '', kind = null) {
    return h('div', { class: 'grid ' + cls }, items.map(it => h('button', { class: 'cell', onclick: () => { s.close(); onPick(it); } }, thumb(it))),
      kind ? h('button', { class: 'cell shop-cell', onclick: () => { s.close(); openShop(kind); } }, h('span', { class: 'g' }, '+'), h('small', {}, 'More in the shop')) : null);
  }
}
const thumbImg = url => h('img', { src: url, alt: '' });
const thumbStamp = it => h('div', { class: 'thumb-stamp', style: `-webkit-mask-image:url(${it.url});mask-image:url(${it.url});background:${it.ink}` });

function openPaper() {
  const s = sheet('Page paper', h('div', { class: 'grid' }, itemsOf('papers').map(it =>
    h('button', { class: 'cell' + (editor.page.paper === it.ref ? ' on' : ''), onclick: () => { editor.setPaper(it.ref); s.close(); } },
      h('div', { class: 'thumb-paper', style: `background-image:url(${it.url})` }), h('small', {}, it.name)))));
}

// ---------- edit a piece ----------
const INKS = ['#3a2e2a', '#b5322c', '#2f4b8a', '#3b6e4f', '#c98a00', '#c95d7f', '#fffdf8'];

function editPiece(el) {
  const before = editor.snap();
  const done = () => editor.commit(before);
  if (el.type === 'text') editText(el, done);
  else if (el.type === 'photo') editPhoto(el, done);
  else if (el.type === 'stamp') editStamp(el, done);
}

function editText(el, done) {
  const ta = h('textarea', { class: 'text-input', rows: 3 });
  ta.value = el.text;
  ta.style.fontFamily = fontCss(el.font);
  ta.addEventListener('input', () => { el.text = ta.value; editor.refresh(el); });
  const fonts = h('div', { class: 'chips' }, FONTS.map(f => h('button', {
    class: 'chip' + (f.id === el.font ? ' on' : ''), style: `font-family:${f.css}`,
    onclick: e => { el.font = f.id; el.mine = true; ta.style.fontFamily = f.css; fonts.querySelectorAll('.chip').forEach(c => c.classList.remove('on')); e.currentTarget.classList.add('on'); editor.refresh(el); },
  }, f.name)));
  const size = h('input', { type: 'range', min: 18, max: 160, value: Math.round(el.size) });
  size.addEventListener('input', () => { const k = size.value / el.size; el.size = +size.value; el.w = Math.max(80, el.w * k); editor.refresh(el); });
  const colors = swatches(el.color, c => { el.color = c; editor.refresh(el); });
  const align = h('div', { class: 'chips' }, ['left', 'center', 'right'].map(a => h('button', {
    class: 'chip' + ((el.align || 'center') === a ? ' on' : ''),
    onclick: e => { el.align = a; align.querySelectorAll('.chip').forEach(c => c.classList.remove('on')); e.currentTarget.classList.add('on'); editor.refresh(el); },
  }, a)));
  sheet('Text', h('div', { class: 'stack' }, ta, label('Handwriting'), fonts, label('Size'), size, label('Color'), colors, label('Line up'), align), { onClose: done });
  setTimeout(() => ta.focus(), 250);
}

function editPhoto(el, done) {
  const prompt = h('input', { class: 'line-input', value: el.prompt || '', placeholder: 'What should this photo show?' });
  prompt.addEventListener('input', () => { el.prompt = prompt.value; editor.refresh(el); });
  const frames = h('div', { class: 'chips' }, [['polaroid', 'Instant'], ['border', 'White border'], ['none', 'No frame']].map(([f, name]) => h('button', {
    class: 'chip' + ((el.frame || 'polaroid') === f ? ' on' : ''),
    onclick: e => { el.frame = f; frames.querySelectorAll('.chip').forEach(c => c.classList.remove('on')); e.currentTarget.classList.add('on'); editor.refresh(el); },
  }, name)));
  const s = sheet('Photo', h('div', { class: 'stack' },
    el.prompt ? h('p', { class: 'prompt-big' }, el.prompt) : null,
    h('button', { class: 'btn primary', onclick: () => fill(true) }, 'Take a photo'),
    h('button', { class: 'btn', onclick: () => fill(false) }, 'Choose from my library'),
    el.blob ? h('button', { class: 'btn', onclick: () => { s.close(); enterModeRef && enterModeRef('frame', el); } }, 'Move the framing') : null,
    el.blob ? h('button', { class: 'btn', onclick: changeLook }, 'Change the look') : null,
    el.blob ? h('button', { class: 'btn danger-quiet', onclick: () => { el.blob = null; el.look = null; editor.refresh(el); s.close(); } }, 'Take the photo out') : null,
    label('Frame'), frames,
    label('Photo prompt'), prompt,
    canLiveCamera() ? null : h('p', { class: 'note' }, 'In this test copy, "Take a photo" opens the iPhone camera and the look is added after. The live viewfinder comes with the installable version.')), { onClose: done });
  async function fill(capture) {
    const win = document.querySelector(`.el[data-id="${el.id}"] .b > :first-child`);
    const aspect = win && win.offsetHeight ? win.offsetWidth / win.offsetHeight : 3 / 4;
    const got = await getPhoto({ capture, prompt: el.prompt, aspect });
    if (!got) return;
    el.crop = null; // a new photo starts centred, exactly as framed in the viewfinder
    el.blob = got.blob;
    el.look = got.look;
    editor.refresh(el);
    s.close();
    if (el.role === 'photo') earn('shot:' + el.id, EARN.shot, 'A shot from your list');
  }
  async function changeLook() {
    const look = await openDevelop({ src: await originalUrl(el.blob), look: el.look || originalLook(Date.now()), title: 'Change the look' });
    if (!look) return;
    el.look = look;
    editor.refresh(el);
    s.close();
  }
}

function editStamp(el, done) {
  sheet('Stamp ink', h('div', { class: 'stack' }, swatches(el.ink, c => { el.ink = c; editor.refresh(el); })), { onClose: done });
}

function swatches(current, onPick) {
  const row = h('div', { class: 'swatches' }, INKS.map(c => h('button', {
    class: 'sw' + (c === current ? ' on' : ''), style: `background:${c}`, 'aria-label': c,
    onclick: e => { row.querySelectorAll('.sw').forEach(x => x.classList.remove('on')); e.currentTarget.classList.add('on'); onPick(c); },
  })));
  return row;
}
const label = t => h('div', { class: 'label' }, t);

// ---------- tilt to shine ----------
// Offers tilt once a holo piece is on screen. iPhone only lets it start from a tap.
// If motion is blocked here, says so plainly and lets a finger move the light instead.
function offerTilt() {
  setTimeout(() => {
    if (lightOn() || document.querySelector('.tilt-offer')) return;
    const b = h('button', { class: 'tilt-offer', onclick: async () => {
      b.textContent = 'Checking motion…';
      const how = await startTilt();
      b.remove();
      if (how === 'tilt') toastScraps(0, 'Tilt your phone to make holo shine');
      else sheet('Motion is blocked here', [
        h('p', {}, window.KEEPSAKE_ARTIFACT
          ? 'This test copy runs inside Claude, which does not let pages read your phone\'s motion. Tilt will work in the installed app.'
          : 'Your phone did not share its motion. On iPhone, close the app fully and tap Tilt to shine again, then tap Allow.'),
        h('p', {}, 'For now, drag a finger anywhere on the screen and the light follows it, the same way tilting would.'),
      ]);
    } }, '✨ Tilt to shine');
    document.body.append(b);
    setTimeout(() => b.remove(), 15000);
  }, 1500); // give a phone that needs no permission time to start on its own
}

// ---------- palette ----------
// Pick the pieces this book will use. Tap to add or remove; holo versions count separately.
function openPalette(startKind = 'stickers') {
  const book = editor.book;
  const pal = new Set(book.palette || themePalette(setById(book.setId)));
  const kinds = [['stickers', 'Stickers'], ['tapes', 'Tape'], ['stamps', 'Stamps'], ['papers', 'Paper']];
  const bar = h('div', { class: 'tabs' });
  const pane = h('div', { class: 'pane' });
  const count = h('span', { class: 'note tight' });
  let cur = Math.max(0, kinds.findIndex(k => k[0] === startKind));
  function show(i) {
    cur = i;
    bar.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
    count.textContent = `${pal.size} pieces in this book's palette`;
    pane.innerHTML = '';
    const kind = kinds[i][0];
    pane.append(h('div', { class: 'grid' + (kind === 'tapes' ? ' wide' : '') }, variants(kind).map(v => {
      const thumb = kind === 'stickers' ? h('img', { src: v.it.url, alt: '' })
        : kind === 'stamps' ? thumbStamp(v.it)
        : kind === 'tapes' ? h('div', { class: 'thumb-tape', style: `background-image:url(${v.it.url})` })
        : h('div', { class: 'thumb-paper', style: `background-image:url(${v.it.url})` });
      const cell = h('button', { class: 'cell pal' + (pal.has(v.key) ? ' picked' : ''), 'aria-pressed': pal.has(v.key) ? 'true' : 'false', onclick: () => {
        pal.has(v.key) ? pal.delete(v.key) : pal.add(v.key);
        sound.press();
        show(cur);
      } }, v.holo ? holoWrap(thumb, kind === 'stickers' ? v.it.url : null) : thumb, h('span', { class: 'check' }, '✓'));
      return cell;
    })));
  }
  kinds.forEach(([, name], i) => bar.append(h('button', { onclick: () => show(i) }, name)));
  sheet('Palette', h('div', { class: 'stack' },
    h('p', { class: 'note tight' }, 'Pick what this book uses. Your whole collection stays one tap away under Everything.'),
    h('div', { class: 'row between' }, count,
      h('button', { class: 'linkish', onclick: () => { pal.clear(); themePalette(setById(book.setId)).forEach(k => pal.add(k)); show(cur); } }, 'Reset to theme')),
    bar, pane), {
    tall: true,
    onClose: () => { book.palette = [...pal]; drawerAll = false; queueSave(book); if (pal.size) tried('palette'); },
  });
  show(cur);
}

// ---------- scraps, shop, parcel ----------
function scrapsChip() {
  const n = h('span', { class: 'scrap-count' }, String(scraps()));
  const chip = h('button', { class: 'scrap-chip', 'aria-label': 'Scraps and shop', onclick: () => openShop() }, h('span', { class: 'coin' }), n);
  const off = onRewards(st => { if (!n.isConnected) { off(); return; } n.textContent = String(st.scraps); });
  return chip;
}

// Now and then a tool turns up a hint for a hidden discovery, like a note falling out of a drawer.
async function noteFor(tool) {
  const d = await toolNote(tool);
  if (d) toastScraps(0, `A note: “${d.hint}”`);
}

// Toasts wait their turn, so two at once never cover each other.
let toastAt = 0;
function toastScraps(amount, reason) {
  const wait = Math.max(0, toastAt - Date.now());
  toastAt = Date.now() + wait + 2000;
  setTimeout(() => {
    if (amount) sound.coin();
    const disc = /^Discovery: /.test(reason);
    const t = h('div', { class: 'scrap-toast' + (disc ? ' discovery' : '') + (/^A note: /.test(reason) ? ' paper-note' : '') },
      disc ? h('span', { class: 'disc-star' }, '✦') : null,
      /^A note: /.test(reason) ? h('span', { class: 'disc-star' }, '✉') : null,
      amount ? h('span', { class: 'coin' }) : null, amount ? h('strong', {}, `${amount > 0 ? '+' : ''}${amount}`) : null,
      h('span', {}, disc ? reason.replace(/^Discovery: /, 'Found: ') : reason));
    document.body.append(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, /^A note: /.test(reason) ? 3400 : 1900);
  }, wait);
}

const KIND_NAMES = { stickers: 'Stickers', stamps: 'Stamps', tapes: 'Tape', papers: 'Paper', shapes: 'Cut shapes', edges: 'Pattern scissors' };
function itemThumb(c) {
  const it = c.item;
  if (c.kind === 'stickers') return h('img', { src: it.url, alt: '' });
  if (c.kind === 'stamps') return h('div', { class: 'thumb-stamp', style: `-webkit-mask-image:url(${it.url});mask-image:url(${it.url});background:${it.ink}` });
  if (c.kind === 'tapes') return h('div', { class: 'thumb-tape', style: `background-image:url(${it.url})` });
  if (c.kind === 'papers') return h('div', { class: 'thumb-paper', style: `background-image:url(${it.url})` });
  if (c.kind === 'shapes') return h('div', { class: 'thumb-glyph' }, it.glyph);
  if (c.kind === 'edges') return h('div', { class: 'thumb-glyph small' }, it.name);
  return h('div', { class: 'thumb-glyph' }, '✦');
}

function openShop(focusKind = null, focusId = null) {
  const wallet = h('div', { class: 'wallet' });
  const bar = h('div', { class: 'tabs' });
  const pane = h('div', { class: 'pane' });
  const confirmBox = h('div', { class: 'buy-box', hidden: true });
  let tab = 0;
  const drawWallet = () => { wallet.innerHTML = ''; wallet.append(h('span', { class: 'coin' }), h('strong', {}, String(scraps())), h('span', {}, ' scraps')); };
  function show(i) {
    tab = i;
    bar.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === i));
    pane.innerHTML = '';
    const all = catalog();
    if (i === 0) {
      const b = bundle();
      if (b.items.length > 1) pane.append(h('button', { class: 'bundle', onclick: () => ask({ name: `All ${b.items.length} things left`, price: b.price, bundle: true }) },
        h('strong', {}, 'Everything left'), h('span', {}, `${b.items.length} items · `, h('s', {}, String(b.full)), ` ${b.price} scraps`)));
      for (const kind of Object.keys(KIND_NAMES)) {
        const items = all.filter(c => c.kind === kind && !owns(c.id));
        if (!items.length) continue;
        const sec = h('div', { class: 'shop-sec' }, h('div', { class: 'label' }, KIND_NAMES[kind]),
          h('div', { class: 'grid' + (kind === 'tapes' ? ' wide' : '') }, items.map(c => h('button', {
            class: 'cell shop-item' + (c.id === focusId ? ' focus' : ''), onclick: () => ask(c),
          }, itemThumb(c), h('span', { class: 'price' }, h('span', { class: 'coin sm' }), String(c.price))))));
        pane.append(sec);
        if (kind === focusKind) setTimeout(() => sec.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250);
      }
      if (!pane.children.length) pane.append(h('p', { class: 'note' }, 'You own everything in the shop. New packs will show up here.'));
    } else if (i === 2) {
      // Found ones say what you did. Hidden ones show a hint only once you have come across it.
      const rank = d => (found(d.id) ? 0 : hinted(d.id) ? 1 : 2);
      pane.append(h('p', { class: 'note tight' }, `${foundCount()} found, the rest still hidden. Each pays ${DISCOVERY_PAY} scraps the first time. Hints turn up in parcels and while you work.`),
        h('div', { class: 'disc-grid' }, [...DISCOVERIES].sort((a, b) => rank(a) - rank(b)).map(d => found(d.id)
          ? h('div', { class: 'disc found' }, h('span', { class: 'disc-star' }, '✦'), h('strong', {}, d.name), h('span', {}, d.did))
          : hinted(d.id)
            ? h('div', { class: 'disc hint' }, h('span', { class: 'disc-star' }, '?'), h('strong', {}, 'A hint'), h('span', {}, `“${d.hint}”`))
            : h('div', { class: 'disc hidden' }, h('span', { class: 'disc-star' }, '·'), h('strong', {}, '???'), h('span', {}, 'Still hidden')))));
    } else {
      const owned = all.filter(c => owns(c.id)).length;
      pane.append(h('p', { class: 'note tight' }, `${owned} of ${all.length} collected · ${holoCount()} holo found.`));
      for (const kind of Object.keys(KIND_NAMES)) {
        pane.append(h('div', { class: 'label' }, KIND_NAMES[kind]),
          h('div', { class: 'grid' + (kind === 'tapes' ? ' wide' : '') }, all.filter(c => c.kind === kind).map(c => h('div', {
            class: 'cell album' + (owns(c.id) ? '' : ' missing'),
          }, ownsHolo(c.id) ? holoWrap(itemThumb(c), c.kind === 'stickers' ? c.item.url : null) : itemThumb(c)))));
      }
    }
  }
  function ask(c) {
    confirmBox.hidden = false;
    confirmBox.innerHTML = '';
    const short = c.price - scraps();
    if (short > 0) {
      confirmBox.append(h('p', {}, `${c.name}: ${c.price} scraps. You need ${short} more.`),
        h('p', { class: 'note tight' }, `A finished page pays ${EARN.page}, each shot from your list ${EARN.shot}, putting a page together ${EARN.assemble}, and each new discovery ${DISCOVERY_PAY}.`),
        h('button', { class: 'btn small', onclick: () => { confirmBox.hidden = true; } }, 'OK'));
      return;
    }
    confirmBox.append(h('p', {}, `${c.name} for ${c.price} scraps?`),
      h('div', { class: 'row end' },
        h('button', { class: 'btn small', onclick: () => { confirmBox.hidden = true; } }, 'Not now'),
        h('button', { class: 'btn small primary', onclick: async () => {
          const r = c.bundle ? await buyBundle() : await buy(c.id);
          confirmBox.hidden = true;
          if (r.ok) { drawWallet(); show(tab); toastScraps(-c.price, `${c.name} is yours`); }
        } }, 'Buy it')));
  }
  ['Shop', 'My collection', 'Discoveries'].forEach((name, i) => bar.append(h('button', { onclick: () => show(i) }, name)));
  drawWallet();
  sheet('Shop', h('div', { class: 'stack' }, wallet, bar, confirmBox, pane), { tall: true });
  show(0);
}

// The daily parcel: pull the string across to tear the paper open.
function parcelCard() {
  const box = h('div', { class: 'parcel' }, h('div', { class: 'half left' }), h('div', { class: 'half right' }), h('div', { class: 'twine' }));
  const tab = h('div', { class: 'pull-tab' });
  const prize = h('div', { class: 'prize' });
  const text = h('div', { class: 'parcel-text' }, h('strong', {}, "Today's parcel"), h('span', {}, 'Pull the string across to open it.'));
  const card = h('div', { class: 'parcel-card' }, h('div', { class: 'parcel-stage' }, prize, box, tab), text);
  let start = null, opened = false, hiss = null;
  tab.addEventListener('pointerdown', e => { if (opened) return; e.preventDefault(); tab.setPointerCapture(e.pointerId); start = e.clientX; hiss = sound.unroll(); });
  tab.addEventListener('pointermove', e => {
    if (start == null || opened) return;
    const dx = Math.max(0, e.clientX - start);
    tab.style.transform = `translateX(${Math.min(dx, 150)}px)`;
    box.style.setProperty('--open', Math.min(1, dx / 150));
    hiss.speed(Math.abs(e.movementX || 4) * 1.5);
    if (dx > 140) open();
  });
  const up = () => { if (opened || start == null) return; start = null; hiss && hiss.stop(); tab.style.transform = ''; box.style.setProperty('--open', 0); };
  tab.addEventListener('pointerup', up);
  tab.addEventListener('pointercancel', up);
  async function open() {
    opened = true;
    hiss && hiss.stop();
    sound.tear();
    box.classList.add('torn');
    tab.remove();
    const gift = await openGift(testHolo);
    testHolo = false;
    if (!gift) return;
    prize.append(gift.holo ? holoWrap(itemThumb(gift), gift.kind === 'stickers' ? gift.item.url : null) : itemThumb(gift));
    if (gift.holo) { card.classList.add('rare'); offerTilt(); }
    prize.classList.add('show');
    setTimeout(() => sound.done(), 250);
    text.innerHTML = '';
    const note = await giveHint();
    if (note) setTimeout(() => text.append(h('span', { class: 'parcel-note' }, '✉ A note was tucked inside: ', h('em', {}, `“${note.hint}”`))), 900);
    text.append(h('strong', {}, gift.kind === 'scraps' ? `${gift.name}!` : gift.holo ? `A holo ${gift.name.replace(' (holo)', '')}!` : `${gift.name} is yours`),
      h('span', {}, gift.kind === 'scraps' ? 'You already own everything, so here are scraps.' : gift.holo ? 'A rare shiny one. It is in your drawers now.' : 'It is in your drawers now. See you tomorrow for another.'));
  }
  return card;
}

// ---------- start ----------
(async function start() {
  await Promise.all([loadPacks(), document.fonts.ready, loadRewards()]);
  initTilt();
  onEarned((amount, reason) => toastScraps(amount, reason));
  initDiscoveries();
  await Promise.all(FONTS.map(f => document.fonts.load(`40px ${f.css.split(',')[0]}`).catch(() => {})));
  showHome();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
