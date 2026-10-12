// Migration runner.
//
// Migrations are plain .sql files in ./migrations, named NNN_description.sql
// and applied in filename order. Each runs inside a transaction and is
// recorded in schema_migrations, so running this twice is a no-op. There is no
// "down" migration by design: on a database holding real catalogue and loan
// records, rolling a schema backwards is more dangerous than restoring a
// backup, which is the documented procedure (see README).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

const CREATE_LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )
`;

/** List migration files on disk, in apply order. */
export function listMigrations(dir = migrationsDir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(dir, name), 'utf8');
      return {
        version: name.replace(/\.sql$/, ''),
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex').slice(0, 16),
      };
    });
}

/**
 * Apply every migration that has not run yet.
 *
 * @param {{ exec: (sql: string) => void, all: Function, run: Function, transaction: Function }} db
 * @param {{ dir?: string, onApply?: (version: string) => void }} [options]
 * @returns {string[]} versions applied by this call
 */
export function migrate(db, { dir = migrationsDir, onApply } = {}) {
  db.exec(CREATE_LEDGER);

  const applied = new Map(
    db.all('SELECT version, checksum FROM schema_migrations').map((r) => [r.version, r.checksum]),
  );
  const available = listMigrations(dir);
  const justApplied = [];

  for (const migration of available) {
    const previousChecksum = applied.get(migration.version);

    if (previousChecksum !== undefined) {
      // An already-applied migration whose file has changed means someone
      // edited history. Refuse rather than silently diverge from the schema
      // the database actually has.
      if (previousChecksum !== migration.checksum) {
        throw new Error(
          `Migration ${migration.version} has changed since it was applied ` +
            `(recorded ${previousChecksum}, found ${migration.checksum}). ` +
            'Applied migrations must not be edited — add a new migration instead.',
        );
      }
      continue;
    }

    db.transaction(() => {
      db.exec(migration.sql);
      db.run(
        'INSERT INTO schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)',
        migration.version,
        migration.checksum,
        new Date().toISOString(),
      );
    });

    justApplied.push(migration.version);
    onApply?.(migration.version);
  }

  return justApplied;
}

/** Report which migrations are applied and which are outstanding. */
export function migrationStatus(db, { dir = migrationsDir } = {}) {
  db.exec(CREATE_LEDGER);
  const applied = new Set(db.all('SELECT version FROM schema_migrations').map((r) => r.version));
  return listMigrations(dir).map(({ version }) => ({
    version,
    applied: applied.has(version),
  }));
}

// Allow `npm run migrate` to apply migrations without starting the server.
if (process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`) {
  const { getDatabase, closeDatabase } = await import('./index.js');
  const db = getDatabase();
  try {
    const versions = migrate(db, { onApply: (v) => console.log(`applied ${v}`) });
    console.log(
      versions.length > 0
        ? `Done. ${versions.length} migration(s) applied.`
        : 'Already up to date; nothing to apply.',
    );
    for (const { version, applied } of migrationStatus(db)) {
      console.log(`  ${applied ? '✓' : '·'} ${version}`);
    }
  } catch (error) {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

export default migrate;
