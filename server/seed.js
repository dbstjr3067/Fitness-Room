// Writes the demo data for a user into the database.
import { RECOMMENDED_IDS } from '../src/shared/extensions.js';
import { transaction } from './db.js';
import { buildDemoData } from './demoData.js';

export function seedUser(db, userId, today) {
  const { routine, workouts, bodyWeights } = buildDemoData(today);
  transaction(db, () => {
    db.prepare('DELETE FROM workouts WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM body_weights WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM routine_days WHERE user_id = ?').run(userId);
    const insW = db.prepare('INSERT INTO workouts (user_id, date, split_name, memo) VALUES (?, ?, ?, ?)');
    const insE = db.prepare(
      'INSERT INTO workout_entries (workout_id, exercise, weight, unit, sets, reps) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const w of workouts) {
      const { lastInsertRowid } = insW.run(userId, w.date, w.splitName, w.memo);
      for (const e of w.entries) insE.run(lastInsertRowid, e.exercise, e.weight, e.unit, e.sets, e.reps);
    }
    const insB = db.prepare('INSERT INTO body_weights (user_id, date, kg) VALUES (?, ?, ?)');
    for (const b of bodyWeights) insB.run(userId, b.date, b.kg);
    const insR = db.prepare(
      'INSERT INTO routine_days (user_id, weekday, split_name, exercises) VALUES (?, ?, ?, ?)',
    );
    for (const [wd, day] of Object.entries(routine)) {
      insR.run(userId, Number(wd), day.splitName, JSON.stringify(day.exercises));
    }
    const insX = db.prepare(
      'INSERT OR REPLACE INTO user_extensions (user_id, extension_id, enabled) VALUES (?, ?, 1)',
    );
    for (const id of RECOMMENDED_IDS) insX.run(userId, id);
  });
}
