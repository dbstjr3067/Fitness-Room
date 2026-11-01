// Pure calculations behind the 현황 (status) screens.
// Workout shape: { id, date: 'YYYY-MM-DD', splitName, memo, entries: [{ exercise, weight, unit, sets, reps }] }
// Routine shape: { [weekday 0-6]: { splitName, exercises: [{ exercise, program }] } }
import {
  addDays,
  dateRange,
  diffDays,
  startOfMonth,
  startOfWeek,
  weekday,
} from './date.js';

const LB_TO_KG = 0.45359237;

export function toKg(weight, unit) {
  return unit === 'lbs' ? weight * LB_TO_KG : weight;
}

export function fromKg(kg, unit) {
  return unit === 'lbs' ? kg / LB_TO_KG : kg;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function workoutDates(workouts) {
  return new Set(workouts.map((w) => w.date));
}

function hasRoutine(routine) {
  return Boolean(routine) && Object.keys(routine).length > 0;
}

// Planned days in [from, to]: routine weekdays when a routine is used.
function plannedDates(from, to, routine) {
  return dateRange(from, to).filter((d) => routine[weekday(d)]);
}

/**
 * 월간 진행도
 * - avgPerWeek: workout days this month / elapsed weeks (min 1 week)
 * - adherence: with a routine, done planned days / planned days so far;
 *   otherwise workout days / (weeklyGoal * elapsed weeks), capped at 100.
 */
export function monthlyProgress(workouts, { today, routine, useRoutine, weeklyGoal = 3 }) {
  const from = startOfMonth(today);
  const done = workoutDates(workouts.filter((w) => w.date >= from && w.date <= today));
  const daysElapsed = diffDays(from, today) + 1;
  const weeks = Math.max(1, daysElapsed / 7);
  const avgPerWeek = round1(done.size / weeks);

  let adherence;
  let basis;
  if (useRoutine && hasRoutine(routine)) {
    const planned = plannedDates(from, today, routine);
    const hit = planned.filter((d) => done.has(d)).length;
    adherence = planned.length ? Math.round((hit / planned.length) * 100) : null;
    basis = 'routine';
  } else {
    const expected = (weeklyGoal * daysElapsed) / 7;
    adherence = expected > 0 ? Math.min(100, Math.round((done.size / expected) * 100)) : 0;
    basis = 'goal';
  }
  return { from, to: today, workoutDays: done.size, avgPerWeek, adherence, basis };
}

// 주간 진행도: Mon..Sun of the current week
export function weeklyProgress(workouts, { today, routine, useRoutine, weeklyGoal = 3 }) {
  const from = startOfWeek(today);
  const done = workoutDates(workouts);
  const days = dateRange(from, addDays(from, 6)).map((date) => ({
    date,
    done: done.has(date),
    planned: Boolean(useRoutine && routine && routine[weekday(date)]),
    future: date > today,
  }));
  const count = days.filter((d) => d.done).length;
  const target =
    useRoutine && hasRoutine(routine) ? days.filter((d) => d.planned).length : weeklyGoal;
  return { from, days, count, target };
}

// Calendar cells for the month containing `today`
export function monthCalendar(workouts, { today, routine, useRoutine }) {
  const from = startOfMonth(today);
  const done = workoutDates(workouts);
  const cells = [];
  for (let d = from; d.slice(0, 7) === from.slice(0, 7); d = addDays(d, 1)) {
    cells.push({
      date: d,
      day: Number(d.slice(8)),
      done: done.has(d),
      planned: Boolean(useRoutine && routine && routine[weekday(d)]),
      future: d > today,
      today: d === today,
    });
  }
  // Monday-first offset for the first cell
  const lead = (weekday(from) + 6) % 7;
  return { lead, cells };
}

export function volume(entry) {
  return toKg(entry.weight, entry.unit) * entry.sets * entry.reps;
}

// 오늘의 진행도
export function todayProgress(workouts, { today, routine, useRoutine }) {
  const todays = workouts.filter((w) => w.date === today);
  const entries = todays.flatMap((w) => w.entries);
  const planned = useRoutine && routine ? routine[weekday(today)] || null : null;
  const doneIds = new Set(entries.map((e) => e.exercise));
  const plannedExercises = planned
    ? routineExerciseIds(planned).map((id) => ({ id, done: doneIds.has(id) }))
    : [];
  return {
    done: todays.length > 0,
    splitName: todays[0]?.splitName || planned?.splitName || null,
    entries,
    totalSets: entries.reduce((s, e) => s + e.sets, 0),
    totalVolume: Math.round(entries.reduce((s, e) => s + volume(e), 0)),
    plannedExercises,
    memo: todays.map((w) => w.memo).filter(Boolean).join('\n'),
  };
}

// Heaviest weight (kg) per day for one exercise, sorted by date.
export function exerciseSeries(workouts, exercise) {
  const best = new Map();
  for (const w of workouts) {
    for (const e of w.entries) {
      if (e.exercise !== exercise) continue;
      const kg = toKg(e.weight, e.unit);
      if (!best.has(w.date) || best.get(w.date) < kg) best.set(w.date, kg);
    }
  }
  return [...best.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, kg]) => ({ date, kg: round1(kg) }));
}

