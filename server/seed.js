// Writes demo data into the database: the throwaway demo account and a few public sample users.
import { RECOMMENDED_IDS } from '../src/shared/extensions.js';
import { addDays } from '../src/shared/date.js';
import { transaction } from './db.js';
import { DEMO_ROUTINE, DEMO_ROUTINE_ALT, buildDemoData } from './demoData.js';
import { checkWorkoutAchievements, ensureSettings, notify, saveRoutineDays } from './data.js';
import { entryRow } from './routes/workouts.js';

function insertWorkouts(db, userId, workouts) {
  const insW = db.prepare('INSERT INTO workouts (user_id, date, split_name, memo) VALUES (?, ?, ?, ?)');
  const insE = db.prepare(
    'INSERT INTO workout_entries (workout_id, exercise, weight, unit, sets, reps, rating, program, position, metrics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const w of workouts) {
    const { lastInsertRowid } = insW.run(userId, w.date, w.splitName, w.memo);
    w.entries.forEach((e, i) => {
      const row = entryRow(e);
      insE.run(lastInsertRowid, e.exercise, row.weight, row.unit, row.sets, row.reps, e.rating ?? null, row.program, i, row.metrics);
    });
  }
}

function insertRoutine(db, userId, name, days, active, since) {
  const id = db
    .prepare('INSERT INTO routines (user_id, name, is_active, activated_at) VALUES (?, ?, ?, ?)')
    .run(userId, name, active ? 1 : 0, active ? since : null).lastInsertRowid;
  saveRoutineDays(db, id, days);
}

// A sample username that someone already took (older databases) gets a suffix instead of failing.
function freeUsername(db, name) {
  const taken = db.prepare('SELECT 1 FROM users WHERE username = ?');
  for (let i = 0; ; i++) {
    const candidate = i ? `${name.slice(0, 17)}_${i}` : name;
    if (!taken.get(candidate)) return candidate;
  }
}

function enableExtensions(db, userId, ids) {
  const ins = db.prepare('INSERT OR REPLACE INTO user_extensions (user_id, extension_id, enabled) VALUES (?, ?, 1)');
  for (const id of ids) ins.run(userId, id);
}

const SAMPLE_USERS = [
  { username: 'bench_kim', name: '김벤치', bio: '벤치 100kg 도전 중 · 5x5 3개월차', seed: 7, scale: 1.15, isPublic: true },
  { username: 'squat_lee', name: '이스쿼트', bio: '하체는 배신하지 않는다', seed: 11, scale: 1.3, isPublic: true },
  { username: 'routine_choi', name: '최루틴', bio: '퇴근 후 헬스 · 주 4회', seed: 23, scale: 0.8, isPublic: true },
  { username: 'dead_park', name: '박데드', bio: '기록은 비공개로 관리해요', seed: 31, scale: 1.4, isPublic: false },
];

export const SAMPLE_USERNAMES = SAMPLE_USERS.map((s) => s.username);

/** Public sample accounts so search/follow/peek have something to show. Created once (missing ones are added). */
export function ensureSampleUsers(db, today) {
  const existing = db.prepare('SELECT id, username FROM users WHERE is_sample = 1 ORDER BY id').all();
  if (existing.length >= SAMPLE_USERS.length) return existing;
  return transaction(db, () => [
    ...existing,
    ...SAMPLE_USERS.slice(existing.length).map((s) => {
      const id = Number(
        db
          .prepare('INSERT INTO users (username, display_name, bio, is_sample) VALUES (?, ?, ?, 1)')
          .run(freeUsername(db, s.username), s.name, s.bio).lastInsertRowid,
      );
      ensureSettings(db, id);
      db.prepare('UPDATE user_settings SET is_public = ? WHERE user_id = ?').run(s.isPublic ? 1 : 0, id);
      insertWorkouts(db, id, buildDemoData(today, { seed: s.seed, scale: s.scale, skip: 0.1 }).workouts);
      insertRoutine(db, id, '5x5 루틴', DEMO_ROUTINE, true, addDays(today, -364));
      enableExtensions(db, id, ['stronglifts5x5', ...RECOMMENDED_IDS]);
      return { id, username: s.username };
    }),
  ]);
}

export function seedUser(db, userId, today) {
  const { workouts, bodyWeights } = buildDemoData(today);
  const samples = ensureSampleUsers(db, today);
  transaction(db, () => {
    ensureSettings(db, userId);
    db.prepare('UPDATE user_settings SET promo_opt_in = 1, goal_weight = 72, goal_weight_start = ? WHERE user_id = ?').run(
      bodyWeights[0]?.kg ?? null,
      userId,
    );
    insertWorkouts(db, userId, workouts);
    const insB = db.prepare('INSERT INTO body_weights (user_id, date, kg) VALUES (?, ?, ?)');
    for (const b of bodyWeights) insB.run(userId, b.date, b.kg);
    // The demo history covers the last year, all on this routine.
    insertRoutine(db, userId, 'PPL + 5x5', DEMO_ROUTINE, true, addDays(today, -364));
    insertRoutine(db, userId, '전신 3분할', DEMO_ROUTINE_ALT, false);
    enableExtensions(db, userId, [...RECOMMENDED_IDS, 'stronglifts5x5', 'tier', 'shaker']);
    db.prepare('UPDATE user_settings SET tier_profile = ? WHERE user_id = ?').run(JSON.stringify({ sex: 'male', bodyweight: 75 }), userId);
    const wash = db.prepare('INSERT OR IGNORE INTO shaker_washes (user_id, date) VALUES (?, ?)');
    for (const ago of [9, 6, 4, 2]) wash.run(userId, addDays(today, -ago));

    // Social: follow two sample users, one follows back.
    const [kim, lee, choi] = samples;
    const follow = db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)');
    follow.run(userId, kim.id);
    follow.run(userId, lee.id);
    follow.run(choi.id, userId);

    notify(db, userId, {
      type: 'promo',
      title: '체단실에 오신 것을 환영해요',
      body: 'StrongLift 5x5 익스텐션으로 체계적인 증량을 시작해 보세요.',
      data: { extensionId: 'stronglifts5x5' },
    });
    notify(db, userId, { type: 'follow', title: '최루틴님이 회원님을 팔로우하기 시작했어요', actorId: choi.id });
    notify(db, userId, {
      type: 'post',
      title: '김벤치님이 목표를 달성했어요',
      body: '벤치프레스 최고 중량 100kg 달성',
      data: { exercise: 'bench_press', kg: 100 },
      actorId: kim.id,
    });
  });
  // Achievements from the most recent sessions (PRs etc.) become unread notifications.
  const recent = workouts.slice(-3).map((w) => w.date);
  for (const date of recent) checkWorkoutAchievements(db, userId, date);
  // Older ones read already, so the badge only reflects the latest.
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND type IN ('promo', 'follow')").run(userId);
}
