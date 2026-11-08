// @vitest-environment node
// Edge cases from the server audit: input validation, demo accounts, sessions, limits, migrations.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { isDate } from './data.js';
import { RESERVED_USERNAMES } from './auth.js';
import { SAMPLE_USERNAMES } from './seed.js';
import { loginLimiter, rateLimiter } from './limits.js';
import { addDays, todayStr } from '../src/shared/date.js';

let db;
let app;
const uploadDir = mkdtempSync(join(tmpdir(), 'fr-hard-'));

function makeApp(env = {}, opts = {}) {
  db = opts.db || openDb(':memory:');
  app = createApp({ db, env: { PUBLIC_URL: 'http://app.test', ...env }, ai: null, uploadDir, ...opts });
  return app;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  makeApp();
});

async function newUser(username = 'lifter_1') {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ username, password: 'password123', displayName: username });
  expect(r.status).toBe(201);
  return { agent, user: r.body.user };
}

const lift = (exercise, weight = 60, extra = {}) => ({ exercise, weight, unit: 'kg', sets: 5, reps: 5, rating: 3, ...extra });
const run = (exercise, metrics) => ({ exercise, weight: 0, unit: 'kg', sets: 0, reps: 0, rating: 3, metrics });
const demo = (agent = request(app), today = '2026-11-07') => agent.post('/api/auth/demo').send({ today });
const count = (sql, ...args) => db.prepare(sql).get(...args).n;

describe('dates', () => {
  test('only 2000-01-01 .. 2100-12-31 are valid', () => {
    expect(isDate('2000-01-01')).toBe(true);
    expect(isDate('2100-12-31')).toBe(true);
    expect(isDate('1999-12-31')).toBe(false);
    expect(isDate('2101-01-01')).toBe(false);
    expect(isDate('9999-12-31')).toBe(false);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate(['2026-11-07'])).toBe(false);
    expect(isDate(20261107)).toBe(false);
  });

  test('every route refuses far-future dates', async () => {
    const { agent } = await newUser();
    expect((await agent.put('/api/workouts/9999-12-29').send({ entries: [lift('bench_press')] })).status).toBe(400);
    expect((await agent.get('/api/workouts?from=9999-01-01')).status).toBe(400);
    expect((await agent.put('/api/bodyweights/9999-12-29').send({ kg: 70 })).status).toBe(400);
    expect((await agent.delete('/api/bodyweights/9999-12-29')).status).toBe(400);
    expect((await agent.post('/api/meals').send({ date: '9999-12-29', name: 'x', kcal: 1 })).status).toBe(400);
    expect((await agent.put('/api/shaker/9999-12-29')).status).toBe(400);
    expect((await agent.get('/api/tiers?today=9999-12-29')).status).toBe(400);
    expect((await demo(request(app), '9999-12-31')).status).toBe(400);
  });
});

