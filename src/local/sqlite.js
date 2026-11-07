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
    this.db.dirty = true;
    return { changes, lastInsertRowid: rowid };
  }
}

export class DatabaseSync {
  constructor() {
    if (!SQL) throw new Error('SQLite engine not initialised');
    this.raw = new SQL.Database(initialBytes || undefined);
    this.isTransaction = false;
    this.dirty = false;
    lastDb = this;
  }

  prepare(sql) {
    return new StatementSync(this, sql);
  }

  exec(sql) {
    const head = sql.trim().toUpperCase();
    this.raw.exec(sql);
    if (head.startsWith('BEGIN')) this.isTransaction = true;
    else if (head.startsWith('COMMIT') || head.startsWith('ROLLBACK')) this.isTransaction = false;
    else this.dirty = true;
  }

  export() {
    return this.raw.export();
  }
}
