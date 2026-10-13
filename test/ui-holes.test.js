// Regressions for the holes found by walking the running site.
//
// Each test names the break it catches, and each was written before the fix
// and watched failing — so it has proven it can catch the thing it describes.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBook, getBookById } from '../src/db/queries/books.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { createCopies, createCopy } from '../src/db/queries/copies.js';
import { listLoans } from '../src/db/queries/loans.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let fixtures;
let session;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  fixtures = seedTestCatalogue(db);
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

const get = (url, options = {}) => app.inject({ method: 'GET', url, ...options });

describe('a title with many copies', () => {
  let bulkBook;

  before(() => {
    bulkBook = createBook(db, { title: 'Πολλά Αντίτυπα', authorNames: ['Δοκιμή'] });
    createCopies(db, bulkBook, 40, { shelfLocation: 'Π1-05' });
    createCopy(db, bulkBook, { barcode: 'BULK-X', shelfLocation: 'Π2-01' });
  });

  it('shows the public reader a count, not a row per copy', async () => {
    // Break this catches: rendering one table row per copy, which turned a
    // book page into a 41-row inventory nobody reads.
    const response = await get(`/books/${bulkBook}`);
    assert.equal(response.statusCode, 200);

    assert.ok(response.body.includes('41 από 41 διαθέσιμα'), 'the count is missing');

    const rows = response.body.match(/<tbody>[\s\S]*?<\/tbody>/);
    assert.equal(rows, null, 'the public page still renders a per-copy table');
  });

  it('still tells the reader where to find it on the shelf', async () => {
    const response = await get(`/books/${bulkBook}`);
    assert.ok(response.body.includes('Π1-05'), 'the shelf location is gone');
    assert.ok(response.body.includes('Π2-01'), 'a second shelf location is gone');
  });

  it('lists each shelf location once, however many copies sit there', async () => {
    const response = await get(`/books/${bulkBook}`);
    const occurrences = (response.body.match(/Π1-05/g) ?? []).length;
    assert.equal(occurrences, 1, `shelf location repeated ${occurrences} times`);
  });

  it('paginates the staff copy list instead of rendering all of them', async () => {
    // Break this catches: ~40 editable rows in one page, which froze the
    // renderer and made the status column unreadable.
    const response = await session.get(`/staff/books/${bulkBook}/copies`);
    assert.equal(response.statusCode, 200);

    const rowCount = (response.body.match(/<tr\b/g) ?? []).length;
    assert.ok(rowCount <= 30, `rendered ${rowCount} rows in one page`);
    assert.match(response.body, /page=2/, 'no way to reach the rest');
  });
});