describe('demo accounts', () => {
  test('rate limited per address', async () => {
    for (let i = 0; i < 5; i++) expect((await demo()).status).toBe(201);
    const r = await demo();
    expect(r.status).toBe(429);
    makeApp({ DEMO_RATE_LIMIT: '2' });
    await demo();
    await demo();
    expect((await demo()).status).toBe(429);
    makeApp({ NODE_ENV: 'test' }); // the UI test server signs in many demo accounts from one address
    for (let i = 0; i < 7; i++) expect((await demo()).status).toBe(201);
  });

  test('off by default in production, on with ALLOW_DEMO=true', async () => {
    makeApp({ NODE_ENV: 'production' });
    expect((await demo()).status).toBe(404);
    expect((await request(app).get('/api/auth/providers')).body.demo).toBe(false);
    makeApp({ NODE_ENV: 'production', ALLOW_DEMO: 'true' });
    expect((await demo()).status).toBe(201);
  });

  test('old demo accounts and demo accounts without a session are removed', async () => {
    const a = request.agent(app);
    await demo(a);
    const b = request.agent(app);
    await demo(b);
    expect(count('SELECT COUNT(*) AS n FROM users WHERE is_demo = 1')).toBe(2);
    const [first, second] = db.prepare('SELECT id FROM users WHERE is_demo = 1 ORDER BY id').all();
    db.prepare("UPDATE users SET created_at = datetime('now', '-25 hours') WHERE id = ?").run(first.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(second.id);
    makeApp({}, { db }); // startup cleanup
    expect(count('SELECT COUNT(*) AS n FROM users WHERE is_demo = 1')).toBe(0);
    expect(count('SELECT COUNT(*) AS n FROM users WHERE is_sample = 1')).toBe(4);
  });

  test('DEMO_TTL_HOURS=0 keeps signed-in demo accounts', async () => {
    makeApp({ DEMO_TTL_HOURS: '0' });
    await demo(request.agent(app));
    db.prepare("UPDATE users SET created_at = datetime('now', '-30 days') WHERE is_demo = 1").run();
    makeApp({ DEMO_TTL_HOURS: '0' }, { db });
    expect(count('SELECT COUNT(*) AS n FROM users WHERE is_demo = 1')).toBe(1);
  });

  test('a demo account only follows sample users and gets the keyword search', async () => {
    const { user: real } = await newUser('real_user');
    const d = request.agent(app);
    await demo(d);
    const r = await d.post(`/api/users/${real.id}/follow`);
    expect(r.status).toBe(403);
    expect(count('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?', real.id)).toBe(0);
    const sample = db.prepare("SELECT id FROM users WHERE username = 'routine_choi'").get();
    expect((await d.post(`/api/users/${sample.id}/follow`)).status).toBe(200);

    const ai = { beta: { messages: { create: vi.fn() } } };
    makeApp({}, { db, ai });
    const d2 = request.agent(app);
    await demo(d2);
    const s = await d2.post('/api/ai/extension-search').send({ question: '5x5 운동 프로그램' });
    expect(s.status).toBe(200);
    expect(s.body.source).toBe('keyword');
    expect(ai.beta.messages.create).not.toHaveBeenCalled();
  });

  test('sample usernames are reserved and an old clash does not break the demo', async () => {
    expect(SAMPLE_USERNAMES).toEqual(RESERVED_USERNAMES);
    const r = await request(app).post('/api/auth/register').send({ username: 'bench_kim', password: 'password123' });
    expect(r.status).toBe(409);
    const { agent } = await newUser();
    expect((await agent.put('/api/me/username').send({ username: 'squat_lee' })).status).toBe(409);

    // A database where someone took the name before it was reserved.
    db.prepare("INSERT INTO users (username, display_name) VALUES ('bench_kim', '선점')").run();
    const d = request.agent(app);
    expect((await demo(d)).status).toBe(201);
    expect((await demo()).status).toBe(201);
    expect(db.prepare("SELECT username FROM users WHERE is_sample = 1 AND display_name = '김벤치'").get().username).toBe('bench_kim_1');
    expect((await d.get('/api/status')).body.workouts.length).toBeGreaterThan(100);
  });

  test('a failed demo seeding leaves no half-made account', async () => {
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON body_weights BEGIN SELECT RAISE(ABORT, 'boom'); END");
    expect((await demo()).status).toBe(500);
    expect(count('SELECT COUNT(*) AS n FROM users')).toBe(0);
  });

  test('a demo account with its own id and password becomes a real account', async () => {
    const d = request.agent(app);
    await demo(d);
    await d.put('/api/me/username').send({ username: 'demo_keeper' });
    const r = await d.put('/api/me/password').send({ next: 'password123' });
    expect(r.body.user.isDemo).toBe(false);
    await d.post('/api/auth/logout');
    const again = await request(app).post('/api/auth/login').send({ username: 'demo_keeper', password: 'password123' });
    expect(again.status).toBe(200);
  });
});

describe('sessions', () => {
  test('signing in again replaces the old session; leaving a demo account removes it', async () => {
    const { agent } = await newUser();
    expect(count('SELECT COUNT(*) AS n FROM sessions')).toBe(1);
    await agent.post('/api/auth/login').send({ username: 'lifter_1', password: 'password123' });
    expect(count('SELECT COUNT(*) AS n FROM sessions')).toBe(1);

    const d = request.agent(app);
    await demo(d);
    await d.post('/api/auth/login').send({ username: 'lifter_1', password: 'password123' });
    expect(count('SELECT COUNT(*) AS n FROM users WHERE is_demo = 1')).toBe(0);
  });

  test('expired sessions are removed at startup', async () => {
    await newUser();
    db.prepare('UPDATE sessions SET expires_at = 1').run();
    makeApp({}, { db });
    expect(count('SELECT COUNT(*) AS n FROM sessions')).toBe(0);
  });

  test('sessionDays and sliding renewal', async () => {
    makeApp({}, { sessionDays: 2 });
    const { agent } = await newUser();
    const exp = () => db.prepare('SELECT expires_at FROM sessions').get().expires_at;
    expect(exp() - Date.now()).toBeGreaterThan(1.9 * 86400000);
    expect(exp() - Date.now()).toBeLessThan(2.1 * 86400000);
    // more than half left: unchanged, no cookie
    let r = await agent.get('/api/auth/me');
    expect(r.headers['set-cookie']).toBeUndefined();
    db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now() + 0.5 * 86400000);
    r = await agent.get('/api/auth/me');
    expect(r.body.user.username).toBe('lifter_1');
    expect(r.headers['set-cookie'][0]).toMatch(/sid=/);
    expect(exp() - Date.now()).toBeGreaterThan(1.9 * 86400000);
  });
});

