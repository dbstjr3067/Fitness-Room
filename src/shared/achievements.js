// Goal detection. Each achievement has a stable `key` so it is only recorded once.
import { addDays, dateRange, startOfMonth, startOfWeek, weekday, daysInMonth } from './date.js';
import { getExercise, MUSCLE_GROUPS } from './exercises.js';
import { exerciseSeries, routineExerciseIds, toKg, round1, weekStreak, workoutDates } from './stats.js';

export const STREAK_STEP = 4;

function lastDayOfMonth(date) {
  return `${date.slice(0, 8)}${String(daysInMonth(date)).padStart(2, '0')}`;
}

/**
 * Achievements earned by the workout saved on `date`.
 * workouts: all of the user's workouts (including the saved one).
 */
export function detectWorkoutAchievements(workouts, { date, routine, weeklyGoal = 3 }) {
  const out = [];
  const withEntries = workouts.filter((w) => w.entries.length);
  const today = withEntries.find((w) => w.date === date);
  if (!today) return out;

  if (withEntries.length === 1) {
    out.push({ key: 'first_workout', kind: 'first', title: '첫 운동일지 작성', data: { date } });
  }

  // Personal records: a completed set (rated 2+) heavier than every earlier non-failed day.
  const completed = withEntries.map((w) => ({
    ...w,
    entries: w.entries.filter((e) => (w.date === date ? e.rating >= 2 : e.rating !== 1)),
  }));
  for (const ex of new Set(today.entries.filter((e) => e.rating >= 2).map((e) => e.exercise))) {
    const series = exerciseSeries(completed, ex);
    const earlier = series.filter((p) => p.date < date);
    const cur = series.find((p) => p.date === date);
    if (!earlier.length || !cur) continue;
    const prevMax = Math.max(...earlier.map((p) => p.kg));
    if (cur.kg > prevMax) {
      const name = getExercise(ex).name;
      out.push({
        key: `pr:${ex}:${cur.kg}`,
        kind: 'pr',
        title: `${name} 최고 중량 ${cur.kg}kg 달성`,
        data: { exercise: ex, kg: cur.kg, previous: prevMax, date },
      });
    }
  }

  // Streak milestones every 4 weeks, recorded when the current week completes the goal.
  const st = weekStreak(withEntries, { today: date, weeklyGoal });
  if (st.thisWeek >= weeklyGoal && st.weeks > 0 && st.weeks % STREAK_STEP === 0) {
    const start = addDays(startOfWeek(date), -7 * (st.weeks - 1));
    out.push({
      key: `streak:${start}:${st.weeks}`,
      kind: 'streak',
      title: `${st.weeks}주 연속 목표 달성`,
      data: { weeks: st.weeks, since: start },
    });
  }

  // Month fully done: every routine day of the month performed, once the last one is reached.
  if (routine && Object.keys(routine).length) {
    const month = startOfMonth(date);
    const planned = dateRange(month, lastDayOfMonth(date)).filter((d) => routineExerciseIds(routine[weekday(d)]).length);
    const done = workoutDates(withEntries);
    if (planned.length && date >= planned.at(-1) && planned.every((d) => done.has(d))) {
      const m = Number(date.slice(5, 7));
      out.push({
        key: `adherence:${date.slice(0, 7)}`,
        kind: 'adherence',
        title: `${m}월 루틴 이행률 100% 달성`,
        data: { month: date.slice(0, 7) },
      });
    }
  }
  return out;
}

/** Bodyweight goal reached (direction decided by the first recorded weight). */
export function detectWeightGoal(bodyWeights, goalKg) {
  if (!goalKg || bodyWeights.length < 2) return null;
  const sorted = [...bodyWeights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted[0].kg;
  const last = sorted.at(-1).kg;
  if (first === goalKg) return null;
  const reached = first > goalKg ? last <= goalKg : last >= goalKg;
  if (!reached) return null;
  return {
    key: `goal_weight:${goalKg}`,
    kind: 'weight',
    title: `목표 몸무게 ${goalKg}kg 달성`,
    data: { goal: goalKg, kg: last },
  };
}

/** Muscle group labels trained in a workout, most-hit first (primary muscles only). */
export function targetGroups(workout, limit = 3) {
  const counts = new Map();
  for (const e of workout.entries) {
    for (const m of getExercise(e.exercise).muscles?.primary || []) {
      const g = MUSCLE_GROUPS.find((grp) => grp.muscles.includes(m));
      if (g) counts.set(g.label, (counts.get(g.label) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label]) => label);
}

export function totalVolumeKg(workout) {
  return round1(workout.entries.reduce((s, e) => s + toKg(e.weight, e.unit) * e.sets * e.reps, 0));
}
