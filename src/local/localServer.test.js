// @vitest-environment node
// The Android app's in-app server (src/local/localServer.js): starting up, saving to the device and recovering.
// IndexedDB is faked in memory, with switches to make opening, reading or writing fail.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import initSqlJs from 'sql.js';

vi.mock('express', async () => import('./express.js'));
vi.mock('cookie-parser', async () => import('./stubs.js'));
vi.mock('node:sqlite', async () => import('./sqlite.js'));
// In Node the engine finds its own .wasm file (the app passes the bundled URL).
vi.mock('sql.js', async (importOriginal) => {
  const real = (await importOriginal()).default;
  return { default: () => real() };
});
vi.mock('../../server/app.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, createApp: vi.fn(real.createApp) };
});
const native = vi.hoisted(() => ({ listeners: {} }));
vi.mock('@capacitor/app', () => ({
  App: { addListener: (name, fn) => (native.listeners[name] ||= []).push(fn) },
}));

// ---- the bits of a browser page the in-app server uses ----
globalThis.window = globalThis;
const windowEvents = new EventTarget();
for (const m of ['addEventListener', 'removeEventListener', 'dispatchEvent']) window[m] = windowEvents[m].bind(windowEvents);
const page = new EventTarget();
globalThis.document = Object.assign(page, { visibilityState: 'visible' });
globalThis.location = new URL('https://localhost/index.html');
const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  clear: () => ls.clear(),
};

