// 운동일지, 루틴, 몸무게, 현황 data.
import express from 'express';
import { transaction } from '../db.js';
import { PROGRAM_IDS } from '../../src/shared/extensions.js';
import { canUseInProgram, cardioMetricsOf, isCardio } from '../../src/shared/exercises.js';
import { metricError } from '../../src/shared/cardio.js';
import {
  activeRoutine,
  checkWeightAchievement,
  checkWorkoutAchievements,
  isDate,
  loadBodyWeights,
  loadRoutines,
  loadWorkouts,
  saveRoutineDays,
} from '../data.js';

const EXERCISE_RE = /^[a-z0-9_]{1,60}$/;

const bad = (res, msg) => res.status(400).json({ error: msg });

function validProgram(p) {
  return p === null || p === undefined || PROGRAM_IDS.includes(p);
}

export function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length > 30) return '종목은 30개까지 기록할 수 있습니다';
  for (const e of entries) {
    if (!e || !EXERCISE_RE.test(String(e.exercise))) return '종목이 올바르지 않습니다';
    if (e.program && !canUseInProgram(e.exercise)) return '유산소와 맨몸운동은 프로그램 묶음에 넣을 수 없습니다';
    if (isCardio(e.exercise)) {
      const err = validateMetrics(e.exercise, e.metrics);
      if (err) return err;
      if (!(e.rating === null || e.rating === undefined || [1, 2, 3, 4].includes(e.rating))) return '수행만족도는 1~4입니다';
      continue;
    }
    if (e.metrics !== undefined && e.metrics !== null) return '측정 항목은 유산소 종목에만 기록할 수 있습니다';
    if (typeof e.weight !== 'number' || !(e.weight >= 0 && e.weight <= 1000)) return '무게는 0~1000 사이여야 합니다';
    if (!['kg', 'lbs'].includes(e.unit)) return '단위가 올바르지 않습니다';
    if (!Number.isInteger(e.sets) || e.sets < 0 || e.sets > 50) return '세트는 0~50 사이여야 합니다';
    if (!Number.isInteger(e.reps) || e.reps < 0 || e.reps > 200) return '반복 횟수는 0~200 사이여야 합니다';
    if (!(e.rating === null || e.rating === undefined || [1, 2, 3, 4].includes(e.rating))) return '수행만족도는 1~4입니다';
    if (!validProgram(e.program)) return '프로그램이 올바르지 않습니다';
  }
  return null;
}

function validateMetrics(exercise, metrics) {
  if (metrics === undefined || metrics === null) return null;
  if (typeof metrics !== 'object' || Array.isArray(metrics)) return '측정 항목 형식이 올바르지 않습니다';
  const allowed = cardioMetricsOf(exercise);
  for (const [k, v] of Object.entries(metrics)) {
    if (!allowed.includes(k)) return '이 종목에서 기록하지 않는 측정 항목입니다';
    const err = metricError(k, v);
    if (err) return err;
  }
  return null;
}

/** Row values to store: cardio keeps only its measured values, weights keep weight/sets/reps. */
export function entryRow(e) {
  if (isCardio(e.exercise)) {
    const allowed = cardioMetricsOf(e.exercise);
    const metrics = Object.fromEntries(allowed.filter((k) => typeof e.metrics?.[k] === 'number').map((k) => [k, e.metrics[k]]));
    return { weight: 0, unit: 'kg', sets: 0, reps: 0, metrics: JSON.stringify(metrics), program: null };
  }
  return { weight: e.weight, unit: e.unit, sets: e.sets, reps: e.reps, metrics: null, program: e.program || null };
}

