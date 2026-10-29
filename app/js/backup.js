// Backup and restore: every book, its photos, and your Scraps and collection in one .zip file.
// The zip is plain (no compression; photos are already compressed), so any computer can open it:
// inside are manifest.json and a photos folder with the original JPEGs.
import { db } from './db.js';

const FORMAT = 1;

// ---------- a small zip writer and reader ----------
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeZip(files) { // files: [{ name, bytes }]
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.bytes), size = f.bytes.length;
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(8, 0, true);
    head.setUint32(14, crc, true); head.setUint32(18, size, true); head.setUint32(22, size, true);
    head.setUint16(26, name.length, true);
    parts.push(head.buffer, name, f.bytes);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, size, true); cen.setUint32(24, size, true);
    cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true);
    central.push(cen.buffer, name);
    offset += 30 + name.length + size;
  }
  const cenSize = central.reduce((a, p) => a + (p.byteLength ?? p.length), 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer), dec = new TextDecoder();
  let e = buf.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip');
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    if (method === 0) out.set(name, buf.slice(start, start + size));
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

// ---------- backup ----------
export async function makeBackup() {
  const books = await db.allBooks();
  const rewards = await db.getMeta('rewards').catch(() => null);
  const ids = new Set();
  for (const b of books) for (const pg of b.pages) for (const el of pg.els) if (el.blob) ids.add(el.blob);
  const files = [];
  let photos = 0;
  for (const id of ids) {
    const blob = await db.getBlob(id);
    if (!blob) continue;
    files.push({ name: `photos/${id}.jpg`, bytes: new Uint8Array(await blob.arrayBuffer()) });
    photos++;
  }
  const manifest = { app: 'keepsake', format: FORMAT, made: new Date().toISOString(), books, rewards };
  files.unshift({ name: 'manifest.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) });
  const blob = makeZip(files);
  const day = new Date().toLocaleDateString('en-CA');
  return { file: new File([blob], `keepsake-backup-${day}.zip`, { type: 'application/zip' }), books: books.length, photos };
}

export function markBackedUp() { try { localStorage.setItem('keepsake.backup', String(Date.now())); } catch (e) { /* ignore */ } }
export function lastBackup() { try { return +localStorage.getItem('keepsake.backup') || 0; } catch (e) { return 0; } }

// ---------- restore ----------
// Reads a backup file and says what is in it, without changing anything yet.
export async function readBackup(file) {
  const files = await readZip(file);
  const raw = files.get('manifest.json');
  if (!raw) throw new Error('This is not a Keepsake backup.');
  const manifest = JSON.parse(new TextDecoder().decode(raw));
  if (manifest.app !== 'keepsake') throw new Error('This is not a Keepsake backup.');
  return { manifest, files };
}

// Adds the backup to this phone. Nothing already here is removed or replaced:
// a book that is already here comes in as a separate copy, and your Scraps and
// collection are combined (you keep whichever Scraps total is higher).
export async function restoreBackup({ manifest, files }) {
  const here = new Set((await db.allBooks()).map(b => b.id));
  let added = 0, copies = 0;
  for (const book of manifest.books || []) {
    for (const pg of book.pages) for (const el of pg.els) {
      if (!el.blob) continue;
      const bytes = files.get(`photos/${el.blob}.jpg`);
      if (bytes && !(await db.getBlob(el.blob))) await db.putBlob(el.blob, new Blob([bytes], { type: 'image/jpeg' }));
    }
    if (here.has(book.id)) {
      book.id = book.id + '-r' + Date.now().toString(36);
      book.title = book.title + ' (restored)';
      copies++;
    }
    await db.putBook(book);
    added++;
  }
  const mine = await db.getMeta('rewards').catch(() => null), theirs = manifest.rewards;
  if (theirs) {
    const merged = mine ? {
      ...mine,
      scraps: Math.max(mine.scraps || 0, theirs.scraps || 0),
      owned: [...new Set([...(mine.owned || []), ...(theirs.owned || [])])],
      holo: [...new Set([...(mine.holo || []), ...(theirs.holo || [])])],
      hints: [...new Set([...(mine.hints || []), ...(theirs.hints || [])])],
      days: [...new Set([...(mine.days || []), ...(theirs.days || [])])].sort().slice(-60),
      claimed: { ...(theirs.claimed || {}), ...(mine.claimed || {}) },
      uses: { ...(theirs.uses || {}), ...(mine.uses || {}) },
    } : theirs;
    await db.putMeta('rewards', merged);
  }
  return { added, copies };
}
