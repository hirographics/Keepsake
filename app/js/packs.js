// Scrap packs: each pack is a folder with pack.json plus image files.
// An element points at art with a ref like "starter/star".
const PACKS = ['starter'];
const KINDS = ['stickers', 'stamps', 'tapes', 'papers'];

export const packs = { list: [], byRef: new Map() };

export async function loadPacks() {
  for (const id of PACKS) {
    const base = `packs/${id}/`;
    const res = await fetch(base + 'pack.json');
    const m = await res.json();
    packs.list.push(m);
    for (const kind of KINDS) {
      for (const item of m[kind] || []) {
        item.kind = kind;
        item.ref = `${m.id}/${item.id}`;
        item.url = base + item.file;
        packs.byRef.set(item.ref, item);
      }
    }
  }
  // Warm the image cache so art appears instantly in the editor.
  for (const item of packs.byRef.values()) { const i = new Image(); i.src = item.url; }
}

export function asset(ref) {
  return packs.byRef.get(ref) || null;
}

export function itemsOf(kind) {
  return packs.list.flatMap(m => (m[kind] || []));
}
