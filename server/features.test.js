// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { V1_SCHEMA, openDb } from './db.js';
import { broadcastPromo } from './routes/social.js';
import { REFUSAL_TEXT } from './ai.js';

let db;
let app;
let uploadDir;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b40000000049454e44ae426082', 'hex');

function makeApp({ ai = null, env = {} } = {}) {
  db = openDb(':memory:');
  uploadDir = mkdtempSync(join(tmpdir(), 'fr-feat-'));
  app = createApp({ db, env, ai, uploadDir });
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  makeApp();
});

let n = 0;
async function newUser(extra = {}) {
  const agent = request.agent(app);
  const username = `user_${++n}`;
  const r = await agent
    .post('/api/auth/register')
    .send({ username, password: 'password123', displayName: extra.displayName || `리프터${n}`, promoOptIn: extra.promoOptIn });
  return { agent, user: r.body.user, username };
}

const entry = (exercise, weight, extra = {}) => ({ exercise, weight, unit: 'kg', sets: 5, reps: 5, rating: 3, program: null, ...extra });

describe('migration from the first database version', () => {
  test('moves routines, renames extensions and merges duplicate days', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fr-mig-')), 'old.db');
    const old = new DatabaseSync(file);
    old.exec(V1_SCHEMA);
    old.exec(`
      INSERT INTO users (display_name) VALUES ('옛사용자');
      INSERT INTO user_extensions VALUES (1, 'bodyweight', 1), (1, 'routine', 1), (1, 'streak', 1);
      INSERT INTO workouts (user_id, date, split_name) VALUES (1, '2026-10-01', 'A'), (1, '2026-10-01', 'B');
      INSERT INTO workout_entries (workout_id, exercise, weight, sets, reps) VALUES (1, 'squat', 100, 5, 5), (2, 'bench_press', 80, 5, 5);
      INSERT INTO routine_days VALUES (1, 1, 'Push', '["bench_press","dips"]');
      PRAGMA user_version = 1;
    `);
    old.close();

    const migrated = openDb(file);
    expect(migrated.prepare("PRAGMA user_version").get().user_version).toBe(5);
    const ext = migrated.prepare('SELECT extension_id FROM user_extensions ORDER BY extension_id').all().map((r) => r.extension_id);
    expect(ext).toEqual(['streak', 'today', 'weighttrack']);
    const routine = migrated.prepare('SELECT * FROM routines').get();
    expect(routine).toMatchObject({ name: '기본 루틴', is_active: 1 });
    const day = migrated.prepare('SELECT * FROM routine_days').get();
    expect(JSON.parse(day.exercises)).toEqual([
      { exercise: 'bench_press', program: null },
      { exercise: 'dips', program: null },
    ]);
    expect(migrated.prepare('SELECT COUNT(*) AS n FROM workouts').get().n).toBe(1);
    expect(migrated.prepare('SELECT COUNT(*) AS n FROM workout_entries WHERE workout_id = 1').get().n).toBe(2);
    // running again is a no-op
    migrated.close();
    expect(openDb(file).prepare("PRAGMA user_version").get().user_version).toBe(5);
  });
});

