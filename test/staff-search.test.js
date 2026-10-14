// One box that finds books and readers.
//
// The desk needs both: a teacher holding a book searches the title, a teacher
// chasing an overdue one has only the student's name. Making them two separate
// pages means knowing which one you are in before you start typing.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { searchEverything } from '../src/db/queries/search.js';
import { translate } from '../src/lib/i18n.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let session;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  seedTestCatalogue(db);
  createBorrower(db, { displayName: 'Οδυσσέας Μαρής', schoolClass: 'Β2' });
  createBorrower(db, { displayName: 'Μαρία Παπαδοπούλου', schoolClass: 'Γ1' });
  await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

const asStaff = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

describe('searching books and readers at once', () => {
  it('finds a title by name', () => {
    const { books } = searchEverything(db, { q: 'οδυσ' });
    assert.ok(books.some((book) => book.book_title === 'Οδύσσεια'), 'the title was not found');
  });

  it('finds a reader by name', () => {
    const { borrowers } = searchEverything(db, { q: 'μαρια' });
    assert.ok(
      borrowers.some((person) => person.display_name === 'Μαρία Παπαδοπούλου'),
      'the reader was not found',
    );
  });

  it('finds both at once and keeps them apart', () => {
    // 'οδυσ' matches the Οδύσσεια and the reader Οδυσσέας.
    const { books, borrowers } = searchEverything(db, { q: 'οδυσ' });
    assert.ok(books.length > 0, 'no books');
    assert.ok(borrowers.length > 0, 'no readers');
    assert.ok(!('display_name' in books[0]), 'a reader leaked into the books');
  });

  it('returns nothing for a blank query', () => {
    for (const q of ['', '   ', undefined, null]) {
      const result = searchEverything(db, { q });
      assert.deepEqual(result, { books: [], borrowers: [] }, `blank query ${JSON.stringify(q)}`);
    }
  });

  it('matches Greek whatever the case and accents', () => {
    for (const q of ['ΟΔΥΣΣΕΙΑ', 'οδύσσεια', 'οδυσσεια']) {
      const { books } = searchEverything(db, { q });
      assert.ok(books.some((book) => book.book_title === 'Οδύσσεια'), `"${q}" found nothing`);
    }
  });
});

describe('the staff search page', () => {
  it('shows both groups when both match', async () => {
    const response = await asStaff(`/staff/search?q=${encodeURIComponent('οδυσ')}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('Οδυσσέας Μαρής'));
  });

  it('omits a group that has no results', async () => {
    // Searching a title that no reader is named after must not leave an empty
    // "ΑΝΑΓΝΩΣΤΕΣ" box sitting there.
    const response = await asStaff(`/staff/search?q=${encodeURIComponent('ιλιαδα')}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Ιλιάδα'));
    // Scoped to the group heading: the word also names a page in the
    // navigation, which is present on every page and proves nothing here.
    const heading = `class="label">${translate('el', 'staff.search.readers')}`;
    assert.ok(!response.body.includes(heading), 'an empty group was rendered');
  });

  it('offers to lend only when a copy is free', async () => {
    const response = await asStaff(`/staff/search?q=${encodeURIComponent('οδυσσεια')}`);
    assert.ok(response.body.includes('Δανεισμός'), 'no way to lend an available title');
  });

  it('says so when nothing matches', async () => {
    const response = await asStaff('/staff/search?q=zzzznothing');
    assert.equal(response.statusCode, 200);
    assert.ok(
      response.body.includes(translate('el', 'staff.search.empty', { query: 'zzzznothing' })),
      'no empty state',
    );
  });

  it('is refused to a signed-out visitor, and leaks no reader', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/staff/search?q=${encodeURIComponent('μαρια')}`,
      headers: { cookie: 'ui=next' },
    });
    assert.equal(response.statusCode, 302);
    assert.ok(response.headers.location.startsWith('/staff/login'));
    assert.ok(!response.body.includes('Παπαδοπούλου'), 'a reader name leaked to a stranger');
  });
});