describe('password limits', () => {
  test('limiter prunes expired entries', () => {
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    const l = loginLimiter({ max: 2, windowMs: 1000 });
    l.fail('a');
    l.fail('b');
    expect(l.size()).toBe(2);
    now.mockReturnValue(1_000_000 + 120_000);
    l.fail('c');
    expect(l.size()).toBe(1);
    const allow = rateLimiter({ max: 1, windowMs: 1000 });
    expect(allow('x')).toBe(true);
    expect(allow('x')).toBe(false);
    now.mockReturnValue(1_000_000 + 240_000);
    expect(allow('y')).toBe(true);
    expect(allow.size()).toBe(1);
    now.mockRestore();
  });

  test('failures across many usernames from one address are limited', async () => {
    await newUser();
    for (let i = 0; i < 30; i++) await request(app).post('/api/auth/login').send({ username: `user_${i}`, password: 'whatever1' });
    const r = await request(app).post('/api/auth/login').send({ username: 'lifter_1', password: 'password123' });
    expect(r.status).toBe(429);
  });

  test('TRUST_PROXY: the limit follows the forwarded client address', async () => {
    makeApp({ TRUST_PROXY: '1' });
    await newUser();
    for (let i = 0; i < 10; i++) {
      await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.9').send({ username: 'lifter_1', password: 'wrong-pass' });
    }
    const attacker = await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.9').send({ username: 'lifter_1', password: 'password123' });
    expect(attacker.status).toBe(429);
    const owner = await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.7').send({ username: 'lifter_1', password: 'password123' });
    expect(owner.status).toBe(200);
  });

  test('password change and account deletion are limited too', async () => {
    const { agent } = await newUser();
    for (let i = 0; i < 10; i++) expect((await agent.put('/api/me/password').send({ current: 'wrong-pass', next: 'password456' })).status).toBe(401);
    expect((await agent.put('/api/me/password').send({ current: 'password123', next: 'password456' })).status).toBe(429);
    expect((await agent.delete('/api/me').send({ password: 'password123' })).status).toBe(429);
  });
});