describe('workout logs', () => {
  test('save, update, read, range list and delete', async () => {
    const { agent } = await newUser();
    let r = await agent.put('/api/workouts/2026-10-27').send({ splitName: 'Push', memo: '좋았음', entries: [entry('bench_press', 60)] });
    expect(r.status).toBe(200);
    expect(r.body.workout).toMatchObject({ date: '2026-10-27', splitName: 'Push', memo: '좋았음' });
    expect(r.body.workout.entries[0]).toMatchObject({ exercise: 'bench_press', weight: 60, rating: 3 });

    r = await agent.put('/api/workouts/2026-10-27').send({ splitName: 'Push', entries: [entry('bench_press', 62.5), entry('dips', 0, { rating: 1 })] });
    expect(r.body.workout.entries.map((e) => e.exercise)).toEqual(['bench_press', 'dips']);
    await agent.put('/api/workouts/2026-10-29').send({ entries: [entry('squat', 100)] });

    expect((await agent.get('/api/workouts/2026-10-27')).body.workout.entries).toHaveLength(2);
    const range = await agent.get('/api/workouts?from=2026-10-28&to=2026-10-31');
    expect(range.body.workouts.map((w) => w.date)).toEqual(['2026-10-29']);

    // empty log removes the day
    await agent.put('/api/workouts/2026-10-29').send({ entries: [] });
    expect((await agent.get('/api/workouts/2026-10-29')).body.workout).toBeNull();
    await agent.delete('/api/workouts/2026-10-27');
    expect((await agent.get('/api/workouts')).body.workouts).toEqual([]);
  });

  test('validation', async () => {
    const { agent } = await newUser();
    const put = (body, date = '2026-10-27') => agent.put(`/api/workouts/${date}`).send(body);
    expect((await put({ entries: [] }, '2026-02-30')).status).toBe(400);
    expect((await put({ entries: [entry('bench_press', -1)] })).status).toBe(400);
    expect((await put({ entries: [entry('bench_press', 60, { rating: 5 })] })).status).toBe(400);
    expect((await put({ entries: [entry('bench_press', 60, { program: 'madcow' })] })).status).toBe(400);
    expect((await put({ entries: [entry('DROP TABLE', 60)] })).status).toBe(400);
    expect((await put({ entries: [entry('bench_press', 60, { sets: 1.5 })] })).status).toBe(400);
    expect((await put({ memo: 'x'.repeat(2001), entries: [] })).status).toBe(400);
    expect((await put({ entries: Array.from({ length: 31 }, () => entry('squat', 1)) })).status).toBe(400);
  });

  test('logs are private to their owner', async () => {
    const a = await newUser();
    const b = await newUser();
    await a.agent.put('/api/workouts/2026-10-27').send({ entries: [entry('squat', 100)] });
    expect((await b.agent.get('/api/workouts/2026-10-27')).body.workout).toBeNull();
    await b.agent.delete('/api/workouts/2026-10-27');
    expect((await a.agent.get('/api/workouts/2026-10-27')).body.workout).not.toBeNull();
  });

  test('first log and personal records create achievements once', async () => {
    const { agent } = await newUser();
    let r = await agent.put('/api/workouts/2026-10-20').send({ entries: [entry('squat', 100)] });
    expect(r.body.achievements.map((a) => a.key)).toEqual(['first_workout']);
    r = await agent.put('/api/workouts/2026-10-22').send({ entries: [entry('squat', 105)] });
    expect(r.body.achievements.map((a) => a.key)).toEqual(['pr:squat:105']);
    r = await agent.put('/api/workouts/2026-10-22').send({ entries: [entry('squat', 105)], memo: '수정' });
    expect(r.body.achievements).toEqual([]);
    const notes = (await agent.get('/api/notifications')).body.notifications;
    expect(notes.map((x) => x.title)).toEqual(['스쿼트 최고 중량 105kg 달성', '첫 운동일지 작성']);
    expect((await agent.get('/api/notifications/unread-count')).body.count).toBe(2);
  });
});