export function validateRoutineDays(days) {
  if (!days || typeof days !== 'object' || Array.isArray(days)) return '루틴 형식이 올바르지 않습니다';
  for (const [wd, day] of Object.entries(days)) {
    if (!/^[0-6]$/.test(wd)) return '요일이 올바르지 않습니다';
    if (!day || typeof day !== 'object') return '루틴 형식이 올바르지 않습니다';
    if (day.splitName !== undefined && (typeof day.splitName !== 'string' || day.splitName.length > 40)) {
      return '분할명은 40자 이하여야 합니다';
    }
    if (!Array.isArray(day.exercises) || day.exercises.length > 20) return '하루 종목은 20개까지입니다';
    for (const e of day.exercises) {
      if (!e || !EXERCISE_RE.test(String(e.exercise)) || !validProgram(e.program)) return '루틴 종목이 올바르지 않습니다';
      if (e.program && !canUseInProgram(e.exercise)) return '유산소와 맨몸운동은 프로그램 묶음에 넣을 수 없습니다';
    }
  }
  return null;
}

function cleanDays(days) {
  const out = {};
  for (const [wd, day] of Object.entries(days)) {
    out[wd] = {
      splitName: (day.splitName || '').trim(),
      exercises: day.exercises.map((e) => ({ exercise: e.exercise, program: e.program || null })),
    };
  }
  return out;
}