describe('oauth', () => {
  const env = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret' };
  function oauthApp(profile, calls = []) {
    const fetchImpl = async (url, opts) => {
      calls.push(opts);
      if (url.includes('access_token')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
      return new Response(JSON.stringify(profile), { status: 200 });
    };
    return makeApp(env, { fetchImpl });
  }
  async function login(agent) {
    const start = await agent.get('/api/auth/oauth/github');
    const state = new URL(start.headers.location).searchParams.get('state');
    return agent.get(`/api/auth/oauth/github/callback?code=abc&state=${state}`);
  }

  test('odd profile fields are cleaned instead of crashing', async () => {
    const calls = [];
    oauthApp({ id: 7, name: 12345, login: ['x'], email: { a: 1 }, avatar_url: { u: 1 } }, calls);
    const r = await login(request.agent(app));
    expect(r.headers.location).toBe('/');
    const u = db.prepare('SELECT * FROM users').get();
    expect(u).toMatchObject({ display_name: 'GitHub 사용자', email: null, avatar_url: null });
    expect(calls.every((c) => c.signal instanceof AbortSignal)).toBe(true);

    oauthApp({ id: { nested: true } });
    const bad = await login(request.agent(app));
    expect(decodeURIComponent(bad.headers.location)).toMatch(/login_error=GitHub 로그인에 실패/);
  });

  test('a database error ends in a failed login, not a crash', async () => {
    oauthApp({ id: 9, login: 'x' });
    db.exec("CREATE TRIGGER boom BEFORE INSERT ON oauth_accounts BEGIN SELECT RAISE(ABORT, 'locked'); END");
    const r = await login(request.agent(app));
    expect(r.status).toBe(302);
    expect(decodeURIComponent(r.headers.location)).toMatch(/login_error=/);
  });

  test('cancel at the provider says so', async () => {
    oauthApp({ id: 9 });
    const agent = request.agent(app);
    const start = await agent.get('/api/auth/oauth/github');
    const state = new URL(start.headers.location).searchParams.get('state');
    const r = await agent.get(`/api/auth/oauth/github/callback?error=access_denied&state=${state}`);
    expect(decodeURIComponent(r.headers.location)).toContain('로그인을 취소했습니다');
    expect((await request(app).get('/api/auth/oauth/constructor')).status).toBe(404);
  });

  test('switching accounts through oauth drops the old session', async () => {
    oauthApp({ id: 9, login: 'gh' });
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ username: 'lifter_1', password: 'password123' });
    await login(agent);
    expect(count('SELECT COUNT(*) AS n FROM sessions')).toBe(1);
  });
});

