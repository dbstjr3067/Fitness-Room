// 티어: percentile against the frozen strength standards (tierData.js), shown as LoL-style tiers.
import { STANDARDS, STANDARD_PERCENTILES } from './tierData.js';
import { toKg, round1 } from './stats.js';

// Lifts that have a tier. `exercise` = which logged exercise feeds the automatic update.
export const TIER_LIFTS = [
  { id: 'total', name: '3대 합계', unit: 'kg', icon: 'deadlift', parts: ['squat', 'bench_press', 'deadlift'] },
  { id: 'squat', name: '스쿼트', unit: 'kg', icon: 'squat', exercise: 'squat', standard: 'squat' },
  { id: 'bench_press', name: '벤치프레스', unit: 'kg', icon: 'bench', exercise: 'bench_press', standard: 'bench_press' },
  { id: 'deadlift', name: '데드리프트', unit: 'kg', icon: 'deadlift', exercise: 'deadlift', standard: 'deadlift' },
  { id: 'overhead_press', name: '오버헤드 프레스', unit: 'kg', icon: 'press', exercise: 'overhead_press', standard: 'overhead_press' },
  { id: 'military_press', name: '밀리터리 프레스', unit: 'kg', icon: 'press', exercise: 'standing_military_press', standard: 'military_press' },
  { id: 'weighted_pull_up', name: '중량 풀업', unit: 'kg_added', icon: 'pullup', exercise: 'pull_up', standard: 'weighted_pull_up' },
  { id: 'weighted_dips', name: '중량 딥스', unit: 'kg_added', icon: 'dips', exercise: 'dips', standard: 'weighted_dips' },
  { id: 'pull_up_reps', name: '풀업 (횟수)', unit: 'reps', icon: 'pullup', exercise: 'pull_up', standard: 'pull_up_reps' },
  { id: 'dips_reps', name: '딥스 (횟수)', unit: 'reps', icon: 'dips', exercise: 'dips', standard: 'dips_reps' },
  { id: 'push_up_reps', name: '푸시업 (횟수)', unit: 'reps', icon: 'pushup', exercise: 'push_up', standard: 'push_up_reps' },
];

const byId = new Map(TIER_LIFTS.map((l) => [l.id, l]));
export const getTierLift = (id) => byId.get(id) || null;

// Percentile bands (low → high). Bronze–Diamond have divisions IV–I like LoL.
export const TIERS = [
  { id: 'bronze', name: '브론즈', min: 0, max: 20, divisions: true, color: '#b07a52' },
  { id: 'silver', name: '실버', min: 20, max: 40, divisions: true, color: '#a9b4c2' },
  { id: 'gold', name: '골드', min: 40, max: 60, divisions: true, color: '#e6b84a' },
  { id: 'platinum', name: '플래티넘', min: 60, max: 75, divisions: true, color: '#4fc1b5' },
  { id: 'emerald', name: '에메랄드', min: 75, max: 87, divisions: true, color: '#2fbf71' },
  { id: 'diamond', name: '다이아몬드', min: 87, max: 95, divisions: true, color: '#6c9cff' },
  { id: 'master', name: '마스터', min: 95, max: 98.5, divisions: false, color: '#b46be0' },
  { id: 'grandmaster', name: '그랜드마스터', min: 98.5, max: 99.5, divisions: false, color: '#ef5350' },
  { id: 'challenger', name: '챌린저', min: 99.5, max: 100.01, divisions: false, color: '#f5d061' },
];
const DIVISION_LABELS = ['IV', 'III', 'II', 'I'];

/** rank: 0 = 브론즈 IV … 23 = 다이아몬드 I, 24 마스터, 25 그랜드마스터, 26 챌린저 */
export function rankForPercentile(p) {
  if (Number.isNaN(Number(p))) return 0; // no number → lowest rank, never 챌린저
  let rank = 0;
  for (const t of TIERS) {
    if (p < t.max || t.id === 'challenger') {
      if (!t.divisions) return rank;
      const step = (t.max - t.min) / 4;
      return rank + Math.min(3, Math.max(0, Math.floor((p - t.min) / step)));
    }
    rank += t.divisions ? 4 : 1;
  }
  return rank;
}