export function workoutRoutes(ctx) {
  const { db } = ctx;
  const r = express.Router();
  r.use(['/status', '/workouts', '/bodyweights', '/routines'], ctx.requireUser);

  // ---- status (현황) ----
  r.get('/status', (req, res) => {
    const routine = activeRoutine(db, req.user.id);
    res.json({
      workouts: loadWorkouts(db, req.user.id),
      routine: routine ? routine.days : {},
      routineName: routine?.name || null,
      bodyWeights: loadBodyWeights(db, req.user.id),
    });
  });

  // ---- workouts ----
  r.get('/workouts', (req, res) => {
    const { from, to } = req.query;
    if ((from && !isDate(from)) || (to && !isDate(to))) return bad(res, '날짜 형식이 올바르지 않습니다');
    res.json({ workouts: loadWorkouts(db, req.user.id, { from, to }).reverse() });
  });

  r.get('/workouts/:date', (req, res) => {
    if (!isDate(req.params.date)) return bad(res, '날짜 형식이 올바르지 않습니다');
    const [w] = loadWorkouts(db, req.user.id, { from: req.params.date, to: req.params.date });
    res.json({ workout: w || null });
  });

  r.put('/workouts/:date', (req, res) => {
    const { date } = req.params;
    if (!isDate(date)) return bad(res, '날짜 형식이 올바르지 않습니다');
    const b = req.body || {};
    const splitName = String(b.splitName || '').trim();
    const memo = String(b.memo || '');
    const entries = b.entries || [];
    if (splitName.length > 40) return bad(res, '운동명은 40자 이하여야 합니다');
    if (memo.length > 2000) return bad(res, '메모는 2000자 이하여야 합니다');
    const err = validateEntries(entries);
    if (err) return bad(res, err);

    const uid = req.user.id;
    transaction(db, () => {
      const existing = db.prepare('SELECT id FROM workouts WHERE user_id = ? AND date = ?').get(uid, date);
      if (!entries.length && !memo.trim() && !splitName) {
        if (existing) db.prepare('DELETE FROM workouts WHERE id = ?').run(existing.id);
        return;
      }
      let id = existing?.id;
      if (id) {
        db.prepare('UPDATE workouts SET split_name = ?, memo = ? WHERE id = ?').run(splitName, memo, id);
        db.prepare('DELETE FROM workout_entries WHERE workout_id = ?').run(id);
      } else {
        id = db.prepare('INSERT INTO workouts (user_id, date, split_name, memo) VALUES (?, ?, ?, ?)').run(uid, date, splitName, memo)
          .lastInsertRowid;
      }
      const ins = db.prepare(
        'INSERT INTO workout_entries (workout_id, exercise, weight, unit, sets, reps, rating, program, position, metrics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      );
      entries.forEach((e, i) => {
        const row = entryRow(e);
        ins.run(id, e.exercise, row.weight, row.unit, row.sets, row.reps, e.rating ?? null, row.program, i, row.metrics);
      });
    });
    const achievements = entries.length ? checkWorkoutAchievements(db, uid, date) : [];
    const [w] = loadWorkouts(db, uid, { from: date, to: date });
    res.json({ workout: w || null, achievements });
  });

  r.delete('/workouts/:date', (req, res) => {
    if (!isDate(req.params.date)) return bad(res, '날짜 형식이 올바르지 않습니다');
    db.prepare('DELETE FROM workouts WHERE user_id = ? AND date = ?').run(req.user.id, req.params.date);
    res.json({ ok: true });
  });

  // ---- body weight (WeightTrack) ----
  r.put('/bodyweights/:date', (req, res) => {
    if (!isDate(req.params.date)) return bad(res, '날짜 형식이 올바르지 않습니다');
    const kg = req.body?.kg;
    if (typeof kg !== 'number' || !(kg >= 20 && kg <= 300)) return bad(res, '몸무게는 20~300kg 사이여야 합니다');
    db.prepare('INSERT OR REPLACE INTO body_weights (user_id, date, kg) VALUES (?, ?, ?)').run(
      req.user.id,
      req.params.date,
      Math.round(kg * 10) / 10,
    );
    const achievements = checkWeightAchievement(db, req.user.id);
    res.json({ bodyWeights: loadBodyWeights(db, req.user.id), achievements });
  });

  r.delete('/bodyweights/:date', (req, res) => {
    db.prepare('DELETE FROM body_weights WHERE user_id = ? AND date = ?').run(req.user.id, req.params.date);
    res.json({ bodyWeights: loadBodyWeights(db, req.user.id) });
  });

  // ---- routines ----
  const ownRoutine = (req, res) => {
    const row = db.prepare('SELECT * FROM routines WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
    if (!row) res.status(404).json({ error: '루틴을 찾을 수 없습니다' });
    return row;
  };

  const readRoutineBody = (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name || name.length > 30) return bad(res, '루틴 이름은 1~30자여야 합니다') && null;
    const err = validateRoutineDays(req.body?.days);
    if (err) return bad(res, err) && null;
    return { name, days: cleanDays(req.body.days) };
  };

  r.get('/routines', (req, res) => res.json({ routines: loadRoutines(db, req.user.id) }));

  r.post('/routines', (req, res) => {
    const body = readRoutineBody(req, res);
    if (!body) return;
    const count = db.prepare('SELECT COUNT(*) AS n FROM routines WHERE user_id = ?').get(req.user.id).n;
    if (count >= 20) return bad(res, '루틴은 20개까지 저장할 수 있습니다');
    transaction(db, () => {
      const hasActive = db.prepare('SELECT 1 FROM routines WHERE user_id = ? AND is_active = 1').get(req.user.id);
      const id = db
        .prepare('INSERT INTO routines (user_id, name, is_active) VALUES (?, ?, ?)')
        .run(req.user.id, body.name, hasActive ? 0 : 1).lastInsertRowid;
      saveRoutineDays(db, id, body.days);
    });
    res.status(201).json({ routines: loadRoutines(db, req.user.id) });
  });

  r.put('/routines/:id', (req, res) => {
    const row = ownRoutine(req, res);
    if (!row) return;
    const body = readRoutineBody(req, res);
    if (!body) return;
    transaction(db, () => {
      db.prepare('UPDATE routines SET name = ? WHERE id = ?').run(body.name, row.id);
      saveRoutineDays(db, row.id, body.days);
    });
    res.json({ routines: loadRoutines(db, req.user.id) });
  });

  r.post('/routines/:id/activate', (req, res) => {
    const row = ownRoutine(req, res);
    if (!row) return;
    transaction(db, () => {
      db.prepare('UPDATE routines SET is_active = 0 WHERE user_id = ?').run(req.user.id);
      db.prepare('UPDATE routines SET is_active = 1 WHERE id = ?').run(row.id);
    });
    res.json({ routines: loadRoutines(db, req.user.id) });
  });

  r.delete('/routines/:id', (req, res) => {
    const row = ownRoutine(req, res);
    if (!row) return;
    db.prepare('DELETE FROM routines WHERE id = ?').run(row.id);
    res.json({ routines: loadRoutines(db, req.user.id) });
  });

  return r;
}
