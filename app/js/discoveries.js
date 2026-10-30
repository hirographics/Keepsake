// Discoveries: small one-time rewards for trying a technique, never for how a page looks.
// Nothing here judges or ranks a page, and nothing is ever taken away.
// Found ones show what you did; the rest show only a hint, so there is always more to find.
import { earn, claimed, hints, addHints, useTool } from './rewards.js';
import { isPlain } from './look.js';
import { PAGE_W, PAGE_H } from './templates.js';

export const DISCOVERY_PAY = 15;

// `tool` says where its hint can turn up while you work.
export const DISCOVERIES = [
  { id: 'cut-free', tool: 'cut', name: 'Freehand cut', hint: "Scissors don't need to be told what to cut.", did: 'You cut your own shape out of paper.' },
  { id: 'cut-shape', tool: 'cut', name: 'Punched shape', hint: 'The scissors know a few shapes by heart.', did: 'You cut a ready-made shape.' },
  { id: 'edge-zigzag', tool: 'cut', name: 'Zigzag edge', hint: 'Some blades bite.', did: 'You trimmed with zigzag scissors.' },
  { id: 'edge-scallop', tool: 'cut', name: 'Scallop edge', hint: 'Some blades are gentle, like lace.', did: 'You trimmed with scallop scissors.' },
  { id: 'edge-wave', tool: 'cut', name: 'Wave edge', hint: 'Some blades roll like the sea.', did: 'You trimmed with wave scissors.' },
  { id: 'edge-deckle', tool: 'cut', name: 'Deckle edge', hint: 'Some blades remember handmade paper.', did: 'You gave a piece a rough deckle edge.' },
  { id: 'torn', tool: 'cut', name: 'Torn by hand', hint: 'Scissors are slow. Be quick.', did: 'You tore paper with one fast swipe.' },
  { id: 'cut-photo', tool: 'cut', name: 'Cut-up photo', hint: 'Even a photo can lose an edge or two.', did: 'You cut a photo into a new shape.' },
  { id: 'collage', tool: 'page', name: 'Collage', hint: 'One sheet is never enough.', did: 'You layered three papers on one page.' },
  { id: 'matted', tool: 'page', name: 'Matted photo', hint: 'Photos like something to stand on.', did: 'You put a paper mat behind a photo.' },
  { id: 'tape-roll', tool: 'tape', name: 'Off the roll', hint: 'Not all tape comes out of a drawer.', did: 'You pulled tape straight off the roll.' },
  { id: 'flick-tear', tool: 'tape', name: 'Flick tear', hint: 'How you let go matters.', did: 'You flicked the roll and tore a ragged end.' },
  { id: 'washi-cross', tool: 'tape', name: 'See-through', hint: 'Thin tape has nothing to hide.', did: 'You crossed two strips of washi.' },
  { id: 'taped-photo', tool: 'tape', name: 'Taped down', hint: 'Corners like to be held down.', did: 'You taped across a photo edge.' },
  { id: 'flap', tool: 'tape', name: 'Secret flap', hint: 'Some photos keep secrets underneath.', did: 'You lifted a photo taped only at the top.' },
  { id: 'photo-bomb', tool: 'sticker', name: 'Photo bomb', hint: "Stickers don't respect personal space.", did: 'You stuck a sticker on a photo.' },
  { id: 'curl', tool: 'sticker', name: 'Curled corner', hint: "Stickers don't always want to lie flat.", did: 'You curled up a sticker corner.' },
  { id: 'ghost-print', tool: 'stamp', name: 'Ghost print', hint: 'Some prints are only half there.', did: 'You made a faded print with one dab.' },
  { id: 'layered-prints', tool: 'stamp', name: 'Layered prints', hint: "Ink doesn't mind company.", did: 'You stamped over another print.' },
  { id: 'postmarked', tool: 'stamp', name: 'Postmarked', hint: 'Photos can be sent, too.', did: 'You stamped right on a photo.' },
  { id: 'two-tone', tool: 'stamp', name: 'Two-tone', hint: 'One pad is never the whole story.', did: 'You inked one stamp with two colors.' },
  { id: 'twist', tool: 'stamp', name: 'Twist', hint: 'A stamp can dance a little.', did: 'You twisted a stamp with two fingers.' },
  { id: 'inked-edge', tool: 'stamp', name: 'Inked edge', hint: "Pads aren't only for stamps.", did: 'You rubbed an ink pad along a paper edge.' },
  { id: 'bleed', tool: 'page', name: 'Off the edge', hint: "The page has edges. Things don't have to.", did: 'You let a piece hang off the page edge.' },
  { id: 'tilt', tool: 'page', name: 'Off kilter', hint: 'Straight is overrated.', did: 'You turned a piece well off straight.' },
  { id: 'mixed-hands', tool: 'page', name: 'Mixed hands', hint: 'More than one hand wrote this.', did: 'You wrote in three different hands.' },
  { id: 'reframe', tool: 'camera', name: 'Reframed', hint: 'A photo can shift in its window.', did: 'You moved or zoomed a photo in its frame.' },
  { id: 'new-leak', tool: 'camera', name: 'Lucky leak', hint: 'Light finds its own way in.', did: 'You asked for a new light leak.' },
  { id: 'original-look', tool: 'camera', name: 'Straight shot', hint: "Some moments don't need a look.", did: 'You kept a photo just as it was shot.' },
  { id: 'double-exposure', tool: 'camera', name: 'Double exposure', hint: 'The film remembers what you forget to do.', did: 'You shot twice on one frame.' },
  { id: 'shake', tool: 'camera', name: 'Shake it', hint: 'Impatient photos can be hurried along.', did: 'You shook a photo to develop it faster.' },
  { id: 'holo-placed', tool: 'sticker', name: 'Shiny', hint: 'Something that catches the light.', did: 'You put a holo piece on a page.' },
  { id: 'layout-swap', tool: 'page', name: 'Shuffle', hint: 'Pages can rearrange themselves.', did: 'You switched a page to a new layout.' },
  { id: 'theme-swap', tool: 'page', name: 'Change of scene', hint: 'A book can change its clothes.', did: 'You gave a book a new theme.' },
  { id: 'palette', tool: 'page', name: 'Picky', hint: 'Drawers can be choosy.', did: 'You made a palette for a book.' },
  { id: 'by-hand', tool: 'page', name: 'All by hand', hint: 'Every piece, by hand.', did: 'You put a whole page together by hand.' },
  { id: 'long-story', tool: 'page', name: 'Long story', hint: 'Some days need more pages.', did: 'You filled four pages with photos.' },
  { id: 'shared', tool: 'page', name: 'Show and tell', hint: 'Pages are made to be seen.', did: 'You shared a page.' },
  { id: 'circle-page', tool: 'page', name: 'In good company', hint: 'Some pages are better with friends.', did: 'You sent a page to your circle.' },
  { id: 'ribbon', tool: 'page', name: 'Pinned a ribbon', hint: "Someone else's page deserves something.", did: "You gave a ribbon to a friend's page." },
];
const byId = Object.fromEntries(DISCOVERIES.map(d => [d.id, d]));
export const found = id => claimed('disc:' + id);
export const foundCount = () => DISCOVERIES.filter(d => found(d.id)).length;

