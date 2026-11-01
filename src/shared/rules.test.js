import { describe, expect, test } from 'vitest';
import { addDays } from './date.js';
import { hstWeek, programDefaults, programSessionsThisWeek, roundWeight, suggestNext } from './programs.js';
import { detectWeightGoal, detectWorkoutAchievements, targetGroups } from './achievements.js';
import { calcTargets, macroStatus, outsideWindow, sumMeals, validateProfile } from './caltrack.js';
import { logAdherence } from './stats.js';
import { getExercise, searchExercises } from './exercises.js';
import { dependents, searchExtensions } from './extensions.js';

const TODAY = '2026-10-28'; // Wednesday
const w = (date, entries) => ({ date, splitName: '', memo: '', entries });
const e = (exercise, weight, rating = 3, program = null, extra = {}) => ({ exercise, weight, unit: 'kg', sets: 5, reps: 5, rating, program, ...extra });

describe('weight suggestions', () => {
  test('no history -> null', () => {
    expect(suggestNext([], 'squat', { date: TODAY })).toBeNull();
  });

  test('base rule: two easy sessions at the same weight -> +increment', () => {
    const hist = [w('2026-10-20', [e('squat', 100, 3)]), w('2026-10-24', [e('squat', 100, 4)])];
    expect(suggestNext(hist, 'squat', { date: TODAY })).toMatchObject({ kind: 'increase', kg: 102.5 });
    const once = [w('2026-10-24', [e('squat', 100, 4)])];
    expect(suggestNext(once, 'squat', { date: TODAY })).toMatchObject({ kind: 'keep', kg: 100 });
    const hard = [w('2026-10-20', [e('squat', 100, 2)]), w('2026-10-24', [e('squat', 100, 3)])];
    expect(suggestNext(hard, 'squat', { date: TODAY }).kind).toBe('keep');
  });

  test('base rule: three failures at the same weight -> 10% deload', () => {
    const hist = ['2026-10-18', '2026-10-21', '2026-10-24'].map((d) => w(d, [e('bench_press', 80, 1)]));
    expect(suggestNext(hist, 'bench_press', { date: TODAY })).toMatchObject({ kind: 'deload', kg: 72.5 });
  });

  test('only history before the date counts', () => {
    const hist = [w('2026-10-20', [e('squat', 100, 3)]), w('2026-10-24', [e('squat', 100, 3)]), w(TODAY, [e('squat', 500, 3)])];
    expect(suggestNext(hist, 'squat', { date: TODAY }).kg).toBe(102.5);
  });

  test('5x5: success adds 2.5kg (deadlift 5kg); failure keeps; three failures deload', () => {
    const SL = 'stronglifts5x5';
    expect(suggestNext([w('2026-10-26', [e('squat', 100, 2, SL)])], 'squat', { program: SL, date: TODAY })).toMatchObject({ kind: 'increase', kg: 102.5 });
    expect(suggestNext([w('2026-10-26', [e('deadlift', 120, 3, SL)])], 'deadlift', { program: SL, date: TODAY })).toMatchObject({ kind: 'increase', kg: 125 });
    expect(suggestNext([w('2026-10-26', [e('squat', 100, 1, SL)])], 'squat', { program: SL, date: TODAY })).toMatchObject({ kind: 'keep', kg: 100 });
    const fails = ['2026-10-19', '2026-10-21', '2026-10-26'].map((d) => w(d, [e('squat', 100, 1, SL)]));
    expect(suggestNext(fails, 'squat', { program: SL, date: TODAY })).toMatchObject({ kind: 'deload', kg: 90 });
  });

  test('program falls back to plain history when the exercise is new to the program', () => {
    const hist = [w('2026-10-26', [e('squat', 100, 3, null)])];
    expect(suggestNext(hist, 'squat', { program: 'stronglifts5x5', date: TODAY })).toMatchObject({ kind: 'increase', kg: 102.5 });
  });

  test('GVT: all 10x10 done -> +2.5kg', () => {
    const hist = [w('2026-10-26', [e('bench_press', 60, 2, 'gvt', { sets: 10, reps: 10 })])];
    expect(suggestNext(hist, 'bench_press', { program: 'gvt', date: TODAY })).toMatchObject({ kind: 'increase', kg: 62.5 });
  });

  test('HST: blocks of 2 weeks with 15/10/5 reps; increase within a block, keep on a new block', () => {
    const start = '2026-10-01';
    const hist = [w(start, [e('squat', 60, 3, 'hst')])];
    expect(hstWeek(hist, start)).toBe(0);
    expect(hstWeek(hist, addDays(start, 15))).toBe(2);
    expect(hstWeek(hist, addDays(start, 42))).toBe(0); // cycle restarts after 6 weeks
    expect(programDefaults('hst', 'squat', { workouts: hist, date: addDays(start, 3) })).toEqual({ sets: 2, reps: 15 });
    expect(programDefaults('hst', 'squat', { workouts: hist, date: addDays(start, 15) })).toEqual({ sets: 2, reps: 10 });
    expect(suggestNext(hist, 'squat', { program: 'hst', date: addDays(start, 3) })).toMatchObject({ kind: 'increase', kg: 62.5 });
    const newBlock = suggestNext(hist, 'squat', { program: 'hst', date: addDays(start, 15) });
    expect(newBlock).toMatchObject({ kind: 'keep', kg: 60 });
    expect(newBlock.reason).toContain('10회');
  });

  test('program defaults', () => {
    expect(programDefaults('stronglifts5x5', 'squat')).toEqual({ sets: 5, reps: 5 });
    expect(programDefaults('stronglifts5x5', 'deadlift')).toEqual({ sets: 1, reps: 5 });
    expect(programDefaults('gvt', 'squat')).toEqual({ sets: 10, reps: 10 });
    expect(programDefaults(null, 'squat')).toBeNull();
  });

  test('pure bodyweight exercises never suggest weight', () => {
    expect(getExercise('plank').increment).toBe(0);
    const hist = [w('2026-10-20', [e('plank', 0, 4)]), w('2026-10-24', [e('plank', 0, 4)])];
    expect(suggestNext(hist, 'plank', { date: TODAY }).kind).toBe('keep');
  });

  test('weight rounding and weekly program sessions', () => {
    expect(roundWeight(101.3, 2.5)).toBe(102.5);
    expect(roundWeight(101.2, 2.5)).toBe(100);
    expect(roundWeight(101.3, 0)).toBe(101.3);
    const hist = [
      w('2026-10-26', [e('squat', 100, 3, 'stronglifts5x5')]),
      w('2026-10-27', [e('curl', 10)]),
      w('2026-10-28', [e('bench_press', 60, 3, 'stronglifts5x5')]),
      w('2026-10-24', [e('squat', 100, 3, 'stronglifts5x5')]),
    ];
    expect(programSessionsThisWeek(hist, 'stronglifts5x5', TODAY)).toBe(2);
  });
});

