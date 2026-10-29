// Discoveries: small one-time rewards for trying a technique, never for how a page looks.
// Nothing here judges or ranks a page, and nothing is ever taken away.
// Found ones show what you did; the rest show only a hint, so there is always more to find.
import { earn, claimed } from './rewards.js';
import { isPlain } from './look.js';
import { PAGE_W, PAGE_H } from './templates.js';

export const DISCOVERY_PAY = 15;

export const DISCOVERIES = [
  { id: 'cut-free', name: 'Freehand cut', hint: 'Scissors do not need a shape to follow.', did: 'You cut your own shape out of paper.' },
  { id: 'cut-shape', name: 'Punched shape', hint: 'There are shapes hiding in the scissors.', did: 'You cut a ready-made shape.' },
  { id: 'edge-zigzag', name: 'Zigzag edge', hint: 'Some scissors leave a fancy edge.', did: 'You trimmed with zigzag scissors.' },
  { id: 'edge-scallop', name: 'Scallop edge', hint: 'Soft bumps, like a doily.', did: 'You trimmed with scallop scissors.' },
  { id: 'edge-wave', name: 'Wave edge', hint: 'An edge that rolls like the sea.', did: 'You trimmed with wave scissors.' },
  { id: 'edge-deckle', name: 'Deckle edge', hint: 'Rough, like handmade paper.', did: 'You gave a piece a rough deckle edge.' },
  { id: 'cut-photo', name: 'Cut-up photo', hint: 'Photos can go under the scissors too.', did: 'You cut a photo into a new shape.' },
  { id: 'collage', name: 'Collage', hint: 'One sheet of paper is rarely enough.', did: 'You layered three papers on one page.' },
  { id: 'matted', name: 'Matted photo', hint: 'Try a paper behind a photo.', did: 'You put a paper mat behind a photo.' },
  { id: 'tape-roll', name: 'Off the roll', hint: 'Tape does not have to come from the drawer.', did: 'You pulled tape straight off the roll.' },
  { id: 'taped-photo', name: 'Taped down', hint: 'Tape a photo down yourself.', did: 'You taped across a photo edge.' },
  { id: 'photo-bomb', name: 'Photo bomb', hint: 'A sticker can sit right on a photo.', did: 'You stuck a sticker on a photo.' },
  { id: 'ghost-print', name: 'Ghost print', hint: 'What does a stamp do with just a little ink?', did: 'You made a faded print with one dab.' },
  { id: 'layered-prints', name: 'Layered prints', hint: 'Stamps can overlap.', did: 'You stamped over another print.' },
  { id: 'postmarked', name: 'Postmarked', hint: 'Stamps work on photos, too.', did: 'You stamped right on a photo.' },
  { id: 'bleed', name: 'Off the edge', hint: 'Not everything has to stay on the page.', did: 'You let a piece hang off the page edge.' },
  { id: 'tilt', name: 'Off kilter', hint: 'Not everything has to be straight.', did: 'You turned a piece well off straight.' },
  { id: 'mixed-hands', name: 'Mixed hands', hint: 'One handwriting is just the start.', did: 'You wrote in three different hands.' },
  { id: 'reframe', name: 'Reframed', hint: 'A photo can move inside its frame.', did: 'You moved or zoomed a photo in its frame.' },
  { id: 'new-leak', name: 'Lucky leak', hint: 'Light leaks are never the same twice.', did: 'You asked for a new light leak.' },
  { id: 'original-look', name: 'Straight shot', hint: 'Not every photo needs the disposable look.', did: 'You kept a photo just as it was shot.' },
  { id: 'holo-placed', name: 'Shiny', hint: 'Rare pieces come in parcels.', did: 'You put a holo piece on a page.' },
  { id: 'layout-swap', name: 'Shuffle', hint: 'A page can change its layout mid-build.', did: 'You switched a page to a new layout.' },
  { id: 'theme-swap', name: 'Change of scene', hint: 'A book can change its whole theme.', did: 'You gave a book a new theme.' },
  { id: 'palette', name: 'Picky', hint: 'Your drawers can show just your favorites.', did: 'You made a palette for a book.' },
  { id: 'by-hand', name: 'All by hand', hint: 'Put a page together without skipping.', did: 'You put a whole page together by hand.' },
  { id: 'long-story', name: 'Long story', hint: 'Some days need more than a page or two.', did: 'You filled four pages with photos.' },
  { id: 'shared', name: 'Show and tell', hint: 'Pages are made to be seen.', did: 'You shared a page.' },
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
    for (let i = 0; i < stamps.length; i++) for (let j = i + 1; j < stamps.length; j++) if ((mine(stamps[i]) || mine(stamps[j])) && overlap(stamps[i], stamps[j]) > 0.25) hit('layered-prints');
  }
  fonts.delete(undefined);
  if (fonts.size >= 3) hit('mixed-hands');
  if (book.pages.length >= 4 && photoPages >= 4) hit('long-story');
}
