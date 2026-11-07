// Runs the API server inside the mobile app: same route code as server/, SQLite via WebAssembly,
// data saved on the device (IndexedDB). Only used by the Android build (VITE_LOCAL_BACKEND).
import { Buffer } from 'buffer';
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { currentDatabase, setEngine } from './sqlite.js';
import { dispatch } from './express.js';
import { idbDelete, idbGet, idbKeys, idbSet } from './idb.js';
import { createSaver } from './saver.js';

globalThis.Buffer = globalThis.Buffer || Buffer;

const DB_KEY = 'db';
const BACKUP_PREFIX = 'db-backup-';
const SESSION_KEY = 'fr-session';
// Sessions on the phone: there's no password recovery offline, so don't log people out of their only data.
const SESSION_DAYS = 3650;
// Requests after which the database is saved before the app moves on (account created, logged in/out, …).
const AUTH_REQUEST = /^\/api\/(auth\/(register|login|demo|logout)|me\/(password|recovery|username)|me)\/?$/;

/**
 * Why the app couldn't start. kind:
 *  'read'  the saved data couldn't be read (nothing was opened or overwritten; retrying is safe)
 *  'open'  the saved data is there but couldn't be opened or upgraded (bytes kept under `backupKey`)
 *  'other' anything else (engine failed to load, …)
 */
export class StartupError extends Error {
  constructor(kind, cause, { bytes = null, backupKey = null } = {}) {
    super(cause?.message || String(cause));
    this.name = 'StartupError';
    this.kind = kind;
    this.cause = cause;
    this.bytes = bytes;
    this.backupKey = backupKey;
  }
}

let sqlEngine = null;
async function engine() {
  if (!sqlEngine) sqlEngine = initSqlJs({ locateFile: () => wasmUrl }).catch((e) => ((sqlEngine = null), Promise.reject(e)));
  return sqlEngine;
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

const sameBytes = (a, b) => a?.length === b.length && a.every((v, i) => v === b[i]);

/** Keep a copy of database bytes that failed to open (once per distinct copy). Returns its key. */
export async function backupDatabase(bytes) {
  const keys = (await idbKeys()).filter((k) => typeof k === 'string' && k.startsWith(BACKUP_PREFIX)).sort();
  const latest = keys[keys.length - 1];
  if (latest) {
    const prev = await idbGet(latest);
    if (prev && sameBytes(new Uint8Array(prev), bytes)) return latest;
  }
  const key = `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
  await idbSet(key, bytes);
  return key;
}

/** Start over with an empty database; the current bytes are kept as a backup first. */
export async function resetDatabase() {
  const saved = await idbGet(DB_KEY);
  if (saved !== undefined && saved !== null) await backupDatabase(new Uint8Array(saved));
  await idbDelete(DB_KEY);
}

function listenAppState(saver) {
  const flush = () => saver.flush();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);
  import('@capacitor/app')
    .then(({ App }) => {
      App.addListener('pause', flush);
      // The app comes back (maybe days later): screens refresh "today" on this event.
      App.addListener('resume', () => window.dispatchEvent(new Event('fr:resume')));
    })
    .catch(() => {});
}

export async function startLocalServer() {
  let SQL;
  try {
    SQL = await engine();
  } catch (e) {
    throw new StartupError('other', e);
  }

  let saved;
  try {
    saved = await idbGet(DB_KEY);
  } catch (e) {
    // Never start on an empty database here: it would be saved over the user's records.
    throw new StartupError('read', e);
  }
  const bytes = saved === undefined || saved === null ? null : new Uint8Array(saved);

  let app;
  try {
    setEngine(SQL, bytes);
    const { openDb } = await import('../../server/db.js');
    const { createApp } = await import('../../server/app.js');
    const db = openDb('local');
    app = createApp({ db, env: { NODE_ENV: 'production' }, ai: null, inlineAvatars: true, sessionDays: SESSION_DAYS });
  } catch (e) {
    let backupKey = null;
    if (bytes) backupKey = await backupDatabase(bytes).catch(() => null);
    throw new StartupError(bytes ? 'open' : 'other', e, { bytes, backupKey });
  }

  const saver = createSaver({
    getDb: currentDatabase,
    write: (data) => idbSet(DB_KEY, data),
    onError: (error, failures) => window.dispatchEvent(new CustomEvent('fr:save-error', { detail: { error, failures } })),
    onRecover: () => window.dispatchEvent(new Event('fr:save-ok')),
  });
  // A new or upgraded database is saved right away; an unchanged one isn't rewritten.
  saver.flush();
  listenAppState(saver);

  let sid = loadSession();
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, opts = {}) => {
    const isRequest = typeof input !== 'string' && !(input instanceof URL);
    // Same-origin /api/ requests (a path, a full URL or a Request object) are answered in the app.
    const base = new URL(window.location?.href || 'http://localhost/');
    let target;
    try {
      target = new URL(isRequest ? input.url : String(input), base);
    } catch {
      return nativeFetch(input, opts);
    }
    if (target.origin !== base.origin || !target.pathname.startsWith('/api/')) return nativeFetch(input, opts);

    const method = (opts.method || (isRequest ? input.method : 'GET')).toUpperCase();
    const headers = {};
    new Headers(opts.headers || (isRequest ? input.headers : {})).forEach((v, k) => (headers[k] = v));
    const body = opts.body !== undefined ? opts.body : isRequest && method !== 'GET' && method !== 'HEAD' ? await input.arrayBuffer() : null;
    const out = await dispatch(app, {
      method,
      url: target.pathname + target.search,
      headers,
      body: await toBytes(body),
      cookies: sid ? { sid } : {},
    });
    if (out.clearCookies.includes('sid')) sid = null;
    if (out.setCookies.sid) sid = out.setCookies.sid;
    // Only requests that changed something are saved (reads cost nothing). After sign-up, login and
    // the like, wait for the save so a session never outlives the account row it points to.
    if (AUTH_REQUEST.test(target.pathname) && method !== 'GET') await saver.flush();
    else saver.schedule();
    saveSession(sid);
    const noBody = out.status === 204 || out.status === 304 || method === 'HEAD';
    return new Response(noBody ? null : out.body, { status: out.status, headers: out.headers });
  };
}
