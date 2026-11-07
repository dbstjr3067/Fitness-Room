import { afterEach, describe, expect, test } from 'vitest';
import {
  EXERCISES,
  MUSCLES,
  customExercises,
  getExercise,
  isKnownExercise,
  searchExercises,
  setCustomExercises,
} from './exercises.js';

afterEach(() => setCustomExercises([]));

describe('exercise catalog', () => {
  test('739 exercises split into 프리웨이트 / 머신 / 맨몸운동', () => {
    expect(EXERCISES).toHaveLength(739);
    const counts = {};
    for (const e of EXERCISES) counts[e.category] = (counts[e.category] || 0) + 1;
    expect(counts).toEqual({ free: 489, machine: 139, bodyweight: 111 });
  });

  test('unique ids and Korean names; tips and muscles are valid', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    expect(new Set(EXERCISES.map((e) => e.name)).size).toBe(EXERCISES.length);
    for (const e of EXERCISES) {
      expect(e.id).toMatch(/^[a-z0-9_]{1,60}$/);
      expect(e.name).toMatch(/[가-힣]/);
      expect(e.tips.length).toBeGreaterThanOrEqual(2);
      for (const m of [...e.muscles.primary, ...e.muscles.secondary]) expect(MUSCLES[m], `${e.id}:${m}`).toBeTruthy();
    }
  });

  test('the hand-written exercises keep their ids and come first', () => {
    expect(EXERCISES[0].id).toBe('bench_press');
    expect(getExercise('squat').name).toBe('스쿼트');
    expect(getExercise('standing_military_press').name).toMatch(/밀리터리 프레스/);
  });

  test('search by Korean, English name and muscle, filtered by category', () => {
    expect(searchExercises('벤치 프레스')[0].id).toBe('bench_press');
    expect(searchExercises('kettlebell swing').length).toBeGreaterThan(0);
    const machines = searchExercises('', { category: 'machine' });
    expect(machines).toHaveLength(139);
    expect(machines.every((e) => e.category === 'machine')).toBe(true);
    expect(searchExercises('하체', { category: 'bodyweight' }).every((e) => e.category === 'bodyweight')).toBe(true);
  });
});

describe('user-added exercises', () => {
  test('registered exercises are searchable, listed first and resolvable', () => {
    setCustomExercises([{ id: 7, name: '스미스 머신 런지', category: 'machine', primaryMuscles: ['quads'], increment: 5 }]);
    expect(customExercises().map((e) => e.id)).toEqual(['c7']);
    expect(searchExercises('', { category: 'machine' })[0].id).toBe('c7');
    expect(searchExercises('스미스 머신 런지')[0]).toMatchObject({ id: 'c7', custom: true, icon: 'machine' });
    expect(searchExercises('', { category: 'free' }).some((e) => e.id === 'c7')).toBe(false);
    expect(isKnownExercise('c7')).toBe(true);
    setCustomExercises([]);
    expect(getExercise('c7').name).toBe('삭제된 운동');
    expect(isKnownExercise('c7')).toBe(false);
  });
});
