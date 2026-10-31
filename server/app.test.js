// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { hashPassword, verifyPassword } from './auth.js';

let db;
let app;

function makeApp(env = {}, fetchImpl) {
  db = openDb(':memory:');
  app = createApp({ db, env: { PUBLIC_URL: 'http://app.test', ...env }, fetchImpl });
  return app;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  makeApp();
});

const register = (agent, body = {}) =>
  agent.post('/api/auth/register').send({ username: 'lifter_1', password: 'password123', displayName: '리프터', ...body });

describe('passwords', () => {
  test('hash and verify', () => {
    const h = hashPassword('secret-pass');
    expect(h).not.toContain('secret-pass');
    expect(verifyPassword('secret-pass', h)).toBe(true);
    expect(verifyPassword('wrong-pass', h)).toBe(false);
    expect(verifyPassword('x', null)).toBe(false);
  });
});

describe('local auth', () => {
  test('register logs in, me returns the user, logout ends the session', async () => {
    const agent = request.agent(app);
    const r = await register(agent);
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ username: 'lifter_1', displayName: '리프터', isDemo: false });
    expect(r.headers['set-cookie'][0]).toMatch(/sid=.*HttpOnly/);

    expect((await agent.get('/api/auth/me')).body.user.username).toBe('lifter_1');
    expect((await agent.post('/api/auth/logout')).status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n).toBe(0);
  });

  test('login with correct and wrong passwords', async () => {
    await register(request(app));
    const bad = await request(app).post('/api/auth/login').send({ username: 'lifter_1', password: 'nope-nope' });
    expect(bad.status).toBe(401);
    const unknown = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'whatever1' });
    expect(unknown.status).toBe(401);
    const agent = request.agent(app);
    const ok = await agent.post('/api/auth/login').send({ username: 'lifter_1', password: 'password123' });
    expect(ok.status).toBe(200);
    expect((await agent.get('/api/auth/me')).body.user.displayName).toBe('리프터');
  });

  test('validation and duplicates', async () => {
    expect((await register(request(app), { username: 'AB' })).status).toBe(400);
    expect((await register(request(app), { password: 'short' })).status).toBe(400);
    expect((await register(request(app))).status).toBe(201);
    expect((await register(request(app))).status).toBe(409);
  });

  test('blocks repeated failed logins', async () => {
    await register(request(app));
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').send({ username: 'lifter_1', password: 'wrong-pass' });
    }
    const r = await request(app).post('/api/auth/login').send({ username: 'lifter_1', password: 'password123' });
    expect(r.status).toBe(429);
  });

  test('expired sessions are rejected', async () => {
    const agent = request.agent(app);
    await register(agent);
    db.prepare('UPDATE sessions SET expires_at = 0').run();
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });
});

describe('demo account', () => {
  test('creates seeded data and is deleted on logout', async () => {
    const agent = request.agent(app);
    const r = await agent.post('/api/auth/demo').send({ today: '2026-10-28' });
    expect(r.status).toBe(201);
    expect(r.body.user.isDemo).toBe(true);

    const status = await agent.get('/api/status');
    expect(status.status).toBe(200);
    expect(status.body.workouts.length).toBeGreaterThan(100);
    expect(status.body.workouts.at(-1).date).toBe('2026-10-28');
    expect(status.body.workouts[0].entries[0]).toHaveProperty('exercise');
    expect(Object.keys(status.body.routine).length).toBe(4);
    expect(status.body.bodyWeights.length).toBeGreaterThan(50);

    const settings = await agent.get('/api/settings');
    expect(settings.body.extensions).toEqual({ bodyweight: true, streak: true, routine: true });

    await agent.post('/api/auth/logout');
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM workouts').get().n).toBe(0);
  });

  test('rejects a bad date and can be disabled', async () => {
    expect((await request(app).post('/api/auth/demo').send({ today: 'tomorrow' })).status).toBe(400);
    makeApp({ ALLOW_DEMO: 'false' });
    expect((await request(app).post('/api/auth/demo').send({ today: '2026-10-28' })).status).toBe(404);
    expect((await request(app).get('/api/auth/providers')).body.demo).toBe(false);
  });
});