describe('routines', () => {
  const days = { 1: { splitName: 'Push', exercises: [{ exercise: 'bench_press', program: 'stronglifts5x5' }] } };

  test('create, activate, edit, delete; status uses the active routine', async () => {
    const { agent } = await newUser();
    let r = await agent.post('/api/routines').send({ name: 'A', days });
    expect(r.status).toBe(201);
    expect(r.body.routines[0]).toMatchObject({ name: 'A', active: true });
    r = await agent.post('/api/routines').send({ name: 'B', days: { 3: { splitName: 'Pull', exercises: [{ exercise: 'deadlift' }] } } });
    expect(r.body.routines.map((x) => [x.name, x.active])).toEqual([['A', true], ['B', false]]);
    const b = r.body.routines.find((x) => x.name === 'B');

    r = await agent.post(`/api/routines/${b.id}/activate`);
    expect(r.body.routines.find((x) => x.active).name).toBe('B');
    let status = await agent.get('/api/status');
    expect(status.body.routineName).toBe('B');
    expect(status.body.routine[3]).toEqual({ splitName: 'Pull', exercises: [{ exercise: 'deadlift', program: null }] });

    r = await agent.put(`/api/routines/${b.id}`).send({ name: 'B2', days: {} });
    expect(r.body.routines.find((x) => x.id === b.id)).toMatchObject({ name: 'B2', days: {} });
    await agent.delete(`/api/routines/${b.id}`);
    status = await agent.get('/api/status');
    expect(status.body.routineName).toBeNull();
  });

  test('validation and ownership', async () => {
    const a = await newUser();
    const b = await newUser();
    expect((await a.agent.post('/api/routines').send({ name: '', days })).status).toBe(400);
    expect((await a.agent.post('/api/routines').send({ name: 'x', days: { 7: { exercises: [] } } })).status).toBe(400);
    expect((await a.agent.post('/api/routines').send({ name: 'x', days: { 1: { exercises: [{ exercise: 'squat', program: 'nope' }] } } })).status).toBe(400);
    const r = await a.agent.post('/api/routines').send({ name: 'mine', days });
    const id = r.body.routines[0].id;
    expect((await b.agent.put(`/api/routines/${id}`).send({ name: 'hack', days })).status).toBe(404);
    expect((await b.agent.post(`/api/routines/${id}/activate`)).status).toBe(404);
    expect((await b.agent.delete(`/api/routines/${id}`)).status).toBe(404);
  });
});

describe('body weight and goal', () => {
  test('records weights and notifies when the goal is reached', async () => {
    const { agent } = await newUser();
    await agent.put('/api/me/extensions/weighttrack').send({ enabled: true });
    await agent.put('/api/me/settings').send({ goalWeight: 75 });
    await agent.put('/api/bodyweights/2026-10-01').send({ kg: 78 });
    let r = await agent.put('/api/bodyweights/2026-10-15').send({ kg: 76.2 });
    expect(r.body.achievements).toEqual([]);
    r = await agent.put('/api/bodyweights/2026-10-30').send({ kg: 74.9 });
    expect(r.body.achievements.map((a) => a.key)).toEqual(['goal_weight:75']);
    expect(r.body.bodyWeights).toHaveLength(3);
    expect((await agent.put('/api/bodyweights/2026-10-31').send({ kg: 5 })).status).toBe(400);
  });
});

describe('follow, search and profile privacy', () => {
  test('search by name and @id, excluding yourself and demo accounts', async () => {
    const me = await newUser({ displayName: '김철수' });
    await newUser({ displayName: '김영희' });
    const demo = request.agent(app);
    await demo.post('/api/auth/demo').send({ today: '2026-11-01' });
    let r = await me.agent.get(`/api/users/search?q=${encodeURIComponent('김')}`);
    const names = r.body.users.map((u) => u.displayName);
    expect(names).toContain('김영희');
    expect(names).toContain('김벤치'); // sample user
    expect(names).not.toContain('김철수');
    expect(names).not.toContain('체단실 체험');
    r = await me.agent.get('/api/users/search?q=@bench_k');
    expect(r.body.users.map((u) => u.username)).toEqual(['bench_kim']);
    r = await me.agent.get('/api/users/search?q=%25');
    expect(r.body.users).toEqual([]);
  });

  test('follow / unfollow with a notification; no self follow', async () => {
    const a = await newUser({ displayName: '에이' });
    const b = await newUser();
    let r = await a.agent.post(`/api/users/${b.user.id}/follow`);
    expect(r.body).toMatchObject({ isFollowing: true, followers: 1 });
    await a.agent.post(`/api/users/${b.user.id}/follow`); // idempotent, no duplicate notification
    const notes = (await b.agent.get('/api/notifications')).body.notifications;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ type: 'follow', title: '에이님이 회원님을 팔로우하기 시작했어요', actor: { id: a.user.id } });
    expect((await a.agent.get(`/api/users/${b.user.id}`)).body.isFollowing).toBe(true);
    r = await a.agent.delete(`/api/users/${b.user.id}/follow`);
    expect(r.body).toMatchObject({ isFollowing: false, followers: 0 });
    expect((await a.agent.post(`/api/users/${a.user.id}/follow`)).status).toBe(400);
    expect((await a.agent.post('/api/users/99999/follow')).status).toBe(404);
  });

  test('private profiles hide routine and progress', async () => {
    const a = await newUser();
    const b = await newUser();
    await b.agent.put('/api/workouts/2026-10-27').send({ entries: [entry('squat', 100)] });
    let r = await a.agent.get(`/api/users/${b.user.id}`);
    expect(r.body.isPublic).toBe(true);
    expect(r.body.workouts).toHaveLength(1);
    await b.agent.put('/api/me/settings').send({ isPublic: false });
    r = await a.agent.get(`/api/users/${b.user.id}`);
    expect(r.body).toMatchObject({ isPublic: false, workouts: null, routine: null });
    // the owner still sees their own
    expect((await b.agent.get(`/api/users/${b.user.id}`)).body.workouts).toHaveLength(1);
  });

  test('demo accounts are not visible to others', async () => {
    const demo = request.agent(app);
    const d = (await demo.post('/api/auth/demo').send({ today: '2026-11-01' })).body.user;
    const a = await newUser();
    expect((await a.agent.get(`/api/users/${d.id}`)).status).toBe(404);
    expect((await a.agent.post(`/api/users/${d.id}/follow`)).status).toBe(404);
  });
});

