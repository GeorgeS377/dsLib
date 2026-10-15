// The public catalogue in the second interface.
//
// Most books have no cover image yet, so a grid of covers today is a wall of
// grey placeholders. The list is the default and the grid is a switch, which
// means the design does not have to be redone once covers exist.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { checkOut } from '../src/db/queries/loans.js';
import { cleanupDir, cookieValue, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let fixtures;

const NEXT = { cookie: 'ui=next' };

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  fixtures = seedTestCatalogue(db);
  const staff = await makeStaffUser(db);
  const borrower = createBorrower(db, { displayName: 'Κωνσταντίνα Ιδιωτική', schoolClass: 'Γ1' }).id;
  const copy = db.get("SELECT id FROM copy WHERE barcode = 'T-0001'");
  checkOut(db, { copyId: copy.id, borrowerId: borrower, loanDays: 14, staffUserId: staff.id });
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

const get = (url, headers = NEXT) => app.inject({ method: 'GET', url, headers });

describe('every public page in the second interface', () => {
  it('has a template of its own', () => {
    const root = path.join(process.cwd(), 'src', 'views');
    const classic = fs.readdirSync(path.join(root, 'public')).filter((f) => f.endsWith('.ejs'));
    const next = new Set(fs.readdirSync(path.join(root, 'next', 'public')));
    const missing = classic.filter((file) => !next.has(file));
    assert.deepEqual(missing, [], `public pages with no second-interface template: ${missing}`);
  });

  it('renders', async () => {
    for (const url of [
      '/',
      '/books',
      `/books/${fixtures.books.odyssey}`,
      '/categories',
      '/authors',
      `/authors/${db.get('SELECT id FROM author LIMIT 1').id}`,
    ]) {
      const response = await get(url);
      assert.equal(response.statusCode, 200, `${url} returned ${response.statusCode}`);
      assert.ok(response.body.includes('next.css'), `${url} is not in the second interface`);
    }
  });
});

describe('grid or list', () => {
  it('shows a grid by default', async () => {
    const response = await get('/books');
    assert.match(response.body, /class="[^"]*\bbook-grid\b/, 'not the grid');
    assert.ok(!/class="[^"]*\bbook-list\b/.test(response.body), 'the list showed without being asked');
  });

  it('switches to the list and remembers it', async () => {
    const chosen = await get('/books?view=list');
    assert.match(chosen.body, /class="[^"]*\bbook-list\b/, 'the list did not appear');
    assert.equal(cookieValue(chosen, 'view'), 'list');

    const later = await get('/books', { cookie: 'ui=next; view=list' });
    assert.match(later.body, /class="[^"]*\bbook-list\b/, 'the choice was forgotten');
  });

  it('ignores a view that is not one of the two', async () => {
    const response = await get('/books?view=banana');
    assert.match(response.body, /class="[^"]*\bbook-grid\b/);
    assert.equal(cookieValue(response, 'view'), undefined, 'an unknown view was remembered');
  });

  it('keeps the search and filters when switching', async () => {
    const response = await get(`/books?q=${encodeURIComponent('ομηρος')}&available=1`);
    const link = response.body.match(/href="([^"]*view=list[^"]*)"/)?.[1];
    assert.ok(link, 'no way to switch to the list');
    assert.ok(link.includes('q='), 'the switch drops the search');
    assert.ok(link.includes('available=1'), 'the switch drops the filters');
  });
});

