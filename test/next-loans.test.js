// The loan list, and what replaced the check-in page.
//
// Returning a book has three ways in: the reader's page, the loan list, and
// scanning. The first two are actions on a loan you can already see; the
// third used to have a page of its own, and now lives in the one search box.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBook } from '../src/db/queries/books.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { createCopy } from '../src/db/queries/copies.js';
import { checkOut, listLoans } from '../src/db/queries/loans.js';
import { searchEverything } from '../src/db/queries/search.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { csrfFrom, encodeFields, login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let session;
let staff;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  seedTestCatalogue(db);
  staff = await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);

  // Two loans, to two readers, of two titles.
  const kostas = createBorrower(db, { displayName: 'Κώστας Δανειστής', schoolClass: 'Α1' }).id;
  const eleni = createBorrower(db, { displayName: 'Ελένη Άλλη', schoolClass: 'Β2' }).id;
  const one = createCopy(db, createBook(db, { title: 'Το Πρώτο Βιβλίο' }), { barcode: 'LN-1' }).id;
  const two = createCopy(db, createBook(db, { title: 'Το Δεύτερο Βιβλίο' }), { barcode: 'LN-2' }).id;
  checkOut(db, { copyId: one, borrowerId: kostas, loanDays: 14, staffUserId: staff.id });
  checkOut(db, { copyId: two, borrowerId: eleni, loanDays: 14, staffUserId: staff.id });
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

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

describe('searching the loans', () => {
  it('narrows by the book', async () => {
    const response = await get(`/staff/loans?q=${encodeURIComponent('πρωτο')}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Το Πρώτο Βιβλίο'), 'the matching loan is missing');
    assert.ok(!response.body.includes('Το Δεύτερο Βιβλίο'), 'it narrowed nothing');
  });

  it('narrows by the reader', async () => {
    const response = await get(`/staff/loans?q=${encodeURIComponent('ελενη')}`);
    assert.ok(response.body.includes('Ελένη Άλλη'), 'the reader was not found');
    assert.ok(!response.body.includes('Κώστας Δανειστής'), 'it narrowed nothing');
  });

  it('narrows by the barcode on the copy', async () => {
    const response = await get('/staff/loans?q=LN-2');
    assert.ok(response.body.includes('Το Δεύτερο Βιβλίο'), 'the barcode found nothing');
    assert.ok(!response.body.includes('Το Πρώτο Βιβλίο'), 'it narrowed nothing');
  });

  it('keeps the search when the status filter changes', async () => {
    const response = await get(`/staff/loans?q=${encodeURIComponent('ελενη')}`);
    const link = response.body.match(/href="(\/staff\/loans\?[^"]*status=returned[^"]*)"/)?.[1];
    assert.ok(link, 'no status filter links');
    assert.ok(link.includes('q='), 'changing the status throws the search away');
  });

  it('says so when a search matches no loan', async () => {
    const response = await get('/staff/loans?q=zzzznothing');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Δεν υπάρχουν δανεισμοί'), 'no empty state');
  });
});

describe('returning a book without a page of its own', () => {
  it('has no page of its own in this interface', () => {
    // The template is gone, so nothing in the second interface can render it.
    // The route survives because the first interface still has that page, and
    // this branch does not change the first interface.
    const views = path.join(process.cwd(), 'src', 'views');
    assert.ok(
      !fs.existsSync(path.join(views, 'next', 'staff', 'checkin.ejs')),
      'the second interface still has a check-in page',
    );
    assert.ok(
      fs.existsSync(path.join(views, 'staff', 'checkin.ejs')),
      'the first interface lost its check-in page',
    );
  });

  it('links to it from nowhere', async () => {
    for (const url of ['/staff', '/staff/loans', `/staff/loans/checkout?copy=${
      db.get('SELECT id FROM copy LIMIT 1').id}`]) {
      const response = await get(url);
      assert.ok(
        !response.body.includes('href="/staff/loans/checkin"'),
        `${url} still links to the check-in page`,
      );
    }
  });

  it('still closes a loan from the loan list', async () => {
    const loan = listLoans(db, { status: 'open' }).rows[0];
    const before = listLoans(db, { status: 'open' }).total;

    const response = await post(
      '/staff/loans/checkin',
      { loan_id: loan.id },
      { tokenFrom: '/staff/loans' },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(listLoans(db, { status: 'open' }).total, before - 1, 'the loan did not close');
  });

  it('finds a copy by the barcode on it, so a scanner still works', () => {
    // The check-in page was the only thing that read a barcode. Taking it
    // away without this would take scanning with it.
    const { books } = searchEverything(db, { q: 'LN-2' });
    assert.ok(books.length > 0, 'a scanned barcode finds nothing');
    assert.equal(books[0].book_title, 'Το Δεύτερο Βιβλίο');
  });
});
