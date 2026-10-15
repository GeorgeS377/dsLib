// Migrations and the database layer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { openDatabase } from '../src/db/index.js';
import { listMigrations, migrate, migrationStatus } from '../src/db/migrate.js';

describe('migrations', () => {
  it('finds the migration files in order', () => {
    const migrations = listMigrations();
    assert.ok(migrations.length >= 2);
    assert.deepEqual(
      migrations.map((m) => m.version),
      [...migrations.map((m) => m.version)].sort(),
    );
    assert.equal(migrations[0].version, '001_catalogue');
  });

  it('applies cleanly to an empty database', () => {
    const db = openDatabase(':memory:');
    const applied = migrate(db);
    // Read from the directory rather than listed here: a new migration is a
    // normal thing to add, and this test should check that all of them ran,
    // not that there are exactly the ones someone wrote down once.
    assert.deepEqual(applied, migrationNames());

    // Every table the application expects now exists.
    const tables = db
      .all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((r) => r.name);
    for (const expected of [
      'audit_log',
      'author',
      'book',
      'book_author',
      'book_category',
      'borrower',
      'category',
      'copy',
      'loan',
      'schema_migrations',
      'session',
      'staff_user',
    ]) {
      assert.ok(tables.includes(expected), `missing table ${expected}`);
    }
    db.close();
  });

  it('is idempotent — a second run applies nothing', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    assert.deepEqual(migrate(db), []);
    assert.deepEqual(migrate(db), []);
    db.close();
  });

  it('reports status for applied and outstanding migrations', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const status = migrationStatus(db);
    assert.ok(status.every((s) => s.applied));
    db.close();
  });

  it('refuses to run when an applied migration file has been edited', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dslib-mig-'));
    const file = path.join(dir, '001_test.sql');
    fs.writeFileSync(file, 'CREATE TABLE a (id INTEGER PRIMARY KEY);');

    const db = openDatabase(':memory:');
    migrate(db, { dir });

    // Editing history would leave the schema and the ledger disagreeing.
    fs.writeFileSync(file, 'CREATE TABLE a (id INTEGER PRIMARY KEY, extra TEXT);');
    assert.throws(() => migrate(db, { dir }), /has changed since it was applied/);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rolls back a failing migration rather than half-applying it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dslib-mig-'));
    fs.writeFileSync(
      path.join(dir, '001_broken.sql'),
      'CREATE TABLE good (id INTEGER PRIMARY KEY); THIS IS NOT SQL;',
    );

    const db = openDatabase(':memory:');
    assert.throws(() => migrate(db, { dir }));

    // The table from the first statement must not survive.
    const tables = db.all("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name);
    assert.ok(!tables.includes('good'), 'a failed migration left a table behind');
    assert.equal(db.value('SELECT COUNT(*) FROM schema_migrations'), 0);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the database file and its directory on first open', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dslib-open-'));
    const file = path.join(dir, 'nested', 'library.db');
    const db = openDatabase(file);
    migrate(db);
    db.close();
    assert.ok(fs.existsSync(file));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('database layer', () => {
  it('enforces foreign keys', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    // Without PRAGMA foreign_keys = ON this insert would succeed and the
    // schema's REFERENCES clauses would be decorative.
    assert.throws(
      () =>
        db.run(
          `INSERT INTO copy (book_id, status, created_at, updated_at)
           VALUES (9999, 'available', ?, ?)`,
          '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z',
        ),
      /FOREIGN KEY constraint failed/,
    );
    db.close();
  });

  it('rejects a copy status of on_loan — being on loan is derived', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const t = '2026-01-01T00:00:00.000Z';
    db.run('INSERT INTO book (title, created_at, updated_at) VALUES (?, ?, ?)', 'X', t, t);
    assert.throws(
      () =>
        db.run(
          `INSERT INTO copy (book_id, status, created_at, updated_at) VALUES (1, 'on_loan', ?, ?)`,
          t,
          t,
        ),
      /CHECK constraint failed/,
    );
    db.close();
  });

  it('rejects an implausible publication year', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const t = '2026-01-01T00:00:00.000Z';
    assert.throws(
      () =>
        db.run(
          'INSERT INTO book (title, publication_year, created_at, updated_at) VALUES (?, ?, ?, ?)',
          'X',
          3000,
          t,
          t,
        ),
      /CHECK constraint failed/,
    );
    db.close();
  });

  it('rejects an empty title', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    const t = '2026-01-01T00:00:00.000Z';
    assert.throws(
      () => db.run('INSERT INTO book (title, created_at, updated_at) VALUES (?, ?, ?)', '   ', t, t),
      /CHECK constraint failed/,
    );
    db.close();
  });

  it('commits a successful transaction', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    db.transaction(() => {
      db.run(
        'INSERT INTO category (name, name_norm, slug, created_at, updated_at) VALUES (?,?,?,?,?)',
        'A',
        'a',
        'a',
        'x',
        'x',
      );
    });
    assert.equal(db.value('SELECT COUNT(*) FROM category'), 1);
    db.close();
  });

  it('rolls a transaction back when the body throws', () => {
    const db = openDatabase(':memory:');
    migrate(db);
    assert.throws(() =>
      db.transaction(() => {
        db.run(
          'INSERT INTO category (name, name_norm, slug, created_at, updated_at) VALUES (?,?,?,?,?)',
          'A',
          'a',
          'a',
          'x',
          'x',
        );
        throw new Error('boom');
      }),
    );
    assert.equal(db.value('SELECT COUNT(*) FROM category'), 0);
    db.close();
  });

  it('supports nested transactions via savepoints', () => {
    const db = openDatabase(':memory:');
    migrate(db);

    db.transaction(() => {
      db.run(
        'INSERT INTO category (name, name_norm, slug, created_at, updated_at) VALUES (?,?,?,?,?)',
        'Outer',
        'outer',
        'outer',
        'x',
        'x',
      );
      // An inner failure rolls back only the inner work.
      try {
        db.transaction(() => {
          db.run(
            'INSERT INTO category (name, name_norm, slug, created_at, updated_at) VALUES (?,?,?,?,?)',
            'Inner',
            'inner',
            'inner',
            'x',
            'x',
          );
          throw new Error('inner failed');
        });
      } catch {
        /* handled */
      }
    });

    const names = db.all('SELECT name FROM category ORDER BY name').map((r) => r.name);
    assert.deepEqual(names, ['Outer']);
    db.close();
  });

  it('answers a ping', () => {
    const db = openDatabase(':memory:');
    assert.equal(db.ping(), true);
    db.close();
  });
});

/** Every migration on disk, in the order the runner applies them. */
function migrationNames() {
  const dir = path.join(process.cwd(), 'src', 'db', 'migrations');
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => name.replace(/\.sql$/, ''));
}