export function describeRank(rank) {
  let r = 0;
  for (const t of TIERS) {
    const size = t.divisions ? 4 : 1;
    if (rank < r + size) {
      const division = t.divisions ? DIVISION_LABELS[rank - r] : null;
      return { tier: t, division, label: division ? `${t.name} ${division}` : t.name };
    }
    r += size;
  }
  const last = TIERS[TIERS.length - 1];
  return { tier: last, division: null, label: last.name };
}

// ---- percentile from the standards ----
function interpolateRow(rows, bodyweight) {
  const sorted = [...rows].sort((a, b) => a[0] - b[0]);
  if (bodyweight <= sorted[0][0]) return sorted[0].slice(1);
  if (bodyweight >= sorted.at(-1)[0]) return sorted.at(-1).slice(1);
  for (let i = 0; i < sorted.length - 1; i++) {
    const [a, b] = [sorted[i], sorted[i + 1]];
    if (bodyweight >= a[0] && bodyweight <= b[0]) {
      const f = (bodyweight - a[0]) / (b[0] - a[0]);
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * f);
    }
  }
  return sorted.at(-1).slice(1);
}

const validBodyweight = (bw) => typeof bw === 'number' && Number.isFinite(bw) && bw > 0;

function standardTable(lift, sex) {
  return (Object.prototype.hasOwnProperty.call(STANDARDS, lift.standard) && STANDARDS[lift.standard][sex === 'female' ? 'female' : 'male']) || null;
}

/**
 * Bodyweight the standards table actually uses: tables cover a limited range and outside it the nearest
 * row is used. Returns { outOfRange, usedBodyweight } (null without a lift table or a valid bodyweight).
 */
export function bodyweightRange(liftId, { sex, bodyweight } = {}) {
  const lift = getTierLift(liftId);
  if (!lift || !validBodyweight(bodyweight)) return null;
  const parts = lift.parts ? lift.parts.map(getTierLift) : [lift];
  const tables = parts.map((l) => standardTable(l, sex));
  if (tables.some((rows) => !rows?.length)) return null;
  // the range every table covers (the total needs all three)
  const lo = Math.max(...tables.map((rows) => Math.min(...rows.map((r) => r[0]))));
  const hi = Math.min(...tables.map((rows) => Math.max(...rows.map((r) => r[0]))));
  const usedBodyweight = Math.min(hi, Math.max(lo, bodyweight));
  return { outOfRange: usedBodyweight !== bodyweight, usedBodyweight };
}

/**
 * Thresholds (value at 5/20/50/80/95%) for a lift, sex and bodyweight. The total sums the three lifts.
 * null without a valid bodyweight. The array also carries non-enumerable `outOfRange` / `usedBodyweight`
 * (the bodyweight was outside the table and was clamped to its nearest row).
 */
export function thresholdsFor(liftId, { sex, bodyweight } = {}) {
  const lift = getTierLift(liftId);
  if (!lift || !validBodyweight(bodyweight)) return null;
  let t;
  if (lift.parts) {
    const parts = lift.parts.map((p) => thresholdsFor(p, { sex, bodyweight }));
    if (parts.some((p) => !p)) return null;
    t = parts[0].map((_, i) => parts.reduce((s, x) => s + x[i], 0));
  } else {
    const table = standardTable(lift, sex);
    if (!table) return null;
    t = interpolateRow(table, bodyweight);
  }
  const range = bodyweightRange(liftId, { sex, bodyweight });
  Object.defineProperty(t, 'outOfRange', { value: range.outOfRange, enumerable: false });
  Object.defineProperty(t, 'usedBodyweight', { value: range.usedBodyweight, enumerable: false });
  return t;
}

