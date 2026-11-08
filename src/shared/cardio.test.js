import { afterEach, describe, expect, test } from 'vitest';
import { CARDIO, CARDIO_METRICS, cleanMetricValue, formatMetrics, metricError } from './cardio.js';
import {
  canUseInProgram,
  cardioMetricsOf,
  getExercise,
  isCardio,
  searchExercises,
  setCustomExercises,
  SEARCH_CATEGORIES,
} from './exercises.js';
import { cardioSeries, performedExercises, weeklyCardio } from './stats.js';
import { detectWorkoutAchievements } from './achievements.js';

afterEach(() => setCustomExercises([]));

const run = (exercise, metrics, extra = {}) => ({ exercise, weight: 0, unit: 'kg', sets: 0, reps: 0, rating: 3, program: null, metrics, ...extra });
const lift = (exercise, weight) => ({ exercise, weight, unit: 'kg', sets: 3, reps: 5, rating: 3, program: null });

describe('유산소 catalog', () => {
  test('27 exercises, each measuring 1~3 known values', () => {
    expect(CARDIO).toHaveLength(27);
    for (const e of CARDIO) {
      expect(e.metrics.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.metrics.length, e.id).toBeLessThanOrEqual(3);
      for (const m of e.metrics) expect(CARDIO_METRICS[m], `${e.id}:${m}`).toBeTruthy();
      expect(isCardio(e.id)).toBe(true);
    }
  });

  test('different exercises measure different things', () => {
    expect(cardioMetricsOf('treadmill_run')).toEqual(['speed', 'incline', 'time']);
    expect(cardioMetricsOf('outdoor_run')).toEqual(['distance_km', 'time']);
    expect(cardioMetricsOf('rowing_machine')).toEqual(['distance_m', 'time']);
    expect(cardioMetricsOf('jump_rope')).toEqual(['count', 'time']);
    expect(cardioMetricsOf('stationary_bike')).toEqual(['level', 'time']);
    expect(cardioMetricsOf('bench_press')).toEqual([]);
  });

  test('배틀 로프 moved from free weights to 유산소; 에어 바이크 (crunch) stays', () => {
    expect(getExercise('battling_ropes').category).toBe('cardio');
    expect(getExercise('air_bike').category).toBe('bodyweight');
  });

  test('cardio is searched only where it is allowed', () => {
    expect(searchExercises('러닝')).toEqual([]);
    expect(searchExercises('러닝', { category: 'cardio' }).map((e) => e.id)).toContain('treadmill_run');
    const everything = SEARCH_CATEGORIES.map((c) => c.id).filter((id) => id !== 'all');
    expect(searchExercises('러닝', { allowed: everything }).length).toBeGreaterThan(0);
    expect(searchExercises('', { category: 'cardio' })).toHaveLength(27);
  });

  test('programs take free weights and machines only', () => {
    expect(canUseInProgram('squat')).toBe(true);
    expect(canUseInProgram('leg_press')).toBe(true);
    expect(canUseInProgram('pull_up')).toBe(false);
    expect(canUseInProgram('treadmill_run')).toBe(false);
  });

  test('user-added cardio keeps its chosen measurements', () => {
    setCustomExercises([{ id: 3, name: '사이드 스텝', category: 'cardio', primaryMuscles: [], metrics: ['distance_km', 'time'] }]);
    expect(isCardio('c3')).toBe(true);
    expect(cardioMetricsOf('c3')).toEqual(['distance_km', 'time']);
    expect(getExercise('c3').icon).toBe('pulse');
    expect(canUseInProgram('c3')).toBe(false);
  });
});

describe('measured values', () => {
  test('ranges and whole numbers', () => {
    expect(metricError('speed', 8.5)).toBeNull();
    expect(metricError('speed', 0)).toMatch(/속도/);
    expect(metricError('incline', 0)).toBeNull();
    expect(metricError('incline', 41)).toMatch(/0~40%/);
    expect(metricError('count', 10.5)).toMatch(/정수/);
    expect(metricError('time', null)).toBeNull();
    expect(metricError('time', '30')).toMatch(/올바르지/);
    expect(metricError('weight', 30)).toMatch(/측정 항목/);
  });

  test('cleaning input and formatting', () => {
    expect(cleanMetricValue('speed', '6.55')).toBe(6.55);
    expect(cleanMetricValue('distance_m', '2000.4')).toBe(2000);
    expect(cleanMetricValue('time', '')).toBeNull();
    expect(formatMetrics(['speed', 'incline', 'time'], { speed: 6, incline: 5, time: 30 })).toBe('6km/h · 5% · 30분');
    expect(formatMetrics(['rounds', 'time'], { rounds: 8 })).toBe('8라운드');
  });
});

describe('cardio in stats', () => {
  const workouts = [
    { date: '2026-11-02', entries: [lift('squat', 100), run('treadmill_run', { speed: 9, incline: 1, time: 20 })] },
    { date: '2026-11-04', entries: [run('treadmill_run', { speed: 10, time: 15 }), run('treadmill_run', { speed: 8, time: 10 })] },
    { date: '2026-11-06', entries: [run('rowing_machine', { distance_m: 2000, time: 10 })] },
  ];

  test('weight lists skip cardio; the cardio list skips weights', () => {
    expect(performedExercises(workouts)).toEqual(['squat']);
    expect(performedExercises(workouts, { cardio: true })).toEqual(['rowing_machine', 'treadmill_run']);
  });

  test('a day sums time/distance and keeps the best speed', () => {
    expect(cardioSeries(workouts, 'treadmill_run', 'time')).toEqual([
      { date: '2026-11-02', kg: 20 },
      { date: '2026-11-04', kg: 25 },
    ]);
    expect(cardioSeries(workouts, 'treadmill_run', 'speed').map((p) => p.kg)).toEqual([9, 10]);
    expect(cardioSeries(workouts, 'treadmill_run', 'incline')).toEqual([{ date: '2026-11-02', kg: 1 }]);
  });

  test('this week: sessions (days with 유산소) and minutes', () => {
    // two cardio entries on one day are one session
    expect(weeklyCardio(workouts, { today: '2026-11-07' })).toEqual({ minutes: 55, sessions: 3 });
    expect(weeklyCardio(workouts, { today: '2026-11-10' })).toEqual({ minutes: 0, sessions: 0 });
  });

  test('cardio never creates a 최고 중량 achievement', () => {
    const history = [
      { date: '2026-11-01', entries: [run('treadmill_run', { speed: 8, time: 20 })] },
      { date: '2026-11-03', entries: [run('treadmill_run', { speed: 12, time: 40 })] },
    ];
    const keys = detectWorkoutAchievements(history, { date: '2026-11-03', weeklyGoal: 3 }).map((a) => a.key);
    expect(keys.some((k) => k.startsWith('pr:'))).toBe(false);
  });
});
