// Edge cases from the calculation audit (lbs users, rest days, empty logs, backdated logs, extremes, IME search).
import { describe, expect, test } from 'vitest';
import { addDays, dateRange, daysInMonth, diffDays, formatDate, parseDate, startOfWeek } from './date.js';
import {
  bodyweightSummary,
  exerciseChange,
  exerciseSeries,
  fromKg,
  monthCalendar,
  monthlyProgress,
  round1,
  todayProgress,
  volume,
  weekStreak,
  weeklyCardio,
  weeklyProgress,
} from './stats.js';
import { hstStart, hstWeek, programDefaults, suggestNext } from './programs.js';
import { detectWeightGoal, detectWorkoutAchievements, totalVolumeKg } from './achievements.js';
import { calcTargets, macroStatus } from './caltrack.js';
import { bodyweightRange, evaluate, liftValueFromEntries, rankForPercentile, thresholdsFor, topPercentText } from './tiers.js';
import { cleanMetricValue, formatMetrics, isMetricId, metricError, metricText } from './cardio.js';
import { isMuscleId, searchExercises, toCustomExercise } from './exercises.js';

const w = (date, entries = [], extra = {}) => ({ id: date, date, splitName: null, memo: '', entries, ...extra });
const e = (exercise, weight, { unit = 'kg', sets = 5, reps = 5, rating = 3, program = null } = {}) => ({
  exercise,
  weight,
  unit,
  sets,
  reps,
  rating,
  program,
});
const lbs = (kg) => round1(fromKg(kg, 'lbs'));

describe('B1 lbs weights survive the kg round trip', () => {
  test('every 2.5 lb step from 45 to 600 displays as logged', () => {
    const bad = [];
    for (let lb = 45; lb <= 600; lb += 2.5) {
      const [p] = exerciseSeries([w('2026-11-02', [e('bench_press', lb, { unit: 'lbs' })])], 'bench_press');
      if (lbs(p.kg) !== lb) bad.push(lb);
    }
    expect(bad).toEqual([]);
  });

  test('change diff converts to the logged difference', () => {
    const s = exerciseSeries(
      [w('2026-11-02', [e('bench_press', 225, { unit: 'lbs' })]), w('2026-11-05', [e('bench_press', 230, { unit: 'lbs' })])],
      'bench_press',
    );
    const c = exerciseChange(s, { today: '2026-11-07', days: 7 });
    expect(lbs(c.to.kg)).toBe(230);
    expect(lbs(c.diff)).toBe(5);
    expect(c.pct).toBe(2.2);
  });

  test('bodyweight diff has no float noise', () => {
    const bw = bodyweightSummary([{ date: '2026-10-01', kg: 80 }, { date: '2026-10-20', kg: 74.8 }], { today: '2026-10-25', days: 30 });
    expect(bw.change.diff).toBe(-5.2);
    expect(bw.change.pct).toBe(-6.5);
  });
});

describe('B13 change percentage from a zero or negative base', () => {
  test('pct is null when the base is 0 or assisted', () => {
    const zero = [{ date: '2026-11-01', kg: 0 }, { date: '2026-11-05', kg: 10 }];
    expect(exerciseChange(zero, { today: '2026-11-07', days: 7 })).toMatchObject({ diff: 10, pct: null });
    const assisted = [{ date: '2026-11-01', kg: -30 }, { date: '2026-11-05', kg: -10 }];
    expect(exerciseChange(assisted, { today: '2026-11-07', days: 7 })).toMatchObject({ diff: 20, pct: null });
  });
});