describe('exercise ids in logs and routines', () => {
  test('only catalog ids and your own custom exercises', async () => {
    const { agent: victim } = await newUser('victim_1');
    const { agent } = await newUser('other_1');
    const c = (await victim.post('/api/me/exercises').send({ name: '비밀운동XYZ', category: 'free' })).body.exercise;
    expect((await agent.put('/api/workouts/2026-11-01').send({ entries: [lift(`c${c.id}`)] })).status).toBe(400);
    expect((await agent.put('/api/workouts/2026-11-01').send({ entries: [lift('zzz_not_real')] })).status).toBe(400);
    expect((await agent.post('/api/routines').send({ name: 'r', days: { 1: { exercises: [{ exercise: `c${c.id}` }] } } })).status).toBe(400);
    expect((await victim.put('/api/workouts/2026-11-01').send({ entries: [lift(`c${c.id}`)] })).status).toBe(200);
  });

  test('a deleted custom exercise stays in old days and routines', async () => {
    const { agent } = await newUser();
    const cardio = (await agent.post('/api/me/exercises').send({ name: '사이드 스텝', category: 'cardio', metrics: ['time'] })).body.exercise;
    const free = (await agent.post('/api/me/exercises').send({ name: '랜드마인', category: 'free' })).body.exercise;
    const day = [run(`c${cardio.id}`, { time: 20 }), lift(`c${free.id}`, 40, { program: 'stronglifts5x5' })];
    expect((await agent.put('/api/workouts/2026-11-06').send({ entries: day })).status).toBe(200);
    const routine = { name: 'r', days: { 1: { exercises: [{ exercise: `c${free.id}`, program: 'stronglifts5x5' }] } } };
    const rid = (await agent.post('/api/routines').send(routine)).body.routines[0].id;
    await agent.delete(`/api/me/exercises/${cardio.id}`);
    await agent.delete(`/api/me/exercises/${free.id}`);

    const saved = (await agent.get('/api/workouts/2026-11-06')).body.workout;
    const r = await agent.put('/api/workouts/2026-11-06').send({ memo: '수정', entries: saved.entries });
    expect(r.status).toBe(200);
    expect(r.body.workout.entries.map((e) => [e.exercise, e.metrics || null, e.program])).toEqual([
      [`c${cardio.id}`, { time: 20 }, null],
      [`c${free.id}`, null, 'stronglifts5x5'],
    ]);
    // ...but not on another day
    expect((await agent.put('/api/workouts/2026-11-07').send({ entries: saved.entries })).status).toBe(400);
    expect((await agent.put(`/api/routines/${rid}`).send({ ...routine, name: 'r2' })).status).toBe(200);
    // stored entries can't sneak in unknown measurements
    const bad = [{ ...saved.entries[0], metrics: { constructor: 5 } }];
    expect((await agent.put('/api/workouts/2026-11-06').send({ entries: bad })).status).toBe(400);
  });

  test('a custom exercise that leaves free/machine leaves program groups', async () => {
    const { agent } = await newUser();
    const c = (await agent.post('/api/me/exercises').send({ name: '랜드마인', category: 'free' })).body.exercise;
    const entry = lift(`c${c.id}`, 40, { program: 'stronglifts5x5' });
    await agent.put('/api/workouts/2026-11-05').send({ entries: [entry] });
    const routine = { name: 'r', days: { 1: { exercises: [{ exercise: `c${c.id}`, program: 'stronglifts5x5' }] } } };
    const rid = (await agent.post('/api/routines').send(routine)).body.routines[0].id;
    await agent.put(`/api/me/exercises/${c.id}`).send({ name: '랜드마인', category: 'bodyweight' });

    const saved = (await agent.get('/api/workouts/2026-11-05')).body.workout;
    expect(saved.entries[0].program).toBeNull();
    expect((await agent.put('/api/workouts/2026-11-05').send({ memo: 'x', entries: saved.entries })).status).toBe(200);
    const days = (await agent.get('/api/routines')).body.routines[0].days;
    expect(days[1].exercises[0].program).toBeNull();
    expect((await agent.put(`/api/routines/${rid}`).send({ name: 'r', days })).status).toBe(200);
  });
});

