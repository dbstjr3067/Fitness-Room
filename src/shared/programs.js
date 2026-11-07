// Program rules (5x5 / GVT / HST) and weight-increase suggestions.
// Workout entry: { exercise, weight, unit, sets, reps, rating (1-4|null), program (id|null) }
// rating: 1 = 목표 세트 실패, 2 = 힘들게 수행, 3 = 적절히 수행, 4 = 쉽게 수행
import { addDays, diffDays, startOfWeek, todayStr } from './date.js';
import { getExercise } from './exercises.js';
import { fromKg, toKg, round1 } from './stats.js';

export const RATINGS = [
  { value: 1, label: '실패', description: '목표 세트수를 실패했다' },
  { value: 2, label: '힘듦', description: '힘들게 수행했다' },
  { value: 3, label: '적절', description: '적절히 수행했다' },
  { value: 4, label: '쉬움', description: '쉽게 수행했다' },
];

const HST_REPS = [15, 15, 10, 10, 5, 5]; // by week within a 6-week cycle
const HST_BREAK_DAYS = 14; // a pause this long without HST sessions starts a new cycle

function step(exercise) {
  const inc = getExercise(exercise).increment;
  return inc === undefined ? 2.5 : inc;
}

// Weight step in the user's unit: the exercise increment in kg; in lbs 5 lb (2.5 lb for small increments).
function unitStep(inc, unit) {
  if (unit !== 'lbs') return inc;
  return inc >= 2.5 ? 5 : 2.5;
}

export function roundWeight(kg, inc = 2.5) {
  if (!inc) return round1(kg);
  return round1(Math.round(kg / inc) * inc);
}

