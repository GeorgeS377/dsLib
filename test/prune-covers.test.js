// Sweeping up cover files no book refers to.
//
// Orphans exist on purpose: a cover is stored the moment a book form is
// refused, so the librarian's framing survives the correction. Abandon the
// form and those files stay. This is what collects them, and — more to the
// point — what must never collect anything else.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createBook, setBookCover } from '../src/db/queries/books.js';
import { pruneCovers } from '../scripts/prune-covers.js';
import { cleanupDir, makeTestDb, testConfig } from './helpers.js';

let db; let dir; let uploadDir; let coversDir;

before(() => {
  const setup = testConfig();
  dir = setup.dir;
  uploadDir = setup.config.uploadDir;
  coversDir = path.join(uploadDir, 'covers');
  db = makeTestDb();
});

after(() => { db.close(); cleanupDir(dir); });

beforeEach(() => {
  fs.rmSync(coversDir, { recursive: true, force: true });
  fs.mkdirSync(coversDir, { recursive: true });
  db.run('DELETE FROM book');
});

/** Write a cover file with a real stored name, optionally aged. */
function writeCover({ hoursOld = 0, suffix = '' } = {}) {
  const name = `${crypto.randomUUID()}${suffix}.jpg`;
  const full = path.join(coversDir, name);
  fs.writeFileSync(full, 'not really a jpeg, but the sweep never decodes one');
  if (hoursOld > 0) {
    const when = new Date(Date.now() - hoursOld * 3600_000);
    fs.utimesSync(full, when, when);
  }
  return name;
}

const exists = (name) => fs.existsSync(path.join(coversDir, name));

describe('pruning covers no book refers to', () => {
  it('removes an orphan older than the threshold', () => {
    const orphan = writeCover({ hoursOld: 48 });
    const result = pruneCovers(db, { uploadDir, olderThanHours: 24 });
    assert.deepEqual(result.removed, [orphan]);
    assert.ok(!exists(orphan), 'the orphan is still there');
  });

  it('keeps a cover a book still refers to, however old', () => {
    const cover = writeCover({ hoursOld: 10_000 });
    const thumb = writeCover({ hoursOld: 10_000, suffix: '-thumb' });
    const id = createBook(db, { title: 'Με Εξώφυλλο' });
    setBookCover(db, id, { coverPath: cover, thumbPath: thumb });

    const result = pruneCovers(db, { uploadDir, olderThanHours: 24 });
    assert.deepEqual(result.removed, []);
    assert.ok(exists(cover) && exists(thumb), 'a cover in use was deleted');
    assert.equal(result.kept, 2);
  });

  it('keeps a recent orphan, which may be a form still being filled in', () => {
    // The threshold is the whole reason this is safe to run while the site
    // is up: a cover waiting out a rejected form is minutes old.
    const fresh = writeCover({ hoursOld: 0 });
    const result = pruneCovers(db, { uploadDir, olderThanHours: 24 });
    assert.deepEqual(result.removed, []);
    assert.ok(exists(fresh), 'a cover still being worked on was deleted');
  });

  it('removes nothing when asked for a dry run', () => {
    const orphan = writeCover({ hoursOld: 48 });
    const result = pruneCovers(db, { uploadDir, olderThanHours: 24, dryRun: true });
    assert.deepEqual(result.removed, [orphan], 'a dry run should still report what it would do');
    assert.ok(exists(orphan), 'a dry run deleted a file');
  });

  it('ignores a file that is not a stored cover name', () => {
    fs.writeFileSync(path.join(coversDir, 'README.txt'), 'left here by a person');
    const when = new Date(Date.now() - 10_000 * 3600_000);
    fs.utimesSync(path.join(coversDir, 'README.txt'), when, when);

    const result = pruneCovers(db, { uploadDir, olderThanHours: 24 });
    assert.deepEqual(result.removed, []);
    assert.ok(exists('README.txt'), 'the sweep deleted something it did not write');
  });

  it('copes with no covers directory at all', () => {
    fs.rmSync(coversDir, { recursive: true, force: true });
    const result = pruneCovers(db, { uploadDir, olderThanHours: 24 });
    assert.deepEqual(result, { removed: [], kept: 0 });
  });
});