describe('types and whitelists', () => {
  test('wrong types are 400, not 500', async () => {
    const { agent } = await newUser();
    const put = (entries, extra = {}) => agent.put('/api/workouts/2026-11-07').send({ entries, ...extra });
    expect((await put([lift(null)])).status).toBe(400);
    expect((await put([{ ...lift('x'), exercise: undefined }])).status).toBe(400);
    expect((await put([lift(['bench_press'])])).status).toBe(400);
    expect((await put([lift('bench_press')], { memo: { a: 1 } })).status).toBe(400);
    expect((await agent.post('/api/meals').send({ date: '2026-11-07', time: ['12:00'], name: 'x', kcal: 1 })).status).toBe(400);
    expect((await agent.post('/api/meals').send({ date: '2026-11-07', name: { a: 1 }, kcal: 1 })).status).toBe(400);
    const routine = (exercises) => agent.post('/api/routines').send({ name: 'r', days: { 1: { exercises } } });
    expect((await routine([{ exercise: null }])).status).toBe(400);
    expect((await routine([{}])).status).toBe(400);
    expect((await routine(['bench_press'])).status).toBe(400);
    expect(count('SELECT COUNT(*) AS n FROM routines')).toBe(0);
  });

  test('prototype keys are not whitelisted', async () => {
    const { agent } = await newUser();
    for (const m of ['__proto__', 'constructor', 'toString']) {
      expect((await agent.post('/api/me/exercises').send({ name: `a${m}`, category: 'free', primaryMuscles: [m] })).status).toBe(400);
      expect((await agent.post('/api/me/exercises').send({ name: `b${m}`, category: 'cardio', metrics: [m] })).status).toBe(400);
    }
    expect((await agent.put('/api/workouts/2026-11-07').send({ entries: [run('treadmill_run', { constructor: 5 })] })).status).toBe(400);
  });

  test('settings and profile take real booleans, strings and numbers', async () => {
    const { agent } = await newUser();
    expect((await agent.put('/api/me/settings').send({ isPublic: 'false' })).status).toBe(400);
    expect((await agent.put('/api/me/settings').send({ promoOptIn: 1 })).status).toBe(400);
    expect((await agent.put('/api/me/settings').send({ isPublic: false })).body.isPublic).toBe(false);
    expect((await agent.put('/api/me/extensions/tier').send({ enabled: 'false' })).status).toBe(400);
    expect((await agent.put('/api/me/profile').send({ displayName: {} })).status).toBe(400);
    expect((await agent.put('/api/me/recovery').send({ email: ['a@b.co'] })).status).toBe(400);
    expect((await agent.put('/api/me/username').send({ username: ['abcd_1'] })).status).toBe(400);
    expect((await agent.put('/api/tiers/profile').send({ sex: 'male', bodyweight: '80' })).status).toBe(400);
    expect((await agent.put('/api/me/exercises/1').send({ name: 'x', category: 'free', increment: '2.5' })).status).toBe(404);
    expect((await agent.post('/api/me/exercises').send({ name: 'x', category: 'free', increment: '2.5' })).status).toBe(400);

    const cal = { heightCm: 175, age: 30, sex: 'male', activity: 'light', goal: 'lose' };
    expect((await agent.put('/api/me/settings').send({ calProfile: { ...cal, heightCm: '175' } })).status).toBe(400);
    const r = await agent.put('/api/me/settings').send({ calProfile: { ...cal, junk: 'x'.repeat(5000) } });
    expect(r.status).toBe(200);
    expect(r.body.calProfile).toEqual(cal);
  });
});