describe('B2 / K1 suggestNext in the user unit', () => {
  const one = (exercise, weight, opts) => [w('2026-11-02', [e(exercise, weight, opts)])];
  const two = (exercise, weight, opts) => [w('2026-10-30', [e(exercise, weight, opts)]), w('2026-11-02', [e(exercise, weight, opts)])];

  test('keep returns the last weight unchanged', () => {
    expect(lbs(suggestNext(one('bench_press', 135, { unit: 'lbs' }), 'bench_press', { date: '2026-11-05', unit: 'lbs' }).kg)).toBe(135);
    expect(suggestNext(one('dumbbell_curl', 7), 'dumbbell_curl', { date: '2026-11-05' })).toMatchObject({ kind: 'keep', kg: 7 });
    expect(suggestNext(one('bench_press', 61), 'bench_press', { date: '2026-11-05' })).toMatchObject({ kind: 'keep', kg: 61 });
  });

  test('lbs increases step by 5 lb (10 lb deadlift on 5x5)', () => {
    const SL = 'stronglifts5x5';
    const s = suggestNext(one('bench_press', 225, { unit: 'lbs', program: SL }), 'bench_press', { program: SL, date: '2026-11-05', unit: 'lbs' });
    expect(s.kind).toBe('increase');
    expect(lbs(s.kg)).toBe(230);
    const d = suggestNext(one('deadlift', 315, { unit: 'lbs', program: SL }), 'deadlift', { program: SL, date: '2026-11-05', unit: 'lbs' });
    expect(lbs(d.kg)).toBe(325);
    const g = suggestNext(one('bench_press', 100, { unit: 'lbs', program: 'gvt' }), 'bench_press', { program: 'gvt', date: '2026-11-05', unit: 'lbs' });
    expect(lbs(g.kg)).toBe(105);
  });

  test('small increments step by 2.5 lb', () => {
    const s = suggestNext(two('dumbbell_curl', 20, { unit: 'lbs' }), 'dumbbell_curl', { date: '2026-11-05', unit: 'lbs' });
    expect(s.kind).toBe('increase');
    expect(lbs(s.kg)).toBe(22.5);
  });

  test('kg: off-grid weights add the step without snapping', () => {
    expect(suggestNext(two('dumbbell_curl', 7), 'dumbbell_curl', { date: '2026-11-05' })).toMatchObject({ kind: 'increase', kg: 9 });
    expect(suggestNext(two('bench_press', 61), 'bench_press', { date: '2026-11-05' })).toMatchObject({ kind: 'increase', kg: 63.5 });
  });

  test('lbs deload lands on the 5 lb grid', () => {
    const fails = ['2026-10-26', '2026-10-29', '2026-11-02'].map((d) => w(d, [e('bench_press', 135, { unit: 'lbs', rating: 1 })]));
    const s = suggestNext(fails, 'bench_press', { date: '2026-11-05', unit: 'lbs' });
    expect(s.kind).toBe('deload');
    expect(lbs(s.kg)).toBe(120);
  });
});

describe('B15 deload never repeats the same weight', () => {
  const fails = (exercise, kg) => ['2026-10-26', '2026-10-29', '2026-11-02'].map((d) => w(d, [e(exercise, kg, { rating: 1 })]));

  test('light weight: one step down when 10% rounds back up', () => {
    expect(suggestNext(fails('bench_press', 12.5), 'bench_press', { date: '2026-11-05' })).toMatchObject({ kind: 'deload', kg: 10 });
  });

  test('nothing lighter left: keep with a reason', () => {
    const s = suggestNext(fails('bench_press', 2.5), 'bench_press', { date: '2026-11-05' });
    expect(s.kind).toBe('keep');
    expect(s.kg).toBe(2.5);
    expect(s.reason).toMatch(/실패/);
  });
});

describe('B16 program rules only read their own history', () => {
  test('GVT history does not trigger a 5x5 increase', () => {
    const gvt = [w('2026-11-02', [e('squat', 60, { program: 'gvt', sets: 10, reps: 10 })])];
    const s = suggestNext(gvt, 'squat', { program: 'stronglifts5x5', date: '2026-11-05' });
    expect(s).toMatchObject({ kind: 'keep', kg: 60, reason: '지난 무게 유지' });
  });
});

