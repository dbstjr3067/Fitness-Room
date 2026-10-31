// Demo data (pure, no DB): one year of workouts relative to `today`, so the 현황 screens have something to show.
import { addDays, diffDays, weekday } from '../src/shared/date.js';

const ROUTINE = {
  1: { splitName: 'Push Day', exercises: ['bench_press', 'incline_bench_press', 'overhead_press', 'dips'] },
  3: { splitName: 'Pull Day', exercises: ['deadlift', 'barbell_row', 'pull_up', 'dumbbell_curl'] },
  5: { splitName: 'Leg Day', exercises: ['squat', 'romanian_deadlift', 'leg_press'] },
  6: { splitName: 'Upper', exercises: ['bench_press', 'overhead_press', 'lat_pulldown'] },
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

function weightFor(exercise, date, today) {
  const [start, perWeek] = PLAN[exercise];
  const weeks = (365 - diffDays(date, today)) / 7;
  let kg = start + perWeek * weeks;
  // Deadlift: back tweak 3 weeks ago, weights reduced since then.
  if (exercise === 'deadlift' && diffDays(date, today) <= 21) kg -= 15;
  return roundTo(kg, 2.5);
}

export function buildDemoData(today) {
  const rand = rng(42);
  const workouts = [];
  for (let date = addDays(today, -364); date <= today; date = addDays(date, 1)) {
    const day = ROUTINE[weekday(date)];
    if (!day) continue;
    const ago = diffDays(date, today);
    if (ago > 0 && rand() < 0.14) continue; // skipped session
    const entries = day.exercises
      .filter((ex) => {
        if (ex === 'dips') return ago > 30; // no longer done
        if (ex === 'leg_press') return ago <= 30; // recently started
        return true;
      })
      .map((ex) => {
        const [, , sets, reps] = PLAN[ex];
        return { exercise: ex, weight: weightFor(ex, date, today), unit: 'kg', sets, reps };
      });
    const memo =
      ago === 0
        ? '컨디션 좋음. 다음 주 벤치 2.5kg 증량 시도.'
        : rand() < 0.2
          ? '마지막 세트 자세 무너짐, 다음엔 템포 유지'
          : '';
    workouts.push({ date, splitName: day.splitName, memo, entries });
  }

  const bodyWeights = [];
  for (let ago = 180; ago >= 0; ago -= 2) {
    const kg = 79 - (180 - ago) * 0.022 + (rand() - 0.5) * 0.8;
    bodyWeights.push({ date: addDays(today, -ago), kg: Math.round(kg * 10) / 10 });
  }

  return { routine: ROUTINE, workouts, bodyWeights };
}