describe('social', () => {
  test('follow/unfollow loops notify once a day; meals are capped per day', async () => {
    const { user: target, agent: targetAgent } = await newUser('target_1');
    const { agent } = await newUser('fan_1');
    for (let i = 0; i < 5; i++) {
      await agent.post(`/api/users/${target.id}/follow`);
      await agent.delete(`/api/users/${target.id}/follow`);
    }
    expect(count("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND type = 'follow'", target.id)).toBe(1);

    for (let i = 0; i < 50; i++) await targetAgent.post('/api/meals').send({ date: '2026-11-07', name: `m${i}`, kcal: 10 });
    const r = await targetAgent.post('/api/meals').send({ date: '2026-11-07', name: 'one more', kcal: 10 });
    expect(r.status).toBe(400);
    expect((await targetAgent.post('/api/meals').send({ date: '2026-11-08', name: 'next day', kcal: 10 })).status).toBe(201);
  });

  test('a private profile shows only who it is; its shares reach mutual followers only', async () => {
    const { user: priv, agent: privAgent } = await newUser('private_1');
    await privAgent.put('/api/me/profile').send({ bio: '비밀 소개' });
    await privAgent.put('/api/me/settings').send({ isPublic: false });
    const { user: fan, agent: fanAgent } = await newUser('fan_1');
    const { user: friend, agent: friendAgent } = await newUser('friend_1');

    const peek = (await fanAgent.get(`/api/users/${priv.id}`)).body;
    expect(peek).toEqual({
      user: { id: priv.id, username: 'private_1', displayName: 'private_1', avatarUrl: null },
      isSelf: false,
      isFollowing: false,
      isPublic: false,
      routine: null,
      routineName: null,
      routineSince: null,
      workouts: null,
    });
    const follow = await fanAgent.post(`/api/users/${priv.id}/follow`);
    expect(follow.body).toEqual({ isFollowing: true });
    await friendAgent.post(`/api/users/${priv.id}/follow`);
    await privAgent.post(`/api/users/${friend.id}/follow`);
    expect((await privAgent.get(`/api/users/${priv.id}`)).body.weeklyGoal).toBe(3);

    await privAgent.put('/api/workouts/2026-11-07').send({ entries: [lift('bench_press')] });
    const ach = db.prepare('SELECT id FROM achievements WHERE user_id = ?').get(priv.id);
    const shared = await privAgent.post(`/api/achievements/${ach.id}/share`);
    expect(shared.body.followers).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM notifications WHERE type = 'post' AND user_id = ?", friend.id)).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM notifications WHERE type = 'post' AND user_id = ?", fan.id)).toBe(0);
  });

  test('responses are nosniff', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('tiers', () => {
  test('a future `today` cannot push processing ahead of the server date', async () => {
    const { agent } = await newUser();
    await agent.put('/api/me/extensions/tier').send({ enabled: true });
    await agent.put('/api/tiers/profile').send({ sex: 'male', bodyweight: 80 });
    await agent.get('/api/tiers?today=2099-01-01');
    const through = () => db.prepare('SELECT processed_through AS d FROM tier_state').get().d;
    expect(through() <= todayStr()).toBe(true);
    db.prepare("UPDATE tier_state SET processed_through = '2099-01-01'").run();
    await agent.get(`/api/tiers?today=${todayStr()}`);
    expect(through()).toBe(addDays(todayStr(), -1));
  });
});

describe('routine start date and weight goal start', () => {
  test('routineSince is the day the routine became active', async () => {
    const { agent, user } = await newUser();
    const days = { 1: { exercises: [{ exercise: 'squat' }] } };
    await agent.post('/api/routines').send({ name: 'A', days });
    const second = (await agent.post('/api/routines').send({ name: 'B', days })).body.routines.find((r) => r.name === 'B');
    expect((await agent.get('/api/status')).body.routineSince).toBe(todayStr());
    db.prepare("UPDATE routines SET activated_at = '2026-01-01'").run();
    await agent.post(`/api/routines/${second.id}/activate`);
    expect((await agent.get('/api/status')).body.routineSince).toBe(todayStr());
    const { agent: other } = await newUser('other_1');
    expect((await other.get(`/api/users/${user.id}`)).body.routineSince).toBe(todayStr());
  });

  test('the demo routine starts with its history', async () => {
    const d = request.agent(app);
    await demo(d, '2026-11-07');
    expect((await d.get('/api/status')).body.routineSince).toBe(addDays('2026-11-07', -364));
  });

  test('goal_weight_start is the latest weight when the goal is set', async () => {
    const { agent } = await newUser();
    const start = () => db.prepare('SELECT goal_weight_start AS kg FROM user_settings').get().kg;
    await agent.put('/api/me/settings').send({ goalWeight: 70 });
    expect(start()).toBeNull();
    await agent.put('/api/bodyweights/2026-11-01').send({ kg: 80 });
    await agent.put('/api/bodyweights/2026-11-05').send({ kg: 78.5 });
    await agent.put('/api/me/settings').send({ goalWeight: 72 });
    expect(start()).toBe(78.5);
    await agent.put('/api/bodyweights/2026-11-06').send({ kg: 77 });
    await agent.put('/api/me/settings').send({ goalWeight: 72, theme: 'light' }); // unchanged goal keeps its start
    expect(start()).toBe(78.5);
    await agent.put('/api/me/settings').send({ goalWeight: null });
    expect(start()).toBeNull();
  });
});

describe('database', () => {
  test('file databases use WAL and wait for locks', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fr-wal-')), 'app.db');
    const fdb = openDb(file);
    expect(fdb.prepare('PRAGMA journal_mode').get().journal_mode).toBe('wal');
    expect(fdb.prepare('PRAGMA busy_timeout').get().timeout).toBe(5000);
  });

  test('version 5 removes orphan rows and adds the missing indexes', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fr-v4-')), 'app.db');
    const v4 = openDb(file);
    v4.exec(`
      PRAGMA foreign_keys = OFF;
      INSERT INTO users (id, display_name) VALUES (1, '남은 사용자');
      INSERT INTO routines (id, user_id, name, is_active, created_at) VALUES (1, 1, 'A', 1, '2026-03-04 10:00:00'), (2, 99, 'gone', 1, '2026-01-01 00:00:00');
      INSERT INTO routine_days (routine_id, weekday, exercises) VALUES (1, 1, '[]'), (2, 1, '[]'), (77, 2, '[]');
      INSERT INTO workouts (id, user_id, date) VALUES (1, 1, '2026-10-01'), (2, 99, '2026-10-01');
      INSERT INTO workout_entries (workout_id, exercise, weight, sets, reps) VALUES (1, 'squat', 100, 5, 5), (2, 'squat', 1, 1, 1), (55, 'squat', 1, 1, 1);
      INSERT INTO sessions (token, user_id, expires_at) VALUES ('t1', 99, 9999999999999);
      INSERT INTO user_settings (user_id) VALUES (1), (99);
      INSERT INTO follows (follower_id, followee_id) VALUES (1, 99), (99, 1);
      INSERT INTO notifications (user_id, type, title, actor_id) VALUES (1, 'follow', 'x', 99), (1, 'promo', 'ok', NULL), (99, 'promo', 'x', NULL);
      INSERT INTO achievements (id, user_id, key, kind, title) VALUES (5, 99, 'k', 'first', 't');
      INSERT INTO notifications (user_id, type, title, achievement_id) VALUES (1, 'achievement', 'x', 5);
      INSERT INTO meals (user_id, date, name, kcal) VALUES (99, '2026-10-01', 'x', 1);
      INSERT INTO body_weights (user_id, date, kg) VALUES (99, '2026-10-01', 70);
      ALTER TABLE routines DROP COLUMN activated_at;
      ALTER TABLE user_settings DROP COLUMN goal_weight_start;
      DROP INDEX workout_entries_workout;
      PRAGMA user_version = 4;
    `);
    v4.close();

    const v5 = openDb(file);
    expect(v5.prepare('PRAGMA user_version').get().user_version).toBe(5);
    const n = (sql) => v5.prepare(`SELECT COUNT(*) AS n FROM ${sql}`).get().n;
    expect(n('routines')).toBe(1);
    expect(n('routine_days')).toBe(1);
    expect(n('workouts')).toBe(1);
    expect(n('workout_entries')).toBe(1);
    expect(n('sessions')).toBe(0);
    expect(n('user_settings')).toBe(1);
    expect(n('follows')).toBe(0);
    expect(v5.prepare('SELECT title FROM notifications').all()).toEqual([{ title: 'ok' }]);
    expect(n('achievements') + n('meals') + n('body_weights')).toBe(0);
    expect(v5.prepare('SELECT activated_at FROM routines').get().activated_at).toBe('2026-03-04');
    expect(n("pragma_index_list('workout_entries') WHERE name = 'workout_entries_workout'")).toBe(1);
    expect(v5.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  test('raw node:sqlite still opens the migrated file', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fr-raw-')), 'app.db');
    openDb(file).close();
    const raw = new DatabaseSync(file);
    expect(raw.prepare('PRAGMA user_version').get().user_version).toBe(5);
  });
});
