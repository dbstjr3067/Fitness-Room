// Runs the API server inside the mobile app: same route code as server/, SQLite via WebAssembly,
// data saved on the device (IndexedDB). Only used by the Android build (VITE_LOCAL_BACKEND).
import { Buffer } from 'buffer';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { currentDatabase, setEngine } from './sqlite.js';
import { dispatch } from './express.js';

globalThis.Buffer = globalThis.Buffer || Buffer;

const IDB_NAME = 'cheodansil';
const SESSION_KEY = 'fr-session';
const SAVE_DELAY_MS = 400;

function idb() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = () => reject(r.error);
  });
}

async function idbSet(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function loadSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

function saveSession(sid) {
  try {
    if (sid) localStorage.setItem(SESSION_KEY, sid);
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // storage unavailable
  }
}

async function toBytes(body) {
  if (body === undefined || body === null) return null;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (typeof body.arrayBuffer === 'function') return new Uint8Array(await body.arrayBuffer());
  return new TextEncoder().encode(String(body));
}

export async function startLocalServer() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await idbGet('db').catch(() => null);
  setEngine(SQL, saved ? new Uint8Array(saved) : null);

  const { openDb } = await import('../../server/db.js');
  const { createApp } = await import('../../server/app.js');
  const db = openDb('local');
  const app = createApp({ db, env: { NODE_ENV: 'production' }, ai: null, inlineAvatars: true });

  let sid = loadSession();
  let timer = null;
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const raw = currentDatabase();
      if (!raw?.dirty) return;
      raw.dirty = false;
      idbSet('db', raw.export()).catch((e) => console.error('save failed', e));
    }, SAVE_DELAY_MS);
  };
  persist();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && persist());

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return nativeFetch(input, opts);
    const headers = {};
    new Headers(opts.headers || {}).forEach((v, k) => (headers[k] = v));
    const out = await dispatch(app, {
      method: (opts.method || 'GET').toUpperCase(),
      url,
      headers,
      body: await toBytes(opts.body),
      cookies: sid ? { sid } : {},
    });
    if (out.clearCookies.includes('sid')) sid = null;
    if (out.setCookies.sid) sid = out.setCookies.sid;
    saveSession(sid);
    if (opts.method && opts.method !== 'GET') persist();
    return new Response(out.status === 204 ? null : out.body, { status: out.status, headers: out.headers });
  };
}
