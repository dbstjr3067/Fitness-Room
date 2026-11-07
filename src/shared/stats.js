// Pure calculations behind the 현황 (status) screens.
// Workout shape: { id, date: 'YYYY-MM-DD', splitName, memo, entries: [{ exercise, weight, unit, sets, reps }] }
// Routine shape: { [weekday 0-6]: { splitName, exercises: [{ exercise, program }] } }
import {
  addDays,
  dateRange,
  daysInMonth,
  diffDays,
  startOfMonth,
  startOfWeek,
  weekday,
} from './date.js';
import { isCardio } from './exercises.js';
import { CARDIO_METRICS } from './cardio.js';

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

// Days with at least one logged exercise (a memo-only day is not a workout day).
export function workoutDates(workouts) {
  return new Set(workouts.filter((w) => w.entries?.length).map((w) => w.date));
}

// Weekly goal as a usable number: 0 / null / invalid fall back to 3 (never 0, which would loop or divide by zero).
export function weeklyGoalOf(weeklyGoal) {
  return Math.max(1, Number(weeklyGoal) || 3);
}

// A routine day is planned only when it has exercises (a 휴식 day with a split name but no exercises is not).
export function isPlannedDay(routine, date) {
  return routineExerciseIds(routine?.[weekday(date)]).length > 0;
}

function hasRoutine(routine) {
  return Boolean(routine) && Object.values(routine).some((day) => routineExerciseIds(day).length > 0);
}

// Planned days in [from, to]: routine weekdays with exercises.
function plannedDates(from, to, routine) {
  return dateRange(from, to).filter((d) => isPlannedDay(routine, d));
}

/**
 * 월간 진행도
 * - avgPerWeek: workout days this month / elapsed weeks (min 1 week)
 * - adherence: with a routine, done planned days / planned days so far
 *   (from `routineSince` when the routine started this month; today only counts once it is done);
 *   otherwise workout days / (weeklyGoal * elapsed weeks), capped at 100.
 */
export function monthlyProgress(workouts, { today, routine, useRoutine, weeklyGoal = 3, routineSince = null }) {
  const from = startOfMonth(today);
  const done = workoutDates(workouts.filter((w) => w.date >= from && w.date <= today));
  const daysElapsed = diffDays(from, today) + 1;
  const weeks = Math.max(1, daysElapsed / 7);
  const avgPerWeek = round1(done.size / weeks);

  let adherence;
  let basis;
  if (useRoutine && hasRoutine(routine)) {
    const start = routineSince && routineSince > from ? routineSince : from;
    const planned = plannedDates(start, today, routine).filter((d) => d < today || done.has(d));
    const hit = planned.filter((d) => done.has(d)).length;
    adherence = planned.length ? Math.round((hit / planned.length) * 100) : null;
    basis = 'routine';
  } else {
    const expected = (weeklyGoalOf(weeklyGoal) * daysElapsed) / 7;
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
    planned: Boolean(useRoutine && isPlannedDay(routine, date)),
    future: date > today,
  }));
  const count = days.filter((d) => d.done).length;
  const target =
    useRoutine && hasRoutine(routine) ? days.filter((d) => d.planned).length : weeklyGoalOf(weeklyGoal);
  return { from, days, count, target };
}

// Calendar cells for the month containing `today`
export function monthCalendar(workouts, { today, routine, useRoutine }) {
  const from = startOfMonth(today);
  const done = workoutDates(workouts);
  const cells = dateRange(from, addDays(from, daysInMonth(from) - 1)).map((d) => ({
    date: d,
    day: Number(d.slice(8)),
    done: done.has(d),
    planned: Boolean(useRoutine && isPlannedDay(routine, d)),
    future: d > today,
    today: d === today,
  }));
  // Monday-first offset for the first cell
  const lead = (weekday(from) + 6) % 7;
  return { lead, cells };
}

// Lifted volume in kg. Assisted (negative) weights count as 0, not as negative volume.
export function volume(entry) {
  return Math.max(0, toKg(entry.weight, entry.unit)) * entry.sets * entry.reps;
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
    done: entries.length > 0,
    splitName: todays[0]?.splitName || planned?.splitName || null,
    entries,
    totalSets: entries.reduce((s, e) => s + e.sets, 0),
    totalVolume: Math.round(entries.reduce((s, e) => s + volume(e), 0)),
    plannedExercises,
    memo: todays.map((w) => w.memo).filter(Boolean).join('\n'),
  };
}

