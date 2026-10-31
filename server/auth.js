import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now() + SESSION_TTL_MS,
  );
  return token;
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

export function cookieOptions(production) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

// Username rules: 4-20 chars, lowercase letters, digits, underscore
export function validateCredentials({ username, password }) {
  if (typeof username !== 'string' || !/^[a-z0-9_]{4,20}$/.test(username)) {
    return '아이디는 4~20자의 영문 소문자, 숫자, _만 사용할 수 있습니다';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return '비밀번호는 8~72자여야 합니다';
  }
  return null;
}