describe('settings, extensions and status', () => {
  test('require login', async () => {
    expect((await request(app).get('/api/status')).status).toBe(401);
    expect((await request(app).get('/api/settings')).status).toBe(401);
    expect((await request(app).put('/api/extensions/streak').send({ enabled: true })).status).toBe(401);
  });

  test('update settings with validation', async () => {
    const agent = request.agent(app);
    await register(agent);
    expect((await agent.get('/api/settings')).body).toEqual({ weeklyGoal: 3, unit: 'kg', theme: 'dark', extensions: {} });
    const r = await agent.put('/api/settings').send({ weeklyGoal: 4, unit: 'lbs', theme: 'light' });
    expect(r.body).toMatchObject({ weeklyGoal: 4, unit: 'lbs', theme: 'light' });
    expect((await agent.put('/api/settings').send({ weeklyGoal: 9 })).status).toBe(400);
    expect((await agent.put('/api/settings').send({ unit: 'stone' })).status).toBe(400);
    expect((await agent.put('/api/settings').send({ theme: 'pink' })).status).toBe(400);
  });

  test('toggle extensions', async () => {
    const agent = request.agent(app);
    await register(agent);
    expect((await agent.put('/api/extensions/streak').send({ enabled: true })).body.extensions).toEqual({ streak: true });
    expect((await agent.put('/api/extensions/streak').send({ enabled: false })).body.extensions).toEqual({ streak: false });
    expect((await agent.put('/api/extensions/nope').send({ enabled: true })).status).toBe(404);
  });

  test('status only returns the current user data', async () => {
    const demo = request.agent(app);
    await demo.post('/api/auth/demo').send({ today: '2026-10-28' });
    const other = request.agent(app);
    await register(other);
    const r = await other.get('/api/status');
    expect(r.body).toEqual({ workouts: [], routine: {}, bodyWeights: [] });
  });

  test('unknown api route is 404 JSON', async () => {
    const r = await request(app).get('/api/nope');
    expect(r.status).toBe(404);
    expect(r.body.error).toBeDefined();
  });
});

describe('oauth', () => {
  const env = { GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' };

  test('providers report which are configured', async () => {
    makeApp(env);
    const r = await request(app).get('/api/auth/providers');
    expect(r.body.providers.map((p) => p.id)).toEqual(['google', 'naver', 'kakao', 'github']);
    expect(r.body.providers.find((p) => p.id === 'github').enabled).toBe(true);
    expect(r.body.providers.find((p) => p.id === 'google').enabled).toBe(false);
  });

  test('unconfigured provider redirects back with an error', async () => {
    const r = await request(app).get('/api/auth/oauth/google');
    expect(r.status).toBe(302);
    expect(decodeURIComponent(r.headers.location)).toContain('login_error=Google 로그인이 아직 설정되지 않았습니다');
  });

  test('full github flow creates and reuses an account', async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes('access_token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      return new Response(JSON.stringify({ id: 777, login: 'octo', name: null, email: 'o@x.dev' }), { status: 200 });
    });
    makeApp(env, fetchImpl);

    const login = async () => {
      const agent = request.agent(app);
      const start = await agent.get('/api/auth/oauth/github');
      expect(start.status).toBe(302);
      const url = new URL(start.headers.location);
      expect(url.origin + url.pathname).toBe('https://github.com/login/oauth/authorize');
      expect(url.searchParams.get('client_id')).toBe('gh-id');
      expect(url.searchParams.get('redirect_uri')).toBe('http://app.test/api/auth/oauth/github/callback');
      const state = url.searchParams.get('state');
      const cb = await agent.get(`/api/auth/oauth/github/callback?code=abc&state=${state}`);
      expect(cb.status).toBe(302);
      expect(cb.headers.location).toBe('/');
      return (await agent.get('/api/auth/me')).body.user;
    };

    const first = await login();
    expect(first).toMatchObject({ displayName: 'octo', email: 'o@x.dev', username: null });
    const second = await login();
    expect(second.id).toBe(first.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(1);

    const tokenCall = fetchImpl.mock.calls.find(([u]) => u.includes('access_token'));
    expect(String(tokenCall[1].body)).toContain('client_secret=gh-secret');
  });

  test('callback rejects a mismatched state', async () => {
    makeApp(env, vi.fn());
    const agent = request.agent(app);
    await agent.get('/api/auth/oauth/github');
    const cb = await agent.get('/api/auth/oauth/github/callback?code=abc&state=forged');
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain('login_error=');
    expect((await agent.get('/api/auth/me')).body.user).toBeNull();
  });

  test('callback reports provider failures', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 400 }));
    makeApp(env, fetchImpl);
    const agent = request.agent(app);
    const start = await agent.get('/api/auth/oauth/github');
    const state = new URL(start.headers.location).searchParams.get('state');
    const cb = await agent.get(`/api/auth/oauth/github/callback?code=abc&state=${state}`);
    expect(decodeURIComponent(cb.headers.location)).toContain('GitHub 로그인에 실패했습니다');
  });

  test('naver and kakao profiles are parsed', async () => {
    const { PROVIDERS } = await import('./oauth.js');
    expect(PROVIDERS.naver.parseProfile({ response: { id: 'n1', nickname: '네이버', email: 'a@n.com' } })).toMatchObject({
      id: 'n1',
      name: '네이버',
    });
    expect(
      PROVIDERS.kakao.parseProfile({ id: 9, kakao_account: { profile: { nickname: '카카오' }, email: 'k@k.com' } }),
    ).toMatchObject({ id: 9, name: '카카오', email: 'k@k.com' });
  });
});
