// Template sets and page layouts.
// A layout is geometry with roles (title, photo, caption, tape, sticker, stamp, date).
// A set fills the roles: its paper, fonts, art, photo prompts and captions.
// Keeping roles on every piece lets a later phase swap layouts without losing anything.
// Page space is 850 x 1100 (8.5 x 11 in at 100 per inch).
import { uid } from './db.js';

export const PAGE_W = 850;
export const PAGE_H = 1100;
const S = 'starter/';

// ---------- layouts ----------
const LAYOUTS = [
  {
    id: 'big', name: 'Big moment', els: [
      { role: 'title', x: 470, y: 110, w: 620, rot: -2, size: 96, align: 'center' },
      { role: 'date', x: 160, y: 42, w: 260, rot: -4, size: 24, align: 'left' },
      { role: 'stamp', k: 0, x: 130, y: 150, w: 170, h: 170, rot: -12 },
      { role: 'photo', x: 420, y: 500, w: 560, h: 610, rot: -3, frame: 'polaroid' },
      { role: 'tape', k: 0, x: 420, y: 205, w: 230, h: 60, rot: 4 },
      { role: 'photo', x: 680, y: 880, w: 270, h: 300, rot: 6, frame: 'polaroid' },
      { role: 'tape', k: 0, x: 690, y: 735, w: 140, h: 52, rot: -8 },
      { role: 'photo', x: 200, y: 905, w: 290, h: 290, rot: -5, frame: 'border' },
      { role: 'sticker', k: 0, x: 745, y: 300, w: 140, h: 140, rot: 12 },
      { role: 'sticker', k: 1, x: 95, y: 640, w: 120, h: 120, rot: -8 },
      { role: 'caption', x: 450, y: 1045, w: 340, rot: 1, size: 52, align: 'center' },
    ],
  },
  {
    id: 'four', name: 'Four corners', els: [
      { role: 'title', x: 425, y: 92, w: 700, rot: 0, size: 84, align: 'center' },
      { role: 'photo', x: 225, y: 360, w: 340, h: 380, rot: -3, frame: 'polaroid' },
      { role: 'photo', x: 625, y: 375, w: 340, h: 380, rot: 3, frame: 'polaroid' },
      { role: 'photo', x: 225, y: 790, w: 340, h: 380, rot: 2, frame: 'polaroid' },
      { role: 'photo', x: 625, y: 805, w: 340, h: 380, rot: -2, frame: 'polaroid' },
      { role: 'tape', k: 1, x: 425, y: 590, w: 200, h: 56, rot: -30 },
      { role: 'sticker', k: 0, x: 780, y: 150, w: 110, h: 110, rot: 10 },
      { role: 'sticker', k: 1, x: 70, y: 150, w: 100, h: 100, rot: -10 },
      { role: 'caption', x: 425, y: 1050, w: 600, rot: -1, size: 46, align: 'center' },
    ],
  },
  {
    id: 'story', name: 'Story', els: [
      { role: 'title', x: 300, y: 100, w: 500, rot: -3, size: 80, align: 'left' },
      { role: 'photo', x: 270, y: 345, w: 420, h: 300, rot: -2, frame: 'border' },
      { role: 'caption', x: 660, y: 330, w: 300, rot: 3, size: 44, align: 'left' },
      { role: 'photo', x: 580, y: 620, w: 420, h: 300, rot: 2, frame: 'border' },
      { role: 'caption', x: 190, y: 630, w: 300, rot: -3, size: 44, align: 'left' },
      { role: 'photo', x: 290, y: 905, w: 420, h: 300, rot: -1, frame: 'border' },
      { role: 'caption', x: 680, y: 910, w: 280, rot: 2, size: 44, align: 'left' },
      { role: 'tape', k: 2, x: 130, y: 200, w: 150, h: 52, rot: -35 },
      { role: 'stamp', k: 1, x: 730, y: 1020, w: 180, h: 180, rot: 8 },
      { role: 'sticker', k: 0, x: 760, y: 120, w: 120, h: 120, rot: 8 },
    ],
  },
  {
    id: 'wide', name: 'Wide shot', els: [
      { role: 'title', x: 425, y: 105, w: 720, rot: 1, size: 88, align: 'center' },
      { role: 'photo', x: 425, y: 430, w: 720, h: 470, rot: -1.5, frame: 'border' },
      { role: 'tape', k: 0, x: 105, y: 215, w: 160, h: 56, rot: -40 },
      { role: 'tape', k: 0, x: 745, y: 215, w: 160, h: 56, rot: 40 },
      { role: 'photo', x: 255, y: 865, w: 340, h: 380, rot: -4, frame: 'polaroid' },
      { role: 'caption', x: 625, y: 790, w: 340, rot: 2, size: 46, align: 'left' },
      { role: 'date', x: 600, y: 700, w: 280, rot: 2, size: 26, align: 'left' },
      { role: 'sticker', k: 1, x: 560, y: 960, w: 130, h: 130, rot: -8 },
      { role: 'stamp', k: 0, x: 740, y: 1000, w: 160, h: 160, rot: 10 },
    ],
  },
];

