// Tier records, automatic updates from workout logs, and promotions.
import { addDays } from '../src/shared/date.js';
import { TIER_LIFTS, describeRank, evaluate, getTierLift, liftValueFromEntries } from '../src/shared/tiers.js';
import { transaction } from './db.js';
import { loadBodyWeights, loadWorkouts, readSettings, recordAchievements } from './data.js';

const TOTAL_PARTS = getTierLift('total').parts;

/** Sex and bodyweight used for percentiles: the tier profile first, then CalTrack / WeightTrack. */
export function tierProfile(db, userId) {
  const s = readSettings(db, userId);
  const own = s.tierProfile || {};
  const bw = loadBodyWeights(db, userId);
  const sex = own.sex || s.calProfile?.sex || null;
  const bodyweight = own.bodyweight || (bw.length ? bw[bw.length - 1].kg : null);
  return { sex, bodyweight, complete: Boolean(sex && bodyweight) };
}

function rowToRecord(r) {
  const d = describeRank(r.rank);
  return {
    lift: r.lift,
    value: r.value,
    percentile: r.percentile,
    rank: r.rank,
    label: d.label,
    tierId: d.tier.id,
    source: r.source,
    achievedOn: r.achieved_on,
  };
}

export function loadTierRecords(db, userId) {
  return db.prepare('SELECT * FROM tier_records WHERE user_id = ?').all(userId).map(rowToRecord);
}

export function unseenPromotions(db, userId) {
  return db
    .prepare('SELECT * FROM tier_promotions WHERE user_id = ? AND seen = 0 ORDER BY id')
    .all(userId)
    .map((p) => ({ id: p.id, lift: p.lift, fromRank: p.from_rank, toRank: p.to_rank, value: p.value, percentile: p.percentile }));
}

/**
 * Record a value if it beats the current best. Returns { record, improved, promotion }.
 * A higher rank than before (or a first placement) creates a promotion for the 승급 screen.
 */
function applyValue(db, userId, liftId, value, { source, date, profile }) {
  const result = evaluate(liftId, value, profile);
  if (!result) return { record: null, improved: false, promotion: null };
  const cur = db.prepare('SELECT * FROM tier_records WHERE user_id = ? AND lift = ?').get(userId, liftId);
  if (cur && value <= cur.value) return { record: rowToRecord(cur), improved: false, promotion: null };
  db.prepare(
    `INSERT INTO tier_records (user_id, lift, value, percentile, rank, source, achieved_on, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, lift) DO UPDATE SET value = excluded.value, percentile = excluded.percentile,
       rank = excluded.rank, source = excluded.source, achieved_on = excluded.achieved_on, updated_at = excluded.updated_at`,
  ).run(userId, liftId, value, result.percentile, result.rank, source, date);
  let promotion = null;
  if (!cur || result.rank > cur.rank) {
    const id = Number(
      db
        .prepare('INSERT INTO tier_promotions (user_id, lift, from_rank, to_rank, value, percentile) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, liftId, cur ? cur.rank : null, result.rank, value, result.percentile).lastInsertRowid,
    );
    promotion = { id, lift: liftId, fromRank: cur ? cur.rank : null, toRank: result.rank, value, percentile: result.percentile };
    const before = cur ? describeRank(cur.rank).tier.id : null;
    if (before !== result.tier.id) {
      recordAchievements(db, userId, [
        {
          key: `tier:${liftId}:${result.tier.id}`,
          kind: 'tier',
          title: `${getTierLift(liftId).name} ${result.tier.name} 달성`,
          data: { lift: liftId, tier: result.tier.id, value },
        },
      ]);
    }
  }
  const row = db.prepare('SELECT * FROM tier_records WHERE user_id = ? AND lift = ?').get(userId, liftId);
  return { record: rowToRecord(row), improved: true, promotion };
}

// 3대 합계 = sum of the best squat, bench and deadlift once all three exist.
function updateTotal(db, userId, { source, date, profile }) {
  const parts = TOTAL_PARTS.map((l) => db.prepare('SELECT value FROM tier_records WHERE user_id = ? AND lift = ?').get(userId, l));
  if (parts.some((p) => !p)) return null;
  const total = Math.round(parts.reduce((s, p) => s + p.value, 0) * 10) / 10;
  return applyValue(db, userId, 'total', total, { source, date, profile });
}

export function submitTierValue(db, userId, liftId, value, { source = 'manual', date }) {
  const profile = tierProfile(db, userId);
  return transaction(db, () => {
    const res = applyValue(db, userId, liftId, value, { source, date, profile });
    const promotions = res.promotion ? [res.promotion] : [];
    if (res.improved && TOTAL_PARTS.includes(liftId)) {
      const t = updateTotal(db, userId, { source, date, profile });
      if (t?.promotion) promotions.push(t.promotion);
    }
    return { record: res.record, improved: res.improved, promotions };
  });
}

/**
 * Automatic update: logs from days that have ended (before `today`) and were not processed yet.
 * The best completed set per lift in that range is applied once. The first run over an existing
 * history only places the tiers (its promotions are marked as seen).
 */
export function processTierLogs(db, userId, today) {
  const profile = tierProfile(db, userId);
  if (!profile.complete) return [];
  const state = db.prepare('SELECT processed_through FROM tier_state WHERE user_id = ?').get(userId);
  const from = state?.processed_through ? addDays(state.processed_through, 1) : undefined;
  const to = addDays(today, -1);
  if (from && from > to) return [];
  const workouts = loadWorkouts(db, userId, { from, to });
  const promotions = [];
  transaction(db, () => {
    let partsChanged = false;
    for (const lift of TIER_LIFTS) {
      if (lift.parts) continue;
      let best = null;
      for (const w of workouts) {
        const v = liftValueFromEntries(lift.id, w.entries, profile.bodyweight);
        if (v !== null && (!best || v > best.value)) best = { value: v, date: w.date };
      }
      if (!best) continue;
      const res = applyValue(db, userId, lift.id, best.value, { source: 'log', date: best.date, profile });
      if (res.promotion) promotions.push(res.promotion);
      if (res.improved && TOTAL_PARTS.includes(lift.id)) partsChanged = true;
    }
    if (partsChanged) {
      const t = updateTotal(db, userId, { source: 'log', date: to, profile });
      if (t?.promotion) promotions.push(t.promotion);
    }
    db.prepare(
      'INSERT INTO tier_state (user_id, processed_through) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET processed_through = excluded.processed_through',
    ).run(userId, to);
    // The very first pass over an existing history is a quiet placement: no pile of 승급 screens.
    if (!state) {
      const seen = db.prepare('UPDATE tier_promotions SET seen = 1 WHERE id = ?');
      for (const p of promotions) seen.run(p.id);
    }
  });
  return state ? promotions : [];
}