describe('searching as you type', () => {
  it('still works as a plain form', async () => {
    // The enhancement fetches the very page the form would have submitted to,
    // so the page has to answer that request correctly on its own.
    const response = await get(`/?q=${encodeURIComponent('οδυσσεια')}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
  });

  it('marks the form and the region that updates', async () => {
    for (const url of ['/', '/books']) {
      const response = await get(url);
      assert.match(response.body, /<form[^>]*data-live-search/, `${url}: form not marked`);
      assert.match(response.body, /data-live-results/, `${url}: no region to update`);
    }
  });

  it('loads the script on every page that asks for it', async () => {
    // Marking a form data-live-search does nothing on a page that never loads
    // the file implementing it — which is exactly what happened here.
    for (const url of ['/', '/books']) {
      const response = await get(url);
      assert.ok(
        response.body.includes('/assets/js/app.js'),
        `${url} asks for live search but loads no script`,
      );
    }
  });

  it('marks everything that changes the results, not just the search box', async () => {
    // Filters, the view switch and paging are the same operation as typing —
    // ask for a URL and show the part that changed. Left as plain navigations
    // they threw away the scroll position, which is a strange thing to happen
    // when you tick a box halfway down a page.
    const response = await get(`/?q=${encodeURIComponent('ο')}`);
    assert.match(response.body, /<form[^>]*data-live-form/, 'the filter form is not marked');
    assert.match(response.body, /data-live-link/, 'the view switch is not marked');
  });

  it('marks paging so it can bring the new page into view', async () => {
    // Paging is the one case where staying put is wrong, so it is marked
    // differently from the rest.
    const many = await get('/books');
    if (!many.body.includes('data-live-page')) {
      // Only meaningful when there is more than one page of results.
      assert.ok(!many.body.includes('pagination'), 'paging exists but is not marked');
    }
  });

  it('puts the results region where a fetched copy can replace it', async () => {
    // The script swaps the children of [data-live-results] with those from a
    // freshly fetched page, so exactly one such region must exist.
    const response = await get(`/?q=${encodeURIComponent('οδυσ')}`);
    const regions = response.body.match(/data-live-results/g) ?? [];
    assert.equal(regions.length, 1, `${regions.length} regions marked`);
  });
});

describe('the front page is the catalogue', () => {
  it('searches and filters from the front page itself', async () => {
    // George prefers the catalogue to a separate landing page, so the two are
    // one: arriving at the library means arriving at the books.
    const response = await get('/');
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<form[^>]*role="search"/, 'no search on the front page');
    assert.ok(response.body.includes('filter__options'), 'no filters on the front page');
    assert.match(response.body, /class="[^"]*\bbook-grid\b/, 'no results on the front page');
  });

  it('searches without leaving it', async () => {
    const response = await get(`/?q=${encodeURIComponent('οδυσσεια')}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'), 'the search found nothing');
    assert.ok(!response.body.includes('Ιλιάδα'), 'the search did not narrow anything');
  });

  it('keeps /books working for anyone who has it', async () => {
    const response = await get('/books');
    assert.equal(response.statusCode, 200);
  });
});

describe('what a public page must never show', () => {
  it('never prints "undefined" at a reader', async () => {
    // A template that reads a field by the wrong name renders the word
    // "undefined" into the page rather than failing, so nothing catches it
    // except looking — which is how this one was found, on the front page.
    for (const url of [
      '/',
      '/books',
      `/books/${fixtures.books.odyssey}`,
      '/categories',
      '/authors',
    ]) {
      const response = await get(url);
      assert.ok(
        !/>\s*undefined|undefined\s*</.test(response.body) && !response.body.includes(' undefined '),
        `${url} rendered the word "undefined"`,
      );
    }
  });

  it('names no borrower, due date or barcode', async () => {
    for (const url of ['/', '/books', `/books/${fixtures.books.odyssey}`]) {
      const response = await get(url);
      assert.ok(!response.body.includes('Ιδιωτική'), `${url} leaked a borrower name`);
      assert.ok(!response.body.includes('T-0001'), `${url} leaked a barcode`);
      assert.ok(!/\d{4}-\d{2}-\d{2}/.test(response.body), `${url} leaked a date`);
    }
  });

  it('counts the copies rather than listing them', async () => {
    const response = await get(`/books/${fixtures.books.odyssey}`);
    assert.ok(response.body.includes('1 από 2 διαθέσιμα'), 'no availability count');
    assert.equal(response.body.match(/<tbody>/g), null, 'a per-copy table is back');
  });
});