function discover(id) {
  const d = byId[id];
  if (!d || found(id)) return;
  earn('disc:' + id, DISCOVERY_PAY, 'Discovery: ' + d.name);
}
export function initDiscoveries() {
  window.addEventListener('keepsake-tried', e => discover(e.detail));
  // Everyone starts with a few hints; the rest turn up later.
  if (!hints().length) addHints(['cut-free', 'tape-roll', 'ghost-print', 'matted']);
}

// ---------- hints ----------
export const hinted = id => hints().includes(id);
// Picks one hidden discovery you have no hint for yet (from one tool if given) and hands over its hint.
export async function giveHint(tool) {
  const pool = DISCOVERIES.filter(d => !found(d.id) && !hinted(d.id) && (!tool || d.tool === tool));
  if (!pool.length) return null;
  const d = pool[Math.floor(Math.random() * pool.length)];
  await addHints([d.id]);
  return d;
}
// Picking up a tool now and then turns up a hint: the 2nd time, the 5th, then every 6th.
export async function toolNote(tool) {
  const n = await useTool(tool);
  if (n !== 2 && n !== 5 && !(n > 5 && (n - 5) % 6 === 0)) return null;
  return giveHint(tool);
}

// ---------- found by looking at the book itself ----------
// Each piece's box on the page, allowing for its turn.
function box(el) {
  const t = (el.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  const h = el.h || 60;
  const hx = (c * el.w + s * h) / 2, hy = (s * el.w + c * h) / 2;
  return { x0: el.x - hx, x1: el.x + hx, y0: el.y - hy, y1: el.y + hy };
}
function overlap(a, b) {
  const A = box(a), B = box(b);
  const w = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), h = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
  if (w <= 0 || h <= 0) return 0;
  const small = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0)) || 1;
  return (w * h) / small; // share of the smaller piece that is covered
}
const inside = (a, b) => { const A = box(a), B = box(b); return A.x0 >= B.x0 && A.x1 <= B.x1 && A.y0 >= B.y0 && A.y1 <= B.y1; };
// Your own touch: added by you, or a template piece you moved, turned or changed.
const mine = el => !el.role || !!el.mine;
const turn = el => { const r = (((el.rot || 0) % 360) + 360) % 360; return Math.min(r, 360 - r); };

