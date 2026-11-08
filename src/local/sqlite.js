// node:sqlite's DatabaseSync API on top of sql.js (SQLite compiled to WebAssembly).
// The engine and any saved database bytes are provided by setEngine() before the server opens the DB.

let SQL = null;
let initialBytes = null;
let lastDb = null;

export function setEngine(sqlJs, bytes) {
  SQL = sqlJs;
  initialBytes = bytes || null;
}

export function currentDatabase() {
  return lastDb;
}

const DML = /^\s*(INSERT|UPDATE|DELETE|REPLACE|SELECT|WITH)\b/i;
// Connection settings change no data, so they never mark the database for saving.
const CONNECTION_PRAGMA = /^\s*PRAGMA\s+(foreign_keys|busy_timeout|journal_mode)\s*=\s*\w+\s*;?\s*$/i;

function bindArgs(args) {
  return args.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v));
}

class StatementSync {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
  }

  get(...args) {
    const stmt = this.db.raw.prepare(this.sql);
    try {
      stmt.bind(bindArgs(args));
      return stmt.step() ? stmt.getAsObject() : undefined;
    } finally {
      stmt.free();
    }
  }

  all(...args) {
    const stmt = this.db.raw.prepare(this.sql);
    const rows = [];
    try {
      stmt.bind(bindArgs(args));
      while (stmt.step()) rows.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return rows;
  }

  run(...args) {
    this.db.raw.run(this.sql, bindArgs(args));
    const changes = this.db.raw.getRowsModified();
    const rowid = this.db.raw.exec('SELECT last_insert_rowid() AS id')[0]?.values[0][0] ?? 0;
    // An INSERT/UPDATE/DELETE that matched nothing leaves the file as it was (no save needed).
    if (changes > 0 || !DML.test(this.sql)) this.db.changed();
    return { changes, lastInsertRowid: rowid };
  }
}

export class DatabaseSync {
  constructor() {
    if (!SQL) throw new Error('SQLite engine not initialised');
    this.raw = new SQL.Database(initialBytes || undefined);
    this.isTransaction = false;
    // Every change bumps `version`; the saver records the version it last wrote (see export()).
    this.version = 0;
    this.savedVersion = 0;
    lastDb = this;
  }

  /** True while there are changes that haven't been written to storage yet. */
  get dirty() {
    return this.version !== this.savedVersion;
  }

  set dirty(value) {
    if (value) this.changed();
    else this.savedVersion = this.version;
  }

  changed() {
    this.version++;
  }

  /** Call once the bytes from an export() taken at `version` are safely stored. */
  markSaved(version) {
    if (version > this.savedVersion) this.savedVersion = version;
  }

  prepare(sql) {
    return new StatementSync(this, sql);
  }

  exec(sql) {
    const head = sql.trim().toUpperCase();
    this.raw.exec(sql);
    if (head.startsWith('BEGIN')) this.isTransaction = true;
    else if (head.startsWith('COMMIT') || head.startsWith('ROLLBACK')) this.isTransaction = false;
    else if (!CONNECTION_PRAGMA.test(sql)) this.changed();
  }

  /**
   * The database file's bytes. sql.js closes and reopens the connection to read the file, which
   * resets connection settings — PRAGMA foreign_keys would fall back to OFF and ON DELETE CASCADE
   * would silently stop working — so they're restored right after.
   */
  export() {
    if (this.isTransaction) throw new Error('cannot export during a transaction');
    const fk = this.raw.exec('PRAGMA foreign_keys')[0]?.values[0][0];
    const bytes = this.raw.export();
    this.raw.exec(`PRAGMA foreign_keys = ${fk ? 'ON' : 'OFF'}`);
    return bytes;
  }
}
