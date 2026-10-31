import { describe, expect, test } from 'vitest';
import { addDays, startOfWeek, weekday } from './date.js';
import {
  droppedAndNew,
  exerciseChange,
  exerciseSeries,
  monthCalendar,
  monthlyProgress,
  performedExercises,
  todayProgress,
  toKg,
  weekStreak,
  weeklyProgress,
} from './stats.js';

const w = (date, entries = [], extra = {}) => ({ id: date, date, splitName: null, memo: '', entries, ...extra });
const e = (exercise, weight, unit = 'kg', sets = 5, reps = 5) => ({ exercise, weight, unit, sets, reps });

// 2026-10-28 is a Wednesday
const TODAY = '2026-10-28';

describe('date helpers', () => {
  test('weekday and week start', () => {
    expect(weekday(TODAY)).toBe(3);
    expect(startOfWeek(TODAY)).toBe('2026-10-26');
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to previous Monday
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('monthlyProgress', () => {
  test('goal based: avg per week and adherence', () => {
    // 28 days elapsed = 4 weeks, 10 workout days, goal 3/week -> 10/12 = 83%
    const days = ['01', '03', '06', '08', '10', '13', '15', '20', '22', '27'];
    const workouts = days.map((d) => w(`2026-10-${d}`, [e('squat', 100)]));
    workouts.push(w('2026-09-30', [e('squat', 100)])); // previous month ignored
    const m = monthlyProgress(workouts, { today: TODAY, weeklyGoal: 3 });
    expect(m.workoutDays).toBe(10);
    expect(m.avgPerWeek).toBe(2.5);
    expect(m.adherence).toBe(83);
    expect(m.basis).toBe('goal');
  });

  test('goal based adherence is capped at 100', () => {
    const workouts = ['2026-10-01', '2026-10-02', '2026-10-03'].map((d) => w(d));
    expect(monthlyProgress(workouts, { today: '2026-10-03', weeklyGoal: 3 }).adherence).toBe(100);
  });

  test('routine based: done planned days / planned days', () => {
    // Routine on Mondays. Mondays in Oct 2026 up to the 28th: 5, 12, 19, 26
    const routine = { 1: { splitName: 'A', exercises: ['squat'] } };
    const workouts = ['2026-10-05', '2026-10-12', '2026-10-26', '2026-10-14'].map((d) => w(d));
    const m = monthlyProgress(workouts, { today: TODAY, routine, useRoutine: true });
    expect(m.adherence).toBe(75);
    expect(m.basis).toBe('routine');
  });

  test('routine ignored when the routine extension is off', () => {
    const routine = { 1: { splitName: 'A', exercises: [] } };
    const m = monthlyProgress([], { today: TODAY, routine, useRoutine: false, weeklyGoal: 3 });
    expect(m.basis).toBe('goal');
    expect(m.adherence).toBe(0);
  });
});

describe('weekly / calendar / today', () => {
  test('weeklyProgress marks Mon..Sun', () => {
    const r = weeklyProgress([w('2026-10-26'), w('2026-10-28'), w('2026-10-20')], { today: TODAY, weeklyGoal: 4 });
    expect(r.days).toHaveLength(7);
    expect(r.days[0].date).toBe('2026-10-26');
    expect(r.count).toBe(2);
    expect(r.target).toBe(4);
    expect(r.days[3].future).toBe(true);
  });

  test('monthCalendar has month days and Monday-first offset', () => {
    const cal = monthCalendar([w('2026-10-02')], { today: TODAY });
    expect(cal.cells).toHaveLength(31);
    expect(cal.lead).toBe(3); // Oct 1 2026 is a Thursday
    expect(cal.cells[1].done).toBe(true);
    expect(cal.cells[27].today).toBe(true);
  });

  test('todayProgress totals and planned checklist', () => {
    const routine = { 3: { splitName: 'Pull', exercises: ['deadlift', 'pull_up'] } };
    const t = todayProgress([w(TODAY, [e('deadlift', 100, 'kg', 1, 5), e('barbell_row', 60, 'kg', 5, 5)], { splitName: 'Pull' })], {
      today: TODAY,
      routine,
      useRoutine: true,
    });
    expect(t.done).toBe(true);
    expect(t.totalSets).toBe(6);
    expect(t.totalVolume).toBe(500 + 1500);
    expect(t.plannedExercises).toEqual([
      { id: 'deadlift', done: true },
      { id: 'pull_up', done: false },
    ]);
  });
});

describe('exercise change', () => {
  const workouts = [
    w('2026-09-01', [e('bench_press', 50)]),
    w('2026-10-05', [e('bench_press', 55), e('bench_press', 60)]),
    w('2026-10-20', [e('bench_press', 62.5)]),
    w('2026-10-27', [e('bench_press', 135, 'lbs')]),
  ];

  test('series keeps the heaviest set per day in kg', () => {
    const s = exerciseSeries(workouts, 'bench_press');
    expect(s.map((p) => p.date)).toEqual(['2026-09-01', '2026-10-05', '2026-10-20', '2026-10-27']);
    expect(s[1].kg).toBe(60);
    expect(s[3].kg).toBe(61.2);
  });

  test('change uses last record before the window as baseline', () => {
    const s = exerciseSeries(workouts, 'bench_press');
    const c = exerciseChange(s, { today: TODAY, days: 30 }); // window starts 09-29
    expect(c.from.date).toBe('2026-09-01');
    expect(c.diff).toBe(11.2);
    expect(c.pct).toBe(22.4);
  });

  test('change inside window only when no earlier record', () => {
    const s = exerciseSeries(workouts.slice(1), 'bench_press');
    const c = exerciseChange(s, { today: TODAY, days: 7 }); // only 10-27 in window, 10-20 before
    expect(c.from.date).toBe('2026-10-20');
    expect(c.diff).toBe(-1.3);
    expect(c.pct).toBe(-2.1);
  });

  test('no records in window -> null', () => {
    expect(exerciseChange(exerciseSeries(workouts, 'squat'), { today: TODAY, days: 7 })).toBeNull();
  });

  test('lbs conversion', () => {
    expect(toKg(100, 'lbs')).toBeCloseTo(45.359, 3);
    expect(toKg(100, 'kg')).toBe(100);
  });

  test('performedExercises orders by most recent', () => {
    expect(performedExercises([w('2026-10-01', [e('squat', 1)]), w('2026-10-10', [e('dips', 1)])])).toEqual(['dips', 'squat']);
  });
});

describe('droppedAndNew', () => {
  test('compares last 30 days with the previous 30', () => {
    const workouts = [
      w('2026-09-10', [e('dips', 0), e('squat', 100)]), // prior window (08-30..09-28)
      w('2026-10-10', [e('squat', 100), e('leg_press', 150)]), // recent window
      w('2026-07-01', [e('deadlift', 100)]), // outside both
    ];
    expect(droppedAndNew(workouts, { today: TODAY })).toEqual({ dropped: ['dips'], added: ['leg_press'] });
  });
});

describe('weekStreak', () => {
  const week = (monday, n) => Array.from({ length: n }, (_, i) => w(addDays(monday, i)));

  test('counts consecutive weeks meeting goal; unfinished current week does not break it', () => {
    const workouts = [...week('2026-10-19', 3), ...week('2026-10-12', 3), ...week('2026-09-28', 3), ...week('2026-10-26', 1)];
    const s = weekStreak(workouts, { today: TODAY, weeklyGoal: 3 });
    expect(s.weeks).toBe(2);
    expect(s.thisWeek).toBe(1);
    expect(s.best).toBe(2);
  });

  test('current week counts once the goal is met', () => {
    const workouts = [...week('2026-10-26', 3), ...week('2026-10-19', 3)];
    expect(weekStreak(workouts, { today: TODAY, weeklyGoal: 3 }).weeks).toBe(2);
  });
});
