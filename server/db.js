import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Version 1: first release (single routine per user).
export const V1_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT,
  email TEXT,
  avatar_url TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS oauth_accounts (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  weekly_goal INTEGER NOT NULL DEFAULT 3,
  unit TEXT NOT NULL DEFAULT 'kg',
  theme TEXT NOT NULL DEFAULT 'dark'
);
CREATE TABLE IF NOT EXISTS user_extensions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extension_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, extension_id)
);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  split_name TEXT,
  memo TEXT
);
CREATE INDEX IF NOT EXISTS workouts_user_date ON workouts(user_id, date);
CREATE TABLE IF NOT EXISTS workout_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise TEXT NOT NULL,
  weight REAL NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  sets INTEGER NOT NULL,
  reps INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS body_weights (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  kg REAL NOT NULL,
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS routine_days (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  split_name TEXT,
  exercises TEXT NOT NULL,
  PRIMARY KEY (user_id, weekday)
);
`;

// Version 2: multiple routines, ratings/programs, social, notifications, meals, profile.
function migrateV2(db) {
  db.exec(`
    ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';
    ALTER TABLE users ADD COLUMN avatar_path TEXT;
    ALTER TABLE users ADD COLUMN recovery_email TEXT;
    ALTER TABLE users ADD COLUMN recovery_phone TEXT;
    ALTER TABLE users ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE user_settings ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1;
    ALTER TABLE user_settings ADD COLUMN promo_opt_in INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE user_settings ADD COLUMN goal_weight REAL;
    ALTER TABLE user_settings ADD COLUMN cal_profile TEXT;

    ALTER TABLE workout_entries ADD COLUMN rating INTEGER;
    ALTER TABLE workout_entries ADD COLUMN program TEXT;
    ALTER TABLE workout_entries ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

    CREATE TABLE routines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX routines_user ON routines(user_id);
    CREATE TABLE routine_days_v2 (
      routine_id INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      weekday INTEGER NOT NULL,
      split_name TEXT,
      exercises TEXT NOT NULL,
      PRIMARY KEY (routine_id, weekday)
    );

    CREATE TABLE follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (follower_id, followee_id)
    );
    CREATE INDEX follows_followee ON follows(followee_id);

    CREATE TABLE extension_likes (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      extension_id TEXT NOT NULL,
      PRIMARY KEY (user_id, extension_id)
    );
    CREATE TABLE extension_saves (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      extension_id TEXT NOT NULL,
      PRIMARY KEY (user_id, extension_id)
    );

    CREATE TABLE achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      shared INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, key)
    );

    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      achievement_id INTEGER REFERENCES achievements(id) ON DELETE CASCADE,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX notifications_user ON notifications(user_id, is_read);

    CREATE TABLE meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      time TEXT,
      name TEXT NOT NULL,
      kcal REAL NOT NULL,
      carbs REAL NOT NULL DEFAULT 0,
      protein REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX meals_user_date ON meals(user_id, date);
  `);

  // Old single routine -> a saved, active routine.
  const owners = db.prepare('SELECT DISTINCT user_id FROM routine_days').all();
  const insRoutine = db.prepare("INSERT INTO routines (user_id, name, is_active) VALUES (?, '기본 루틴', 1)");
  const insDay = db.prepare(
    'INSERT INTO routine_days_v2 (routine_id, weekday, split_name, exercises) VALUES (?, ?, ?, ?)',
  );
  for (const { user_id: uid } of owners) {
    const rid = insRoutine.run(uid).lastInsertRowid;
    for (const d of db.prepare('SELECT * FROM routine_days WHERE user_id = ?').all(uid)) {
      const exercises = JSON.parse(d.exercises).map((e) => (typeof e === 'string' ? { exercise: e, program: null } : e));
      insDay.run(rid, d.weekday, d.split_name, JSON.stringify(exercises));
    }
  }
  db.exec(`
    DROP TABLE routine_days;
    ALTER TABLE routine_days_v2 RENAME TO routine_days;
  `);

  // Extension ids renamed: bodyweight -> weighttrack, routine -> today (routine itself is now a core feature).
  db.exec(`
    UPDATE OR IGNORE user_extensions SET extension_id = 'weighttrack' WHERE extension_id = 'bodyweight';
    UPDATE OR IGNORE user_extensions SET extension_id = 'today' WHERE extension_id = 'routine';
    DELETE FROM user_extensions WHERE extension_id IN ('bodyweight', 'routine');
  `);

  // One log per day: merge duplicates into the earliest workout of that day.
  const dups = db
    .prepare('SELECT user_id, date, MIN(id) AS keep FROM workouts GROUP BY user_id, date HAVING COUNT(*) > 1')
    .all();
  for (const d of dups) {
    db.prepare(
      'UPDATE workout_entries SET workout_id = ? WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ? AND date = ? AND id != ?)',
    ).run(d.keep, d.user_id, d.date, d.keep);
    db.prepare('DELETE FROM workouts WHERE user_id = ? AND date = ? AND id != ?').run(d.user_id, d.date, d.keep);
  }
  db.exec(`
    DROP INDEX IF EXISTS workouts_user_date;
    CREATE UNIQUE INDEX workouts_user_date ON workouts(user_id, date);
  `);
}

const MIGRATIONS = [(db) => db.exec(V1_SCHEMA), migrateV2];

export function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    transaction(db, () => {
      MIGRATIONS[v](db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export function openDb(path = ':memory:') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

export function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
