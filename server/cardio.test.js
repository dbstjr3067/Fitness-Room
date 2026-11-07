// @vitest-environment node
// 유산소 logs, program rules and the version 4 migration.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { openDb } from './db.js';
import { setCustomExercises } from '../src/shared/exercises.js';

let db;
let app;
const uploadDir = mkdtempSync(join(tmpdir(), 'fr-cardio-'));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db = openDb(':memory:');
  app = createApp({ db, env: {}, ai: null, uploadDir });
});
afterEach(() => setCustomExercises([]));

let n = 0;
async function newUser() {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/register').send({ username: `cardio_${++n}`, password: 'password123', displayName: `러너${n}` });
  return { agent, user: r.body.user };
}

const lift = (exercise, weight, extra = {}) => ({ exercise, weight, unit: 'kg', sets: 5, reps: 5, rating: 3, program: null, ...extra });
const run = (exercise, metrics, extra = {}) => ({ exercise, weight: 0, unit: 'kg', sets: 0, reps: 0, rating: 3, program: null, metrics, ...extra });

describe('유산소 in the workout log', () => {
  test('saves measured values next to weight entries', async () => {
    const { agent } = await newUser();
    const r = await agent.put('/api/workouts/2026-11-07').send({
      entries: [lift('squat', 100), run('treadmill_run', { speed: 9.5, incline: 1, time: 25 }), run('rowing_machine', { distance_m: 2000 })],
    });
    expect(r.status).toBe(200);
    const [, treadmill, row] = r.body.workout.entries;
    expect(treadmill).toMatchObject({ exercise: 'treadmill_run', weight: 0, sets: 0, reps: 0, metrics: { speed: 9.5, incline: 1, time: 25 } });
    expect(row.metrics).toEqual({ distance_m: 2000 });
    expect(r.body.workout.entries[0]).not.toHaveProperty('metrics');
  });

  test('stray weight values on cardio are stored as 0', async () => {
    const { agent } = await newUser();
    const r = await agent.put('/api/workouts/2026-11-07').send({ entries: [run('jump_rope', { count: 500 }, { weight: 20, sets: 3, reps: 10 })] });
    expect(r.body.workout.entries[0]).toMatchObject({ weight: 0, sets: 0, reps: 0, metrics: { count: 500 } });
  });

  test('rejects values the exercise does not measure, out-of-range values and metrics on weights', async () => {
    const { agent } = await newUser();
    const put = (entries) => agent.put('/api/workouts/2026-11-07').send({ entries });
    expect((await put([run('outdoor_run', { incline: 3 })])).status).toBe(400);
    expect((await put([run('treadmill_run', { incline: 60 })])).status).toBe(400);
    expect((await put([run('jump_rope', { count: 10.5 })])).status).toBe(400);
    expect((await put([run('treadmill_run', [1, 2])])).status).toBe(400);
    expect((await put([lift('squat', 100, { metrics: { time: 10 } })])).status).toBe(400);
    expect((await put([run('treadmill_run', null)])).status).toBe(200);
  });

  test('5x5 / GVT / HST groups only take free weights and machines', async () => {
    const { agent } = await newUser();
    const put = (entries) => agent.put('/api/workouts/2026-11-07').send({ entries });
    const err = await put([run('treadmill_run', { time: 10 }, { program: 'stronglifts5x5' })]);
    expect(err.status).toBe(400);
    expect(err.body.error).toMatch(/유산소와 맨몸운동/);
    expect((await put([lift('pull_up', 0, { program: 'hst' })])).status).toBe(400);
    expect((await put([lift('leg_press', 140, { program: 'hst' })])).status).toBe(200);

    const routine = await agent.post('/api/routines').send({ name: '테스트', days: { 1: { exercises: [{ exercise: 'dips', program: 'gvt' }] } } });
    expect(routine.status).toBe(400);
    const ok = await agent.post('/api/routines').send({ name: '테스트', days: { 1: { exercises: [{ exercise: 'outdoor_run', program: null }] } } });
    expect(ok.status).toBe(201);
  });

  test('custom cardio: chosen measurements, validation, no switching to weights', async () => {
    const { agent } = await newUser();
    const post = (body) => agent.post('/api/me/exercises').send(body);
    expect((await post({ name: '사이드 스텝', category: 'cardio' })).status).toBe(400);
    expect((await post({ name: '사이드 스텝', category: 'cardio', metrics: ['time', 'speed', 'count', 'kcal'] })).status).toBe(400);
    expect((await post({ name: '사이드 스텝', category: 'cardio', metrics: ['weight'] })).status).toBe(400);
    const r = await post({ name: '사이드 스텝', category: 'cardio', metrics: ['distance_km', 'time'], increment: 5 });
    expect(r.status).toBe(201);
    expect(r.body.exercise).toMatchObject({ category: 'cardio', metrics: ['distance_km', 'time'], increment: 0 });
    const id = r.body.exercise.id;

    const log = await agent.put('/api/workouts/2026-11-07').send({ entries: [run(`c${id}`, { distance_km: 3.2, time: 25 })] });
    expect(log.body.workout.entries[0].metrics).toEqual({ distance_km: 3.2, time: 25 });
    expect((await agent.put('/api/workouts/2026-11-07').send({ entries: [run(`c${id}`, { speed: 5 })] })).status).toBe(400);

    expect((await agent.put(`/api/me/exercises/${id}`).send({ name: '사이드 스텝', category: 'free' })).status).toBe(400);
    const edited = await agent.put(`/api/me/exercises/${id}`).send({ name: '사이드 스텝', category: 'cardio', metrics: ['time'] });
    expect(edited.body.exercise.metrics).toEqual(['time']);
  });
});