// Heaviest weight (kg) per day for one exercise, sorted by date.
// kg is not rounded: a lbs log converted back for display must give the logged number again
// (round only after converting, e.g. round1(fromKg(p.kg, unit))).
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
    .map(([date, kg]) => ({ date, kg }));
}

/**
 * One cardio value per day, sorted by date: summed (time, distance…) or the day's best (speed, incline, level).
 * Points use `kg` as the value key so the same change/graph helpers work.
 */
export function cardioSeries(workouts, exercise, metric) {
  const agg = (Object.prototype.hasOwnProperty.call(CARDIO_METRICS, metric) && CARDIO_METRICS[metric].agg) || 'sum';
  const byDate = new Map();
  for (const w of workouts) {
    for (const e of w.entries) {
      const v = e.exercise === exercise ? e.metrics?.[metric] : undefined;
      if (typeof v !== 'number') continue;
      const cur = byDate.get(w.date);
      byDate.set(w.date, cur === undefined ? v : agg === 'sum' ? cur + v : Math.max(cur, v));
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, kg: Math.round(v * 100) / 100 }));
}

/** This week's 유산소: total minutes and number of sessions (days with any 유산소 logged). */
export function weeklyCardio(workouts, { today }) {
  const from = addDays(today, -((weekday(today) + 6) % 7));
  let minutes = 0;
  const days = new Set();
  for (const w of workouts) {
    if (w.date < from || w.date > today) continue;
    for (const e of w.entries) {
      if (!isCardio(e.exercise)) continue;
      days.add(w.date);
      minutes += e.metrics?.time || 0;
    }
  }
  return { minutes: Math.round(minutes), sessions: days.size };
}

// Drops float noise (0.30000000000000004) without rounding away precision needed for unit conversion.
const clean = (n) => Math.round(n * 1e6) / 1e6;

/**
 * Weight change over the last `days` days.
 * Baseline is the last record on/before the window start; if none, the first record in the window.
 * `diff` is in the series' unit (kg) and not rounded to 0.1: convert first, then round for display.
 * `pct` is null when the baseline is 0 or negative (assisted), where a percentage means nothing.
 */
export function exerciseChange(series, { today, days }) {
  const start = addDays(today, -(days - 1));
  const inWindow = series.filter((p) => p.date >= start && p.date <= today);
  if (!inWindow.length) return null;
  const before = series.filter((p) => p.date < start);
  const base = before.length ? before[before.length - 1] : inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const diff = clean(last.kg - base.kg);
  const pct = base.kg > 0 ? round1((diff / base.kg) * 100) : null;
  return { from: base, to: last, diff, pct, points: inWindow };
}

export const PERIODS = [
  { id: '7d', label: '7일', days: 7 },
  { id: '3w', label: '3주', days: 21 },
  { id: '3m', label: '3개월', days: 91 },
  { id: '1y', label: '1년', days: 365 },
];

// Exercises the user has done, most recently performed first.
// Weight exercises by default (중량 변화); `cardio: true` lists the 유산소 ones instead.
export function performedExercises(workouts, { cardio = false } = {}) {
  const last = new Map();
  for (const w of workouts) {
    for (const e of w.entries) {
      if (isCardio(e.exercise) !== cardio) continue;
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
  const goal = weeklyGoalOf(weeklyGoal);
  const counts = new Map();
  for (const d of workoutDates(workouts)) {
    const wk = startOfWeek(d);
    if (wk) counts.set(wk, (counts.get(wk) || 0) + 1); // '' = unparsable date
  }
  const thisWeek = startOfWeek(today);
  const thisCount = counts.get(thisWeek) || 0;
  let streak = thisCount >= goal ? 1 : 0;
  // Bounded by the number of counted weeks, so it always ends.
  for (let wk = addDays(thisWeek, -7); streak <= counts.size && (counts.get(wk) || 0) >= goal; wk = addDays(wk, -7)) {
    streak++;
  }
  let best = 0;
  let run = 0;
  const weeks = [...counts.keys()].sort();
  if (weeks.length) {
    const n = Math.min(Math.floor(diffDays(weeks[0], thisWeek) / 7), 21000); // NaN → no loop
    let wk = weeks[0];
    for (let i = 0; i <= n; i++, wk = addDays(wk, 7)) {
      run = (counts.get(wk) || 0) >= goal ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return { weeks: streak, best, thisWeek: thisCount, goal };
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
