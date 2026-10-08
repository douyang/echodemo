// A store in the browser's IndexedDB for data that the page can build again: values by key, in one
// object store, kept from one visit to the next. Every call resolves: to undefined (or false)
// where IndexedDB is missing, blocked, slow or fails (a private window, blocked or cleared site
// data, a sandboxed frame). The page then builds the data. A key's prefix (up to its first colon)
// names its kind, and put() keeps one value of each kind, so a new version replaces the old.

const NAME = 'heart-by-ultrasound', STORE = 'cache';
const WAIT = 1500;            // ms: a store that has not answered by then counts as missing

/** What p resolves to, or fallback once ms have passed. */
const within = (p, ms, fallback) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))]);

let dbP = null;
function db() {
  if (!dbP) {
    dbP = within(new Promise((resolve) => {
      try {
        const req = indexedDB.open(NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => {
          // a later version of the page (another tab) can then change the store: this one opens it again
          req.result.onversionchange = () => { req.result.close(); dbP = null; };
          resolve(req.result);
        };
        req.onerror = req.onblocked = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    }), WAIT, null);
  }
  return dbP;
}

/** The value stored under key, or undefined. */
export async function cacheGet(key) {
  const d = await db();
  if (!d) return undefined;
  return within(new Promise((resolve) => {
    try {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(undefined);
    } catch (e) {
      resolve(undefined);
    }
  }), WAIT, undefined);
}

/** Store value under key, and drop the other values of its kind. Resolves to true once stored. */
export async function cachePut(key, value) {
  const d = await db();
  if (!d) return false;
  const kind = key.slice(0, key.indexOf(':') + 1);
  return within(new Promise((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite'), st = tx.objectStore(STORE);
      if (kind) {
        st.getAllKeys().onsuccess = (e) => {
          for (const k of e.target.result) if (typeof k === 'string' && k.startsWith(kind) && k !== key) st.delete(k);
        };
      }
      st.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  }), WAIT, false);
}