// Past sessions of one exercise before `date`, newest first, weights in kg.
export function exerciseHistory(workouts, exercise, { before, program } = {}) {
  const out = [];
  for (const w of workouts) {
    if (before && w.date >= before) continue;
    for (const e of w.entries) {
      if (e.exercise !== exercise) continue;
      if (program !== undefined && (e.program || null) !== program) continue;
      out.push({ date: w.date, kg: toKg(e.weight, e.unit), sets: e.sets, reps: e.reps, rating: e.rating ?? null });
    }
  }
  // keep heaviest entry per day
  const byDate = new Map();
  for (const s of out) if (!byDate.has(s.date) || byDate.get(s.date).kg < s.kg) byDate.set(s.date, s);
  return [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Start of the current HST cycle: the first HST session after the most recent pause of 14+ days.
 * With `date`, only sessions before it count, and a pause running up to `date` means a new cycle
 * starts on `date` (returns null). Without `date`, every session counts.
 */
export function hstStart(workouts, date) {
  const days = [
    ...new Set(
      (workouts || [])
        .filter((w) => (!date || w.date < date) && w.entries.some((e) => e.program === 'hst'))
        .map((w) => w.date),
    ),
  ].sort();
  if (!days.length) return null;
  if (date && diffDays(days.at(-1), date) >= HST_BREAK_DAYS) return null;
  let start = days[0];
  for (let i = 1; i < days.length; i++) if (diffDays(days[i - 1], days[i]) >= HST_BREAK_DAYS) start = days[i];
  return start;
}

export function hstWeek(workouts, date) {
  const day = date || todayStr();
  const start = hstStart(workouts, day) || day;
  const weeks = Math.floor(Math.max(0, diffDays(start, day)) / 7);
  return Number.isFinite(weeks) ? weeks % HST_REPS.length : 0;
}

// Default sets/reps when an exercise is placed in a program group.
export function programDefaults(program, exercise, { workouts = [], date } = {}) {
  switch (program) {
    case 'stronglifts5x5':
      return exercise === 'deadlift' ? { sets: 1, reps: 5 } : { sets: 5, reps: 5 };
    case 'gvt':
      return { sets: 10, reps: 10 };
    case 'hst':
      return { sets: 2, reps: HST_REPS[hstWeek(workouts, date)] };
    default:
      return null;
  }
}

const sameWeight = (a, b) => Math.abs(a.kg - b.kg) < 0.05;
const FAILED_THREE = '같은 무게에서 3번 연속 실패해 10% 디로드';

/**
 * Suggest the next weight for an exercise.
 * Returns { kind: 'increase' | 'deload' | 'keep', kg, reason } or null with no history. `kg` is in kg.
 * - 'keep' repeats the last weight exactly (no rounding).
 * - increases / deloads are worked out in the user's `unit` ('kg' | 'lbs'): kg steps by the exercise
 *   increment, lbs by 5 lb (2.5 lb for small increments), so round1(fromKg(kg, unit)) is a clean number.
 *   An increase adds the step to the last weight as is (no snapping to the step grid).
 * Program rules only read that program's history; an exercise new to the program gets the plain rule.
 */
export function suggestNext(workouts, exercise, { program = null, date, unit = 'kg' } = {}) {
  const inc = step(exercise);
  let rule = program;
  let hist = exerciseHistory(workouts, exercise, { before: date, program });
  if (!hist.length && program) {
    hist = exerciseHistory(workouts, exercise, { before: date });
    rule = null;
  }
  if (!hist.length) return null;
  const [last] = hist;
  const keep = (reason) => ({ kind: 'keep', kg: last.kg, reason });
  if (!inc) return keep('맨몸 운동은 반복 수를 늘려보세요');

  const stepU = unitStep(inc, unit);
  const lastU = fromKg(last.kg, unit);
  const toKgOf = (u) => (unit === 'lbs' ? toKg(round1(u), 'lbs') : round1(u));
  const increase = (steps, reason) => ({ kind: 'increase', kg: toKgOf(lastU + stepU * steps), reason });
  // 10% lighter on the unit's step grid. When that rounds back to the same weight (light loads), one step down;
  // with nothing lighter left, keep the weight.
  const deload = () => {
    const target = Math.round((lastU * 0.9) / stepU) * stepU;
    if (target < lastU - 0.05) return { kind: 'deload', kg: toKgOf(target), reason: FAILED_THREE };
    if (lastU - stepU > 0.05) {
      return { kind: 'deload', kg: toKgOf(lastU - stepU), reason: '같은 무게에서 3번 연속 실패해 한 단계 낮춤' };
    }
    return keep('같은 무게에서 3번 연속 실패: 반복 수를 줄여 다시 도전');
  };

  const failedThree = hist.length >= 3 && hist.slice(0, 3).every((s) => s.rating === 1 && sameWeight(s, last));

  switch (rule) {
    case 'stronglifts5x5': {
      if (failedThree) return deload();
      if (last.rating && last.rating >= 2) {
        return increase(exercise === 'deadlift' ? 2 : 1, '지난번 5x5를 모두 성공');
      }
      return keep(last.rating === 1 ? '지난번 실패한 무게에 다시 도전' : '지난 기록 유지');
    }
    case 'gvt': {
      if (failedThree) return deload();
      if (last.rating && last.rating >= 2) return increase(1, '지난번 10x10을 모두 성공');
      return keep('10세트를 모두 채울 때까지 무게 유지');
    }
    case 'hst': {
      const week = hstWeek(workouts, date);
      const lastWeek = hstWeek(workouts, last.date);
      const sameBlock =
        Math.floor(week / 2) === Math.floor(lastWeek / 2) && diffDays(last.date, date || todayStr()) < 14;
      if (!sameBlock) return keep(`새 블록 시작: ${HST_REPS[week]}회로 지난 무게부터`);
      if (last.rating && last.rating >= 2) return increase(1, '블록 안에서 매 회차 증량');
      return keep('지난 회차를 성공하면 증량');
    }
    default: {
      if (failedThree) return deload();
      const prev = hist[1];
      if (prev && sameWeight(prev, last) && last.rating >= 3 && prev.rating >= 3) {
        return increase(1, '같은 무게를 2번 연속 여유 있게 수행');
      }
      return keep('지난 무게 유지');
    }
  }
}

// Distinct days this week (Mon–Sun) with entries in the program.
export function programSessionsThisWeek(workouts, program, date) {
  const from = startOfWeek(date);
  const to = addDays(from, 6);
  return new Set(
    workouts.filter((w) => w.date >= from && w.date <= to && w.entries.some((e) => e.program === program)).map((w) => w.date),
  ).size;
}