describe('B8 / B19 HST cycle', () => {
  const hst = (date) => w(date, [e('squat', 60, { program: 'hst', sets: 2, reps: 15 })]);

  test('restarts after a break of two weeks or more', () => {
    const old = ['2026-01-05', '2026-01-08', '2026-01-12', '2026-01-15', '2026-01-19'].map(hst);
    // back after months: a new cycle starts on the day you return
    expect(hstWeek(old, '2026-05-04')).toBe(0);
    const back = [...old, hst('2026-05-04'), hst('2026-05-07')];
    expect(hstStart(back, '2026-05-12')).toBe('2026-05-04');
    expect(hstWeek(back, '2026-05-12')).toBe(1);
    expect(programDefaults('hst', 'squat', { workouts: back, date: '2026-05-04' })).toEqual({ sets: 2, reps: 15 });
  });

  test('missing date or workouts does not throw', () => {
    expect(programDefaults('hst', 'squat', {})).toEqual({ sets: 2, reps: 15 });
    expect(hstWeek([hst('2026-01-05')], undefined)).toBe(0);
    expect(hstWeek(undefined, '2026-01-05')).toBe(0);
  });
});

describe('B3 / B4 / B12 / K2 progress counts', () => {
  const squat = [e('squat', 100)];
  // Mondays planned, Wednesday is a rest day with a split name but no exercises
  const routine = { 1: { splitName: 'A', exercises: [{ exercise: 'squat', program: null }] }, 3: { splitName: '휴식', exercises: [] } };
  const mondays = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'].map((d) => w(d, squat));

  test('rest days are not planned anywhere', () => {
    expect(monthlyProgress(mondays, { today: '2026-11-30', routine, useRoutine: true }).adherence).toBe(100);
    const wp = weeklyProgress(mondays, { today: '2026-11-30', routine, useRoutine: true });
    expect(wp.target).toBe(1);
    expect(monthCalendar(mondays, { today: '2026-11-30', routine, useRoutine: true }).cells.find((c) => c.date === '2026-11-04').planned).toBe(false);
    expect(detectWorkoutAchievements(mondays, { date: '2026-11-30', routine }).map((a) => a.key)).toContain('adherence:2026-11');
  });

  test('a routine of rest days only falls back to the weekly goal', () => {
    const rest = { 3: { splitName: '휴식', exercises: [] } };
    expect(monthlyProgress(mondays, { today: '2026-11-30', routine: rest, useRoutine: true }).basis).toBe('goal');
  });

  test('memo-only days are not workout days', () => {
    const memo = [w('2026-11-03', [], { memo: '컨디션 별로' }), w('2026-11-04', [], { splitName: '하체' })];
    expect(monthlyProgress(memo, { today: '2026-11-05', weeklyGoal: 3 }).workoutDays).toBe(0);
    expect(weeklyProgress(memo, { today: '2026-11-05' }).count).toBe(0);
    expect(monthCalendar(memo, { today: '2026-11-05' }).cells[2].done).toBe(false);
    expect(todayProgress(memo, { today: '2026-11-03' }).done).toBe(false);
    expect(weekStreak([...memo, w('2026-11-02', squat)], { today: '2026-11-05', weeklyGoal: 3 }).thisWeek).toBe(1);
  });

  test('today is not a missed day before it is logged', () => {
    // Monday 2026-11-09, morning: last Monday done, today not yet
    const m = monthlyProgress([w('2026-11-02', squat)], { today: '2026-11-09', routine, useRoutine: true });
    expect(m.adherence).toBe(100);
    const done = monthlyProgress([w('2026-11-02', squat), w('2026-11-09', squat)], { today: '2026-11-09', routine, useRoutine: true });
    expect(done.adherence).toBe(100);
    // first planned day of the month, not logged yet -> no ratio yet
    expect(monthlyProgress([], { today: '2026-11-02', routine, useRoutine: true }).adherence).toBeNull();
  });

  test('routineSince limits the planned days of the month', () => {
    const since = { today: '2026-11-30', routine, useRoutine: true, routineSince: '2026-11-15' };
    const late = mondays.filter((x) => x.date >= '2026-11-15');
    expect(monthlyProgress(late, since).adherence).toBe(100);
    expect(monthlyProgress(late, { ...since, routineSince: undefined }).adherence).toBe(60);
    expect(monthlyProgress(late, { ...since, routineSince: '2026-10-01' }).adherence).toBe(60);
    expect(detectWorkoutAchievements(late, { date: '2026-11-30', routine, routineSince: '2026-11-15' }).map((a) => a.key)).toContain(
      'adherence:2026-11',
    );
    expect(detectWorkoutAchievements(late, { date: '2026-11-30', routine }).some((a) => a.kind === 'adherence')).toBe(false);
  });
});

