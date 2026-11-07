import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'sid';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY_MS;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

let dummyHash = null;

/** Same work as a real password check, for unknown users (answer time must not reveal which ids exist). */
export function verifyDummy(password) {
  dummyHash ||= hashPassword('not-a-real-password');
  verifyPassword(String(password), dummyHash);
  return false;
}

export function createSession(db, userId, ttlMs = SESSION_TTL_MS) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + ttlMs);
  return token;
}

/** Sliding sessions: once less than half the lifetime is left, extend it. Returns true when extended. */
export function renewSession(db, token, expiresAt, ttlMs = SESSION_TTL_MS) {
  if (expiresAt - Date.now() >= ttlMs / 2) return false;
  db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(Date.now() + ttlMs, token);
  return true;
}

export function purgeExpiredSessions(db) {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function userFromSession(db, token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* , s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .get(token);
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    deleteSession(db, token);
    return null;
  }
  return row;
}

export function cookieOptions(production, ttlMs = SESSION_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    maxAge: ttlMs,
    path: '/',
  };
}

// Username rules: 4-20 chars, lowercase letters, digits, underscore
// Ids of the built-in sample users (seed.js): nobody else may take them.
export const RESERVED_USERNAMES = ['bench_kim', 'squat_lee', 'routine_choi', 'dead_park'];

export function validateCredentials({ username, password }) {
  if (typeof username !== 'string' || !/^[a-z0-9_]{4,20}$/.test(username)) {
    return '아이디는 4~20자의 영문 소문자, 숫자, _만 사용할 수 있습니다';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return '비밀번호는 8~72자여야 합니다';
  }
  return null;
}
