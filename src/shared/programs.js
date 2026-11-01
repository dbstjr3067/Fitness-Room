// Program rules (5x5 / GVT / HST) and weight-increase suggestions.
// Workout entry: { exercise, weight, unit, sets, reps, rating (1-4|null), program (id|null) }
// rating: 1 = 목표 세트 실패, 2 = 힘들게 수행, 3 = 적절히 수행, 4 = 쉽게 수행
import { addDays, diffDays, startOfWeek } from './date.js';
import { getExercise } from './exercises.js';
import { toKg, round1 } from './stats.js';

export const RATINGS = [
  { value: 1, label: '실패', description: '목표 세트수를 실패했다' },
  { value: 2, label: '힘듦', description: '힘들게 수행했다' },
  { value: 3, label: '적절', description: '적절히 수행했다' },
  { value: 4, label: '쉬움', description: '쉽게 수행했다' },
];

const HST_REPS = [15, 15, 10, 10, 5, 5]; // by week within a 6-week cycle

function step(exercise) {
  const inc = getExercise(exercise).increment;
  return inc === undefined ? 2.5 : inc;
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

// First day any HST-grouped exercise was done; the HST cycle is anchored there.
export function hstStart(workouts) {
  let first = null;
  for (const w of workouts) {
    if (w.entries.some((e) => e.program === 'hst') && (!first || w.date < first)) first = w.date;
  }
  return first;
}

export function hstWeek(workouts, date) {
  const start = hstStart(workouts) || date;
  const weeks = Math.floor(Math.max(0, diffDays(start, date)) / 7);
  return weeks % HST_REPS.length;
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
const deload = (s, inc, reason) => ({ kind: 'deload', kg: roundWeight(s.kg * 0.9, inc), reason });

/**
 * Suggest the next weight for an exercise.
 * Returns { kind: 'increase' | 'deload' | 'keep', kg, reason } or null with no history.
 */
export function suggestNext(workouts, exercise, { program = null, date }) {
  const inc = step(exercise);
  let hist = exerciseHistory(workouts, exercise, { before: date, program });
  if (!hist.length && program) hist = exerciseHistory(workouts, exercise, { before: date });
  if (!hist.length) return null;
  const [last] = hist;
  const keep = (reason) => ({ kind: 'keep', kg: roundWeight(last.kg, inc), reason });
  if (!inc) return keep('맨몸 운동은 반복 수를 늘려보세요');

  const failedThree = hist.length >= 3 && hist.slice(0, 3).every((s) => s.rating === 1 && sameWeight(s, last));

  switch (program) {
    case 'stronglifts5x5': {
      if (failedThree) return deload(last, inc, '같은 무게에서 3번 연속 실패해 10% 디로드');
      if (last.rating && last.rating >= 2) {
        const add = exercise === 'deadlift' ? inc * 2 : inc;
        return { kind: 'increase', kg: roundWeight(last.kg + add, inc), reason: '지난번 5x5를 모두 성공' };
      }
      return keep(last.rating === 1 ? '지난번 실패한 무게에 다시 도전' : '지난 기록 유지');
    }
    case 'gvt': {
      if (failedThree) return deload(last, inc, '같은 무게에서 3번 연속 실패해 10% 디로드');
      if (last.rating && last.rating >= 2) {
        return { kind: 'increase', kg: roundWeight(last.kg + inc, inc), reason: '지난번 10x10을 모두 성공' };
      }
      return keep('10세트를 모두 채울 때까지 무게 유지');
    }
    case 'hst': {
      const week = hstWeek(workouts, date);
      const lastWeek = hstWeek(workouts, last.date);
      const sameBlock =
        Math.floor(week / 2) === Math.floor(lastWeek / 2) && diffDays(last.date, date) < 14;
      if (!sameBlock) return keep(`새 블록 시작: ${HST_REPS[week]}회로 지난 무게부터`);
      if (last.rating && last.rating >= 2) {
        return { kind: 'increase', kg: roundWeight(last.kg + inc, inc), reason: '블록 안에서 매 회차 증량' };
      }
      return keep('지난 회차를 성공하면 증량');
    }
    default: {
      if (failedThree) return deload(last, inc, '같은 무게에서 3번 연속 실패해 10% 디로드');
      const prev = hist[1];
      if (prev && sameWeight(prev, last) && last.rating >= 3 && prev.rating >= 3) {
        return { kind: 'increase', kg: roundWeight(last.kg + inc, inc), reason: '같은 무게를 2번 연속 여유 있게 수행' };
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
