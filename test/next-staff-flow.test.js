// A shift at the desk, in the second interface.
//
// The behaviour is the first interface's — same URLs, same field names, same
// basket in the query string — so these tests prove the new screens drive it,
// not that circulation works, which test/circulation.test.js already covers.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBook } from '../src/db/queries/books.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { createCopy } from '../src/db/queries/copies.js';
import { listLoans } from '../src/db/queries/loans.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { csrfFrom, encodeFields, login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let session;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  seedTestCatalogue(db);
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

/** A signed-in GET in the second interface. */
const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

/** A signed-in POST in the second interface, with a token from the form. */
async function post(url, fields, { tokenFrom = url } = {}) {
  const page = await get(tokenFrom);
  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: `${session.cookie}; ui=next`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: encodeFields({ _csrf: csrfFrom(page.body), ...fields }),
  });
}

describe('the staff home in the second interface', () => {
  it('is a search field, not a dashboard', async () => {
    const response = await get('/staff');
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /action="\/staff\/search"/, 'no search form');
    assert.ok(!response.body.includes('stat-grid'), 'the dashboard tiles are still there');
  });

  it('asks what you are looking for before you have typed anything', async () => {
    const response = await get('/staff');
    assert.ok(response.body.includes('Τι ψάχνετε;'), 'no opening prompt');
  });
});

describe('lending from the search', () => {
  it('lends a copy found by searching for the title', async () => {
    const borrower = createBorrower(db, { displayName: 'Από Αναζήτηση', schoolClass: 'Α1' }).id;
    const book = createBook(db, { title: 'Βρες Με' });
    const copy = createCopy(db, book, { barcode: 'NEXT-1' }).id;

    const found = await get(`/staff/search?q=${encodeURIComponent('βρες')}`);
    assert.ok(found.body.includes(`/staff/loans/checkout?copy=${copy}`), 'no way to lend it');

    const response = await post(
      '/staff/loans/checkout',
      { copy_id: copy, borrower_id: borrower },
      { tokenFrom: `/staff/loans/checkout?copy=${copy}` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(listLoans(db, { borrowerId: borrower, status: 'open' }).total, 1);
  });

  it('still lends several copies to one borrower in one go', async () => {
    const borrower = createBorrower(db, { displayName: 'Πολλά Μαζί', schoolClass: 'Β1' }).id;
    const one = createCopy(db, createBook(db, { title: 'Μαζί Α' }), { barcode: 'NEXT-2' }).id;
    const two = createCopy(db, createBook(db, { title: 'Μαζί Β' }), { barcode: 'NEXT-3' }).id;

    const response = await post(
      '/staff/loans/checkout',
      { copy_id: [one, two], borrower_id: borrower },
      { tokenFrom: `/staff/loans/checkout?copy=${one}&copy=${two}` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(listLoans(db, { borrowerId: borrower, status: 'open' }).total, 2);
  });
});

describe('taking a book back from the search', () => {
  it('reaches the reader who has it and closes the loan', async () => {
    const borrower = createBorrower(db, { displayName: 'Κρατάει Ένα', schoolClass: 'Γ2' }).id;
    const copy = createCopy(db, createBook(db, { title: 'Προς Επιστροφή' }), { barcode: 'NEXT-4' }).id;
    await post(
      '/staff/loans/checkout',
      { copy_id: copy, borrower_id: borrower },
      { tokenFrom: `/staff/loans/checkout?copy=${copy}` },
    );

    // The teacher knows the student's name, not the barcode.
    const found = await get(`/staff/search?q=${encodeURIComponent('κρατάει')}`);
    assert.ok(found.body.includes('Κρατάει Ένα'), 'the reader was not found');
    assert.ok(found.body.includes(`/staff/borrowers/${borrower}`), 'no way through to them');

    const loan = listLoans(db, { borrowerId: borrower, status: 'open' }).rows[0];
    const response = await post(
      '/staff/loans/checkin',
      { loan_id: loan.id, redirect_to: `/staff/borrowers/${borrower}` },
      { tokenFrom: `/staff/borrowers/${borrower}` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(listLoans(db, { borrowerId: borrower, status: 'open' }).total, 0);
  });
});