// ---------- sets ----------
const INK_RED = '#b5322c', INK_BLUE = '#2f4b8a', INK_GREEN = '#3b6e4f';
export const SETS = [
  {
    id: 'game-night', name: 'Game night', title: 'Game Night', titleFont: 'permanent-marker', captionFont: 'caveat',
    paper: S + 'grid', tapes: ['stripe-red', 'dots-teal', 'mustard-plain'], stickers: ['die', 'meeple', 'trophy', 'card', 'pizza', 'star'],
    stamps: [['postmark', INK_RED], ['winner', INK_RED]],
    keywords: ['game', 'games', 'board game', 'board games', 'cards', 'card game', 'poker', 'puzzle', 'trivia', 'dice', 'chess', 'catan', 'dnd', 'd&d', 'game night', 'video game', 'minecraft', 'tournament'],
    prompts: ['Everyone around the table', 'The game box', 'Close-up of the winning move', '{Who} mid-turn', 'The snacks', "The winner's face", 'Hands on the board', 'The final score'],
    captions: ['who won?', 'final score: ____ to ____', 'first we set up...', 'then it got serious', 'and the winner was...', 'rematch?'],
  },
  {
    id: 'birthday', name: 'Birthday', title: 'Happy Birthday', titleFont: 'gloria-hallelujah', captionFont: 'caveat',
    paper: S + 'blush', tapes: ['gingham-pink', 'dots-teal', 'kraft-stars'], stickers: ['balloon', 'cake', 'sparkle', 'flower', 'heart', 'star'],
    stamps: [['best-day', INK_BLUE], ['heart-stamp', INK_RED]],
    keywords: ['birthday', 'bday', 'b-day', 'party', 'turns', 'candles', 'cake', 'celebrate', 'celebration', 'anniversary'],
    prompts: ['The birthday person', 'Blowing out the candles', 'The cake up close', 'Everyone singing', 'Opening a present', '{Who} and the birthday person', 'The decorations', 'The biggest laugh'],
    captions: ['make a wish', '____ years old!', 'best day ever', 'the cake was...', 'favorite present:', 'so loved'],
  },
  {
    id: 'outdoors', name: 'Outdoors', title: 'Out There', titleFont: 'permanent-marker', captionFont: 'patrick-hand',
    paper: S + 'kraft', tapes: ['kraft-stars', 'mustard-plain', 'grid-cream'], stickers: ['mountain', 'sun', 'leaf', 'arrow', 'flower', 'camera'],
    stamps: [['memories', INK_GREEN], ['postmark', INK_GREEN]],
    keywords: ['hike', 'hiking', 'trail', 'camp', 'camping', 'park', 'lake', 'river', 'beach', 'fishing', 'outdoors', 'outside', 'mountain', 'mountains', 'walk', 'bike', 'biking', 'kayak', 'swim', 'garden', 'picnic', 'overland', 'offroad', 'desert'],
    prompts: ['The trailhead sign', 'The view from the top', '{Who} on the trail', 'Something tiny you found', 'Boots on the ground', 'The sky', 'The lunch spot', 'Everyone at the end'],
    captions: ['miles: ___', 'we made it!', 'best view:', 'spotted:', 'next time...', 'tired and happy'],
  },
  {
    id: 'food', name: 'Food', title: 'Good Eats', titleFont: 'permanent-marker', captionFont: 'caveat',
    paper: S + 'cream', tapes: ['gingham-pink', 'stripe-red', 'mustard-plain'], stickers: ['pizza', 'coffee', 'cake', 'heart', 'star', 'sparkle'],
    stamps: [['hello', INK_BLUE], ['best-day', INK_RED]],
    keywords: ['dinner', 'lunch', 'breakfast', 'brunch', 'restaurant', 'cook', 'cooking', 'bake', 'baking', 'eat', 'eating', 'food', 'taco', 'pizza', 'burger', 'sushi', 'bbq', 'barbecue', 'grill', 'coffee', 'cafe', 'dessert', 'ice cream', 'date night'],
    prompts: ['The menu or the sign', 'The first bite', '{Who} at the table', 'The best dish', 'The kitchen in action', 'Dessert', 'Empty plates', 'Cheers!'],
    captions: ['we ordered...', 'rating: ★★★★★', 'best bite:', 'would come back for...', 'so full', 'recipe idea:'],
  },
  {
    id: 'trip', name: 'Trip', title: "Let's Go", titleFont: 'permanent-marker', captionFont: 'special-elite',
    paper: S + 'dots', tapes: ['kraft-stars', 'dots-teal', 'grid-cream'], stickers: ['plane', 'camera', 'mountain', 'sun', 'arrow', 'star'],
    stamps: [['postmark', INK_BLUE], ['memories', INK_BLUE]],
    keywords: ['trip', 'travel', 'traveling', 'vacation', 'road trip', 'drive', 'flight', 'fly', 'flying', 'visit', 'visiting', 'disneyland', 'disney', 'vegas', 'hotel', 'cruise', 'getaway', 'tour', 'airport', 'weekend away'],
    prompts: ['Packed bags', 'On the road', 'The welcome sign', '{Who} exploring', 'The best view', 'A local snack', 'Where we stayed', 'The last look'],
    captions: ['day 1', 'we went to...', 'favorite stop:', 'miles traveled: ___', 'want to go back', 'souvenir:'],
  },
  {
    id: 'family-day', name: 'Family day', title: 'Family Day', titleFont: 'gloria-hallelujah', captionFont: 'caveat',
    paper: S + 'lined', tapes: ['mustard-plain', 'gingham-pink', 'stripe-red'], stickers: ['heart', 'sun', 'star', 'flower', 'camera', 'sparkle'],
    stamps: [['heart-stamp', INK_RED], ['hello', INK_BLUE]],
    keywords: ['family', 'kids', 'kid', 'mom', 'dad', 'grandma', 'grandpa', 'sister', 'brother', 'son', 'daughter', 'cousins', 'home', 'movie', 'movies', 'craft', 'crafts', 'play', 'playdate', 'friends', 'hang out', 'sleepover'],
    prompts: ['Everyone together', '{Who} laughing', 'Something we made', 'The little details', 'The best moment', 'Silly faces', 'Where we were', 'The end of the day'],
    captions: ['today we...', 'best part:', 'we laughed when...', 'love these people', 'remember this', 'the end'],
  },
];
const FALLBACK = 'family-day';

