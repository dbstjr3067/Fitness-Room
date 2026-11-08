// Demo data (pure, no DB): one year of workouts relative to `today`, so the 현황 screens have something to show.
import { addDays, diffDays, weekday } from '../src/shared/date.js';

const SL = 'stronglifts5x5';
const ex = (exercise, program = null) => ({ exercise, program });

export const DEMO_ROUTINE = {
  1: { splitName: 'Push Day', exercises: [ex('bench_press', SL), ex('incline_bench_press'), ex('overhead_press', SL), ex('dips')] },
  3: { splitName: 'Pull Day', exercises: [ex('deadlift', SL), ex('barbell_row', SL), ex('pull_up'), ex('dumbbell_curl')] },
  5: { splitName: 'Leg Day', exercises: [ex('squat', SL), ex('romanian_deadlift'), ex('leg_press')] },
  6: { splitName: 'Upper', exercises: [ex('bench_press', SL), ex('overhead_press', SL), ex('lat_pulldown')] },
};

export const DEMO_ROUTINE_ALT = {
  1: { splitName: '전신 A', exercises: [ex('squat'), ex('bench_press'), ex('barbell_row')] },
  3: { splitName: '전신 B', exercises: [ex('deadlift'), ex('overhead_press'), ex('pull_up')] },
  5: { splitName: '전신 A', exercises: [ex('squat'), ex('bench_press'), ex('barbell_row')] },
};

// [start kg, kg gained per week, sets, reps]
const PLAN = {
  bench_press: [55, 0.6, 5, 5],
  incline_bench_press: [40, 0.4, 3, 8],
  overhead_press: [30, 0.35, 5, 5],
  dips: [0, 0.15, 3, 10],
  deadlift: [100, 0.6, 1, 5],
  barbell_row: [50, 0.45, 5, 5],
  pull_up: [0, 0.12, 3, 8],
  dumbbell_curl: [10, 0.06, 3, 12],
  squat: [75, 0.7, 5, 5],
  romanian_deadlift: [60, 0.45, 3, 8],
  leg_press: [140, 1.2, 3, 10],
  lat_pulldown: [40, 0.45, 3, 10],
};

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const roundTo = (n, step) => Math.round(n / step) * step;

function weightFor(exercise, date, today, scale) {
  const [start, perWeek] = PLAN[exercise];
  const weeks = (365 - diffDays(date, today)) / 7;
  let kg = start * scale + perWeek * scale * weeks;
  // Deadlift: back tweak 3 weeks ago, weights reduced since then.
  if (exercise === 'deadlift' && diffDays(date, today) <= 21) kg -= 15;
  return roundTo(kg, 2.5);
}

function ratingFor(exercise, ago, rand) {
  if (exercise === 'deadlift' && ago <= 21) return 2; // still recovering
  const r = rand();
  if (r < 0.06) return 1;
  if (r < 0.3) return 2;
  if (r < 0.85) return 3;
  return 4;
}

// 유산소 after some sessions in the last 4 months (own random sequence, so the weights stay the same).
function cardioFor(date, today, rand) {
  const ago = diffDays(date, today);
  if (ago > 120 || rand() < 0.35) return [];
  const r1 = (n) => Math.round(n * 10) / 10;
  const rating = rand() < 0.8 ? 3 : 4;
  switch (weekday(date)) {
    case 1:
      return [{ exercise: 'treadmill_run', metrics: { speed: r1(8.5 + (120 - ago) / 60 + rand()), incline: 1, time: 20 }, rating }];
    case 3:
      return [{ exercise: 'rowing_machine', metrics: { distance_m: Math.round((2000 + (120 - ago) * 5 + rand() * 300) / 50) * 50, time: 12 }, rating }];
    case 5:
      return [{ exercise: 'incline_walk', metrics: { speed: 5.5, incline: 10 + Math.round(rand() * 2), time: 25 + Math.round(rand() * 2) * 5 }, rating }];
    default:
      return [{ exercise: 'jump_rope', metrics: { count: 800 + Math.round(rand() * 6) * 100, time: 10 }, rating }];
  }
}

/** options: seed (random sequence), scale (strength multiplier), skip (share of skipped sessions) */
export function buildDemoData(today, { seed = 42, scale = 1, skip = 0.14 } = {}) {
  const rand = rng(seed);
  const cardioRand = rng(seed + 7);
  const workouts = [];
  for (let date = addDays(today, -364); date <= today; date = addDays(date, 1)) {
    const day = DEMO_ROUTINE[weekday(date)];
    if (!day) continue;
    const ago = diffDays(date, today);
    if (ago > 0 && rand() < skip) continue; // skipped session
    const entries = day.exercises
      .filter(({ exercise: e }) => {
        if (e === 'dips') return ago > 33; // no longer done
        if (e === 'leg_press') return ago <= 26; // recently started
        return true;
      })
      .map(({ exercise: e, program }) => {
        const [, , sets, reps] = PLAN[e];
        return {
          exercise: e,
          weight: weightFor(e, date, today, scale),
          unit: 'kg',
          sets,
          reps,
          rating: ratingFor(e, ago, rand),
          program,
        };
      });
    const memo =
      ago <= 2 && !workouts.some((w) => w.memo.startsWith('컨디션'))
        ? '컨디션 좋음. 다음 주 벤치 2.5kg 증량 시도.'
        : rand() < 0.2
          ? '마지막 세트 자세 무너짐, 다음엔 템포 유지'
          : '';
    entries.push(...cardioFor(date, today, cardioRand).map((c) => ({ ...c, weight: 0, unit: 'kg', sets: 0, reps: 0, program: null })));
    workouts.push({ date, splitName: day.splitName, memo, entries });
  }

  const bodyWeights = [];
  for (let ago = 180; ago >= 0; ago -= 2) {
    const kg = 79 * Math.sqrt(scale) - (180 - ago) * 0.022 + (rand() - 0.5) * 0.8;
    bodyWeights.push({ date: addDays(today, -ago), kg: Math.round(kg * 10) / 10 });
  }

  return { routine: DEMO_ROUTINE, workouts, bodyWeights };
}
