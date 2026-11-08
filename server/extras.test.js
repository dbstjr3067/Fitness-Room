// @vitest-environment node
// Custom exercises, 세척했나요? and 티어 endpoints.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { getExercise, setCustomExercises } from '../src/shared/exercises.js';
import { thresholdsFor } from '../src/shared/tiers.js';

let db;
let app;
const uploadDir = mkdtempSync(join(tmpdir(), 'fr-extras-'));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db = openDb(':memory:');
  app = createApp({ db, env: {}, ai: null, uploadDir });
});
afterEach(() => setCustomExercises([]));

let n = 0;
async function newUser() {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ username: `extra_${++n}`, password: 'password123', displayName: `리프터${n}` });
  return { agent, user: r.body.user };
}

const entry = (exercise, weight, extra = {}) => ({ exercise, weight, unit: 'kg', sets: 3, reps: 5, rating: 3, program: null, ...extra });
const male80 = { sex: 'male', bodyweight: 80 };

describe('custom exercises', () => {
  test('create, list, update, delete and use in a workout log', async () => {
    const { agent } = await newUser();
    const r = await agent.post('/api/me/exercises').send({ name: '스미스 머신 런지', category: 'machine', primaryMuscles: ['quads', 'glutes'] });
    expect(r.status).toBe(201);
    expect(r.body.exercise).toMatchObject({ name: '스미스 머신 런지', category: 'machine', primaryMuscles: ['quads', 'glutes'], increment: 5 });
    const id = r.body.exercise.id;
    expect(getExercise(`c${id}`).name).toBe('스미스 머신 런지');

    const log = await agent.put('/api/workouts/2026-11-01').send({ entries: [entry(`c${id}`, 40)] });
    expect(log.status).toBe(200);
    const status = await agent.get('/api/status');
    expect(status.body.workouts[0].entries[0].exercise).toBe(`c${id}`);

    const up = await agent.put(`/api/me/exercises/${id}`).send({ name: '스미스 런지', category: 'machine', primaryMuscles: ['quads'], increment: 2.5 });
    expect(up.body.exercise).toMatchObject({ name: '스미스 런지', increment: 2.5 });
    expect((await agent.get('/api/me/exercises')).body.exercises.map((e) => e.name)).toEqual(['스미스 런지']);

    expect((await agent.delete(`/api/me/exercises/${id}`)).status).toBe(200);
    expect((await agent.get('/api/me/exercises')).body.exercises).toEqual([]);
    expect(getExercise(`c${id}`).name).toBe('삭제된 운동');
  });

  test('validation, duplicates and default increments', async () => {
    const { agent } = await newUser();
    const post = (body) => agent.post('/api/me/exercises').send(body);
    expect((await post({ name: '', category: 'free' })).status).toBe(400);
    expect((await post({ name: 'x'.repeat(41), category: 'free' })).status).toBe(400);
    expect((await post({ name: '운동', category: 'cardio' })).status).toBe(400);
    expect((await post({ name: '운동', category: 'free', primaryMuscles: ['wings'] })).status).toBe(400);
    expect((await post({ name: '운동', category: 'free', primaryMuscles: ['chest', 'triceps', 'quads', 'glutes', 'abs'] })).status).toBe(400);
    expect((await post({ name: '운동', category: 'free', increment: 50 })).status).toBe(400);
    expect((await post({ name: '머슬업 변형', category: 'bodyweight' })).body.exercise.increment).toBe(0);
    expect((await post({ name: '머슬업 변형', category: 'bodyweight' })).status).toBe(409);
  });

  test("users cannot see or change each other's exercises", async () => {
    const a = await newUser();
    const b = await newUser();
    const { id } = (await a.agent.post('/api/me/exercises').send({ name: '나만의 운동', category: 'free' })).body.exercise;
    expect((await b.agent.get('/api/me/exercises')).body.exercises).toEqual([]);
    expect((await b.agent.put(`/api/me/exercises/${id}`).send({ name: '탈취', category: 'free' })).status).toBe(404);
    expect((await b.agent.delete(`/api/me/exercises/${id}`)).status).toBe(404);
    // the same name is fine for another user
    expect((await b.agent.post('/api/me/exercises').send({ name: '나만의 운동', category: 'free' })).status).toBe(201);
  });

  test('custom exercises are reloaded when the server starts', async () => {
    const { agent } = await newUser();
    const { id } = (await agent.post('/api/me/exercises').send({ name: '재시작 운동', category: 'free' })).body.exercise;
    setCustomExercises([]);
    createApp({ db, env: {}, ai: null, uploadDir });
    expect(getExercise(`c${id}`).name).toBe('재시작 운동');
  });
});