// ---- fake IndexedDB ----
const store = new Map();
const fail = { open: 0, get: 0, put: 0 };
let puts = 0;
const later = (fn) => setTimeout(fn, 1);
const connection = {
  createObjectStore() {},
  close() {},
  transaction() {
    const tx = {};
    const finish = (req, fn) => {
      later(() => {
        try {
          req.result = fn();
        } catch (e) {
          tx.error = e;
          return tx.onerror?.();
        }
        req.onsuccess?.();
        tx.oncomplete?.();
      });
      return req;
    };
    tx.objectStore = () => ({
      get: (k) =>
        finish({}, () => {
          if (fail.get > 0 && fail.get--) throw new Error('UnknownError: read failed');
          return store.get(k);
        }),
      put: (v, k) =>
        finish({}, () => {
          if (fail.put > 0 && fail.put--) throw new Error('QuotaExceededError');
          puts++;
          store.set(k, v instanceof Uint8Array ? v.slice() : v);
          return k;
        }),
      delete: (k) => finish({}, () => store.delete(k)),
      getAllKeys: () => finish({}, () => [...store.keys()]),
    });
    return tx;
  },
};
globalThis.indexedDB = {
  open() {
    const req = {};
    later(() => {
      if (fail.open > 0 && fail.open--) {
        req.error = new Error('UnknownError: Internal error opening backing store');
        return req.onerror?.();
      }
      req.result = connection;
      req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  },
};

const SQL = await initSqlJs();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const savedUsers = () => {
  const db = new SQL.Database(store.get('db'));
  try {
    return (db.exec('SELECT username FROM users')[0]?.values ?? []).map((r) => r[0]);
  } finally {
    db.close();
  }
};
const savedBio = (username) => {
  const db = new SQL.Database(store.get('db'));
  try {
    return db.exec(`SELECT bio FROM users WHERE username = '${username}'`)[0]?.values[0][0];
  } finally {
    db.close();
  }
};

const nativeFetch = vi.fn(async () => new Response('native'));

// Each launch adds page listeners; earlier launches' are removed so only the current "app" reacts.
const added = [];
for (const target of [document, window]) {
  const add = target.addEventListener.bind(target);
  target.addEventListener = (type, fn, opts) => {
    added.push([target, type, fn, opts]);
    return add(type, fn, opts);
  };
}
function removeListeners() {
  for (const [target, type, fn, opts] of added.splice(0)) target.removeEventListener(type, fn, opts);
}

const { startLocalServer, resetDatabase } = await import('./localServer.js');
const { currentDatabase } = await import('./sqlite.js');
const { resetIdbConnection } = await import('./idb.js');
const { createApp } = await import('../../server/app.js');

/** A fresh app launch on the same device storage. */
async function launch() {
  removeListeners();
  for (const k of Object.keys(native.listeners)) delete native.listeners[k];
  resetIdbConnection();
  window.fetch = nativeFetch;
  await startLocalServer();
  await wait(5); // native listeners are attached right after start
}

async function call(method, url, body) {
  const res = await window.fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

beforeEach(() => {
  store.clear();
  localStorage.clear();
  Object.assign(fail, { open: 0, get: 0, put: 0 });
  puts = 0;
  for (const k of Object.keys(native.listeners)) delete native.listeners[k];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('in-app server: device storage', () => {
  test('a failed read never starts (or saves) an empty database over the saved one', async () => {
    await launch();
    await call('POST', '/api/auth/register', { username: 'keeper', password: 'password123' });
    const before = store.get('db');
    expect(savedUsers()).toContain('keeper');

    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const kind of ['open', 'get']) {
      fail[kind] = 1;
      const err = await launch().catch((e) => e);
      expect(err.kind).toBe('read');
      await wait(600);
      expect(store.get('db')).toEqual(before);
    }

    // 다시 시도: reading works again, the account and its session are still there
    await launch();
    expect((await call('GET', '/api/auth/me')).body.user.username).toBe('keeper');
  });

  test('startup saves a new database once and leaves an unchanged one alone', async () => {
    await launch();
    await wait(30);
    expect(puts).toBe(1);
    expect(store.get('db')).toBeInstanceOf(Uint8Array);

    puts = 0;
    await launch();
    await call('GET', '/api/auth/me');
    await wait(600);
    expect(puts).toBe(0);
  });

  test('sign-up is saved before the response (and the session) is handed back', async () => {
    await launch();
    const res = await call('POST', '/api/auth/register', { username: 'quick', password: 'password123' });
    expect(res.status).toBe(201);
    // no debounce wait: the app could be killed right now
    expect(savedUsers()).toContain('quick');
    expect(localStorage.getItem('fr-session')).toBeTruthy();
  });

  test('reads do not export the database; changes are saved after a short pause', async () => {
    await launch();
    await call('POST', '/api/auth/register', { username: 'reader', password: 'password123' });
    const exportSpy = vi.spyOn(currentDatabase(), 'export');
    await call('GET', '/api/status');
    await call('GET', '/api/auth/me');
    await wait(500);
    expect(exportSpy).not.toHaveBeenCalled();

    await call('PUT', '/api/me/profile', { bio: '느긋하게' });
    expect(savedBio('reader')).not.toBe('느긋하게');
    await wait(500);
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(savedBio('reader')).toBe('느긋하게');
  });

  test('going to the background saves immediately', async () => {
    await launch();
    await call('POST', '/api/auth/register', { username: 'leaver', password: 'password123' });

    await call('PUT', '/api/me/profile', { bio: 'hidden' });
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await wait(30);
    expect(savedBio('leaver')).toBe('hidden');
    document.visibilityState = 'visible';

    await call('PUT', '/api/me/profile', { bio: 'paused' });
    native.listeners.pause.forEach((fn) => fn());
    await wait(30);
    expect(savedBio('leaver')).toBe('paused');
  });

  test('the app coming back to the foreground announces fr:resume', async () => {
    await launch();
    const onResume = vi.fn();
    window.addEventListener('fr:resume', onResume);
    native.listeners.resume.forEach((fn) => fn());
    window.removeEventListener('fr:resume', onResume);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  test('a failed save keeps the change pending and retries it', async () => {
    await launch();
    await call('POST', '/api/auth/register', { username: 'retry', password: 'password123' });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fail.put = 1;
    await call('PUT', '/api/me/profile', { bio: 'eventually' });
    await wait(500); // debounced save fails
    expect(fail.put).toBe(0);
    expect(savedBio('retry')).not.toBe('eventually');
    await wait(1100); // retried after a second
    expect(savedBio('retry')).toBe('eventually');
  });

  test('sessions in the app last ten years', async () => {
    await launch();
    expect(createApp).toHaveBeenCalledWith(expect.objectContaining({ sessionDays: 3650, socialMode: 'device' }));
  });

  test('Request objects and full same-origin URLs are answered in the app too', async () => {
    await launch();
    const res = await window.fetch(new Request(new URL('/api/auth/me', window.location.href)));
    expect(await res.json()).toEqual({ user: null });
    await window.fetch('https://example.com/api/x');
    expect(nativeFetch).toHaveBeenCalledTimes(1);
  });
});

describe('in-app server: data that cannot be opened', () => {
  test('corrupted bytes are kept as a backup (once), and starting over keeps them', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const junk = new Uint8Array(4096).fill(7);
    store.set('db', junk);
    const err = await launch().catch((e) => e);
    expect(err.kind).toBe('open');
    expect(err.bytes).toEqual(junk);
    expect(store.get(err.backupKey)).toEqual(junk);
    expect(store.get('db')).toEqual(junk);
    await wait(500);
    expect(store.get('db')).toEqual(junk);

    // launching again doesn't pile up copies of the same bytes
    const again = await launch().catch((e) => e);
    expect(again.backupKey).toBe(err.backupKey);
    expect([...store.keys()].filter((k) => k.startsWith('db-backup-'))).toHaveLength(1);

    await resetDatabase();
    expect(store.has('db')).toBe(false);
    await launch();
    expect((await call('GET', '/api/auth/me')).status).toBe(200);
    expect(store.get(err.backupKey)).toEqual(junk);
  });
});