describe('editing several copies at once', () => {
  let bookId;
  let copyIds;

  before(() => {
    bookId = createBook(db, { title: 'Επεξεργασία Αντιτύπων' });
    copyIds = [
      createCopy(db, bookId, { barcode: 'EDIT-1', shelfLocation: 'A' }).id,
      createCopy(db, bookId, { barcode: 'EDIT-2', shelfLocation: 'B' }).id,
      createCopy(db, bookId, { barcode: 'EDIT-3', shelfLocation: 'C' }).id,
    ];
  });

  it('saves every row that changed, not just one', async () => {
    // Break this catches: a separate <form> per row meant editing three and
    // saving one silently discarded the other two.
    const response = await session.post(
      `/staff/books/${bookId}/copies/save`,
      {
        'copy_id': copyIds,
        [`barcode_${copyIds[0]}`]: 'EDIT-1A',
        [`shelf_${copyIds[0]}`]: 'AA',
        [`status_${copyIds[0]}`]: 'available',
        [`barcode_${copyIds[1]}`]: 'EDIT-2A',
        [`shelf_${copyIds[1]}`]: 'BB',
        [`status_${copyIds[1]}`]: 'available',
        [`barcode_${copyIds[2]}`]: 'EDIT-3',
        [`shelf_${copyIds[2]}`]: 'C',
        [`status_${copyIds[2]}`]: 'repair',
      },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 302);

    const copies = getBookById(db, bookId).copies;
    const byId = Object.fromEntries(copies.map((c) => [c.id, c]));

    assert.equal(byId[copyIds[0]].barcode, 'EDIT-1A', 'the first row was not saved');
    assert.equal(byId[copyIds[0]].shelf_location, 'AA');
    assert.equal(byId[copyIds[1]].barcode, 'EDIT-2A', 'the second row was silently dropped');
    assert.equal(byId[copyIds[1]].shelf_location, 'BB');
    assert.equal(byId[copyIds[2]].status, 'repair', 'the third row was silently dropped');
  });

  it('edits only this title\'s copies, whatever ids are posted', async () => {
    // The ids travel in the form, so a posted id belonging to another book
    // would otherwise be edited from a page that never showed it.
    const otherBook = createBook(db, { title: 'Άλλο Βιβλίο' });
    const outsider = createCopy(db, otherBook, { barcode: 'OUTSIDE-1' }).id;

    await session.post(
      `/staff/books/${bookId}/copies/save`,
      {
        'copy_id': [copyIds[0], outsider],
        [`barcode_${copyIds[0]}`]: 'EDIT-1A',
        [`shelf_${copyIds[0]}`]: 'AA',
        [`status_${copyIds[0]}`]: 'available',
        [`barcode_${outsider}`]: 'HIJACKED',
        [`shelf_${outsider}`]: 'ZZ',
        [`status_${outsider}`]: 'lost',
      },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );

    const untouched = db.get('SELECT * FROM copy WHERE id = ?', outsider);
    assert.equal(untouched.barcode, 'OUTSIDE-1', 'another book\'s copy was edited');
    assert.equal(untouched.status, 'available');
  });

  it('reports a duplicate barcode without saving the other rows into a wrong state', async () => {
    const response = await session.post(
      `/staff/books/${bookId}/copies/save`,
      {
        'copy_id': [copyIds[0], copyIds[1]],
        [`barcode_${copyIds[0]}`]: 'EDIT-1A',
        [`shelf_${copyIds[0]}`]: 'AA',
        [`status_${copyIds[0]}`]: 'available',
        // Collides with the first row's barcode.
        [`barcode_${copyIds[1]}`]: 'EDIT-1A',
        [`shelf_${copyIds[1]}`]: 'BB',
        [`status_${copyIds[1]}`]: 'available',
      },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 302);

    const followed = await session.get(`/staff/books/${bookId}/copies`);
    assert.ok(followed.body.includes('barcode'), 'no mention of the clash');

    // The clashing row kept its old barcode rather than taking a duplicate.
    const byId = Object.fromEntries(getBookById(db, bookId).copies.map((c) => [c.id, c]));
    assert.equal(byId[copyIds[1]].barcode, 'EDIT-2A');
  });
});