describe('notifications and sharing', () => {
  test('read one, read all, and others cannot touch them', async () => {
    const a = await newUser();
    const b = await newUser();
    await a.agent.put('/api/workouts/2026-10-20').send({ entries: [entry('squat', 100)] });
    await a.agent.put('/api/workouts/2026-10-22').send({ entries: [entry('squat', 110)] });
    const [first] = (await a.agent.get('/api/notifications')).body.notifications;
    expect((await b.agent.post(`/api/notifications/${first.id}/read`)).status).toBe(404);
    await a.agent.post(`/api/notifications/${first.id}/read`);
    expect((await a.agent.get('/api/notifications/unread-count')).body.count).toBe(1);
    await a.agent.post('/api/notifications/read-all');
    expect((await a.agent.get('/api/notifications/unread-count')).body.count).toBe(0);
  });

  test('sharing an achievement notifies followers only, once', async () => {
    const a = await newUser({ displayName: '공유자' });
    const fan = await newUser();
    const stranger = await newUser();
    await fan.agent.post(`/api/users/${a.user.id}/follow`);
    const r = await a.agent.put('/api/workouts/2026-10-20').send({ entries: [entry('squat', 100)] });
    const id = r.body.achievements[0].id;
    expect((await stranger.agent.post(`/api/achievements/${id}/share`)).status).toBe(404);
    const share = await a.agent.post(`/api/achievements/${id}/share`);
    expect(share.body).toEqual({ shared: true, followers: 1 });
    expect((await a.agent.post(`/api/achievements/${id}/share`)).status).toBe(409);
    const post = (await fan.agent.get('/api/notifications')).body.notifications.find((x) => x.type === 'post');
    expect(post).toMatchObject({ title: '공유자님이 목표를 달성했어요', body: '첫 운동일지 작성', actor: { id: a.user.id } });
    expect((await stranger.agent.get('/api/notifications')).body.notifications).toEqual([]);
    const mine = (await a.agent.get('/api/notifications')).body.notifications.find((x) => x.achievementId === id);
    expect(mine.shared).toBe(true);
  });

  test('promotional notifications go only to users who opted in', async () => {
    const yes = await newUser({ promoOptIn: true });
    const no = await newUser();
    expect(broadcastPromo(db, { title: '새 익스텐션', extensionId: 'gvt' })).toBe(1);
    expect((await yes.agent.get('/api/notifications')).body.notifications[0]).toMatchObject({ type: 'promo', data: { extensionId: 'gvt' } });
    expect((await no.agent.get('/api/notifications')).body.notifications).toEqual([]);
  });
});