describe('B5 weekly goal of 0 / null', () => {
  test('weekStreak terminates and uses the default goal', () => {
    const ws = [w('2026-11-02', [e('squat', 100)])];
    for (const goal of [0, null, undefined, NaN, '0', -2]) {
      const st = weekStreak(ws, { today: '2026-11-05', weeklyGoal: goal });
      expect(st.goal).toBeGreaterThanOrEqual(1);
    }
    expect(weekStreak(ws, { today: '2026-11-05', weeklyGoal: 0 }).goal).toBe(3);
    expect(monthlyProgress(ws, { today: '2026-11-05', weeklyGoal: 0 }).adherence).toBeGreaterThan(0);
    expect(weeklyProgress(ws, { today: '2026-11-05', weeklyGoal: null }).target).toBe(3);
    expect(detectWorkoutAchievements(ws, { date: '2026-11-02', weeklyGoal: 0 }).map((a) => a.key)).toEqual(['first_workout']);
  });
});

describe('B6 / B7 / B14 personal records', () => {
  test('K4: title in the unit of the record set, data carries unit and value', () => {
    const ws = [w('2026-11-02', [e('bench_press', 225, { unit: 'lbs' })]), w('2026-11-05', [e('bench_press', 230, { unit: 'lbs' })])];
    const [pr] = detectWorkoutAchievements(ws, { date: '2026-11-05' });
    expect(pr.title).toBe('벤치프레스 최고 중량 230lbs 달성');
    expect(pr.key).toBe(`pr:bench_press:${round1(230 * 0.45359237)}`);
    expect(pr.data).toMatchObject({ unit: 'lbs', value: 230, kg: 104.3 });
    const kg = detectWorkoutAchievements([w('2026-11-02', [e('squat', 100)]), w('2026-11-05', [e('squat', 102.5)])], { date: '2026-11-05' });
    expect(kg[0].title).toBe('스쿼트 최고 중량 102.5kg 달성');
    expect(kg[0].data).toMatchObject({ unit: 'kg', value: 102.5, kg: 102.5, previous: 100 });
  });

  test('a backdated log is no record when a later day lifted more', () => {
    const ws = [w('2026-09-01', [e('squat', 100)]), w('2026-10-05', [e('squat', 150)]), w('2026-09-10', [e('squat', 110)])];
    expect(detectWorkoutAchievements(ws, { date: '2026-09-10' }).filter((a) => a.kind === 'pr')).toEqual([]);
    // but it is when it also beats the later days
    const top = [w('2026-09-01', [e('squat', 100)]), w('2026-10-05', [e('squat', 105)]), w('2026-09-10', [e('squat', 110)])];
    expect(detectWorkoutAchievements(top, { date: '2026-09-10' }).map((a) => a.key)).toContain('pr:squat:110');
  });

  test('no record for bodyweight or assisted weights', () => {
    const assisted = [w('2026-11-02', [e('pull_up', -30)]), w('2026-11-05', [e('pull_up', -20)])];
    expect(detectWorkoutAchievements(assisted, { date: '2026-11-05' }).filter((a) => a.kind === 'pr')).toEqual([]);
    const toZero = [w('2026-11-02', [e('pull_up', -30)]), w('2026-11-05', [e('pull_up', 0)])];
    expect(detectWorkoutAchievements(toZero, { date: '2026-11-05' }).filter((a) => a.kind === 'pr')).toEqual([]);
  });

  test('volume ignores assisted weights', () => {
    expect(volume(e('pull_up', -20, { sets: 3, reps: 8 }))).toBe(0);
    const day = w('2026-11-05', [e('pull_up', -20, { sets: 3, reps: 8 }), e('squat', 100, { sets: 1, reps: 5 })]);
    expect(totalVolumeKg(day)).toBe(500);
    expect(todayProgress([day], { today: '2026-11-05' }).totalVolume).toBe(500);
  });
});