describe('log adherence and target muscles', () => {
  const routine = { 3: { splitName: 'Pull', exercises: [{ exercise: 'deadlift' }, { exercise: 'pull_up' }] } };

  test('performed planned exercises count even when failed', () => {
    expect(logAdherence(w(TODAY, [e('deadlift', 100, 1), e('pull_up', 0, 1)]), routine)).toBe(100);
    expect(logAdherence(w(TODAY, [e('deadlift', 100, 4), e('curl', 10)]), routine)).toBe(50);
  });

  test('days without a routine plan are not counted', () => {
    expect(logAdherence(w('2026-10-29', [e('squat', 100)]), routine)).toBeNull();
    expect(logAdherence(w(TODAY, [e('squat', 100)]), {})).toBeNull();
  });

  test('target muscle groups', () => {
    expect(targetGroups(w(TODAY, [e('bench_press', 60), e('incline_bench_press', 40), e('squat', 100)]))).toEqual(['가슴', '하체']);
  });
});

describe('achievements', () => {
  test('first workout', () => {
    expect(detectWorkoutAchievements([w(TODAY, [e('squat', 100)])], { date: TODAY }).map((a) => a.key)).toEqual(['first_workout']);
  });

  test('personal record only when beating an earlier day', () => {
    const hist = [w('2026-10-20', [e('squat', 100)]), w(TODAY, [e('squat', 105), e('bench_press', 60)])];
    const found = detectWorkoutAchievements(hist, { date: TODAY });
    expect(found.map((a) => a.key)).toEqual(['pr:squat:105']);
    expect(found[0].title).toBe('스쿼트 최고 중량 105kg 달성');
    const equal = [w('2026-10-20', [e('squat', 100)]), w(TODAY, [e('squat', 100)])];
    expect(detectWorkoutAchievements(equal, { date: TODAY })).toEqual([]);
  });

  test('a record needs a completed set (rated 2+); failed attempts do not count', () => {
    const base = w('2026-10-20', [e('squat', 100)]);
    expect(detectWorkoutAchievements([base, w(TODAY, [e('squat', 110, null)])], { date: TODAY })).toEqual([]);
    expect(detectWorkoutAchievements([base, w(TODAY, [e('squat', 110, 1)])], { date: TODAY })).toEqual([]);
    expect(detectWorkoutAchievements([base, w(TODAY, [e('squat', 110, 2)])], { date: TODAY }).map((a) => a.key)).toEqual(['pr:squat:110']);
    // an earlier failed 120kg attempt does not raise the bar
    const failedBefore = [base, w('2026-10-24', [e('squat', 120, 1)]), w(TODAY, [e('squat', 110, 3)])];
    expect(detectWorkoutAchievements(failedBefore, { date: TODAY }).map((a) => a.key)).toEqual(['pr:squat:110']);
  });

  test('streak milestone every 4 weeks', () => {
    const hist = [];
    for (let wk = 0; wk < 4; wk++) {
      const monday = addDays('2026-10-05', wk * 7);
      for (let d = 0; d < 3; d++) hist.push(w(addDays(monday, d), [e('squat', 100)]));
    }
    const found = detectWorkoutAchievements(hist, { date: '2026-10-28', weeklyGoal: 3 });
    expect(found.map((a) => a.key)).toContain('streak:2026-10-05:4');
    // the third week is not a milestone
    expect(detectWorkoutAchievements(hist.slice(0, 9), { date: '2026-10-21', weeklyGoal: 3 }).some((a) => a.kind === 'streak')).toBe(false);
  });

  test('month adherence 100% once the last planned day is done', () => {
    const routine = { 6: { splitName: 'Sat', exercises: [{ exercise: 'squat' }] } }; // Saturdays: 3,10,17,24,31 Oct 2026
    const sats = ['2026-10-03', '2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'];
    const hist = sats.map((d) => w(d, [e('squat', 100)]));
    expect(detectWorkoutAchievements(hist, { date: '2026-10-31', routine }).map((a) => a.key)).toContain('adherence:2026-10');
    expect(detectWorkoutAchievements(hist.slice(0, 4), { date: '2026-10-24', routine }).some((a) => a.kind === 'adherence')).toBe(false);
    const missed = hist.filter((x) => x.date !== '2026-10-10');
    expect(detectWorkoutAchievements(missed, { date: '2026-10-31', routine }).some((a) => a.kind === 'adherence')).toBe(false);
  });

  test('weight goal in both directions', () => {
    const down = [{ date: '2026-10-01', kg: 80 }, { date: '2026-10-20', kg: 74.8 }];
    expect(detectWeightGoal(down, 75)?.key).toBe('goal_weight:75');
    expect(detectWeightGoal(down, 74)).toBeNull();
    const up = [{ date: '2026-10-01', kg: 60 }, { date: '2026-10-20', kg: 65 }];
    expect(detectWeightGoal(up, 65)?.key).toBe('goal_weight:65');
    expect(detectWeightGoal(up, null)).toBeNull();
  });
});