export function setById(id) {
  return SETS.find(s => s.id === id) || SETS[0];
}

// ---------- reading the plan ----------
// Scores each set by the keywords in the sentence. Longer phrases count more.
export function matchSet(plan) {
  const text = ' ' + plan.toLowerCase().replace(/[^a-z0-9&'\- ]+/g, ' ') + ' ';
  let best = null, bestScore = 0, hit = null;
  for (const set of SETS) {
    let score = 0, word = null;
    for (const k of set.keywords) {
      const re = new RegExp(`(^|[^a-z])${k.replace(/[-&]/g, '\\$&')}(s|es)?([^a-z]|$)`);
      if (re.test(text)) {
        const pts = k.includes(' ') ? 3 : 2;
        score += pts;
        if (!word || k.length > word.length) word = k;
      }
    }
    // Family words are often just who is coming along; they count less.
    if (set.id === FALLBACK) score *= 0.5;
    if (score > bestScore) { best = set; bestScore = score; hit = word; }
  }
  return { set: best || setById(FALLBACK), word: hit };
}

// "with my sister" -> "your sister"; "with Kai" -> "Kai"; nothing -> null
export function whoFrom(plan) {
  const m = plan.match(/\bwith\s+(.+?)(?:\s+(?:at|in|on|to|for|from|this|tonight|tomorrow|today|after|before|and then)\b|[.,!?]|$)/i);
  if (!m) return null;
  let who = m[1].trim().replace(/^(my|our)\s+/i, 'your ').replace(/^the\s+/i, 'the ');
  if (who.split(' ').length > 5) return null;
  return who;
}

export const LENGTHS = [
  { id: 'short', name: 'An hour or two', pages: 1 },
  { id: 'half', name: 'Half a day', pages: 2 },
  { id: 'day', name: 'A full day', pages: 4 },
  { id: 'weekend', name: 'A weekend', pages: 6 },
];

export function photoSlotsFor(pages) {
  let n = 0;
  for (let i = 0; i < pages; i++) n += LAYOUTS[i % LAYOUTS.length].els.filter(e => e.role === 'photo').length;
  return n;
}

// ---------- building pages ----------
function fill(text, ctx) {
  const who = ctx.who || 'everyone';
  return text
    .replace('{Who}', who.charAt(0).toUpperCase() + who.slice(1))
    .replace('{who}', who);
}

export function formatDate(t) {
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// One template piece from a layout slot, styled by the set.
// Pieces remember which prompt, caption or art they took (pi, ci, k) so a theme swap can trade like for like.
function makeEl(spec, set, book, index) {
  const ctx = book.ctx || {};
  const cur = book.cursor || (book.cursor = { prompt: 0, caption: 0 });
  const pick = (list, k) => list[(index + k) % list.length];
  const { role, k = 0, ...g } = spec;
  const base = { id: uid('e'), role, h: g.h || 0, cut: null, ...g };
  switch (role) {
    case 'title':
      return { ...base, type: 'text', text: set.title, font: set.titleFont, color: '#3a2e2a' };
    case 'caption': {
      const ci = cur.caption++ % set.captions.length;
      return { ...base, type: 'text', ci, text: set.captions[ci], font: set.captionFont, color: '#3a2e2a' };
    }
    case 'date':
      return { ...base, type: 'text', text: formatDate(book.date || book.created), font: 'special-elite', color: '#7a4a3a' };
    case 'photo': {
      const pi = cur.prompt++ % set.prompts.length;
      return { ...base, type: 'photo', pi, prompt: fill(set.prompts[pi], ctx), blob: null, crop: { x: 0.5, y: 0.5, zoom: 1 } };
    }
    case 'tape':
      return { ...base, type: 'tape', k: (index + k) % set.tapes.length, ref: S + pick(set.tapes, k) };
    case 'sticker': {
      const kk = (index + index + k * 2) % set.stickers.length;
      return { ...base, type: 'sticker', k: kk, ref: S + set.stickers[kk] };
    }
    case 'stamp': {
      const kk = (index + k) % set.stamps.length;
      const [id, ink] = set.stamps[kk];
      return { ...base, type: 'stamp', k: kk, ref: S + id, ink };
    }
  }
  return base;
}

// Makes the next page of a book. Prompts and captions continue where the last page stopped.
export function nextPage(book) {
  const set = setById(book.setId);
  const index = book.pages.length;
  const layout = LAYOUTS[index % LAYOUTS.length];
  return { id: uid('p'), paper: set.paper, layoutId: layout.id, els: layout.els.map(spec => makeEl(spec, set, book, index)) };
}

export { LAYOUTS };

// Moves a page onto another layout. Nothing is thrown away:
// template pieces move into the new slots of the same kind (filled photos take the biggest spots),
// pieces with no slot left stay on the page, and anything you added yourself stays where you put it.
export function relayout(book, index, layoutId) {
  const page = book.pages[index];
  const layout = LAYOUTS.find(l => l.id === layoutId);
  if (!layout || !page) return;
  const set = setById(book.setId);
  const pools = {};
  const mine = [];
  for (const el of page.els) (el.role ? (pools[el.role] = pools[el.role] || []) : mine).push(el);
  const area = e => e.w * (e.h || e.w);
  if (pools.photo) pools.photo.sort((a, b) => (!!b.blob - !!a.blob) || area(b) - area(a));
  // Photo slots in order of size, so the best photos land in the biggest spots.
  const photoSpecs = layout.els.filter(e => e.role === 'photo').slice().sort((a, b) => area(b) - area(a));
  const photoFor = new Map(photoSpecs.map((spec, i) => [spec, i]));
  const placed = [];
  for (const spec of layout.els) {
    const pool = pools[spec.role] || [];
    let el;
    if (spec.role === 'photo') el = pool[photoFor.get(spec)];
    else el = pool.shift();
    if (spec.role === 'photo' && el) pool[photoFor.get(spec)] = null;
    if (!el) { placed.push(makeEl(spec, set, book, index)); continue; }
    el.x = spec.x; el.y = spec.y; el.rot = spec.rot;
    if (el.type === 'text') { el.w = spec.w; el.size = spec.size; el.align = spec.align; }
    else if (el.cut) { const k = Math.min(spec.w / el.w, spec.h / el.h); el.w *= k; el.h *= k; }
    else if (el.type === 'tape') { el.w = spec.w; }
    else { el.w = spec.w; el.h = spec.h; }
    if (spec.frame && el.type === 'photo') el.frame = spec.frame;
    placed.push(el);
  }
  // Extra photos with no slot: a small pile in the bottom corner, still on the page.
  const extraPhotos = (pools.photo || []).filter(Boolean);
  extraPhotos.forEach((el, i) => {
    const k = 220 / el.w;
    el.w *= k; el.h *= k;
    el.x = PAGE_W - 150 - i * 26; el.y = PAGE_H - 170 - i * 22; el.rot = 6 - i * 5;
  });
  const leftovers = Object.entries(pools).filter(([r]) => r !== 'photo').flatMap(([, list]) => list);
  page.els = [...placed, ...leftovers, ...extraPhotos, ...mine];
  page.layoutId = layout.id;
}

// Gives the whole book another theme. Template pieces trade for the same slot in the new theme;
// anything you typed, changed or added yourself is left alone.
export function setTheme(book, setId) {
  const from = setById(book.setId), to = setById(setId);
  if (from.id === to.id) return;
  const ctx = book.ctx || {};
  for (const page of book.pages) {
    if (page.paper === from.paper) page.paper = to.paper;
    for (const el of page.els) {
      if (!el.role) continue;
      if (el.role === 'title') {
        if (el.text === from.title) el.text = to.title;
        if (el.font === from.titleFont) el.font = to.titleFont;
      } else if (el.role === 'caption') {
        const ci = el.ci != null ? el.ci : from.captions.indexOf(el.text);
        if (ci >= 0 && el.text === from.captions[ci]) { el.text = to.captions[ci % to.captions.length]; el.ci = ci; }
        if (el.font === from.captionFont) el.font = to.captionFont;
      } else if (el.role === 'photo') {
        const pi = el.pi != null ? el.pi : from.prompts.findIndex(p => fill(p, ctx) === el.prompt);
        if (pi >= 0 && !el.blob && el.prompt === fill(from.prompts[pi], ctx)) { el.prompt = fill(to.prompts[pi % to.prompts.length], ctx); el.pi = pi; }
      } else if (['tape', 'sticker', 'stamp'].includes(el.role)) {
        const list = el.role === 'tape' ? from.tapes : el.role === 'sticker' ? from.stickers : from.stamps.map(x => x[0]);
        const k = el.k != null ? el.k : list.indexOf(el.ref.replace(S, ''));
        if (k < 0 || el.ref !== S + list[k]) continue; // you swapped this art yourself
        if (el.role === 'tape') el.ref = S + to.tapes[k % to.tapes.length];
        if (el.role === 'sticker') el.ref = S + to.stickers[k % to.stickers.length];
        if (el.role === 'stamp') { const [id, ink] = to.stamps[k % to.stamps.length]; el.ref = S + id; el.ink = ink; }
        el.k = k;
      }
    }
  }
  book.setId = to.id;
}

export function makeBook({ plan, setId, pages }) {
  const now = Date.now();
  const book = {
    id: uid('k'), title: plan, plan, setId, created: now, updated: now, date: now,
    ctx: { who: whoFrom(plan) }, cursor: { prompt: 0, caption: 0 }, pages: [],
  };
  for (let i = 0; i < pages; i++) book.pages.push(nextPage(book));
  return book;
}
