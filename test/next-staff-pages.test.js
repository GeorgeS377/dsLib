// Every staff page, in the second interface.
//
// Table-driven, because the risk here is not any one page being wrong — it is
// one page being forgotten and quietly falling back to the first interface's
// template inside the second one's shell.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
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

const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

const pages = () => [
  '/staff',
  '/staff/search?q=test',
  '/staff/books',
  '/staff/books/new',
  `/staff/books/${fixtures.books.odyssey}`,
  `/staff/books/${fixtures.books.odyssey}/copies`,
  `/staff/books/${fixtures.books.odyssey}/delete`,
  '/staff/loans',
  `/staff/loans/checkout?copy=${db.get('SELECT id FROM copy LIMIT 1').id}`,
  '/staff/loans/checkin',
  '/staff/borrowers',
  '/staff/categories',
  '/staff/authors',
  '/staff/users',
  '/staff/settings',
  '/staff/account',
];

describe('every staff page in the second interface', () => {
  it('has a template of its own, not the first interface\'s', () => {
    // A missing next/ template renders the classic one inside the new shell,
    // which looks half-finished rather than broken — so it has to be asserted
    // rather than noticed.
    const root = path.join(process.cwd(), 'src', 'views');
    const classic = fs.readdirSync(path.join(root, 'staff')).filter((f) => f.endsWith('.ejs'));
    const next = new Set(fs.readdirSync(path.join(root, 'next', 'staff')));
    const missing = classic.filter((file) => !next.has(file));
    assert.deepEqual(missing, [], `staff pages with no second-interface template: ${missing}`);
  });

  it('renders', async () => {
    for (const url of pages()) {
      const response = await get(url);
      assert.equal(response.statusCode, 200, `${url} returned ${response.statusCode}`);
      assert.ok(response.body.includes('next.css'), `${url} is not in the second interface`);
    }
  });

  it('caps the width of every search field', async () => {
    // A search box spanning a wide screen was the specific thing that looked
    // wrong on the readers page.
    for (const url of ['/staff/books', '/staff/borrowers', '/staff/search?q=a']) {
      const response = await get(url);
      const forms = response.body.match(/<form[^>]*role="search"[^>]*>/g) ?? [];
      assert.ok(forms.length > 0, `${url} has no search form`);
      for (const form of forms) {
        assert.match(form, /class="[^"]*\bsearch\b/, `${url}: a search form without the capped class`);
      }
    }
  });

  it('offers checkboxes, never a multiple-select', async () => {
    // A <select multiple> needs Ctrl+click to pick a second entry, which
    // almost nobody discovers, and draws the chosen rows in the same grey it
    // uses for disabled ones.
    for (const url of pages()) {
      const response = await get(url);
      assert.ok(!/<select[^>]*\bmultiple\b/.test(response.body), `${url} has a multiple-select`);
    }
  });

  it('sends the lending page to the search when it has nothing to lend', async () => {
    // With no copy chosen it was a second, emptier copy of the search page —
    // two places to start the same job. The one with the readers and the
    // basket on it is the one worth keeping.
    const response = await get('/staff/loans/checkout');
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff');
  });

  it('still shows the lending page once a copy is chosen', async () => {
    const copy = db.get('SELECT id FROM copy LIMIT 1');
    const response = await get(`/staff/loans/checkout?copy=${copy.id}`);
    assert.equal(response.statusCode, 200);
  });

  it('keeps a search on the lending page working', async () => {
    // Searching from there adds a second book to the same loan, so it is a
    // different thing from arriving with nothing.
    const response = await get(`/staff/loans/checkout?q=${encodeURIComponent('οδυσ')}`);
    assert.equal(response.statusCode, 200);
  });

  it('has one page for the account, not two', async () => {
    // /staff/account/password rendered the same template as /staff/account
    // and nothing linked to it.
    const response = await get('/staff/account/password');
    assert.equal(response.statusCode, 404, 'the duplicate account page is still there');
  });

  it('keeps every form in one column with its submit set apart', async () => {
    const response = await get('/staff/books/new');
    assert.ok(response.body.includes('class="field__label"'), 'fields are not labelled');
    assert.ok(response.body.includes('<button class="btn" type="submit"'), 'no primary submit');
  });
});
