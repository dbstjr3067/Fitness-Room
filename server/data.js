// Shared database reads/writes used by several route modules.
import { transaction } from './db.js';
import { detectWeightGoal, detectWorkoutAchievements } from '../src/shared/achievements.js';
import { getExtension, dependents } from '../src/shared/extensions.js';
import { addDays, todayStr } from '../src/shared/date.js';

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Dates outside this range are refused everywhere (year 10000+ would also break string ordering).
export const MIN_DATE = '2000-01-01';
export const MAX_DATE = '2100-12-31';

export function isDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s) || s < MIN_DATE || s > MAX_DATE) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The server's local date; a client's `today` is used instead when it is at most a day away (time zones). */
export function localToday(candidate, now = new Date()) {
  const server = todayStr(now);
  if (isDate(candidate) && candidate >= addDays(server, -1) && candidate <= addDays(server, 1)) return candidate;
  return server;
}

export function avatarUrl(u) {
  if (u.avatar_path) return `/api/users/${u.id}/avatar?v=${encodeURIComponent(u.avatar_path.split('/').pop())}`;
  return u.avatar_url || null;
}

export function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    bio: u.bio || '',
    avatarUrl: avatarUrl(u),
  };
}

export function selfUser(db, u) {
  const providers = db.prepare('SELECT provider FROM oauth_accounts WHERE user_id = ?').all(u.id).map((r) => r.provider);
  return {
    ...publicUser(u),
    email: u.email,
    recoveryEmail: u.recovery_email || '',
    recoveryPhone: u.recovery_phone || '',
    hasPassword: Boolean(u.password_hash),
    providers,
    isDemo: Boolean(u.is_demo),
  };
}

