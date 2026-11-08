// Tiny key-value store on IndexedDB (mobile app). One connection is opened and reused; if it fails or
// gets closed, the next call opens a new one.

const IDB_NAME = 'cheodansil';
const STORE = 'kv';

let connection = null;

function open() {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        const forget = () => {
          if (connection === pending) connection = null;
        };
        db.onclose = forget; // closed by the browser (e.g. storage cleared)
        db.onversionchange = () => {
          db.close();
          forget();
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB를 열 수 없습니다'));
      req.onblocked = () => reject(new Error('IndexedDB가 다른 창에서 사용 중입니다'));
    });
    const pending = connection;
    pending.catch(() => {
      if (connection === pending) connection = null;
    });
  }
  return connection;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (e) {
      // The connection is closing/closed: drop it so the next call reopens.
      connection = null;
      reject(e);
      return;
    }
    let result;
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => (result = req.result);
    // Resolve only once the transaction is committed (for writes: the data is on disk).
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || req.error || new Error('IndexedDB 오류'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB 작업이 취소되었습니다'));
  });
}

/** The stored value, or undefined when the key has never been written. Rejects on read errors. */
export function idbGet(key) {
  return run('readonly', (store) => store.get(key));
}

/** Resolves once the value is committed. */
export function idbSet(key, value) {
  return run('readwrite', (store) => store.put(value, key));
}

export function idbDelete(key) {
  return run('readwrite', (store) => store.delete(key));
}

export function idbKeys() {
  return run('readonly', (store) => store.getAllKeys());
}

/** For tests: forget the cached connection. */
export function resetIdbConnection() {
  connection = null;
}
