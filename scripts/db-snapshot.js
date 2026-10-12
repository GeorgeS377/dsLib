#!/usr/bin/env node
// Write a consistent snapshot of the database to a new file, and verify it.
//
// Used by backup.sh when the sqlite3 CLI is not installed — which is the
// normal case on a minimal server, since the application itself needs only
// Node. Exists as a file rather than an inline `node -e` so the SQL and the
// paths are not run through shell quoting.
//
// Usage:
//   node scripts/db-snapshot.js <source.db> <target.db>
//   node scripts/db-snapshot.js --check <file.db>
//   node scripts/db-snapshot.js --versions <file.db>
//
// VACUUM INTO is the right tool here: it writes a consistent, compacted copy
// of a live database, including anything still in the write-ahead log. A
// plain file copy can capture a torn write and produce a backup that only
// fails when someone needs it.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

function integrityOf(file) {
  // Not read-only: SQLite needs to touch the -shm sidecar to read a database
  // in WAL mode, so a read-only handle fails with "unable to open database
  // file" on exactly the databases this app creates.
  const db = new DatabaseSync(file);
  try {
    return db.prepare('PRAGMA integrity_check').get().integrity_check;
  } finally {
    db.close();
  }
}

function snapshot(source, target) {
  if (!fs.existsSync(source)) {
    throw new Error(`no database at ${source}`);
  }
  if (fs.existsSync(target)) {
    throw new Error(`${target} already exists; refusing to overwrite it`);
  }

  const db = new DatabaseSync(source);
  try {
    // A bound parameter, so a path containing a quote cannot break the SQL.
    db.prepare('VACUUM INTO ?').run(target);
  } finally {
    db.close();
  }

  const result = integrityOf(target);
  if (result !== 'ok') {
    throw new Error(`the snapshot failed its integrity check: ${result}`);
  }
  return result;
}

/** Which migrations a database file contains, for a backup manifest. */
function versionsOf(file) {
  const db = new DatabaseSync(file);
  try {
    const rows = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    return rows.length > 0 ? rows.map((row) => row.version).join(', ') : '(none)';
  } catch {
    // A database from before the migration ledger existed.
    return '(no migration ledger)';
  } finally {
    db.close();
  }
}

// Only act as a CLI when run directly. Without this guard, importing the
// module — as test/backup.test.js does to exercise the helpers — executes the
// argument parsing against the importer's argv and sets a failing exit code.
const invokedDirectly =
  process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;

const args = process.argv.slice(2);

if (invokedDirectly) {
  try {
    runCli(args);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

function runCli() {
  if (args[0] === '--check') {
    const file = args[1];
    if (!file) throw new Error('usage: db-snapshot.js --check <file.db>');
    process.stdout.write(`${integrityOf(file)}\n`);
  } else if (args[0] === '--versions') {
    const file = args[1];
    if (!file) throw new Error('usage: db-snapshot.js --versions <file.db>');
    process.stdout.write(`${versionsOf(file)}\n`);
  } else {
    const [source, target] = args;
    if (!source || !target) {
      throw new Error('usage: db-snapshot.js <source.db> <target.db>');
    }
    snapshot(source, target);
    process.stdout.write('ok\n');
  }
}

export { integrityOf, snapshot, versionsOf };
