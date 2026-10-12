// Public catalogue routes — acceptance criteria 1, 2, 3 and 9.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBook } from '../src/db/queries/books.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { checkIn, checkOut } from '../src/db/queries/loans.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';

let app;
let db;
let dir;
let fixtures;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  fixtures = seedTestCatalogue(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

const get = (url, options = {}) => app.inject({ method: 'GET', url, ...options });

describe('browsing without an account (acceptance 1)', () => {
  it('serves every public page to an anonymous visitor', async () => {
    const category = db.get('SELECT slug FROM category LIMIT 1');
    const author = db.get('SELECT id FROM author WHERE name = ?', 'Όμηρος');

    const urls = [
      '/',
      '/books',
      `/books/${fixtures.books.odyssey}`,
      '/categories',
      `/categories/${category.slug}`,
      '/authors',
      `/authors/${author.id}`,
    ];

    for (const url of urls) {
      const response = await get(url);
      assert.equal(response.statusCode, 200, `${url} returned ${response.statusCode}`);
      assert.match(response.headers['content-type'], /text\/html/, url);
    }
  });

  it('never asks an anonymous visitor to log in', async () => {
    for (const url of ['/', '/books', '/categories', '/authors']) {
      const response = await get(url);
      assert.ok(!response.body.includes('type="password"'), `${url} shows a password field`);
    }
  });

  it('declares UTF-8 and renders Greek correctly', async () => {
    const response = await get('/books');
    assert.match(response.headers['content-type'], /charset=utf-8/);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('<meta charset="utf-8">'));
  });

  it('switches the whole interface to English and back', async () => {
    const english = await get('/books?lang=en');
    assert.ok(english.body.includes('Sort by'));
    assert.ok(english.body.includes('<html lang="en">'));
    // Catalogue data stays in the language it was catalogued in.
    assert.ok(english.body.includes('Οδύσσεια'));

    const greek = await get('/books?lang=el');
    assert.ok(greek.body.includes('Ταξινόμηση'));
  });
});

describe('search (acceptance 2)', () => {
  it('finds a title by exact, lowercase, uppercase and unaccented spelling', async () => {
    for (const q of ['Οδύσσεια', 'οδυσσεια', 'ΟΔΥΣΣΕΙΑ', 'οδύσσεια']) {
      const response = await get(`/books?q=${encodeURIComponent(q)}`);
      assert.equal(response.statusCode, 200);
      assert.ok(response.body.includes('Οδύσσεια'), `"${q}" did not find the title`);
      assert.ok(!response.body.includes('search.empty'), `"${q}" rendered the empty state`);
    }
  });

  it('finds a book by author name', async () => {
    const response = await get(`/books?q=${encodeURIComponent('Καζαντζάκης')}`);
    assert.ok(response.body.includes('Ζορμπά'));
  });

  it('finds a book by ISBN', async () => {
    const response = await get('/books?q=9780141439518');
    assert.ok(response.body.includes('Pride and Prejudice'));
  });

  it('finds a book by a keyword from its description', async () => {
    const response = await get(`/books?q=${encodeURIComponent('Ιθάκη')}`);
    assert.ok(response.body.includes('Οδύσσεια'));
  });

  it('matches a partial word', async () => {
    const response = await get(`/books?q=${encodeURIComponent('οδυσ')}`);
    assert.ok(response.body.includes('Οδύσσεια'));
  });

  it('shows a helpful message when nothing matches', async () => {
    const response = await get('/books?q=zzzznothingmatches');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Δεν βρέθηκαν βιβλία'));
    assert.ok(response.body.includes('zzzznothingmatches'), 'the query is echoed back');
    assert.ok(response.body.includes('/books'), 'offers a way to clear the search');
  });

  it('keeps the query in the search box after searching', async () => {
    const response = await get(`/books?q=${encodeURIComponent('Ιλιάδα')}`);
    assert.match(response.body, /name="q"[^>]*value="Ιλιάδα"/);
  });

  it('escapes a query containing HTML rather than rendering it', async () => {
    const payload = '<script>alert(1)</script>';
    const response = await get(`/books?q=${encodeURIComponent(payload)}`);
    assert.equal(response.statusCode, 200);
    assert.ok(!response.body.includes('<script>alert(1)</script>'), 'reflected XSS');
    assert.ok(response.body.includes('&lt;script&gt;'), 'the query is escaped, not dropped');
  });

  it('treats SQL metacharacters in a query as text', async () => {
    const response = await get(`/books?q=${encodeURIComponent("' OR 1=1; DROP TABLE book; --")}`);
    assert.equal(response.statusCode, 200);
    // The catalogue is still intact.
    assert.equal(db.value('SELECT COUNT(*) FROM book'), 5);
  });
});