describe('세척했나요?', () => {
  test('mark washed, cancel and report the last wash', async () => {
    const { agent } = await newUser();
    expect((await agent.get('/api/shaker?today=2026-11-07')).body).toEqual({ last: null, washedToday: false });
    await agent.put('/api/shaker/2026-11-03');
    let r = await agent.put('/api/shaker/2026-11-07');
    expect(r.body).toEqual({ last: '2026-11-07', washedToday: true });
    r = await agent.delete('/api/shaker/2026-11-07');
    expect(r.body).toEqual({ last: '2026-11-03', washedToday: false });
    expect((await agent.put('/api/shaker/yesterday')).status).toBe(400);
    expect((await request(app).get('/api/shaker')).status).toBe(401);
  });
});

describe('티어', () => {
  async function tierUser({ enable = true } = {}) {
    const u = await newUser();
    if (enable) await u.agent.put('/api/me/extensions/tier').send({ enabled: true });
    return u;
  }

  test('profile is required and validated', async () => {
    const { agent } = await tierUser();
    let r = await agent.get('/api/tiers?today=2026-11-07');
    expect(r.body).toEqual({ profile: { sex: null, bodyweight: null, complete: false }, records: [], promotions: [] });
    expect((await agent.post('/api/tiers/bench_press').send({ value: 100, date: '2026-11-07' })).status).toBe(400);
    expect((await agent.put('/api/tiers/profile').send({ sex: 'other', bodyweight: 80 })).status).toBe(400);
    expect((await agent.put('/api/tiers/profile').send({ sex: 'male', bodyweight: 10 })).status).toBe(400);
    r = await agent.put('/api/tiers/profile').send({ sex: 'male', bodyweight: 80 });
    expect(r.body.profile).toEqual({ sex: 'male', bodyweight: 80, complete: true });
  });

  test('manual updates keep the best value and promote on a higher rank', async () => {
    const { agent } = await tierUser();
    await agent.put('/api/tiers/profile').send(male80);
    const t = thresholdsFor('bench_press', male80);

    let r = await agent.post('/api/tiers/bench_press').send({ value: t[1], date: '2026-11-07' });
    expect(r.body.improved).toBe(true);
    expect(r.body.newPromotions).toHaveLength(1);
    expect(r.body.newPromotions[0]).toMatchObject({ lift: 'bench_press', fromRank: null });
    const firstRank = r.body.record.rank;

    r = await agent.post('/api/tiers/bench_press').send({ value: t[1] - 5, date: '2026-11-07' });
    expect(r.body.improved).toBe(false);
    expect(r.body.record.value).toBe(Math.round(t[1] * 10) / 10);

    r = await agent.post('/api/tiers/bench_press').send({ value: t[3], date: '2026-11-07' });
    expect(r.body.newPromotions).toHaveLength(1);
    expect(r.body.newPromotions[0]).toMatchObject({ fromRank: firstRank });
    expect(r.body.record.rank).toBeGreaterThan(firstRank);

    // both promotions wait in the queue until they are marked as seen
    expect(r.body.promotions).toHaveLength(2);
    await agent.post('/api/tiers/promotions/seen').send({ ids: r.body.promotions.map((p) => p.id) });
    expect((await agent.get('/api/tiers')).body.promotions).toEqual([]);

    const ach = db.prepare("SELECT key FROM achievements WHERE kind = 'tier'").all().map((a) => a.key);
    expect(ach.length).toBe(2);
    expect(ach.every((k) => k.startsWith('tier:bench_press:'))).toBe(true);
  });

  test('3대 합계 follows the three lifts and cannot be set by hand', async () => {
    const { agent } = await tierUser();
    await agent.put('/api/tiers/profile').send(male80);
    expect((await agent.post('/api/tiers/total').send({ value: 400, date: '2026-11-07' })).status).toBe(400);
    expect((await agent.post('/api/tiers/curl').send({ value: 40, date: '2026-11-07' })).status).toBe(404);
    await agent.post('/api/tiers/squat').send({ value: 140, date: '2026-11-07' });
    await agent.post('/api/tiers/bench_press').send({ value: 100, date: '2026-11-07' });
    const r = await agent.post('/api/tiers/deadlift').send({ value: 180, date: '2026-11-07' });
    expect(r.body.newPromotions.map((p) => p.lift)).toEqual(['deadlift', 'total']);
    expect(r.body.records.find((x) => x.lift === 'total').value).toBe(420);
  });

  test('value ranges per unit', async () => {
    const { agent } = await tierUser();
    await agent.put('/api/tiers/profile').send(male80);
    const post = (lift, value) => agent.post(`/api/tiers/${lift}`).send({ value, date: '2026-11-07' });
    expect((await post('pull_up_reps', 12.5)).status).toBe(400);
    expect((await post('pull_up_reps', 0)).status).toBe(400);
    expect((await post('pull_up_reps', 12)).status).toBe(200);
    expect((await post('weighted_pull_up', -10)).status).toBe(200);
    expect((await post('squat', 900)).status).toBe(400);
    expect((await agent.post('/api/tiers/squat').send({ value: 100, date: 'today' })).status).toBe(400);
  });

  test('logs update tiers after the day ends; the first pass is a quiet placement', async () => {
    const { agent } = await tierUser();
    await agent.put('/api/tiers/profile').send(male80);
    await agent.put('/api/workouts/2026-11-01').send({ entries: [entry('squat', 100), entry('bench_press', 80, { rating: 1 })] });

    let r = await agent.get('/api/tiers?today=2026-11-05');
    expect(r.body.records.map((x) => x.lift)).toEqual(['squat']); // rating 1 sets don't count
    expect(r.body.records[0]).toMatchObject({ source: 'log', achievedOn: '2026-11-01', value: 116.7 });
    expect(r.body.promotions).toEqual([]);

    // today's log waits until tomorrow
    await agent.put('/api/workouts/2026-11-06').send({ entries: [entry('squat', 160)] });
    r = await agent.get('/api/tiers?today=2026-11-06');
    expect(r.body.records[0].value).toBe(116.7);
    r = await agent.get('/api/tiers?today=2026-11-07');
    expect(r.body.records[0].value).toBe(186.7);
    expect(r.body.promotions).toHaveLength(1);
    expect(r.body.promotions[0]).toMatchObject({ lift: 'squat', value: 186.7 });

    // processed days are not counted twice
    r = await agent.get('/api/tiers?today=2026-11-07');
    expect(r.body.promotions).toHaveLength(1);
  });

  test('no automatic updates while the extension is off', async () => {
    const { agent } = await tierUser({ enable: false });
    await agent.put('/api/tiers/profile').send(male80);
    await agent.put('/api/workouts/2026-11-01').send({ entries: [entry('squat', 100)] });
    expect((await agent.get('/api/tiers?today=2026-11-05')).body.records).toEqual([]);
  });

  test('the profile falls back to CalTrack sex and WeightTrack bodyweight', async () => {
    const { agent, user } = await tierUser();
    db.prepare('UPDATE user_settings SET cal_profile = ? WHERE user_id = ?').run(JSON.stringify({ sex: 'female' }), user.id);
    db.prepare("INSERT INTO body_weights (user_id, date, kg) VALUES (?, '2026-11-01', 58.5)").run(user.id);
    expect((await agent.get('/api/tiers')).body.profile).toEqual({ sex: 'female', bodyweight: 58.5, complete: true });
  });

  test('deleting the account removes tier, shaker and custom exercise data', async () => {
    const { agent, user } = await tierUser();
    await agent.put('/api/tiers/profile').send(male80);
    await agent.post('/api/tiers/squat').send({ value: 120, date: '2026-11-07' });
    await agent.get('/api/tiers?today=2026-11-07');
    await agent.put('/api/shaker/2026-11-07');
    await agent.post('/api/me/exercises').send({ name: '삭제될 운동', category: 'free' });
    expect((await agent.delete('/api/me').send({ password: 'password123' })).status).toBe(200);
    for (const table of ['tier_records', 'tier_promotions', 'tier_state', 'shaker_washes', 'custom_exercises']) {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`).get(user.id).n, table).toBe(0);
    }
  });
});
