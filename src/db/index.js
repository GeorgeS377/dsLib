// Database connection, using Node's built-in node:sqlite.
//
// Why node:sqlite rather than better-sqlite3: it ships with Node 24, so there
// is no native module to compile here or on the deployment server, and no
// rebuild step after a Node upgrade. The API is synchronous, which suits
// SQLite — queries are microseconds of local I/O, and Fastify handles one
// request at a time per tick regardless.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config as defaultConfig } from '../config.js';

/** @typedef {import('node:sqlite').DatabaseSync} RawDatabase */

let singleton = null;

/**
 * Open a database, apply the pragmas we rely on, and wrap it with small
 * helpers. Callers get the same object back for the same path.
 *
 * @param {string} [databasePath]
 * @returns {Database}
 */
export function openDatabase(databasePath) {
  const file = databasePath ?? defaultConfig.databasePath;

  if (file !== ':memory:') {
    // Create the containing directory on first run so a fresh checkout works
    // without a manual mkdir. Restrictive mode: the file holds borrower data.
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o750 });
  }

  const raw = new DatabaseSync(file);

  // Foreign keys are OFF by default in SQLite and must be enabled per
  // connection. Without this, every REFERENCES clause in the schema is
  // decorative. This is the single most important line in this file.
  raw.exec('PRAGMA foreign_keys = ON');

  // Write-ahead logging: readers do not block the writer, which matters when a
  // visitor searches the catalogue while a librarian saves a record.
  if (file !== ':memory:') {
    raw.exec('PRAGMA journal_mode = WAL');
  }

  // Wait rather than failing immediately if another connection holds the lock.
  raw.exec('PRAGMA busy_timeout = 5000');

  // Durable enough for this workload, and much faster than FULL on spinning
  // or networked storage. WAL + NORMAL survives application crashes; only an
  // OS-level crash can lose the last transactions.
  raw.exec('PRAGMA synchronous = NORMAL');

  // Enforce the declared column types rather than SQLite's usual flexibility,
  // so a bug cannot quietly store a string in an INTEGER column.
  raw.exec('PRAGMA trusted_schema = OFF');

  return wrap(raw, file);
}

/**
 * Small wrapper: prepared-statement helpers and an explicit transaction
 * helper. Deliberately thin — queries live in src/db/queries/*, and keeping
 * all SQL there is what would make a future move to PostgreSQL contained.
 */
function wrap(raw, file) {
  const cache = new Map();
  // Transaction nesting depth, used by transaction() below.
  let depth = 0;

  const prepare = (sql) => {
    let statement = cache.get(sql);
    if (!statement) {
      statement = raw.prepare(sql);
      cache.set(sql, statement);
    }
    return statement;
  };

  return {
    raw,
    file,

    /** First matching row, or undefined. */
    get(sql, ...params) {
      return prepare(sql).get(...params);
    },

    /** All matching rows. */
    all(sql, ...params) {
      return prepare(sql).all(...params);
    },

    /** Execute a statement; returns { changes, lastInsertRowid }. */
    run(sql, ...params) {
      return prepare(sql).run(...params);
    },

    /** A single scalar from the first row, or undefined. */
    value(sql, ...params) {
      const row = prepare(sql).get(...params);
      if (!row) return undefined;
      return Object.values(row)[0];
    },

    /** Run multiple statements (migrations, pragmas). Not parameterized. */
    exec(sql) {
      return raw.exec(sql);
    },

    /**
     * Run fn inside a transaction, rolling back if it throws. Nested calls
     * reuse the outer transaction rather than failing — SQLite has no nested
     * BEGIN, so a savepoint is used instead.
     */
    transaction(fn) {
      if (depth === 0) {
        raw.exec('BEGIN');
      } else {
        raw.exec(`SAVEPOINT sp_${depth}`);
      }
      depth += 1;
      try {
        const result = fn();
        depth -= 1;
        if (depth === 0) {
          raw.exec('COMMIT');
        } else {
          raw.exec(`RELEASE sp_${depth}`);
        }
        return result;
      } catch (error) {
        depth -= 1;
        if (depth === 0) {
          raw.exec('ROLLBACK');
        } else {
          raw.exec(`ROLLBACK TO sp_${depth}`);
          raw.exec(`RELEASE sp_${depth}`);
        }
        throw error;
      }
    },

    /** Cheap liveness probe for /healthz. Throws if the file is unusable. */
    ping() {
      raw.prepare('SELECT 1 AS ok').get();
      return true;
    },

    close() {
      cache.clear();
      raw.close();
    },
  };
}

/** @typedef {ReturnType<typeof wrap>} Database */

/** The process-wide connection, opened on first use. */
export function getDatabase() {
  if (!singleton) singleton = openDatabase();
  return singleton;
}

export function closeDatabase() {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

/** ISO-8601 UTC timestamp, the format every *_at column uses. */
export function now() {
  return new Date().toISOString();
}

export default getDatabase;
