// 직접 추가한 운동, 세척했나요?, 티어
import express from 'express';
import {
  MUSCLES,
  PROGRAM_CATEGORY_IDS,
  removeCustomExercise,
  setCustomExercises,
  upsertCustomExercise,
} from '../../src/shared/exercises.js';
import { getTierLift } from '../../src/shared/tiers.js';
import { CARDIO_METRICS, MAX_CUSTOM_METRICS } from '../../src/shared/cardio.js';
import { addDays, todayStr } from '../../src/shared/date.js';
import { transaction } from '../db.js';
import { isDate, readSettings } from '../data.js';
import { loadTierRecords, processTierLogs, submitTierValue, tierProfile, unseenPromotions } from '../tiers.js';

const CATEGORIES = ['free', 'machine', 'bodyweight', 'cardio'];
const MAX_CUSTOM = 200;

function rowToCustom(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    primaryMuscles: JSON.parse(r.primary_muscles || '[]'),
    increment: r.increment,
    ...(r.category === 'cardio' ? { metrics: JSON.parse(r.metrics || '["time"]').filter(isMetric) } : {}),
  };
}

const isMuscle = (m) => typeof m === 'string' && Object.hasOwn(MUSCLES, m);
const isMetric = (m) => typeof m === 'string' && Object.hasOwn(CARDIO_METRICS, m);

/** A custom exercise that can no longer be in 5x5 / GVT / HST groups leaves them in the user's logs and routines. */
function clearPrograms(db, userId, exerciseId) {
  db.prepare(
    'UPDATE workout_entries SET program = NULL WHERE exercise = ? AND program IS NOT NULL AND workout_id IN (SELECT id FROM workouts WHERE user_id = ?)',
  ).run(exerciseId, userId);
  const setDay = db.prepare('UPDATE routine_days SET exercises = ? WHERE routine_id = ? AND weekday = ?');
  const days = db
    .prepare('SELECT d.routine_id, d.weekday, d.exercises FROM routine_days d JOIN routines r ON r.id = d.routine_id WHERE r.user_id = ?')
    .all(userId);
  for (const d of days) {
    const list = JSON.parse(d.exercises);
    if (!list.some((e) => e.exercise === exerciseId && e.program)) continue;
    const fixed = list.map((e) => (e.exercise === exerciseId ? { ...e, program: null } : e));
    setDay.run(JSON.stringify(fixed), d.routine_id, d.weekday);
  }
}

/** Load every user's custom exercises so names resolve in server-side text (titles etc.). */
export function loadAllCustomExercises(db) {
  setCustomExercises(db.prepare('SELECT * FROM custom_exercises').all().map(rowToCustom));
}

function readCustomBody(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const category = body?.category;
  const primaryMuscles = Array.isArray(body?.primaryMuscles) ? [...new Set(body.primaryMuscles)] : [];
  const increment = body?.increment === undefined || body?.increment === null ? null : body.increment;
  if (!name || name.length > 40) return { error: '운동 이름은 1~40자여야 합니다' };
  if (!CATEGORIES.includes(category)) return { error: '카테고리를 선택하세요' };
  if (primaryMuscles.length > 4 || !primaryMuscles.every(isMuscle)) return { error: '자극 부위가 올바르지 않습니다' };
  if (increment !== null && !(typeof increment === 'number' && increment >= 0 && increment <= 20)) {
    return { error: '증량 단위는 0~20kg 사이여야 합니다' };
  }
  let metrics = null;
  if (category === 'cardio') {
    metrics = Array.isArray(body?.metrics) ? [...new Set(body.metrics)] : [];
    if (!metrics.length || metrics.length > MAX_CUSTOM_METRICS || !metrics.every(isMetric)) {
      return { error: `측정 항목을 1~${MAX_CUSTOM_METRICS}개 고르세요` };
    }
  }
  const defaultStep = { bodyweight: 0, cardio: 0, machine: 5 }[category] ?? 2.5;
  return {
    value: { name, category, primaryMuscles, metrics, increment: category === 'cardio' ? 0 : (increment ?? defaultStep) },
  };
}