// Standard normal CDF (Abramowitz–Stegun approximation).
function phi(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/**
 * Percentile (0–100) of a value: straight lines between the five measured points,
 * a normal-shaped tail above the 95% point (so 마스터–챌린저 stay rare), and a line to 0 below 5%.
 */
export function percentileOf(liftId, value, profile) {
  const t = thresholdsFor(liftId, profile);
  if (!t || !Number.isFinite(value)) return null;
  const P = STANDARD_PERCENTILES;
  if (value >= t[4]) {
    const sd = Math.max((t[4] - t[3]) / (1.6449 - 0.8416), 1e-6);
    return Math.min(99.99, phi(1.6449 + (value - t[4]) / sd) * 100);
  }
  for (let i = 3; i >= 0; i--) {
    if (value >= t[i]) {
      const span = t[i + 1] - t[i];
      return span <= 0 ? P[i + 1] : P[i] + ((value - t[i]) / span) * (P[i + 1] - P[i]);
    }
  }
  const slope = (t[1] - t[0]) / (P[1] - P[0]) || 1;
  return Math.max(0, P[0] - (t[0] - value) / slope);
}

/**
 * Tier of a value, or null (unknown lift, no valid bodyweight, or no number).
 * `outOfRange` / `usedBodyweight`: the bodyweight was outside the standards table and its nearest row was used.
 */
export function evaluate(liftId, value, profile) {
  const percentile = percentileOf(liftId, value, profile);
  if (percentile === null) return null;
  const rank = rankForPercentile(percentile);
  const { outOfRange, usedBodyweight } = bodyweightRange(liftId, profile);
  return { value, percentile: round1(percentile), rank, ...describeRank(rank), outOfRange, usedBodyweight };
}

/** "상위 12%" style text ('' without a number) */
export function topPercentText(percentile) {
  if (typeof percentile !== 'number' || Number.isNaN(percentile)) return '';
  const top = Math.max(0.01, 100 - percentile);
  return `상위 ${top < 1 ? top.toFixed(2).replace(/0$/, '') : Math.round(top)}%`;
}

// ---- values from workout logs ----
export const MAX_REPS_FOR_E1RM = 12;

/** Epley estimated 1RM. */
export function estimate1RM(weightKg, reps) {
  if (!(weightKg > 0) || !(reps >= 1)) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

/**
 * Best value for a lift on one day's entries. Only completed sets (rating ≥ 2) count.
 * kg lifts need a positive weight; 중량 풀업/딥스 take added (> 0) or assisted (< 0) weight with a known bodyweight.
 */
export function liftValueFromEntries(liftId, entries, bodyweight) {
  const lift = getTierLift(liftId);
  if (!lift || lift.parts) return null;
  let best = null;
  for (const e of entries) {
    if (e.exercise !== lift.exercise || !(e.rating >= 2)) continue;
    const kg = toKg(e.weight, e.unit);
    const repsOk = e.reps >= 1 && e.reps <= MAX_REPS_FOR_E1RM;
    let v = null;
    if (lift.unit === 'reps') {
      if (kg === 0 && e.reps > 0) v = e.reps;
    } else if (lift.unit === 'kg_added') {
      if (kg !== 0 && repsOk && validBodyweight(bodyweight) && bodyweight + kg > 0) {
        v = estimate1RM(bodyweight + kg, e.reps) - bodyweight;
      }
    } else if (kg > 0 && repsOk) {
      v = estimate1RM(kg, e.reps);
    }
    if (v !== null && (best === null || v > best)) best = v;
  }
  return best === null ? null : round1(best);
}

export function formatLiftValue(liftId, value) {
  const lift = getTierLift(liftId);
  if (!lift) return String(value);
  if (lift.unit === 'reps') return `${value}회`;
  if (lift.unit === 'kg_added') return `${value >= 0 ? '+' : ''}${value}kg`;
  return `${value}kg`;
}