/**
 * Weight change over the last `days` days.
 * Baseline is the last record on/before the window start; if none, the first record in the window.
 */
export function exerciseChange(series, { today, days }) {
  const start = addDays(today, -(days - 1));
  const inWindow = series.filter((p) => p.date >= start && p.date <= today);
  if (!inWindow.length) return null;
  const before = series.filter((p) => p.date < start);
  const base = before.length ? before[before.length - 1] : inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const diff = round1(last.kg - base.kg);
  const pct = base.kg > 0 ? round1((diff / base.kg) * 100) : 0;
  return { from: base, to: last, diff, pct, points: inWindow };
}

export const PERIODS = [
  { id: '7d', label: '7일', days: 7 },
  { id: '3w', label: '3주', days: 21 },
  { id: '3m', label: '3개월', days: 91 },
  { id: '1y', label: '1년', days: 365 },
];

// Exercises the user has done, most recently performed first.
export function performedExercises(workouts) {
  const last = new Map();
  for (const w of workouts) {
    for (const e of w.entries) {
      if (!last.has(e.exercise) || last.get(e.exercise) < w.date) last.set(e.exercise, w.date);
    }
  }
  return [...last.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
}

function exercisesBetween(workouts, from, to) {
  const s = new Set();
  for (const w of workouts) {
    if (w.date >= from && w.date <= to) for (const e of w.entries) s.add(e.exercise);
  }
  return s;
}

// 하지 않게 된 운동 / 새로 하게 된 운동: last 30 days vs the 30 days before.
export function droppedAndNew(workouts, { today, days = 30 }) {
  const recentFrom = addDays(today, -(days - 1));
  const priorTo = addDays(recentFrom, -1);
  const priorFrom = addDays(priorTo, -(days - 1));
  const recent = exercisesBetween(workouts, recentFrom, today);
  const prior = exercisesBetween(workouts, priorFrom, priorTo);
  return {
    dropped: [...prior].filter((e) => !recent.has(e)).sort(),
    added: [...recent].filter((e) => !prior.has(e)).sort(),
  };
}

/**
 * Streak: consecutive weeks (Mon-Sun) that met the weekly goal.
 * The current week counts once met; an unfinished current week does not break the streak.
 */
export function weekStreak(workouts, { today, weeklyGoal = 3 }) {
  const counts = new Map();
  for (const d of workoutDates(workouts)) {
    const wk = startOfWeek(d);
    counts.set(wk, (counts.get(wk) || 0) + 1);
  }
  const thisWeek = startOfWeek(today);
  const thisCount = counts.get(thisWeek) || 0;
  let streak = thisCount >= weeklyGoal ? 1 : 0;
  for (let wk = addDays(thisWeek, -7); (counts.get(wk) || 0) >= weeklyGoal; wk = addDays(wk, -7)) {
    streak++;
  }
  let best = 0;
  let run = 0;
  const weeks = [...counts.keys()].sort();
  if (weeks.length) {
    for (let wk = weeks[0]; wk <= thisWeek; wk = addDays(wk, 7)) {
      run = (counts.get(wk) || 0) >= weeklyGoal ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return { weeks: streak, best, thisWeek: thisCount, goal: weeklyGoal };
}

// Bodyweight entries: [{ date, kg }]
export function bodyweightSummary(entries, { today, days = 30 }) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!sorted.length) return null;
  const change = exerciseChange(sorted, { today, days });
  const latest = sorted[sorted.length - 1];
  return { latest, change, points: change ? change.points : [] };
}

export function routineDay(routine, date) {
  return routine ? routine[weekday(date)] || null : null;
}

// Routine day exercises may be ids (old format) or { exercise, program }.
export function routineExerciseIds(day) {
  return (day?.exercises || []).map((e) => (typeof e === 'string' ? e : e.exercise));
}

/**
 * 일지 이행률: share of the routine's planned exercises for that weekday that were performed
 * (a failed attempt still counts as performed). null on days without a routine plan.
 */
export function logAdherence(workout, routine) {
  const planned = routineExerciseIds(routine?.[weekday(workout.date)]);
  if (!planned.length) return null;
  const done = new Set(workout.entries.map((e) => e.exercise));
  const hit = planned.filter((id) => done.has(id)).length;
  return Math.round((hit / planned.length) * 100);
}