describe('B10 / K3 weight goal direction', () => {
  test('startKg decides lose / gain', () => {
    const bw = [{ date: '2026-09-01', kg: 80 }, { date: '2026-10-01', kg: 70 }];
    expect(detectWeightGoal(bw, 75)?.key).toBe('goal_weight:75'); // old behaviour: from the first weight
    expect(detectWeightGoal(bw, 75, { startKg: 70 })).toBeNull(); // gaining from 70 to 75: not yet
    expect(detectWeightGoal([...bw, { date: '2026-11-01', kg: 75.2 }], 75, { startKg: 70 })?.key).toBe('goal_weight:75');
    expect(detectWeightGoal([{ date: '2026-11-01', kg: 74 }], 75, { startKg: 78 })?.key).toBe('goal_weight:75');
    expect(detectWeightGoal(bw, 75, { startKg: null })?.key).toBe('goal_weight:75');
  });
});

describe('B11 CalTrack extremes', () => {
  test('a deficit never exceeds what the body burns', () => {
    const t = calcTargets({ heightCm: 155, age: 60, sex: 'female', activity: 'sedentary', goal: 'lose', weightKg: 45 });
    expect(t.tdee).toBeLessThan(1200);
    expect(t.kcal).toBe(t.tdee);
    const f = calcTargets({ heightCm: 155, age: 60, sex: 'female', activity: 'sedentary', goal: 'fasting', weightKg: 45 });
    expect(f.kcal).toBeLessThanOrEqual(f.tdee);
  });

  test('protein stays reasonable for heavy bodyweights; fat and carbs stay non-negative', () => {
    for (const p of [
      { heightCm: 165, age: 35, sex: 'female', activity: 'sedentary', goal: 'lose', weightKg: 120 },
      { heightCm: 180, age: 30, sex: 'male', activity: 'sedentary', goal: 'lose', weightKg: 250 },
      { heightCm: 150, age: 70, sex: 'female', activity: 'sedentary', goal: 'fasting', weightKg: 45 },
    ]) {
      const t = calcTargets(p);
      expect((t.protein * 4) / t.kcal).toBeLessThanOrEqual(0.351);
      expect(t.protein).toBeLessThanOrEqual(Math.round(2.2 * 25 * (p.heightCm / 100) ** 2));
      expect(t.fat).toBeGreaterThanOrEqual(0);
      expect(t.carbs).toBeGreaterThanOrEqual(0);
    }
  });

  test('a target of 0 is not ok for any intake', () => {
    expect(macroStatus(0, 0)).toBe('ok');
    expect(macroStatus(50, 0)).toBe('over');
    expect(macroStatus(50, null)).toBe('ok');
  });
});

