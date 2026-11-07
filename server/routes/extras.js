// 직접 추가한 운동, 세척했나요?, 티어
import express from 'express';
import { MUSCLES, removeCustomExercise, setCustomExercises, upsertCustomExercise } from '../../src/shared/exercises.js';
import { getTierLift } from '../../src/shared/tiers.js';
import { isDate, readSettings } from '../data.js';
import { loadTierRecords, processTierLogs, submitTierValue, tierProfile, unseenPromotions } from '../tiers.js';

const CATEGORIES = ['free', 'machine', 'bodyweight'];
const MAX_CUSTOM = 200;

function rowToCustom(r) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    primaryMuscles: JSON.parse(r.primary_muscles || '[]'),
    increment: r.increment,
  };
}

/** Load every user's custom exercises so names resolve in server-side text (titles etc.). */
export function loadAllCustomExercises(db) {
  setCustomExercises(db.prepare('SELECT * FROM custom_exercises').all().map(rowToCustom));
}

function readCustomBody(body) {
  const name = String(body?.name || '').trim();
  const category = body?.category;
  const primaryMuscles = Array.isArray(body?.primaryMuscles) ? [...new Set(body.primaryMuscles)] : [];
  const increment = body?.increment === undefined ? null : Number(body.increment);
  if (!name || name.length > 40) return { error: '운동 이름은 1~40자여야 합니다' };
  if (!CATEGORIES.includes(category)) return { error: '카테고리를 선택하세요' };
  if (primaryMuscles.length > 4 || primaryMuscles.some((m) => !MUSCLES[m])) return { error: '자극 부위가 올바르지 않습니다' };
  if (increment !== null && !(increment >= 0 && increment <= 20)) return { error: '증량 단위는 0~20kg 사이여야 합니다' };
  return {
    value: { name, category, primaryMuscles, increment: increment ?? (category === 'bodyweight' ? 0 : category === 'machine' ? 5 : 2.5) },
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
      .prepare('INSERT INTO custom_exercises (user_id, name, category, primary_muscles, increment) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, value.name, value.category, JSON.stringify(value.primaryMuscles), value.increment).lastInsertRowid;
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
    db.prepare('UPDATE custom_exercises SET name = ?, category = ?, primary_muscles = ?, increment = ? WHERE id = ?').run(
      value.name,
      value.category,
      JSON.stringify(value.primaryMuscles),
      value.increment,
      cur.id,
    );
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

  r.get('/tiers', requireUser, (req, res) => {
    const today = req.query.today;
    if (today && !isDate(today)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    if (today && readSettings(db, req.user.id).extensions.tier) processTierLogs(db, req.user.id, today);
    res.json(tierState(req.user.id));
  });

  r.put('/tiers/profile', requireUser, (req, res) => {
    const sex = req.body?.sex;
    const bodyweight = Number(req.body?.bodyweight);
    if (!['male', 'female'].includes(sex)) return res.status(400).json({ error: '성별을 선택하세요' });
    if (!(bodyweight >= 30 && bodyweight <= 250)) return res.status(400).json({ error: '체중은 30~250kg 사이로 입력하세요' });
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
    const value = Number(req.body?.value);
    if (!isDate(date)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다' });
    const [min, max] = lift.unit === 'reps' ? [1, 300] : lift.unit === 'kg_added' ? [-100, 300] : [1, 500];
    if (!(value >= min && value <= max)) return res.status(400).json({ error: `${min}~${max} 사이로 입력하세요` });
    if (lift.unit === 'reps' && !Number.isInteger(value)) return res.status(400).json({ error: '횟수는 정수로 입력하세요' });
    const profile = tierProfile(db, req.user.id);
    if (!profile.complete) return res.status(400).json({ error: '먼저 성별과 체중을 입력하세요' });
    const result = submitTierValue(db, req.user.id, lift.id, Math.round(value * 10) / 10, { source: 'manual', date });
    // promotions = every unseen one (the queue the client shows); newPromotions = from this update only
    res.json({ record: result.record, improved: result.improved, newPromotions: result.promotions, ...tierState(req.user.id) });
  });

  return r;
}