describe('filters, sorting and pagination (acceptance 3)', () => {
  it('filters by category', async () => {
    const category = db.get('SELECT id, slug FROM category WHERE name = ?', 'Αρχαία Γραμματεία');
    const response = await get(`/books?category=${category.id}`);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('Ιλιάδα'));
    assert.ok(!response.body.includes('Pride and Prejudice'));
  });

  it('filters by author, year, language and availability', async () => {
    const author = db.get('SELECT id FROM author WHERE name = ?', 'Jane Austen');
    assert.ok((await get(`/books?author=${author.id}`)).body.includes('Pride and Prejudice'));
    assert.ok((await get('/books?year=1946')).body.includes('Ζορμπά'));
    assert.ok((await get('/books?language=en')).body.includes('Pride and Prejudice'));

    // The Austen copy is in for repair, so it is excluded from available-only.
    const available = await get('/books?available=1');
    assert.ok(!available.body.includes('Pride and Prejudice'));
    assert.ok(available.body.includes('Οδύσσεια'));
  });

  it('applies each sort order', async () => {
    for (const sort of ['title', 'title_desc', 'author', 'newest', 'year', 'year_desc']) {
      const response = await get(`/books?sort=${sort}`);
      assert.equal(response.statusCode, 200, `sort=${sort} failed`);
      assert.match(response.body, new RegExp(`value="${sort}"[^>]*selected`), `sort=${sort} not reflected in the control`);
    }
  });

  it('ignores a bogus sort value instead of erroring', async () => {
    const response = await get('/books?sort=../../etc/passwd');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
  });

  it('paginates and carries the search term into page links', async () => {
    const response = await get('/books?q=ο&perPage=2');
    assert.equal(response.statusCode, 200);

    // With four titles and the default page size there is a single page here,
    // so create enough titles to force pagination.
    for (let i = 0; i < 30; i += 1) {
      createBook(db, { title: `Δοκιμαστικό Βιβλίο ${i}`, authorNames: ['Δοκιμή'] });
    }

    const page1 = await get(`/books?q=${encodeURIComponent('δοκιμαστικο')}`);
    assert.ok(page1.body.includes('Σελίδα') || page1.body.includes('pagination'));
    // Page links must keep the query.
    assert.match(page1.body, /href="\/books\?q=[^"]*&amp;page=2"/);

    const page2 = await get(`/books?q=${encodeURIComponent('δοκιμαστικο')}&page=2`);
    assert.equal(page2.statusCode, 200);
    assert.match(page2.body, /aria-current="page"/);
  });

  it('preserves every active filter across pagination links', async () => {
    const category = db.get('SELECT id FROM category WHERE name = ?', 'Αρχαία Γραμματεία');
    const response = await get(
      `/books?q=${encodeURIComponent('ο')}&category=${category.id}&sort=newest&available=1`,
    );
    assert.equal(response.statusCode, 200);

    // Each filter is re-emitted in the sort form, so changing sort keeps them.
    assert.match(response.body, new RegExp(`name="category" value="${category.id}"`));
    assert.match(response.body, /name="available" value="1"/);
    assert.match(response.body, /name="q" value="ο"/);
  });

  it('clamps an out-of-range page number', async () => {
    for (const page of ['0', '-3', '99999', 'abc']) {
      const response = await get(`/books?page=${page}`);
      assert.equal(response.statusCode, 200, `page=${page} failed`);
    }
  });

  it('shows a result count', async () => {
    const response = await get('/books?q=9780141439518');
    assert.ok(response.body.includes('Εμφάνιση'));
  });
});

