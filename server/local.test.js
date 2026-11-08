// @vitest-environment node
// The Android app runs this same server code in the app, through src/local/ (mini Express + sql.js).
import { describe, expect, test, vi } from 'vitest';
import initSqlJs from 'sql.js';

vi.mock('express', async () => import('../src/local/express.js'));
vi.mock('cookie-parser', async () => import('../src/local/stubs.js'));
vi.mock('node:sqlite', async () => import('../src/local/sqlite.js'));

const { setEngine, currentDatabase } = await import('../src/local/sqlite.js');
const { dispatch, default: express } = await import('../src/local/express.js');
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

  test('foreign keys stay on after the database is saved (export), so deletes still cascade', async () => {
    const app = boot(null);
    const call = client(app);
    const db = currentDatabase();
    await call('POST', '/api/auth/register', { username: 'cascade', password: 'password123' });
    await call('PUT', '/api/workouts/2026-11-07', {
      entries: [{ exercise: 'bench_press', weight: 60, unit: 'kg', sets: 5, reps: 5, rating: 3, program: null }],
    });
    db.export(); // what every save does
    expect(db.prepare('PRAGMA foreign_keys').get().foreign_keys).toBe(1);
    const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    expect(count('workouts')).toBe(1);
    expect((await call('DELETE', '/api/me', { password: 'password123' })).status).toBe(200);
    expect(count('users')).toBe(0);
    expect(count('workouts')).toBe(0);
    expect(count('workout_entries')).toBe(0);
    expect(count('sessions')).toBe(0);

    // demo logout removes the demo user's ~900 rows even after a save
    const demo = client(app);
    await demo('POST', '/api/auth/demo', { today: '2026-11-07' });
    db.export();
    await demo('POST', '/api/auth/logout');
    expect(db.prepare('SELECT COUNT(*) AS n FROM workouts WHERE user_id NOT IN (SELECT id FROM users)').get().n).toBe(0);
  });

  test('only real changes mark the database for saving', async () => {
    const call = client(boot(null));
    const db = currentDatabase();
    expect(db.dirty).toBe(true); // fresh database: schema created
    await call('POST', '/api/auth/register', { username: 'dirty_check', password: 'password123' });
    const bytes = db.export();
    db.markSaved(db.version);

    boot(bytes); // reopening an up-to-date database changes nothing
    const reopened = currentDatabase();
    expect(reopened.dirty).toBe(false);
    reopened.prepare('UPDATE users SET bio = ? WHERE id = ?').run('x', 999);
    expect(reopened.dirty).toBe(false);
    const call2 = client(createApp({ db: reopened, env: {}, ai: null, inlineAvatars: true }));
    await call2('GET', '/api/auth/me');
    expect(reopened.dirty).toBe(false);
    await call2('POST', '/api/auth/login', { username: 'dirty_check', password: 'password123' });
    expect(reopened.dirty).toBe(true);
    // a save taken before a later change doesn't hide that change
    const v = reopened.version;
    reopened.prepare('UPDATE users SET bio = ?').run('later');
    reopened.markSaved(v);
    expect(reopened.dirty).toBe(true);
  });

  test('router: waits for async handlers, rejects bad input like Express', async () => {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    app.use((req, res, next) => {
      next(); // not awaited
    });
    app.get('/slow', async (req, res) => {
      await new Promise((r) => setTimeout(r, 20));
      res.json({ ok: 1, from: req.query.from });
    });
    app.post('/echo', (req, res) => res.json(req.body));
    app.get('/p/:id', (req, res) => res.json({ id: req.params.id }));
    app.get('/never', () => {});
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => {
      if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too large' });
      if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad json' });
      if (err.expose && err.status) return res.status(err.status).json({ error: err.message });
      res.status(500).json({ error: 'boom' });
    });
    const json = (text) => ({ headers: { 'content-type': 'application/json' }, body: new TextEncoder().encode(text) });

    const slow = await dispatch(app, { method: 'GET', url: '/slow?from=a&from=b' });
    expect(slow.status).toBe(200);
    expect(JSON.parse(slow.body)).toEqual({ ok: 1, from: ['a', 'b'] });

    const bad = await dispatch(app, { method: 'GET', url: '/p/%E0%A4%A' });
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.body).error).toBeTruthy();
    expect(JSON.parse((await dispatch(app, { method: 'GET', url: '/p/%ED%8F%B0' })).body).id).toBe('폰');

    expect((await dispatch(app, { method: 'POST', url: '/echo', ...json(JSON.stringify({ a: 'x'.repeat(2000) })) })).status).toBe(413);
    expect((await dispatch(app, { method: 'POST', url: '/echo', ...json('null') })).status).toBe(400);
    expect((await dispatch(app, { method: 'POST', url: '/echo', ...json('{bad') })).status).toBe(400);
    expect(JSON.parse((await dispatch(app, { method: 'POST', url: '/echo', ...json('{"a":1}') })).body)).toEqual({ a: 1 });

    const head = await dispatch(app, { method: 'HEAD', url: '/p/1' });
    expect(head.status).toBe(200);
    expect(head.body).toBe('');

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const never = await dispatch(app, { method: 'GET', url: '/never' }, { timeoutMs: 50 });
    errSpy.mockRestore();
    expect(never.status).toBe(500);
  });

  test('server routes: malformed path escapes and oversized JSON bodies', async () => {
    const call = client(boot(null));
    await call('POST', '/api/auth/register', { username: 'router_user', password: 'password123' });
    expect((await call('POST', '/api/users/%ZZ/follow')).status).toBe(400);
    expect((await call('PUT', '/api/me/profile', { bio: 'x'.repeat(200 * 1024) })).status).toBe(413);
    expect((await call('HEAD', '/api/auth/me')).status).toBe(200);
  });
});