export function extraRoutes(ctx) {
  const { db, requireUser } = ctx;
  const r = express.Router();

  // ---- custom exercises (/api/me/exercises) ----
  r.get('/me/exercises', requireUser, (req, res) => {
    const rows = db.prepare('SELECT * FROM custom_exercises WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    res.json({ exercises: rows.map(rowToCustom) });
  });

  r.post('/me/exercises', requireUser, (req, res) => {
    const { value, error } = readCustomBody(req.body);
    if (error) return res.status(400).json({ error });
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM custom_exercises WHERE user_id = ?').get(req.user.id);
    if (n >= MAX_CUSTOM) return res.status(400).json({ error: `직접 추가한 운동은 ${MAX_CUSTOM}개까지 저장할 수 있습니다` });
    const dup = db.prepare('SELECT 1 FROM custom_exercises WHERE user_id = ? AND lower(name) = lower(?)').get(req.user.id, value.name);
    if (dup) return res.status(409).json({ error: '같은 이름의 운동이 이미 있습니다' });
    const id = db
      .prepare('INSERT INTO custom_exercises (user_id, name, category, primary_muscles, increment, metrics) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.user.id, value.name, value.category, JSON.stringify(value.primaryMuscles), value.increment, value.metrics && JSON.stringify(value.metrics))
      .lastInsertRowid;
    const row = rowToCustom(db.prepare('SELECT * FROM custom_exercises WHERE id = ?').get(id));
    upsertCustomExercise(row);
    res.status(201).json({ exercise: row });
  });

  r.put('/me/exercises/:id', requireUser, (req, res) => {
    const cur = db.prepare('SELECT * FROM custom_exercises WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!cur) return res.status(404).json({ error: '운동을 찾을 수 없습니다' });
    const { value, error } = readCustomBody(req.body);
    if (error) return res.status(400).json({ error });
    const dup = db
      .prepare('SELECT 1 FROM custom_exercises WHERE user_id = ? AND lower(name) = lower(?) AND id != ?')
      .get(req.user.id, value.name, cur.id);
    if (dup) return res.status(409).json({ error: '같은 이름의 운동이 이미 있습니다' });
    // A saved exercise cannot switch between 유산소 and weights: its past logs are stored differently.
    if ((cur.category === 'cardio') !== (value.category === 'cardio')) {
      return res.status(400).json({ error: '유산소와 웨이트 사이에서는 카테고리를 바꿀 수 없습니다' });
    }
    transaction(db, () => {
      db.prepare('UPDATE custom_exercises SET name = ?, category = ?, primary_muscles = ?, increment = ?, metrics = ? WHERE id = ?').run(
        value.name,
        value.category,
        JSON.stringify(value.primaryMuscles),
        value.increment,
        value.metrics && JSON.stringify(value.metrics),
        cur.id,
      );
      if (!PROGRAM_CATEGORY_IDS.includes(value.category)) clearPrograms(db, req.user.id, `c${cur.id}`);
    });
    const row = rowToCustom(db.prepare('SELECT * FROM custom_exercises WHERE id = ?').get(cur.id));
    upsertCustomExercise(row);
    res.json({ exercise: row });
  });

  r.delete('/me/exercises/:id', requireUser, (req, res) => {
    const { changes } = db.prepare('DELETE FROM custom_exercises WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    if (!changes) return res.status(404).json({ error: '운동을 찾을 수 없습니다' });
    removeCustomExercise(`c${Number(req.params.id)}`);
    res.json({ ok: true });
  });

  // ---- 세척했나요? (shaker washes) ----
  const shakerState = (userId, today) => {
    const last = db.prepare('SELECT MAX(date) AS d FROM shaker_washes WHERE user_id = ?').get(userId).d || null;
    const washedToday = today ? Boolean(db.prepare('SELECT 1 FROM shaker_washes WHERE user_id = ? AND date = ?').get(userId, today)) : false;
    return { last, washedToday };
  };

  r.get('/shaker', requireUser, (req, res) => {
    const today = req.query.today;
    if (today && !isDate(today)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    res.json(shakerState(req.user.id, today));
  });

  r.put('/shaker/:date', requireUser, (req, res) => {
    if (!isDate(req.params.date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    db.prepare('INSERT OR IGNORE INTO shaker_washes (user_id, date) VALUES (?, ?)').run(req.user.id, req.params.date);
    res.json(shakerState(req.user.id, req.params.date));
  });

  r.delete('/shaker/:date', requireUser, (req, res) => {
    if (!isDate(req.params.date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    db.prepare('DELETE FROM shaker_washes WHERE user_id = ? AND date = ?').run(req.user.id, req.params.date);
    res.json(shakerState(req.user.id, req.params.date));
  });

  // ---- 티어 ----
  const tierState = (userId) => ({
    profile: tierProfile(db, userId),
    records: loadTierRecords(db, userId),
    promotions: unseenPromotions(db, userId),
  });

  // Kept as GET for the client. A client `today` is never trusted beyond the server's tomorrow (time zones),
  // so processed_through (= today - 1) can't jump ahead and stop the automatic updates.
  r.get('/tiers', requireUser, (req, res) => {
    let today = req.query.today;
    if (today && !isDate(today)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    if (today && readSettings(db, req.user.id).extensions.tier) {
      const serverToday = todayStr();
      if (today > addDays(serverToday, 1)) today = addDays(serverToday, 1);
      // Repair a processed_through already pushed into the future.
      db.prepare('UPDATE tier_state SET processed_through = ? WHERE user_id = ? AND processed_through > ?').run(
        addDays(serverToday, -1),
        req.user.id,
        serverToday,
      );
      processTierLogs(db, req.user.id, today);
    }
    res.json(tierState(req.user.id));
  });

  r.put('/tiers/profile', requireUser, (req, res) => {
    const sex = req.body?.sex;
    const bodyweight = req.body?.bodyweight;
    if (!['male', 'female'].includes(sex)) return res.status(400).json({ error: '성별을 선택하세요' });
    if (!(typeof bodyweight === 'number' && bodyweight >= 30 && bodyweight <= 250)) return res.status(400).json({ error: '체중은 30~250kg 사이로 입력하세요' });
    db.prepare('UPDATE user_settings SET tier_profile = ? WHERE user_id = ?').run(
      JSON.stringify({ sex, bodyweight: Math.round(bodyweight * 10) / 10 }),
      req.user.id,
    );
    res.json(tierState(req.user.id));
  });

  r.post('/tiers/promotions/seen', requireUser, (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
    const mark = db.prepare('UPDATE tier_promotions SET seen = 1 WHERE id = ? AND user_id = ?');
    for (const id of ids) mark.run(id, req.user.id);
    res.json({ ok: true });
  });

  r.post('/tiers/:lift', requireUser, (req, res) => {
    const lift = getTierLift(req.params.lift);
    if (!lift) return res.status(404).json({ error: '티어가 없는 종목입니다' });
    if (lift.parts) return res.status(400).json({ error: '3대 합계는 스쿼트·벤치·데드 기록으로 계산됩니다' });
    const { date } = req.body || {};
    const value = req.body?.value;
    if (!isDate(date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    const [min, max] = lift.unit === 'reps' ? [1, 300] : lift.unit === 'kg_added' ? [-100, 300] : [1, 500];
    if (!(typeof value === 'number' && value >= min && value <= max)) return res.status(400).json({ error: `${min}~${max} 사이로 입력하세요` });
    if (lift.unit === 'reps' && !Number.isInteger(value)) return res.status(400).json({ error: '횟수는 정수로 입력하세요' });
    const profile = tierProfile(db, req.user.id);
    if (!profile.complete) return res.status(400).json({ error: '먼저 성별과 체중을 입력하세요' });
    const result = submitTierValue(db, req.user.id, lift.id, Math.round(value * 10) / 10, { source: 'manual', date });
    // promotions = every unseen one (the queue the client shows); newPromotions = from this update only
    res.json({ record: result.record, improved: result.improved, newPromotions: result.promotions, ...tierState(req.user.id) });
  });

  return r;
}
