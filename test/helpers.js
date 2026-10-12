// Shared test setup.
//
// Every suite gets its own throwaway SQLite file in the OS temp directory, so
// tests never touch data/library.db and can run without interfering with each
// other. The real database is never opened by the test suite.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createBook } from '../src/db/queries/books.js';
import { createCategory } from '../src/db/queries/categories.js';
import { createCopy } from '../src/db/queries/copies.js';

process.env.NODE_ENV = 'test';

let counter = 0;

/**
 * Build a config pointing at a fresh temporary database and upload directory.
 * @param {Record<string, string>} [overrides] Extra env values.
 */
export function testConfig(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `dslib-test-${process.pid}-${counter++}-`));
  return {
    config: loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-secret-that-is-definitely-long-enough-32',
      DATABASE_PATH: path.join(dir, 'test.db'),
      UPLOAD_DIR: path.join(dir, 'uploads'),
      LIBRARY_NAME: 'Σχολική Βιβλιοθήκη',
      DEFAULT_LANG: 'el',
      ...overrides,
    }),
    dir,
  };
}

/** Remove a temporary directory created by testConfig. */
export function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * An in-memory database with migrations applied. Nothing touches the real
 * data/library.db file.
 */
export function makeTestDb() {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

/**
 * A small catalogue for query and route tests: Greek and English titles,
 * shared authors and categories, and copies in a mix of states.
 *
 * Deliberately creates no staff user and no borrowers — suites that need
 * those create them explicitly, so no test depends on seeded credentials.
 */
export function seedTestCatalogue(db) {
  const categories = {
    greek: createCategory(db, { name: 'Ελληνική Λογοτεχνία' }).id,
    ancient: createCategory(db, { name: 'Αρχαία Γραμματεία' }).id,
    foreign: createCategory(db, { name: 'Ξένη Λογοτεχνία' }).id,
  };

  const odyssey = createBook(db, {
    title: 'Οδύσσεια',
    authorNames: ['Όμηρος'],
    categoryIds: [categories.ancient, categories.greek],
    publication_year: 1998,
    language: 'el',
    publisher: 'Εκδόσεις Κλασικά',
    description: 'Η επιστροφή του Οδυσσέα στην Ιθάκη.',
  });

  const iliad = createBook(db, {
    title: 'Ιλιάδα',
    authorNames: ['Όμηρος'],
    categoryIds: [categories.ancient],
    publication_year: 1996,
    language: 'el',
  });

  const zorba = createBook(db, {
    title: 'Βίος και Πολιτεία του Αλέξη Ζορμπά',
    authorNames: ['Νίκος Καζαντζάκης'],
    categoryIds: [categories.greek],
    publication_year: 1946,
    language: 'el',
  });

  const austen = createBook(db, {
    title: 'Pride and Prejudice',
    authorNames: ['Jane Austen'],
    categoryIds: [categories.foreign],
    isbn13: '9780141439518',
    publication_year: 2003,
    language: 'en',
    publisher: 'Penguin Classics',
  });

  const archived = createBook(db, {
    title: 'Αποσυρμένος Τίτλος',
    authorNames: ['Άγνωστος'],
    publication_year: 1950,
  });
  db.run('UPDATE book SET archived_at = ? WHERE id = ?', new Date().toISOString(), archived);

  const copies = {
    odysseyA: createCopy(db, odyssey, { barcode: 'T-0001', shelfLocation: 'Α1-01' }).id,
    odysseyB: createCopy(db, odyssey, { barcode: 'T-0002', shelfLocation: 'Α1-01' }).id,
    iliadA: createCopy(db, iliad, { barcode: 'T-0003', shelfLocation: 'Α1-02' }).id,
    zorbaA: createCopy(db, zorba, { barcode: 'T-0004', shelfLocation: 'Β2-05' }).id,
    // A copy that is off the shelf for repair: held, but not available.
    austenA: createCopy(db, austen, { barcode: 'T-0005', status: 'repair' }).id,
  };

  return { books: { odyssey, iliad, zorba, austen, archived }, categories, copies };
}

/** Extract the value of one cookie from a set-cookie header list. */
export function cookieValue(response, name) {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const entry of list) {
    const [pair] = entry.split(';');
    const index = pair.indexOf('=');
    if (pair.slice(0, index) === name) return decodeURIComponent(pair.slice(index + 1));
  }
  return undefined;
}
