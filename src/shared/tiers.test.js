import { describe, expect, test } from 'vitest';
import { STANDARDS } from './tierData.js';
import {
  TIERS,
  TIER_LIFTS,
  describeRank,
  estimate1RM,
  evaluate,
  liftValueFromEntries,
  percentileOf,
  rankForPercentile,
  thresholdsFor,
  topPercentText,
} from './tiers.js';

const male80 = { sex: 'male', bodyweight: 80 };
const e = (exercise, weight, reps, rating = 3, unit = 'kg') => ({ exercise, weight, reps, sets: 1, rating, unit });

describe('frozen strength standards', () => {
  test('every tier lift has male and female tables that increase with the level', () => {
    for (const lift of TIER_LIFTS.filter((l) => !l.parts)) {
      const s = STANDARDS[lift.standard];
      expect(s, lift.id).toBeTruthy();
      for (const sex of ['male', 'female']) {
        expect(s[sex].length).toBeGreaterThan(10);
        for (const row of s[sex]) {
          expect(row).toHaveLength(6);
          for (let i = 2; i < 6; i++) expect(row[i]).toBeGreaterThanOrEqual(row[i - 1]);
        }
      }
    }
  });
});

describe('ranks and labels', () => {
  test('bronze IV is the bottom, challenger the top; divisions run IV→I', () => {
    expect(describeRank(rankForPercentile(0)).label).toBe('브론즈 IV');
    expect(describeRank(rankForPercentile(19.9)).label).toBe('브론즈 I');
    expect(describeRank(rankForPercentile(20)).label).toBe('실버 IV');
    expect(describeRank(rankForPercentile(50)).label).toBe('골드 II');
    expect(describeRank(rankForPercentile(80)).label).toBe('에메랄드 III');
    expect(describeRank(rankForPercentile(96)).label).toBe('마스터');
    expect(describeRank(rankForPercentile(99)).label).toBe('그랜드마스터');
    expect(describeRank(rankForPercentile(99.9)).label).toBe('챌린저');
    expect(TIERS.map((t) => t.name)).toEqual(['브론즈', '실버', '골드', '플래티넘', '에메랄드', '다이아몬드', '마스터', '그랜드마스터', '챌린저']);
  });

  test('ranks never decrease as the percentile grows', () => {
    let prev = -1;
    for (let p = 0; p <= 100; p += 0.25) {
      const r = rankForPercentile(p);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
    expect(prev).toBe(26);
  });
});

describe('percentiles', () => {
  test('the measured points map back to 5/20/50/80/95%', () => {
    const t = thresholdsFor('bench_press', male80);
    expect(percentileOf('bench_press', t[0], male80)).toBeCloseTo(5);
    expect(percentileOf('bench_press', t[2], male80)).toBeCloseTo(50);
    expect(percentileOf('bench_press', t[4], male80)).toBeCloseTo(95);
  });

  test('interpolates bodyweight between table rows and clamps outside', () => {
    const rows = STANDARDS.squat.male;
    const at80 = rows.find((r) => r[0] === 80);
    expect(thresholdsFor('squat', male80)).toEqual(at80.slice(1));
    const t82 = thresholdsFor('squat', { sex: 'male', bodyweight: 82.5 });
    const at85 = rows.find((r) => r[0] === 85);
    expect(t82[2]).toBeCloseTo((at80[3] + at85[3]) / 2);
    expect(thresholdsFor('squat', { sex: 'male', bodyweight: 500 })).toEqual(rows.at(-1).slice(1));
  });

  test('heavier lifters need more weight for the same percentile; women use their own table', () => {
    expect(percentileOf('deadlift', 150, { sex: 'male', bodyweight: 60 })).toBeGreaterThan(percentileOf('deadlift', 150, { sex: 'male', bodyweight: 110 }));
    expect(percentileOf('bench_press', 60, { sex: 'female', bodyweight: 60 })).toBeGreaterThan(percentileOf('bench_press', 60, { sex: 'male', bodyweight: 60 }));
  });

  test('the tail above elite keeps 마스터~챌린저 rare', () => {
    const t = thresholdsFor('squat', male80);
    expect(evaluate('squat', t[4] * 1.05, male80).tier.id).toBe('master');
    expect(evaluate('squat', t[4] * 1.6, male80).tier.id).toBe('challenger');
    expect(percentileOf('squat', 0, male80)).toBe(0);
  });

  test('3대 합계 thresholds are the sum of the three lifts', () => {
    const parts = ['squat', 'bench_press', 'deadlift'].map((l) => thresholdsFor(l, male80));
    expect(thresholdsFor('total', male80)).toEqual(parts[0].map((_, i) => parts.reduce((s, p) => s + p[i], 0)));
  });

  test('top percent text', () => {
    expect(topPercentText(56.3)).toBe('상위 44%');
    expect(topPercentText(99.7)).toBe('상위 0.3%');
  });
});

describe('values from workout logs', () => {
  test('Epley estimated 1RM', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 1);
    expect(estimate1RM(0, 5)).toBe(0);
  });

  test('only completed sets count, high-rep sets are ignored for 1RM', () => {
    expect(liftValueFromEntries('bench_press', [e('bench_press', 100, 5, 1)], 80)).toBeNull();
    expect(liftValueFromEntries('bench_press', [e('bench_press', 100, 5, null)], 80)).toBeNull();
    expect(liftValueFromEntries('bench_press', [e('bench_press', 60, 20, 3)], 80)).toBeNull();
    expect(liftValueFromEntries('bench_press', [e('bench_press', 100, 5, 2), e('bench_press', 110, 1, 3)], 80)).toBe(116.7);
    expect(liftValueFromEntries('bench_press', [e('bench_press', 220, 5, 3, 'lbs')], 80)).toBeCloseTo(116.4, 1);
  });

  test('pull-ups: bodyweight sets give reps, weighted sets give added-weight 1RM', () => {
    const entries = [e('pull_up', 0, 12), e('pull_up', 20, 5)];
    expect(liftValueFromEntries('pull_up_reps', entries, 80)).toBe(12);
    // (80 + 20) × (1 + 5/30) − 80
    expect(liftValueFromEntries('weighted_pull_up', entries, 80)).toBeCloseTo(36.7, 1);
    expect(liftValueFromEntries('weighted_pull_up', entries, null)).toBeNull();
    expect(liftValueFromEntries('total', entries, 80)).toBeNull();
  });
});