describe('demo account', () => {
  test('has cardio in its recent history', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/demo').send({ today: '2026-11-07' });
    const { workouts } = (await agent.get('/api/status')).body;
    const cardio = workouts.flatMap((w) => w.entries).filter((e) => e.metrics);
    expect(cardio.length).toBeGreaterThan(10);
    expect(workouts.flatMap((w) => w.entries).every((e) => !e.program || !e.metrics)).toBe(true);
  });
});

describe('migration to version 4', () => {
  test('moves bodyweight exercises out of program groups and adds the metrics columns', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'fr-v3-')), 'app.db');
    const v3 = openDb(file);
    v3.exec(`
      INSERT INTO users (display_name) VALUES ('옛사용자');
      INSERT INTO custom_exercises (user_id, name, category) VALUES (1, '링 딥스', 'bodyweight'), (1, '케이블 로우', 'machine');
      INSERT INTO workouts (user_id, date) VALUES (1, '2026-10-01');
      INSERT INTO workout_entries (workout_id, exercise, weight, sets, reps, program) VALUES
        (1, 'squat', 100, 5, 5, 'stronglifts5x5'), (1, 'dips', 0, 5, 5, 'stronglifts5x5'),
        (1, 'c1', 0, 3, 8, 'hst'), (1, 'c2', 40, 3, 8, 'hst');
      INSERT INTO routines (user_id, name, is_active) VALUES (1, 'A', 1);
      INSERT INTO routine_days (routine_id, weekday, split_name, exercises) VALUES
        (1, 1, 'Push', '[{"exercise":"bench_press","program":"stronglifts5x5"},{"exercise":"pull_up","program":"stronglifts5x5"}]');
      ALTER TABLE workout_entries DROP COLUMN metrics;
      ALTER TABLE custom_exercises DROP COLUMN metrics;
      PRAGMA user_version = 3;
    `);
    v3.close();

    const db4 = openDb(file);
    expect(db4.prepare('PRAGMA user_version').get().user_version).toBe(5);
    const programs = Object.fromEntries(db4.prepare('SELECT exercise, program FROM workout_entries').all().map((r) => [r.exercise, r.program]));
    expect(programs).toEqual({ squat: 'stronglifts5x5', dips: null, c1: null, c2: 'hst' });
    expect(JSON.parse(db4.prepare('SELECT exercises FROM routine_days').get().exercises)).toEqual([
      { exercise: 'bench_press', program: 'stronglifts5x5' },
      { exercise: 'pull_up', program: null },
    ]);
    expect(db4.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('workout_entries') WHERE name = 'metrics'").get().n).toBe(1);
  });
});
