// Scraps: the currency you earn by scrapbooking and spend in the shop.
// Everything can be earned. Nothing here costs real money.
// Saved on this phone with the books.
import { db } from './db.js';
import { itemsOf } from './packs.js';
import { SHAPES, EDGES } from './tools.js';

export const EARN = { shot: 5, page: 30, assemble: 10, gift: 20 };
const PRICE = { stickers: 40, stamps: 60, tapes: 50, papers: 50, shapes: 80, edges: 100 };

// What everyone starts with. The rest is in the shop.
const STARTER = new Set([
  'starter/star', 'starter/heart', 'starter/die', 'starter/meeple', 'starter/sun', 'starter/flower',
  'starter/balloon', 'starter/leaf', 'starter/coffee', 'starter/arrow',
  'starter/postmark', 'starter/best-day', 'starter/hello', 'starter/heart-stamp',
  'starter/oceanic-green', 'starter/stripe-red', 'starter/dots-teal', 'starter/grid-cream', 'starter/mustard-plain',
  'starter/cream', 'starter/kraft', 'starter/grid', 'starter/dots', 'starter/lined',
  'shape/circle', 'shape/heart', 'shape/tag',
  'edge/straight', 'edge/zigzag',
]);

let state = null;
const listeners = new Set();
export const onRewards = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(fn => fn(state));

export async function loadRewards() {
  let s = null;
  try { s = await db.getMeta('rewards'); } catch (e) { /* storage blocked: start fresh in memory */ }
  state = s || { scraps: 0, owned: [], claimed: {}, days: [], lastGift: '' };
  state.holo = state.holo || [];
  state.hints = state.hints || null; // null until the first hints are handed out
  state.uses = state.uses || {};
  return state;
}
async function save() { try { await db.putMeta('rewards', state); } catch (e) { /* ignore */ } emit(); }

export const scraps = () => (state ? state.scraps : 0);
export const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

// Everything that can be owned, with its price.
export function catalog() {
  const list = [];
  for (const kind of ['stickers', 'stamps', 'tapes', 'papers']) for (const it of itemsOf(kind)) list.push({ id: it.ref, kind, name: it.name, price: PRICE[kind], item: it });
  for (const s of SHAPES) list.push({ id: 'shape/' + s.id, kind: 'shapes', name: s.name, price: PRICE.shapes, item: s });
  for (const e of EDGES) list.push({ id: 'edge/' + e.id, kind: 'edges', name: e.name + ' edge', price: PRICE.edges, item: e });
  return list;
}
// Hints for hidden discoveries, found in parcels and while you work.
export const hints = () => (state && state.hints) || [];
export async function addHints(ids) {
  if (!state) return;
  state.hints = [...new Set([...(state.hints || []), ...ids])];
  await save();
}
// Counts how often you pick up each tool, so hints can turn up now and then.
export async function useTool(kind) {
  if (!state) return 0;
  state.uses[kind] = (state.uses[kind] || 0) + 1;
  await save();
  return state.uses[kind];
}
export const claimed = key => !!state && !!state.claimed[key];
export const owns = id => STARTER.has(id) || (state && state.owned.includes(id));
// Holo versions: stickers and tape only, found in parcels, never sold.
export const HOLO_KINDS = ['stickers', 'tapes'];
export const ownsHolo = id => !!state && state.holo.includes(id);
export const holoCount = () => (state ? state.holo.length : 0);

// Pays once per key, so the same shot or page never pays twice.
export async function earn(key, amount, reason) {
  if (!state || state.claimed[key]) return 0;
  state.claimed[key] = true;
  state.scraps += amount;
  markActive();
  await save();
  earned(amount, reason);
  return amount;
}
let earnedHook = null;
export const onEarned = fn => { earnedHook = fn; };
function earned(amount, reason) { earnedHook && earnedHook(amount, reason); }

export async function buy(id) {
  const entry = catalog().find(c => c.id === id);
  if (!entry || owns(id)) return { ok: false, why: 'owned' };
  if (state.scraps < entry.price) return { ok: false, why: 'short', short: entry.price - state.scraps };
  state.scraps -= entry.price;
  state.owned.push(id);
  await save();
  return { ok: true };
}
export function bundle() {
  const left = catalog().filter(c => !owns(c.id));
  const full = left.reduce((a, c) => a + c.price, 0);
  return { items: left, price: Math.round(full * 0.75 / 10) * 10, full };
}
export async function buyBundle() {
  const b = bundle();
  if (!b.items.length) return { ok: false, why: 'owned' };
  if (state.scraps < b.price) return { ok: false, why: 'short', short: b.price - state.scraps };
  state.scraps -= b.price;
  for (const it of b.items) state.owned.push(it.id);
  await save();
  return { ok: true };
}

// A day counts when you scrapbook at all. Missing a day never costs anything.
export function markActive() {
  if (!state) return;
  const d = today();
  if (!state.days.includes(d)) { state.days.push(d); state.days = state.days.slice(-60); }
}
export function thisWeek() {
  const out = [], now = new Date();
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const key = d.toLocaleDateString('en-CA');
    out.push({ key, label: 'MTWTFSS'[i], on: !!state && state.days.includes(key), today: key === today() });
  }
  return out;
}

// One wrapped parcel a day: a random item you do not own yet, or scraps once you own everything.
export const giftReady = () => !!state && state.lastGift !== today();
export async function openGift(forceHolo = false) {
  if (!giftReady()) return null;
  state.lastGift = today();
  markActive();
  const left = catalog().filter(c => !owns(c.id) && c.kind !== 'edges');
  let gift;
  // About 1 in 8 parcels holds a holo sticker or tape, even one you already own.
  const holoPool = catalog().filter(c => HOLO_KINDS.includes(c.kind) && !ownsHolo(c.id));
  if (holoPool.length && (forceHolo || Math.random() < 1 / 8)) {
    const c = holoPool[Math.floor(Math.random() * holoPool.length)];
    state.holo.push(c.id);
    if (!owns(c.id)) state.owned.push(c.id);
    await save();
    return { ...c, holo: true, name: c.name + ' (holo)' };
  }
  if (left.length) {
    gift = left[Math.floor(Math.random() * left.length)];
    state.owned.push(gift.id);
  } else {
    gift = { id: 'scraps', kind: 'scraps', name: `${EARN.gift} scraps`, price: 0 };
    state.scraps += EARN.gift;
  }
  await save();
  return gift;
}

// For testing only: lets the parcel be opened again today.
export async function resetGift() { if (!state) return; state.lastGift = ''; await save(); }