describe('B14 / B17 / B18 / B19 tiers', () => {
  const male80 = { sex: 'male', bodyweight: 80 };

  test('0kg kg-lift logs give no value', () => {
    expect(liftValueFromEntries('squat', [e('squat', 0, { reps: 5 })], 80)).toBeNull();
    expect(liftValueFromEntries('bench_press', [e('bench_press', -10, { reps: 5 })], 80)).toBeNull();
  });

  test('assisted pull-ups give a negative added weight', () => {
    const v = liftValueFromEntries('weighted_pull_up', [e('pull_up', -30, { reps: 5 })], 80);
    expect(v).toBe(round1(50 * (1 + 5 / 30) - 80));
    expect(v).toBeLessThan(0);
    expect(evaluate('weighted_pull_up', v, male80)).not.toBeNull();
    expect(liftValueFromEntries('weighted_pull_up', [e('pull_up', -30, { reps: 5 })], null)).toBeNull();
    expect(liftValueFromEntries('weighted_pull_up', [e('pull_up', -90, { reps: 5 })], 80)).toBeNull();
  });

  test('bodyweight outside the table is flagged, shapes unchanged', () => {
    const inside = evaluate('squat', 100, male80);
    expect(inside).toMatchObject({ outOfRange: false, usedBodyweight: 80 });
    const heavy = evaluate('squat', 100, { sex: 'male', bodyweight: 250 });
    expect(heavy.outOfRange).toBe(true);
    expect(heavy.usedBodyweight).toBeLessThan(250);
    expect(bodyweightRange('total', { sex: 'male', bodyweight: 30 }).outOfRange).toBe(true);
    const t = thresholdsFor('bench_press', male80);
    expect(t).toHaveLength(5);
    expect(Object.keys(t)).toEqual(['0', '1', '2', '3', '4']);
    expect(t.outOfRange).toBe(false);
    expect(thresholdsFor('total', { sex: 'female', bodyweight: 300 }).outOfRange).toBe(true);
  });

  test('no bodyweight or no number -> no tier', () => {
    for (const bodyweight of [null, undefined, NaN, 0]) {
      expect(evaluate('squat', 100, { sex: 'male', bodyweight })).toBeNull();
      expect(thresholdsFor('total', { sex: 'male', bodyweight })).toBeNull();
    }
    expect(evaluate('squat', NaN, male80)).toBeNull();
    expect(rankForPercentile(NaN)).toBe(0);
    expect(topPercentText(NaN)).toBe('');
    expect(topPercentText(88)).toBe('상위 12%');
  });
});

describe('B19 / B20 cardio values', () => {
  test('only plain numbers are accepted', () => {
    expect(cleanMetricValue('incline', ' ')).toBeNull();
    expect(cleanMetricValue('incline', '0x10')).toBeNull();
    expect(cleanMetricValue('incline', '1e1')).toBeNull();
    expect(cleanMetricValue('incline', true)).toBeNull();
    expect(cleanMetricValue('incline', '-1')).toBeNull();
    expect(cleanMetricValue('incline', ' 3 ')).toBe(3);
    expect(cleanMetricValue('speed', '6.')).toBe(6);
    expect(cleanMetricValue('speed', '.5')).toBe(0.5);
    expect(cleanMetricValue('speed', 6.555)).toBe(6.56);
    expect(cleanMetricValue('level', '2.5')).toBe(3); // whole-number metrics are rounded
    expect(cleanMetricValue('speed', Infinity)).toBeNull();
  });

  test('prototype keys are not metrics or muscles', () => {
    expect(isMetricId('constructor')).toBe(false);
    expect(isMetricId('time')).toBe(true);
    expect(cleanMetricValue('constructor', '5')).toBeNull();
    expect(metricError('toString', 5)).toBe('측정 항목이 올바르지 않습니다');
    expect(metricText('constructor')).toBe('constructor');
    expect(formatMetrics(['bogus', 'constructor', 'time'], { bogus: 1, time: 30 })).toBe('30분');
    expect(isMuscleId('constructor')).toBe(false);
    expect(isMuscleId('chest')).toBe(true);
    const custom = toCustomExercise({ id: 7, name: 'x', category: 'free', primaryMuscles: ['constructor'] });
    expect(() => searchExercises('x', { allowed: ['free'] })).not.toThrow();
    expect(toCustomExercise({ id: 8, name: 'y', category: 'cardio', metrics: ['constructor', 'time'] }).metrics).toEqual(['time']);
    expect(custom.muscles.primary).toEqual(['constructor']);
  });
});