export function scanBook(book) {
  const hit = id => { if (!found(id)) discover(id); };
  const fonts = new Set();
  let photoPages = 0;
  for (const pg of book.pages) {
    const els = pg.els, z = el => els.indexOf(el);
    const of = type => els.filter(e => e.type === type);
    const photos = of('photo'), stamps = of('stamp'), papers = of('paper');
    if (photos.some(p => p.blob)) photoPages++;
    if (papers.length >= 3) hit('collage');
    for (const el of els) {
      if (el.type === 'text' && mine(el)) fonts.add(el.font);
      if (el.holo) hit('holo-placed');
      if (!mine(el)) continue;
      if (turn(el) >= 25) hit('tilt');
      const B = box(el);
      const onPage = B.x1 > 0 && B.x0 < PAGE_W && B.y1 > 0 && B.y0 < PAGE_H;
      if (onPage && (B.x0 < -20 || B.x1 > PAGE_W + 20 || B.y0 < -20 || B.y1 > PAGE_H + 20)) hit('bleed');
    }
    for (const p of photos) {
      if (p.cut) hit('cut-photo');
      if (p.blob && p.look && isPlain(p.look)) hit('original-look');
      const c = p.crop;
      if (c && ((c.zoom || 1) > 1.05 || Math.abs(c.x - 0.5) > 0.05 || Math.abs(c.y - 0.5) > 0.05)) hit('reframe');
      for (const m of papers) if (z(m) < z(p) && inside(p, m)) hit('matted');
      for (const t of of('tape')) if (mine(t) && z(t) > z(p) && overlap(t, p) > 0.1 && !inside(t, p)) hit('taped-photo');
      for (const s of of('sticker')) if (mine(s) && z(s) > z(p) && overlap(s, p) > 0.3) hit('photo-bomb');
      for (const s of stamps) if (mine(s) && z(s) > z(p) && overlap(s, p) > 0.3) hit('postmarked');
    }
    for (const s of stamps) if (s.inkLevel != null && s.inkLevel < 0.75) hit('ghost-print');
    const tapes = of('tape');
    for (let i = 0; i < tapes.length; i++) for (let j = i + 1; j < tapes.length; j++) if ((mine(tapes[i]) || mine(tapes[j])) && overlap(tapes[i], tapes[j]) > 0.15) hit('washi-cross');
    for (let i = 0; i < stamps.length; i++) for (let j = i + 1; j < stamps.length; j++) if ((mine(stamps[i]) || mine(stamps[j])) && overlap(stamps[i], stamps[j]) > 0.25) hit('layered-prints');
  }
  fonts.delete(undefined);
  if (fonts.size >= 3) hit('mixed-hands');
  if (book.pages.length >= 4 && photoPages >= 4) hit('long-story');
}
