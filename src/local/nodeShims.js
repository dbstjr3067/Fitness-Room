// Browser stand-ins for the Node built-ins the server code imports (mobile build only).
import { syncScrypt } from 'scrypt-js';

// ---- node:crypto ----
export function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return Buffer.from(b);
}

// Same parameters as Node's scryptSync defaults (N=16384, r=8, p=1) so hashes stay compatible.
export function scryptSync(password, salt, keylen) {
  const out = syncScrypt(Buffer.from(String(password)), Buffer.from(String(salt)), 16384, 8, 1, keylen);
  return Buffer.from(out);
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) throw new RangeError('Input buffers must have the same byte length');
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---- node:fs (profile pictures are stored inline in the database in the app) ----
export const existsSync = () => false;
export const mkdirSync = () => {};
export const unlinkSync = () => {};
export const writeFileSync = () => {};

// ---- node:path ----
export function join(...parts) {
  return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
}
export function dirname(p) {
  return p.split('/').slice(0, -1).join('/') || '/';
}
export function basename(p) {
  return p.split('/').pop();
}

// ---- node:os ----
export const tmpdir = () => '/tmp';

export default { randomBytes, scryptSync, timingSafeEqual, existsSync, mkdirSync, unlinkSync, writeFileSync, join, dirname, basename, tmpdir };