describe('book detail page', () => {
  it('shows every catalogued field', async () => {
    const response = await get(`/books/${fixtures.books.odyssey}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('Όμηρος'), 'author');
    assert.ok(response.body.includes('1998'), 'year');
    assert.ok(response.body.includes('Εκδόσεις Κλασικά'), 'publisher');
    assert.ok(response.body.includes('Αρχαία Γραμματεία'), 'category');
    assert.ok(response.body.includes('Ιθάκη'), 'description');
    assert.ok(response.body.includes('Α1-01'), 'shelf location');
  });

  it('shows availability derived from the copies', async () => {
    const response = await get(`/books/${fixtures.books.odyssey}`);
    assert.ok(response.body.includes('2 από 2 διαθέσιμα'));
  });

  it('reflects a checkout immediately (acceptance 6)', async () => {
    const borrower = createBorrower(db, { displayName: 'Μαρία Παπαδοπούλου', schoolClass: 'Β2' });
    const loan = checkOut(db, { copyId: fixtures.copies.odysseyA, borrowerId: borrower.id });
    assert.ok(loan.ok);

    const during = await get(`/books/${fixtures.books.odyssey}`);
    assert.ok(during.body.includes('1 από 2 διαθέσιμα'));
    assert.ok(during.body.includes('Σε δανεισμό'), 'the loaned copy is marked');

    checkIn(db, { loanId: loan.id });
    const after = await get(`/books/${fixtures.books.odyssey}`);
    assert.ok(after.body.includes('2 από 2 διαθέσιμα'));
  });

  it('shows a copy that is away for repair as unavailable', async () => {
    const response = await get(`/books/${fixtures.books.austen}`);
    assert.ok(response.body.includes('Μη διαθέσιμο'));
    assert.ok(response.body.includes('Σε επιδιόρθωση'));
  });

  it('returns 404 for an archived, unknown or malformed id', async () => {
    for (const url of [
      `/books/${fixtures.books.archived}`,
      '/books/999999',
      '/books/abc',
      '/books/0',
      '/books/-1',
      '/books/1.5',
    ]) {
      const response = await get(url);
      assert.equal(response.statusCode, 404, `${url} returned ${response.statusCode}`);
    }
  });

  it('offers a back link only for a same-site search referer', async () => {
    const withReferer = await get(`/books/${fixtures.books.odyssey}`, {
      headers: { referer: 'http://localhost/books?q=test', host: 'localhost' },
    });
    assert.ok(withReferer.body.includes('/books?q=test'));

    // An off-site referer must not become a link on our page.
    const offSite = await get(`/books/${fixtures.books.odyssey}`, {
      headers: { referer: 'https://evil.example.com/phish', host: 'localhost' },
    });
    assert.ok(!offSite.body.includes('evil.example.com'));
  });
});

describe('categories and authors', () => {
  it('lists categories with their counts and links to each', async () => {
    const response = await get('/categories');
    assert.ok(response.body.includes('Αρχαία Γραμματεία'));
    assert.ok(response.body.includes('/categories/archaia-grammateia'));
  });

  it('shows the books in a category', async () => {
    const response = await get('/categories/archaia-grammateia');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('Ιλιάδα'));
    assert.ok(!response.body.includes('Pride and Prejudice'));
  });

  it('returns 404 for an unknown category slug', async () => {
    assert.equal((await get('/categories/no-such-category')).statusCode, 404);
  });

  it('lists authors and shows one author\'s books', async () => {
    const list = await get('/authors');
    assert.ok(list.body.includes('Όμηρος'));

    const author = db.get('SELECT id FROM author WHERE name = ?', 'Όμηρος');
    const page = await get(`/authors/${author.id}`);
    assert.equal(page.statusCode, 200);
    assert.ok(page.body.includes('Οδύσσεια'));
    assert.ok(page.body.includes('Ιλιάδα'));
  });

  it('searches the author list', async () => {
    const response = await get(`/authors?q=${encodeURIComponent('ομηρ')}`);
    assert.ok(response.body.includes('Όμηρος'));
    assert.ok(!response.body.includes('Jane Austen'));
  });

  it('hides an author whose every title is archived', async () => {
    const author = db.get('SELECT id FROM author WHERE name = ?', 'Άγνωστος');
    assert.equal((await get(`/authors/${author.id}`)).statusCode, 404);
    assert.ok(!(await get('/authors')).body.includes('Άγνωστος'));
  });
});

describe('markup matches what the CSP allows', () => {
  // The CSP permits no inline script or style. Anything inline would be
  // silently dropped by the browser, which is worse than a visible error —
  // so assert the templates never emit it.
  const pages = async () => {
    const category = db.get('SELECT slug FROM category LIMIT 1');
    const author = db.get('SELECT id FROM author WHERE name = ?', 'Όμηρος');
    const urls = [
      '/',
      '/books',
      `/books?q=${encodeURIComponent('οδυσσεια')}&available=1&sort=newest`,
      '/books?q=zzzznothing',
      `/books/${fixtures.books.odyssey}`,
      '/categories',
      `/categories/${category.slug}`,
      '/authors',
      `/authors/${author.id}`,
      '/no-such-page',
    ];
    return Promise.all(urls.map(async (url) => ({ url, body: (await get(url)).body })));
  };

  it('uses no inline style attributes', async () => {
    for (const { url, body } of await pages()) {
      assert.ok(!/<[^>]+\sstyle\s*=/.test(body), `${url} has an inline style attribute`);
    }
  });

  it('uses no inline event handlers or inline script', async () => {
    for (const { url, body } of await pages()) {
      assert.ok(!/\son(click|change|submit|load|input|focus)\s*=/i.test(body), `${url} has an inline handler`);
      assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>[^<]*\S/.test(body), `${url} has inline script content`);
    }
  });

  it('emits no HTML-escaped attribute names, which would never apply', async () => {
    // Catches `aria-current=&#34;page&#34;`, the result of interpolating an
    // attribute string through an escaping output tag.
    for (const { url, body } of await pages()) {
      assert.ok(!body.includes('=&#34;'), `${url} has an escaped attribute quote`);
      assert.ok(!/\s[a-z-]+=&quot;/.test(body), `${url} has an escaped attribute quote`);
    }
  });

  it('marks the current nav item', async () => {
    const response = await get('/books');
    assert.match(response.body, /<a href="\/books" aria-current="page">/);
  });

  it('references only same-origin assets', async () => {
    for (const { url, body } of await pages()) {
      const external = body.match(/(?:src|href)="https?:\/\/[^"]+"/g) ?? [];
      assert.deepEqual(external, [], `${url} references an external asset: ${external.join(', ')}`);
    }
  });
});

describe('what public pages must never expose (acceptance 8)', () => {
  it('shows no borrower information anywhere', async () => {
    const borrower = createBorrower(db, {
      displayName: 'Ευαγγελία Κωνσταντινίδου',
      schoolClass: 'Γ1',
    });
    checkOut(db, { copyId: fixtures.copies.iliadA, borrowerId: borrower.id });

    const category = db.get('SELECT slug FROM category LIMIT 1');
    const author = db.get('SELECT id FROM author WHERE name = ?', 'Όμηρος');

    for (const url of [
      '/',
      '/books',
      '/books?q=' + encodeURIComponent('Ιλιάδα'),
      `/books/${fixtures.books.iliad}`,
      '/categories',
      `/categories/${category.slug}`,
      '/authors',
      `/authors/${author.id}`,
    ]) {
      const body = (await get(url)).body;
      assert.ok(!body.includes('Κωνσταντινίδου'), `${url} leaked a borrower name`);
      assert.ok(!body.includes('Ευαγγελία'), `${url} leaked a borrower name`);
      assert.ok(!body.includes('Γ1'), `${url} leaked a borrower class`);
    }
  });

  it('shows no due dates on the public book page', async () => {
    const response = await get(`/books/${fixtures.books.iliad}`);
    // The copy is marked as on loan, but without saying when it is back.
    assert.ok(response.body.includes('Σε δανεισμό'));
    assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(response.body), 'a timestamp leaked onto the page');
  });

  it('exposes no barcodes publicly', async () => {
    const response = await get(`/books/${fixtures.books.odyssey}`);
    assert.ok(!response.body.includes('T-0001'), 'a copy barcode is public');
  });

  it('exposes no staff account data', async () => {
    for (const url of ['/', '/books', '/categories']) {
      const body = (await get(url)).body;
      assert.ok(!body.includes('scrypt$'));
      assert.ok(!body.toLowerCase().includes('password_hash'));
    }
  });

  it('leaks no internal paths or SQL in any response', async () => {
    for (const url of ['/', '/books?q=%27', '/books/abc', '/no-such-page']) {
      const body = (await get(url)).body;
      assert.ok(!body.includes('/home/'), `${url} leaked a filesystem path`);
      assert.ok(!body.includes('SELECT '), `${url} leaked SQL`);
      assert.ok(!body.includes('node_modules'), `${url} leaked a module path`);
    }
  });
});