describe('profile and account', () => {
  test('edit name and bio with validation', async () => {
    const { agent } = await newUser();
    const r = await agent.put('/api/me/profile').send({ displayName: '새이름', bio: '안녕하세요' });
    expect(r.body.user).toMatchObject({ displayName: '새이름', bio: '안녕하세요' });
    expect((await agent.put('/api/me/profile').send({ displayName: '' })).status).toBe(400);
    expect((await agent.put('/api/me/profile').send({ bio: 'x'.repeat(151) })).status).toBe(400);
  });

  test('avatar upload, serve, reject non-images, reset', async () => {
    const { agent, user } = await newUser();
    let r = await agent.post('/api/me/avatar').set('Content-Type', 'image/png').send(PNG);
    expect(r.status).toBe(200);
    expect(r.body.user.avatarUrl).toMatch(new RegExp(`^/api/users/${user.id}/avatar\\?v=`));
    const img = await request(app).get(`/api/users/${user.id}/avatar`);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(readdirSync(join(uploadDir, 'avatars'))).toHaveLength(1);

    r = await agent.post('/api/me/avatar').set('Content-Type', 'image/png').send(Buffer.from('<svg onload=alert(1)>'));
    expect(r.status).toBe(400);
    r = await agent.post('/api/me/avatar').set('Content-Type', 'image/png').send(Buffer.alloc(600 * 1024));
    expect(r.status).toBe(413);

    r = await agent.delete('/api/me/avatar');
    expect(r.body.user.avatarUrl).toBeNull();
    expect(readdirSync(join(uploadDir, 'avatars'))).toHaveLength(0);
  });

  test('change username and password; recovery info', async () => {
    const a = await newUser();
    const b = await newUser();
    expect((await a.agent.put('/api/me/username').send({ username: b.username })).status).toBe(409);
    expect((await a.agent.put('/api/me/username').send({ username: 'X' })).status).toBe(400);
    expect((await a.agent.put('/api/me/username').send({ username: 'renamed_a' })).body.user.username).toBe('renamed_a');

    expect((await a.agent.put('/api/me/password').send({ current: 'wrong-pass', next: 'newpassword1' })).status).toBe(401);
    expect((await a.agent.put('/api/me/password').send({ current: 'password123', next: 'short' })).status).toBe(400);
    expect((await a.agent.put('/api/me/password').send({ current: 'password123', next: 'newpassword1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ username: 'renamed_a', password: 'password123' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ username: 'renamed_a', password: 'newpassword1' })).status).toBe(200);

    expect((await a.agent.put('/api/me/recovery').send({ email: 'not-an-email' })).status).toBe(400);
    expect((await a.agent.put('/api/me/recovery').send({ phone: '12345' })).status).toBe(400);
    const r = await a.agent.put('/api/me/recovery').send({ email: 'me@example.com', phone: '010-1234-5678' });
    expect(r.body.user).toMatchObject({ recoveryEmail: 'me@example.com', recoveryPhone: '010-1234-5678' });
  });

  test('delete account removes everything', async () => {
    const a = await newUser();
    const b = await newUser();
    await a.agent.put('/api/workouts/2026-10-20').send({ entries: [entry('squat', 100)] });
    await a.agent.post(`/api/users/${b.user.id}/follow`);
    await b.agent.post(`/api/users/${a.user.id}/follow`);
    await a.agent.post('/api/me/avatar').set('Content-Type', 'image/png').send(PNG);

    expect((await a.agent.delete('/api/me').send({ password: 'wrong-pass' })).status).toBe(401);
    expect((await a.agent.delete('/api/me').send({ password: 'password123' })).status).toBe(200);
    expect((await a.agent.get('/api/auth/me')).body.user).toBeNull();
    for (const table of ['workouts', 'notifications', 'achievements', 'sessions']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(a.user.id).n).toBe(0);
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ? OR followee_id = ?').get(a.user.id, a.user.id).n).toBe(0);
    expect(existsSync(join(uploadDir, 'avatars')) ? readdirSync(join(uploadDir, 'avatars')) : []).toEqual([]);
    expect((await b.agent.get(`/api/users/${a.user.id}`)).status).toBe(404);
  });

  test("social-only accounts confirm deletion by typing '탈퇴'", async () => {
    const id = Number(db.prepare("INSERT INTO users (display_name) VALUES ('소셜')").run().lastInsertRowid);
    const agent = request.agent(app);
    const { createSession } = await import('./auth.js');
    agent.set('Cookie', `sid=${createSession(db, id)}`);
    expect((await agent.delete('/api/me').send({ confirm: '네' })).status).toBe(400);
    expect((await agent.delete('/api/me').send({ confirm: '탈퇴' })).status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(id).n).toBe(0);
  });
});

describe('extensions', () => {
  test('likes and saves', async () => {
    const a = await newUser();
    const b = await newUser();
    await a.agent.post('/api/extensions/gvt/like');
    const r = await b.agent.post('/api/extensions/gvt/like');
    expect(r.body).toEqual({ liked: true, likes: 2 });
    await b.agent.post('/api/extensions/gvt/save');
    const list = (await b.agent.get('/api/extensions')).body.extensions.find((e) => e.id === 'gvt');
    expect(list).toMatchObject({ likes: 2, liked: true, saved: true });
    expect((await b.agent.delete('/api/extensions/gvt/like')).body).toEqual({ liked: false, likes: 1 });
    expect((await request(app).post('/api/extensions/gvt/like')).status).toBe(401);
    expect((await a.agent.post('/api/extensions/nope/like')).status).toBe(404);
  });

  test('CalTrack pulls in WeightTrack; turning WeightTrack off turns CalTrack off', async () => {
    const { agent } = await newUser();
    let r = await agent.put('/api/me/extensions/caltrack').send({ enabled: true });
    expect(r.body.extensions).toMatchObject({ caltrack: true, weighttrack: true });
    r = await agent.put('/api/me/extensions/weighttrack').send({ enabled: false });
    expect(r.body.extensions).toMatchObject({ caltrack: false, weighttrack: false });
  });

  test('CalTrack profile validation', async () => {
    const { agent } = await newUser();
    const good = { heightCm: 175, age: 30, sex: 'male', activity: 'moderate', goal: 'lose' };
    expect((await agent.put('/api/me/settings').send({ calProfile: good })).body.calProfile).toEqual(good);
    expect((await agent.put('/api/me/settings').send({ calProfile: { ...good, heightCm: 20 } })).status).toBe(400);
    expect((await agent.put('/api/me/settings').send({ calProfile: { ...good, goal: 'bulk' } })).status).toBe(400);
  });
});

describe('meals', () => {
  test('add, list by date, delete, validate', async () => {
    const a = await newUser();
    const b = await newUser();
    const r = await a.agent.post('/api/meals').send({ date: '2026-11-01', time: '12:30', name: '닭가슴살', kcal: 165, carbs: 0, protein: 31, fat: 3.6 });
    expect(r.status).toBe(201);
    expect((await a.agent.get('/api/meals?date=2026-11-01')).body.meals).toHaveLength(1);
    expect((await b.agent.get('/api/meals?date=2026-11-01')).body.meals).toHaveLength(0);
    expect((await b.agent.delete(`/api/meals/${r.body.meal.id}`)).status).toBe(404);
    expect((await a.agent.post('/api/meals').send({ date: '2026-11-01', name: '', kcal: 1 })).status).toBe(400);
    expect((await a.agent.post('/api/meals').send({ date: '2026-11-01', name: 'x', kcal: -1 })).status).toBe(400);
    expect((await a.agent.post('/api/meals').send({ date: '2026-11-01', time: '25:00', name: 'x', kcal: 1 })).status).toBe(400);
    expect((await a.agent.delete(`/api/meals/${r.body.meal.id}`)).status).toBe(200);
  });

  test('photo analysis is unavailable without an AI key', async () => {
    const { agent } = await newUser();
    expect((await agent.get('/api/ai/status')).body.enabled).toBe(false);
    const r = await agent.post('/api/meals/analyze').set('Content-Type', 'image/png').send(PNG);
    expect(r.status).toBe(503);
  });
});

describe('AI', () => {
  const fakeClient = (reply) => {
    const create = vi.fn(async () => reply);
    return { client: { beta: { messages: { create } } }, create };
  };
  const json = (obj) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }] });

  test('extension search returns links from the model and drops unknown ids', async () => {
    const { client, create } = fakeClient(
      json({ answer: '5x5 프로그램 익스텐션의 링크를 보내드리겠습니다.', extension_ids: ['stronglifts5x5', 'made_up'], off_topic: false }),
    );
    makeApp({ ai: client });
    const { agent } = await newUser();
    const r = await agent.post('/api/ai/extension-search').send({ question: '5x5 프로그램으로 운동을 하고 싶어' });
    expect(r.body).toEqual({
      answer: '5x5 프로그램 익스텐션의 링크를 보내드리겠습니다.',
      extensionIds: ['stronglifts5x5'],
      offTopic: false,
      source: 'ai',
    });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config.format.type).toBe('json_schema');
    expect(params.system).toContain('정중하게 거절');
    expect(params.messages[0].content).toBe('5x5 프로그램으로 운동을 하고 싶어');
  });

  test('off-topic answers carry no links; refusals fall back to a polite message', async () => {
    let fake = fakeClient(json({ answer: '죄송하지만 체단실 관련 질문만 답할 수 있어요.', extension_ids: ['gvt'], off_topic: true }));
    makeApp({ ai: fake.client });
    let { agent } = await newUser();
    let r = await agent.post('/api/ai/extension-search').send({ question: '주식 추천해줘' });
    expect(r.body).toMatchObject({ offTopic: true, extensionIds: [] });

    fake = fakeClient({ stop_reason: 'refusal', content: [] });
    makeApp({ ai: fake.client });
    ({ agent } = await newUser());
    r = await agent.post('/api/ai/extension-search').send({ question: '...' });
    expect(r.body).toMatchObject({ answer: REFUSAL_TEXT, extensionIds: [] });
  });

  test('keyword fallback without a key, input limits and login required', async () => {
    const { agent } = await newUser();
    let r = await agent.post('/api/ai/extension-search').send({ question: 'GVT 프로그램 하고 싶어' });
    expect(r.body).toMatchObject({ extensionIds: ['gvt'], source: 'keyword' });
    r = await agent.post('/api/ai/extension-search').send({ question: '내일 서울 날씨 알려줘' });
    expect(r.body).toMatchObject({ offTopic: true, extensionIds: [] });
    expect((await agent.post('/api/ai/extension-search').send({ question: 'x'.repeat(301) })).status).toBe(400);
    expect((await request(app).post('/api/ai/extension-search').send({ question: '5x5' })).status).toBe(401);
  });

  test('model errors become a 502 with a clear message', async () => {
    const client = { beta: { messages: { create: vi.fn(async () => Promise.reject(new Error('overloaded'))) } } };
    makeApp({ ai: client });
    const { agent } = await newUser();
    const r = await agent.post('/api/ai/extension-search').send({ question: '5x5' });
    expect(r.status).toBe(502);
    expect(r.body.error).toBe('AI 검색에 실패했습니다');
  });

  test('food photo analysis with the model', async () => {
    const { client, create } = fakeClient(json({ items: [{ name: '비빔밥', kcal: 612.4, carbs: 90, protein: 20, fat: 15 }], note: '' }));
    makeApp({ ai: client });
    const { agent } = await newUser();
    expect((await agent.get('/api/ai/status')).body.enabled).toBe(true);
    const r = await agent.post('/api/meals/analyze').set('Content-Type', 'image/png').send(PNG);
    expect(r.body.items).toEqual([{ name: '비빔밥', kcal: 612, carbs: 90, protein: 20, fat: 15 }]);
    const img = create.mock.calls[0][0].messages[0].content[0];
    expect(img).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png' } });
    expect((await agent.post('/api/meals/analyze').set('Content-Type', 'image/png').send(Buffer.from('nope'))).status).toBe(400);
  });
});
