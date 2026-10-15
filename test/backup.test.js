// Backup and restore — acceptance criterion 10.
//
// These run the real scripts against a throwaway project directory, because a
// backup procedure that has never been executed is not a backup procedure.
// The round-trip test is the one that matters: data is written, backed up,
// destroyed, restored, and checked.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import { openDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createBook, listBooks } from '../src/db/queries/books.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { createCopy } from '../src/db/queries/copies.js';
import { checkOut } from '../src/db/queries/loans.js';
import { integrityOf, snapshot, versionsOf } from '../scripts/db-snapshot.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let work;

before(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'dslib-backup-'));
});

after(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

/**
 * A scratch data directory with a populated database and a cover file, plus
 * an .env pointing the scripts at it.
 */
function makeInstance(name) {
  const root = path.join(work, name);
  const dataDir = path.join(root, 'data');
  const coversDir = path.join(dataDir, 'uploads', 'covers');
  fs.mkdirSync(coversDir, { recursive: true });

  const dbPath = path.join(dataDir, 'library.db');
  const db = openDatabase(dbPath);
  migrate(db);

  const bookId = createBook(db, {
    title: 'Οδύσσεια',
    authorNames: ['Όμηρος'],
    publication_year: 1998,
  });
  const copy = createCopy(db, bookId, { barcode: 'BK-0001', shelfLocation: 'Α1-01' });
  const borrower = createBorrower(db, { displayName: 'Μαρία Π.', schoolClass: 'Β2' });
  checkOut(db, { copyId: copy.id, borrowerId: borrower.id, loanDays: 14 });
  db.close();

  // A stand-in cover file, so the covers path is exercised too.
  fs.writeFileSync(path.join(coversDir, 'cover-fixture.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0x00]));

  return {
    root,
    dbPath,
    dataDir,
    coversDir,
    bookId,
    // The scripts resolve their own location, so pointing them at a scratch
    // instance is done through the environment rather than the directory they
    // are run from. Environment settings take precedence over .env, which is
    // exactly what makes this possible.
    env: {
      DATABASE_PATH: dbPath,
      UPLOAD_DIR: path.join(dataDir, 'uploads'),
      BACKUP_DIR: path.join(root, 'backups'),
    },
  };
}

/** Run one of the project scripts against a scratch instance. */
function runScript(script, args, instance) {
  return execFileSync('bash', [path.join(projectRoot, 'scripts', script), ...args], {
    cwd: instance.root ?? instance,
    encoding: 'utf8',
    env: { ...process.env, ...(instance.env ?? {}) },
  });
}

describe('db-snapshot helper', () => {
  it('takes a consistent snapshot of a live database', () => {
    const instance = makeInstance('snapshot');
    const target = path.join(instance.root, 'snapshot.db');

    // The source is still open elsewhere in this test run; VACUUM INTO must
    // cope with that, which a plain file copy would not.
    const live = openDatabase(instance.dbPath);
    assert.equal(snapshot(instance.dbPath, target), 'ok');
    live.close();

    const copy = openDatabase(target);
    assert.equal(copy.value('SELECT COUNT(*) FROM book'), 1);
    assert.equal(copy.value('SELECT COUNT(*) FROM loan'), 1);
    copy.close();
  });

  it('refuses to overwrite an existing file', () => {
    const instance = makeInstance('no-overwrite');
    const target = path.join(instance.root, 'exists.db');
    fs.writeFileSync(target, 'do not clobber me');

    assert.throws(() => snapshot(instance.dbPath, target), /already exists/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'do not clobber me');
  });

  it('reports integrity and schema version', () => {
    const instance = makeInstance('report');
    assert.equal(integrityOf(instance.dbPath), 'ok');
    assert.equal(versionsOf(instance.dbPath), migrationNames().join(', '));
  });
});

describe('backup.sh', () => {
  it('produces a verified backup with the database, covers and a manifest', () => {
    const instance = makeInstance('backup');
    const dest = path.join(instance.root, 'backups');

    const output = runScript('backup.sh', [dest], instance);
    assert.match(output, /integrity ok/);
    assert.match(output, /covers {4}1 file/);

    const [stamp] = fs.readdirSync(dest);
    assert.match(stamp, /^\d{8}T\d{6}Z$/, 'the backup directory is not timestamped');

    const backupDir = path.join(dest, stamp);
    assert.ok(fs.existsSync(path.join(backupDir, 'library.db')));
    assert.ok(fs.existsSync(path.join(backupDir, 'covers', 'cover-fixture.jpg')));

    const manifest = fs.readFileSync(path.join(backupDir, 'MANIFEST.txt'), 'utf8');
    assert.match(manifest, /001_catalogue, 002_circulation/);
    assert.match(manifest, /restore\.sh/);

    // The backed-up database really contains the data.
    const db = openDatabase(path.join(backupDir, 'library.db'));
    assert.equal(db.value('SELECT COUNT(*) FROM book'), 1);
    db.close();
  });

  it('keeps the backup readable only by its owner', () => {
    const instance = makeInstance('permissions');
    const dest = path.join(instance.root, 'backups');
    runScript('backup.sh', [dest], instance);

    const [stamp] = fs.readdirSync(dest);
    // The backup holds borrower names, so it must not be world-readable.
    const dirMode = fs.statSync(path.join(dest, stamp)).mode & 0o777;
    const fileMode = fs.statSync(path.join(dest, stamp, 'library.db')).mode & 0o777;
    assert.equal(dirMode, 0o700, `backup directory mode is ${dirMode.toString(8)}`);
    assert.equal(fileMode, 0o600, `database mode is ${fileMode.toString(8)}`);
  });

  it('fails clearly when there is no database', () => {
    const root = path.join(work, 'empty');
    fs.mkdirSync(root, { recursive: true });

    assert.throws(
      () =>
        runScript('backup.sh', [path.join(root, 'backups')], {
          root,
          env: { DATABASE_PATH: path.join(root, 'missing.db') },
        }),
      /no database at/,
    );
  });
});

describe('restore.sh', () => {
  it('round-trips: back up, lose the data, restore it', () => {
    const instance = makeInstance('roundtrip');
    const dest = path.join(instance.root, 'backups');

    runScript('backup.sh', [dest], instance);
    const [stamp] = fs.readdirSync(dest);
    const backupDir = path.join(dest, stamp);

    // Now add a title that the backup does NOT contain, so the restore can be
    // shown to have genuinely rolled the data back.
    const db = openDatabase(instance.dbPath);
    createBook(db, { title: 'Μετά το Backup' });
    assert.equal(listBooks(db, {}).total, 2);
    db.close();

    // Simulate the disaster: the database is gone.
    fs.rmSync(instance.dbPath);
    fs.rmSync(path.join(instance.coversDir, 'cover-fixture.jpg'));
    assert.ok(!fs.existsSync(instance.dbPath));

    const output = runScript('restore.sh', [backupDir, '--yes'], instance);
    assert.match(output, /integrity ok/);
    assert.match(output, /Restored database/);
    assert.match(output, /Restored 1 cover file/);

    // The catalogue is back, at the state the backup captured.
    const restored = openDatabase(instance.dbPath);
    assert.equal(restored.value('SELECT COUNT(*) FROM book'), 1);
    assert.equal(restored.value('SELECT title FROM book'), 'Οδύσσεια');
    assert.equal(restored.value('SELECT COUNT(*) FROM loan'), 1);
    assert.equal(restored.value('SELECT display_name FROM borrower'), 'Μαρία Π.');
    // And the open loan still blocks a second checkout, so constraints and
    // indexes survived the round trip.
    assert.throws(
      () =>
        restored.run(
          `INSERT INTO loan (copy_id, borrower_id, loaned_at, due_at, created_at, updated_at)
           VALUES ((SELECT id FROM copy LIMIT 1), 1, ?, ?, ?, ?)`,
          '2026-10-01T00:00:00.000Z',
          '2026-10-15T00:00:00.000Z',
          '2026-10-01T00:00:00.000Z',
          '2026-10-01T00:00:00.000Z',
        ),
      /UNIQUE constraint failed/,
    );
    restored.close();

    assert.ok(fs.existsSync(path.join(instance.coversDir, 'cover-fixture.jpg')));
  });

  it('moves the current data aside rather than deleting it', () => {
    const instance = makeInstance('aside');
    const dest = path.join(instance.root, 'backups');
    runScript('backup.sh', [dest], instance);
    const [stamp] = fs.readdirSync(dest).filter((n) => /^\d{8}T/.test(n));

    // Change the live data, then restore over it.
    const db = openDatabase(instance.dbPath);
    createBook(db, { title: 'Θα Μετακινηθεί' });
    db.close();

    runScript('restore.sh', [path.join(dest, stamp), '--yes'], instance);

    // A pre-restore copy exists, so a mistaken restore is itself reversible.
    const aside = fs
      .readdirSync(instance.env.BACKUP_DIR)
      .find((name) => name.startsWith('pre-restore-'));
    assert.ok(aside, 'no pre-restore copy was kept');

    const previous = openDatabase(path.join(instance.env.BACKUP_DIR, aside, 'library.db'));
    assert.equal(previous.value('SELECT COUNT(*) FROM book'), 2, 'the superseded data was lost');
    previous.close();
  });

  it('refuses a damaged backup without touching the live data', () => {
    const instance = makeInstance('damaged');
    const fake = path.join(instance.root, 'bad-backup');
    fs.mkdirSync(fake, { recursive: true });
    fs.writeFileSync(path.join(fake, 'library.db'), 'this is not a sqlite database');

    assert.throws(() => runScript('restore.sh', [fake, '--yes'], instance));

    // The live database is untouched and still usable.
    const db = openDatabase(instance.dbPath);
    assert.equal(db.value('SELECT COUNT(*) FROM book'), 1);
    db.close();
  });

  it('refuses a directory that is not a backup', () => {
    const instance = makeInstance('notabackup');
    const empty = path.join(instance.root, 'nothing-here');
    fs.mkdirSync(empty, { recursive: true });

    assert.throws(() => runScript('restore.sh', [empty, '--yes'], instance), /not found/);
  });

  it('applies outstanding migrations to a restored database', () => {
    // A backup taken before a migration existed must come back usable.
    const instance = makeInstance('oldschema');
    const dest = path.join(instance.root, 'backups');
    runScript('backup.sh', [dest], instance);
    const [stamp] = fs.readdirSync(dest).filter((n) => /^\d{8}T/.test(n));

    // Pretend the backup predates 002 by removing it from the ledger.
    const backupDb = openDatabase(path.join(dest, stamp, 'library.db'));
    backupDb.run("DELETE FROM schema_migrations WHERE version = '002_circulation'");
    backupDb.exec('DROP TABLE loan');
    backupDb.exec('DROP TABLE borrower');
    backupDb.close();

    const output = runScript('restore.sh', [path.join(dest, stamp), '--yes'], instance);
    assert.match(output, /Applying any outstanding migrations/);

    // The tables 002 creates are back.
    const db = openDatabase(instance.dbPath);
    const tables = db
      .all("SELECT name FROM sqlite_master WHERE type = 'table'")
      .map((row) => row.name);
    assert.ok(tables.includes('loan'), 'the restored database is missing the loan table');
    assert.ok(tables.includes('borrower'));
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