describe('the new-book form after a rejected submission', () => {
  it('does not grow an extra author field each time', async () => {
    // Break this catches: every rejected submit re-rendered the blank rows the
    // browser had posted and then added another spare, so the form grew.
    const countAuthorInputs = (body) =>
      (body.match(/<input[^>]*name="authors"/g) ?? []).length;

    const first = await session.post(
      '/staff/books',
      { title: 'Κακό ISBN', isbn: '9780141439519' },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(first.statusCode, 422);
    const firstCount = countAuthorInputs(first.body);

    const second = await session.post(
      '/staff/books',
      { title: 'Κακό ISBN', isbn: '9780141439519', authors: ['', ''] },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(second.statusCode, 422);

    assert.equal(
      countAuthorInputs(second.body),
      firstCount,
      'the form grew another blank author row',
    );
  });

  it('keeps the authors that were filled in', async () => {
    const response = await session.post(
      '/staff/books',
      { title: 'Κακό ISBN', isbn: '9780141439519', authors: ['Πρώτος', '', 'Δεύτερος'] },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('value="Πρώτος"'), 'the first author was lost');
    assert.ok(response.body.includes('value="Δεύτερος"'), 'the second author was lost');
  });

  it('says what is wrong in the summary, not just which field', async () => {
    // Break this catches: a summary listing "ISBN" with the reason only
    // further down a long form.
    const response = await session.post(
      '/staff/books',
      { title: 'Κακό ISBN', isbn: '9780141439519' },
      { tokenFrom: '/staff/books/new' },
    );
    const summary = response.body.slice(
      response.body.indexOf('error-summary'),
      response.body.indexOf('</div>', response.body.indexOf('error-summary')),
    );
    assert.ok(summary.includes('δεν είναι έγκυρο'), 'the summary omits the reason');
  });
});

describe('a borrower who still has books out', () => {
  let borrowerId;

  before(async () => {
    borrowerId = createBorrower(db, { displayName: 'Κρατάει Βιβλία', schoolClass: 'Δ1' }).id;
    const copy = db.get("SELECT id FROM copy WHERE barcode = 'T-0002'");
    await session.post(
      '/staff/loans/checkout',
      { copy_id: copy.id, borrower_id: borrowerId },
      { tokenFrom: `/staff/loans/checkout?copy=${copy.id}` },
    );
  });

  it('offers a return next to each open loan', async () => {
    // Break this catches: the most likely action from a borrower with an
    // overdue book — taking it back — required navigating away to find it.
    const response = await session.get(`/staff/borrowers/${borrowerId}`);
    assert.equal(response.statusCode, 200);
    assert.match(
      response.body,
      /action="\/staff\/loans\/checkin"/,
      'no way to return the book from here',
    );
  });

  it('returns the book from the borrower page', async () => {
    const before = listLoans(db, { borrowerId, status: 'open' }).total;
    assert.equal(before, 1);

    const loan = listLoans(db, { borrowerId, status: 'open' }).rows[0];
    const response = await session.post(
      '/staff/loans/checkin',
      { loan_id: loan.id },
      { tokenFrom: `/staff/borrowers/${borrowerId}` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(listLoans(db, { borrowerId, status: 'open' }).total, 0);
  });

  it('explains inline that anonymising is blocked, rather than offering it', async () => {
    // Break this catches: a live button that led to a page explaining the
    // action in full and only then refusing.
    const other = createBorrower(db, { displayName: 'Ακόμη Κρατάει' }).id;
    const copy = db.get("SELECT id FROM copy WHERE barcode = 'T-0004'");
    await session.post(
      '/staff/loans/checkout',
      { copy_id: copy.id, borrower_id: other },
      { tokenFrom: `/staff/loans/checkout?copy=${copy.id}` },
    );

    const response = await session.get(`/staff/borrowers/${other}`);
    assert.ok(
      response.body.includes('βιβλία σε δανεισμό'),
      'the page does not say why anonymising is unavailable',
    );
    assert.ok(
      !response.body.includes(`/staff/borrowers/${other}/anonymize"`),
      'the anonymise link is still offered although it will be refused',
    );
  });

  it('shows the class once, not twice', async () => {
    const response = await session.get(`/staff/borrowers/${borrowerId}`);
    const body = response.body.slice(0, response.body.indexOf('Επεξεργασία'));
    const occurrences = (body.match(/Δ1/g) ?? []).length;
    assert.equal(occurrences, 1, `the class appears ${occurrences} times above the form`);
  });
});

describe('returning a book from where the librarian is standing', () => {
  it('refuses to be sent off-site by the return-path field', async () => {
    // The field decides where a check-in lands, so it is held to the same
    // rules as the post-login redirect.
    const borrower = createBorrower(db, { displayName: 'Ανακατεύθυνση' }).id;
    const book = createBook(db, { title: 'Ανακατεύθυνση Βιβλίο' });
    const copy = createCopy(db, book, { barcode: 'REDIR-1' }).id;

    await session.post(
      '/staff/loans/checkout',
      { copy_id: copy, borrower_id: borrower },
      { tokenFrom: `/staff/loans/checkout?copy=${copy}` },
    );
    const loan = listLoans(db, { borrowerId: borrower, status: 'open' }).rows[0];

    const response = await session.post(
      '/staff/loans/checkin',
      { loan_id: loan.id, redirect_to: 'https://evil.example.com/staff' },
      { tokenFrom: `/staff/borrowers/${borrower}` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff/loans', 'followed a hostile return path');
  });
});

describe('clearing a search', () => {
  it('offers to clear the search, not "filters", when only a search is set', async () => {
    // Break this catches: an empty result from a plain search offering
    // "Καθαρισμός φίλτρων" when no filter was ever applied.
    const response = await get('/books?q=zzzznothingmatches');
    assert.ok(!response.body.includes('Καθαρισμός φίλτρων'), 'offers to clear absent filters');
    assert.ok(response.body.includes('Καθαρισμός αναζήτησης'), 'no way to clear the search');
  });

  it('still offers to clear filters when a filter is set', async () => {
    const category = db.get('SELECT id FROM category LIMIT 1');
    const response = await get(`/books?category=${category.id}&q=zzzznothingmatches`);
    assert.ok(response.body.includes('Καθαρισμός φίλτρων'));
  });
});

describe('lending several copies at once', () => {
  it('carries a selection of copies across a new search', async () => {
    // Break this catches: a desk flow that could only ever lend one copy, so
    // a student with three books meant three separate transactions.
    const a = db.get("SELECT id FROM copy WHERE barcode = 'T-0001'");
    const c = db.get("SELECT id FROM copy WHERE barcode = 'T-0003'");

    const response = await session.get(
      `/staff/loans/checkout?copy=${a.id}&copy=${c.id}&q=${encodeURIComponent('ιλιαδα')}`,
    );
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('T-0001'), 'the first selected copy was dropped');
    assert.ok(response.body.includes('T-0003'), 'the second selected copy was dropped');
  });

  it('lends every selected copy to one borrower in one go', async () => {
    const borrower = createBorrower(db, { displayName: 'Πολλά Βιβλία', schoolClass: 'Ε1' });
    const bookA = createBook(db, { title: 'Μαζικός Α' });
    const bookB = createBook(db, { title: 'Μαζικός Β' });
    const one = createCopy(db, bookA, { barcode: 'MULTI-1' }).id;
    const two = createCopy(db, bookB, { barcode: 'MULTI-2' }).id;

    const response = await session.post(
      '/staff/loans/checkout',
      { copy_id: [one, two], borrower_id: borrower.id },
      { tokenFrom: `/staff/loans/checkout?copy=${one}&copy=${two}` },
    );
    assert.equal(response.statusCode, 302);

    const open = listLoans(db, { borrowerId: borrower.id, status: 'open' });
    assert.equal(open.total, 2, `expected 2 loans, got ${open.total}`);
    assert.deepEqual(
      open.rows.map((r) => r.book_title).sort(),
      ['Μαζικός Α', 'Μαζικός Β'],
    );
  });

  it('lends the copies it can and names the ones it cannot', async () => {
    const first = createBorrower(db, { displayName: 'Πρώτος Δανειστής' });
    const second = createBorrower(db, { displayName: 'Δεύτερος Δανειστής' });
    const bookA = createBook(db, { title: 'Συγκρουόμενο' });
    const bookB = createBook(db, { title: 'Ελεύθερο' });
    const taken = createCopy(db, bookA, { barcode: 'CLASH-1' }).id;
    const free = createCopy(db, bookB, { barcode: 'CLASH-2' }).id;

    // Someone else takes the first copy in between.
    await session.post(
      '/staff/loans/checkout',
      { copy_id: taken, borrower_id: first.id },
      { tokenFrom: `/staff/loans/checkout?copy=${taken}` },
    );

    const response = await session.post(
      '/staff/loans/checkout',
      { copy_id: [taken, free], borrower_id: second.id },
      { tokenFrom: `/staff/loans/checkout?copy=${taken}&copy=${free}` },
    );
    assert.equal(response.statusCode, 302);

    // The free copy went out; the clash is reported rather than silently lost.
    assert.equal(listLoans(db, { borrowerId: second.id, status: 'open' }).total, 1);
    const followed = await session.get(response.headers.location);
    assert.ok(followed.body.includes('CLASH-1'), 'the refused copy is not named');
  });
});