describe('B22 weekly cardio sessions', () => {
  test('two cardio entries on one day are one session', () => {
    const run = (exercise, time) => ({ exercise, weight: 0, unit: 'kg', sets: 0, reps: 0, metrics: { time } });
    const ws = [w('2026-11-02', [run('treadmill_run', 20), run('stationary_bike', 15)]), w('2026-11-04', [run('outdoor_run', 30)])];
    expect(weeklyCardio(ws, { today: '2026-11-05' })).toEqual({ minutes: 65, sessions: 2 });
  });
});

describe('B21 search while typing Korean', () => {
  const ids = (q) => searchExercises(q).map((x) => x.id);

  test('half-typed syllables still find the exercise', () => {
    expect(ids('벤ㅊ')).toContain('bench_press');
    expect(ids('벤치ㅍ')).toContain('bench_press');
    expect(ids('스쿼ㅌ')).toContain('squat');
    expect(ids('덷')).toContain('deadlift');
    expect(ids('덷')[0]).toBe('deadlift');
  });

  test('a lone jamo does not empty the list', () => {
    expect(searchExercises('ㅂ')).toHaveLength(searchExercises('').length);
  });

  test('initial consonants, NFD input, dashes and underscores', () => {
    expect(ids('ㅂㅊㅍㄹㅅ')).toContain('bench_press');
    expect(ids('ㅅㅋㅌ')).toContain('squat');
    expect(ids('벤치'.normalize('NFD'))).toContain('bench_press');
    expect(ids('bench-press')).toContain('bench_press');
    expect(ids('bench_press')).toContain('bench_press');
  });

  test('whole muscle terms rank above terms that only contain the query', () => {
    // '배' is the 복근 term; '광배' (lats) only contains it
    const list = searchExercises('배');
    const firstLats = list.findIndex((x) => x.muscles.primary.includes('lats') && !x.muscles.primary.includes('abs') && !x.name.includes('배'));
    const lastAbs = list.findLastIndex((x) => x.muscles.primary.includes('abs') && !x.name.includes('배'));
    expect(firstLats).toBeGreaterThan(lastAbs);
  });
});

describe('K5 date helpers always terminate', () => {
  test('ranges and formatting', () => {
    expect(dateRange('2026-11-02', '2026-11-04')).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
    expect(dateRange('2026-11-04', '2026-11-02')).toEqual([]);
    expect(dateRange('garbage', '2026-11-02')).toEqual([]);
    expect(dateRange('2026-11-02', '')).toEqual([]);
    expect(dateRange('0001-01-01', '9999-12-31').length).toBeLessThanOrEqual(146101);
    expect(formatDate(parseDate('0099-03-04'))).toBe('0099-03-04');
    expect(addDays('0050-12-31', 1)).toBe('0051-01-01');
    expect(daysInMonth('0004-02-01')).toBe(29);
    expect(addDays('nope', 1)).toBe('');
    expect(Number.isNaN(diffDays('x', '2026-01-01'))).toBe(true);
    expect(startOfWeek('2100-12-31')).toBe('2100-12-27');
  });

  test('stats helpers with odd dates do not hang', () => {
    const ws = [w('garbage', [e('squat', 100)]), w('0001-01-01', [e('squat', 100)]), w('2026-11-02', [e('squat', 100)])];
    expect(weekStreak(ws, { today: '2026-11-05', weeklyGoal: 1 }).weeks).toBe(1);
    expect(weekStreak(ws, { today: 'garbage', weeklyGoal: 1 }).weeks).toBe(0);
    expect(monthCalendar(ws, { today: '2026-02-10' }).cells).toHaveLength(28);
    expect(monthCalendar(ws, { today: 'bad' }).cells).toEqual([]);
    expect(monthlyProgress(ws, { today: 'bad', routine: { 1: { exercises: ['squat'] } }, useRoutine: true }).adherence).toBeNull();
  });
});
