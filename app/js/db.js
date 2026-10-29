// Tiny IndexedDB wrapper. Books live in "books"; photo files live in "blobs".
const DB_NAME = 'keepsake';
const DB_VERSION = 2;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  allBooks: () => tx('books', 'readonly', s => s.getAll()),
  getBook: id => tx('books', 'readonly', s => s.get(id)),
  putBook: book => tx('books', 'readwrite', s => s.put(book)),
  deleteBook: id => tx('books', 'readwrite', s => s.delete(id)),
  getBlob: id => tx('blobs', 'readonly', s => s.get(id)),
  putBlob: (id, blob) => tx('blobs', 'readwrite', s => s.put(blob, id)),
  deleteBlob: id => tx('blobs', 'readwrite', s => s.delete(id)),
  getMeta: key => tx('meta', 'readonly', s => s.get(key)),
  putMeta: (key, value) => tx('meta', 'readwrite', s => s.put(value, key)),
};

// Object URLs for stored photos, made once per session.
const urlCache = new Map();
export async function blobUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await db.getBlob(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