describe('CalTrack', () => {
  const profile = { heightCm: 180, age: 30, sex: 'male', activity: 'moderate', goal: 'lose' };

  test('Mifflin-St Jeor targets per goal', () => {
    const t = calcTargets({ ...profile, weightKg: 80 });
    expect(t).toMatchObject({ bmr: 1780, tdee: 2759, kcal: 2259, protein: 160, fat: 63, carbs: 264, window: null });
    expect(calcTargets({ ...profile, goal: 'gain', weightKg: 80 }).kcal).toBe(3059);
    const fasting = calcTargets({ ...profile, goal: 'fasting', weightKg: 80 });
    expect(fasting.kcal).toBe(2459);
    expect(fasting.window).toEqual({ start: '12:00', end: '20:00' });
    // never below a safe floor
    expect(calcTargets({ heightCm: 150, age: 70, sex: 'female', activity: 'sedentary', goal: 'lose', weightKg: 45 }).kcal).toBe(1200);
  });

  test('macro status and meal totals', () => {
    expect(macroStatus(80, 100)).toBe('under');
    expect(macroStatus(95, 100)).toBe('ok');
    expect(macroStatus(115, 100)).toBe('over');
    expect(sumMeals([{ kcal: 100.4, carbs: 10, protein: 5, fat: 1 }, { kcal: 200, carbs: 20, protein: 10, fat: 2 }])).toEqual({ kcal: 300, carbs: 30, protein: 15, fat: 3 });
  });

  test('meals outside the fasting window', () => {
    const meals = [{ time: '08:00' }, { time: '13:00' }, { time: '21:30' }, { time: null }];
    expect(outsideWindow(meals, { start: '12:00', end: '20:00' }).map((m) => m.time)).toEqual(['08:00', '21:30']);
    expect(outsideWindow(meals, null)).toEqual([]);
  });

  test('profile validation', () => {
    expect(validateProfile(profile)).toBeNull();
    expect(validateProfile({ ...profile, age: 5 })).toMatch(/나이/);
    expect(validateProfile({ ...profile, sex: 'x' })).toMatch(/성별/);
  });
});

describe('catalog search', () => {
  test('exercises by name, spacing-insensitive and by muscle', () => {
    expect(searchExercises('벤치 프레스').map((x) => x.id)).toContain('bench_press');
    expect(searchExercises('하체').map((x) => x.id)).toContain('squat');
    expect(searchExercises('')).toHaveLength(searchExercises('').length);
  });

  test('extensions by keyword and dependencies', () => {
    expect(searchExtensions('5x5').map((x) => x.id)).toEqual(['stronglifts5x5']);
    expect(searchExtensions('칼로리').map((x) => x.id)).toContain('caltrack');
    expect(dependents('weighttrack')).toEqual(['caltrack']);
  });
});
