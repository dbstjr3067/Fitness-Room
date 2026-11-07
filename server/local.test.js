// @vitest-environment node
// The Android app runs this same server code in the app, through src/local/ (mini Express + sql.js).
import { describe, expect, test, vi } from 'vitest';
import initSqlJs from 'sql.js';

vi.mock('express', async () => import('../src/local/express.js'));
vi.mock('cookie-parser', async () => import('../src/local/stubs.js'));
vi.mock('node:sqlite', async () => import('../src/local/sqlite.js'));

const { setEngine, currentDatabase } = await import('../src/local/sqlite.js');
const { dispatch } = await import('../src/local/express.js');
const { openDb } = await import('./db.js');
const { createApp } = await import('./app.js');

const SQL = await initSqlJs();

function boot(bytes) {
  setEngine(SQL, bytes);
  const db = openDb(':memory:');
  return createApp({ db, env: {}, ai: null, inlineAvatars: true });
}

function client(app) {
  let sid = null;
  return async (method, url, body, headers = {}) => {
    const isJson = body !== undefined && !(body instanceof Uint8Array);
    const out = await dispatch(app, {
      method,
      url,
      headers: isJson ? { 'Content-Type': 'application/json', ...headers } : headers,
      body: body === undefined ? null : isJson ? new TextEncoder().encode(JSON.stringify(body)) : body,
      cookies: sid ? { sid } : {},
    });
    if (out.clearCookies.includes('sid')) sid = null;
    if (out.setCookies.sid) sid = out.setCookies.sid;
    return { status: out.status, body: out.body ? JSON.parse(out.body) : null };
  };
}

describe('server running inside the app (mobile build)', () => {
  test('register, log a workout, read it back, and keep data across a restart', async () => {
    const app = boot(null);
    const call = client(app);
    expect((await call('GET', '/api/auth/me')).body.user).toBeNull();
    const reg = await call('POST', '/api/auth/register', { username: 'phone_user', password: 'password123', displayName: '폰' });
    expect(reg.status).toBe(201);
    const put = await call('PUT', '/api/workouts/2026-11-07', {
      splitName: 'Push',
      entries: [{ exercise: 'bench_press', weight: 60, unit: 'kg', sets: 5, reps: 5, rating: 3, program: null }],
    });
    expect(put.status).toBe(200);
    expect(put.body.achievements.map((a) => a.key)).toEqual(['first_workout']);
    expect((await call('GET', '/api/workouts/2026-11-07')).body.workout.entries[0].weight).toBe(60);
    expect((await call('GET', '/api/nope')).status).toBe(404);
    expect((await call('PUT', '/api/workouts/2026-02-30', { entries: [] })).status).toBe(400);

    // restart: a new app instance on the exported database bytes
    const bytes = currentDatabase().export();
    const call2 = client(boot(bytes));
    const login = await call2('POST', '/api/auth/login', { username: 'phone_user', password: 'password123' });
    expect(login.status).toBe(200);
    expect((await call2('GET', '/api/workouts?from=2026-11-01')).body.workouts).toHaveLength(1);
    expect((await call2('POST', '/api/auth/login', { username: 'phone_user', password: 'wrong-pass' })).status).toBe(401);
  });

  test('demo account, follows, notifications and inline profile pictures', async () => {
    const call = client(boot(null));
    expect((await call('POST', '/api/auth/demo', { today: '2026-11-07' })).status).toBe(201);
    expect((await call('GET', '/api/status')).body.workouts.length).toBeGreaterThan(100);
    const users = (await call('GET', '/api/users/search?q=%40bench')).body.users;
    expect(users.map((u) => u.username)).toEqual(['bench_kim']);
    expect((await call('POST', `/api/users/${users[0].id}/follow`)).body.isFollowing).toBe(true);
    expect((await call('GET', '/api/notifications/unread-count')).body.count).toBeGreaterThan(0);

    const png = new Uint8Array(Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    const up = await call('POST', '/api/me/avatar', png, { 'Content-Type': 'image/png' });
    expect(up.status).toBe(200);
    expect(up.body.user.avatarUrl).toMatch(/^data:image\/png;base64,/);
    const bad = await call('POST', '/api/me/avatar', new TextEncoder().encode('<svg/>'), { 'Content-Type': 'image/png' });
    expect(bad.status).toBe(400);
    const big = await call('POST', '/api/me/avatar', new Uint8Array(600 * 1024), { 'Content-Type': 'image/png' });
    expect(big.status).toBe(413);
  });
});