export function getUser(db, id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ---- settings & extensions ----
export function ensureSettings(db, userId) {
  db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
}

export function readSettings(db, userId) {
  ensureSettings(db, userId);
  const s = db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(userId);
  const extensions = {};
  for (const r of db.prepare('SELECT * FROM user_extensions WHERE user_id = ?').all(userId)) {
    if (getExtension(r.extension_id)) extensions[r.extension_id] = Boolean(r.enabled);
  }
  return {
    weeklyGoal: s.weekly_goal,
    unit: s.unit,
    theme: s.theme,
    isPublic: Boolean(s.is_public),
    promoOptIn: Boolean(s.promo_opt_in),
    goalWeight: s.goal_weight,
    calProfile: s.cal_profile ? JSON.parse(s.cal_profile) : null,
    tierProfile: s.tier_profile ? JSON.parse(s.tier_profile) : null,
    extensions,
  };
}

/** Enable/disable with dependencies: enabling pulls in requirements, disabling turns off dependents. */
export function setExtension(db, userId, id, enabled) {
  const set = db.prepare('INSERT OR REPLACE INTO user_extensions (user_id, extension_id, enabled) VALUES (?, ?, ?)');
  transaction(db, () => {
    set.run(userId, id, enabled ? 1 : 0);
    if (enabled) for (const req of getExtension(id).requires || []) set.run(userId, req, 1);
    else for (const dep of dependents(id)) set.run(userId, dep, 0);
  });
}

// ---- workouts ----
export function loadWorkouts(db, userId, { from, to } = {}) {
  const where = ['w.user_id = ?'];
  const args = [userId];
  if (from) {
    where.push('w.date >= ?');
    args.push(from);
  }
  if (to) {
    where.push('w.date <= ?');
    args.push(to);
  }
  const rows = db
    .prepare(
      `SELECT w.id, w.date, w.split_name, w.memo, e.id AS eid, e.exercise, e.weight, e.unit, e.sets, e.reps, e.rating, e.program, e.metrics
       FROM workouts w LEFT JOIN workout_entries e ON e.workout_id = w.id
       WHERE ${where.join(' AND ')} ORDER BY w.date, e.position, e.id`,
    )
    .all(...args);
  const byId = new Map();
  for (const r of rows) {
    if (!byId.has(r.id)) {
      byId.set(r.id, { id: r.id, date: r.date, splitName: r.split_name || '', memo: r.memo || '', entries: [] });
    }
    if (r.eid) {
      byId.get(r.id).entries.push({
        id: r.eid,
        exercise: r.exercise,
        weight: r.weight,
        unit: r.unit,
        sets: r.sets,
        reps: r.reps,
        rating: r.rating,
        program: r.program,
        ...(r.metrics ? { metrics: JSON.parse(r.metrics) } : {}),
      });
    }
  }
  return [...byId.values()];
}

export function loadBodyWeights(db, userId) {
  return db
    .prepare('SELECT date, kg FROM body_weights WHERE user_id = ? ORDER BY date')
    .all(userId)
    .map((r) => ({ date: r.date, kg: r.kg }));
}

// ---- routines ----
function routineDays(db, routineId) {
  const days = {};
  for (const r of db.prepare('SELECT * FROM routine_days WHERE routine_id = ? ORDER BY weekday').all(routineId)) {
    days[r.weekday] = { splitName: r.split_name || '', exercises: JSON.parse(r.exercises) };
  }
  return days;
}

export function loadRoutines(db, userId) {
  return db
    .prepare('SELECT * FROM routines WHERE user_id = ? ORDER BY is_active DESC, id')
    .all(userId)
    .map((r) => ({ id: r.id, name: r.name, active: Boolean(r.is_active), days: routineDays(db, r.id) }));
}

/** The active routine; activatedAt = the day it became active ('YYYY-MM-DD' or null). */
export function activeRoutine(db, userId) {
  const r = db.prepare('SELECT * FROM routines WHERE user_id = ? AND is_active = 1').get(userId);
  return r ? { id: r.id, name: r.name, activatedAt: r.activated_at || null, days: routineDays(db, r.id) } : null;
}

export function saveRoutineDays(db, routineId, days) {
  db.prepare('DELETE FROM routine_days WHERE routine_id = ?').run(routineId);
  const ins = db.prepare('INSERT INTO routine_days (routine_id, weekday, split_name, exercises) VALUES (?, ?, ?, ?)');
  for (const [wd, day] of Object.entries(days)) {
    if (!day.exercises.length && !day.splitName) continue;
    ins.run(routineId, Number(wd), day.splitName || '', JSON.stringify(day.exercises));
  }
}

// ---- notifications & achievements ----
export function notify(db, userId, { type, title, body = '', data = {}, actorId = null, achievementId = null }) {
  return db
    .prepare(
      'INSERT INTO notifications (user_id, type, title, body, data, actor_id, achievement_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(userId, type, title, body, JSON.stringify(data), actorId, achievementId).lastInsertRowid;
}

/** Store new achievements (dedup by key) and notify the owner. Returns the newly earned ones. */
export function recordAchievements(db, userId, list) {
  const out = [];
  const ins = db.prepare('INSERT OR IGNORE INTO achievements (user_id, key, kind, title, data) VALUES (?, ?, ?, ?, ?)');
  for (const a of list) {
    const res = ins.run(userId, a.key, a.kind, a.title, JSON.stringify(a.data || {}));
    if (!res.changes) continue;
    const id = Number(res.lastInsertRowid);
    notify(db, userId, { type: 'achievement', title: a.title, body: '목표를 달성했어요! 팔로워에게 공유해 보세요.', data: a.data, achievementId: id });
    out.push({ id, ...a });
  }
  return out;
}

export function checkWorkoutAchievements(db, userId, date) {
  const settings = readSettings(db, userId);
  const workouts = loadWorkouts(db, userId);
  const routine = activeRoutine(db, userId);
  const found = detectWorkoutAchievements(workouts, {
    date,
    routine: routine?.days,
    weeklyGoal: settings.weeklyGoal,
    routineSince: routine?.activatedAt || null,
  });
  return recordAchievements(db, userId, found);
}

export function checkWeightAchievement(db, userId) {
  ensureSettings(db, userId);
  const s = db.prepare('SELECT goal_weight, goal_weight_start FROM user_settings WHERE user_id = ?').get(userId);
  const a = detectWeightGoal(loadBodyWeights(db, userId), s.goal_weight, { startKg: s.goal_weight_start ?? null });
  return a ? recordAchievements(db, userId, [a]) : [];
}

/** Latest recorded body weight in kg, or null. */
export function latestBodyWeight(db, userId) {
  return db.prepare('SELECT kg FROM body_weights WHERE user_id = ? ORDER BY date DESC LIMIT 1').get(userId)?.kg ?? null;
}
