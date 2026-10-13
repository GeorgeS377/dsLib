// Theme, icons and the filter bar — the parts of the interface a design
// review flagged. These exist so the fixes cannot quietly regress.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBook } from '../src/db/queries/books.js';
import { createCategory } from '../src/db/queries/categories.js';
import { createCopy } from '../src/db/queries/copies.js';
import { cleanupDir, cookieValue, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let fixtures;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  fixtures = seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

const get = (url, options = {}) => app.inject({ method: 'GET', url, ...options });

describe('theme', () => {
  it('serves light by default', async () => {
    for (const url of ['/', '/books', '/staff/login']) {
      const response = await get(url);
      assert.ok(
        !response.body.includes('data-theme="dark"'),
        `${url} rendered dark without being asked`,
      );
    }
  });

  it('ignores the operating system preference', async () => {
    // A machine set to dark must still get light. Which theme the OS asks for
    // is decided in the stylesheet and nowhere else, so the served stylesheet
    // is the only place this can be observed from here — a browser would be
    // needed to watch it take effect. Matched against the declarations rather
    // than the raw text, so reformatting cannot hide one.
    const css = await get('/assets/css/app.css');
    const declarations = css.body.toLowerCase().replace(/\s+/g, '');
    assert.ok(
      !declarations.includes('prefers-color-scheme'),
      'the stylesheet still switches on the OS preference',
    );
  });

  it('switches to dark on request and remembers it', async () => {
    const response = await get('/?theme=dark');
    assert.match(response.body, /<html lang="el" data-theme="dark">/);
    assert.equal(cookieValue(response, 'theme'), 'dark');

    // The choice survives to the next page without the parameter.
    const next = await get('/books', { cookies: { theme: 'dark' } });
    assert.ok(next.body.includes('data-theme="dark"'));
  });

  it('switches back to light', async () => {
    const response = await get('/?theme=light', { cookies: { theme: 'dark' } });
    assert.ok(!response.body.includes('data-theme="dark"'));
    assert.equal(cookieValue(response, 'theme'), 'light');
  });

  it('ignores an unknown theme value', async () => {
    const response = await get('/?theme=neon');
    assert.ok(!response.body.includes('data-theme'));
    assert.equal(cookieValue(response, 'theme'), undefined);
  });

  it('offers the toggle on public and staff pages', async () => {
    assert.match((await get('/books')).body, /class="theme-toggle"/);

    const session = await login(app);
    assert.match((await session.get('/staff')).body, /class="theme-toggle"/);
  });

  it('applies the theme before <head> is parsed, with no flash of the wrong palette', async () => {
    // Setting data-theme from script on load would repaint after first paint
    // and flash light at someone who chose dark.
    const response = await get('/?theme=dark');
    const head = response.body.slice(0, response.body.indexOf('</head>'));
    assert.ok(head.includes('data-theme="dark"'), 'the theme is set too late');
  });
});

describe('icons', () => {
  it('uses no emoji anywhere in the interface', async () => {
    const session = await login(app);
    const pages = [
      ['/', (await get('/')).body],
      ['/books', (await get('/books')).body],
      ['/books (empty)', (await get('/books?q=zzznothing')).body],
      ['/books/:id', (await get(`/books/${fixtures.books.odyssey}`)).body],
      ['/categories', (await get('/categories')).body],
      ['/authors', (await get('/authors')).body],
      ['404', (await get('/no-such-page')).body],
      ['/staff', (await session.get('/staff')).body],
      ['/staff/books', (await session.get('/staff/books')).body],
      ['/staff/loans/checkout', (await session.get('/staff/loans/checkout')).body],
      ['/staff/borrowers', (await session.get('/staff/borrowers')).body],
      ['/staff/settings', (await session.get('/staff/settings')).body],
    ];

    // Pictographs, dingbats and arrows. Greek text and ordinary punctuation
    // fall outside these ranges.
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}]/u;
    for (const [name, body] of pages) {
      const match = body.match(emoji);
      assert.equal(match, null, `${name} still renders an emoji: ${match && match[0]}`);
    }
  });

  it('draws icons as inline SVG that inherits the text colour', async () => {
    const response = await get('/books');
    assert.match(response.body, /<svg class="icon[^"]*"/);
    assert.match(response.body, /stroke="currentColor"/);
  });

  it('hides decorative icons from assistive technology', async () => {
    const response = await get('/books');
    const icons = response.body.match(/<svg class="icon[\s\S]*?<\/svg>/g) ?? [];
    assert.ok(icons.length > 0, 'no icons were rendered');
    for (const icon of icons) {
      assert.ok(
        icon.includes('aria-hidden="true"') || icon.includes('role="img"'),
        'an icon is neither hidden nor labelled',
      );
    }
  });
});

describe('header and footer layout', () => {
  it('puts the library name first and the language control last', async () => {
    for (const url of ['/', '/books', '/categories']) {
      const body = (await get(url)).body;
      const header = body.slice(body.indexOf('<header'), body.indexOf('</header>'));
      assert.ok(
        header.indexOf('site-brand') < header.indexOf('lang-switch'),
        `${url}: the language control comes before the library name`,
      );
      assert.ok(header.includes('site-header__end'), `${url}: no right-hand cluster`);
    }
  });

  it('puts staff sign-in at the top right, not in the footer', async () => {
    const body = (await get('/books')).body;
    const header = body.slice(body.indexOf('<header'), body.indexOf('</header>'));
    const footer = body.slice(body.indexOf('<footer'));

    assert.ok(header.includes('site-header__staff'), 'the staff link is not in the header');
    assert.ok(
      header.indexOf('site-brand') < header.indexOf('site-header__staff'),
      'the staff link comes before the library name',
    );
    assert.ok(!footer.includes('/staff'), 'the staff link is still in the footer too');
  });

  it('sets no label in all caps, which would strip Greek accents', async () => {
    // ΠΡΟΘΕΣΜΊΑ loses its accent when a browser upper-cases ΠΡΟΘΕΣΜΙΑ, and
    // that happens in the stylesheet, so this is asserted against the served
    // CSS. Whitespace and case are normalized first: 'text-transform:UPPERCASE'
    // is the same defect and a substring match on the pretty-printed form
    // would have missed it.
    const css = await get('/assets/css/app.css');
    const declarations = css.body.toLowerCase().replace(/\s+/g, '');
    for (const banned of ['text-transform:uppercase', 'text-transform:capitalize']) {
      assert.ok(
        !declarations.includes(banned),
        `${banned} renders Greek without its accents`,
      );
    }
  });

  it('gives the staff area one top bar, not two stacked ones', async () => {
    const session = await login(app);
    const body = (await session.get('/staff')).body;

    const bars = body.match(/<header\b/g) ?? [];
    assert.equal(bars.length, 1, `the staff page renders ${bars.length} bars`);

    const bar = body.slice(body.indexOf('<header'), body.indexOf('</header>'));
    // Everything lives in that one bar, in reading order.
    assert.ok(bar.includes('staff-brand'), 'no brand');
    assert.ok(bar.includes('staff-tabs'), 'the tabs are outside the bar');
    assert.ok(bar.includes('/staff/logout'), 'sign out is outside the bar');
    assert.ok(
      bar.indexOf('staff-brand') < bar.indexOf('staff-tabs'),
      'the tabs come before the brand',
    );
    assert.ok(
      bar.indexOf('staff-tabs') < bar.indexOf('staff-bar__end'),
      'the user controls come before the tabs',
    );
  });

  it('marks sign out as destructive', async () => {
    const session = await login(app);
    const body = (await session.get('/staff')).body;
    const form = body.slice(body.indexOf('action="/staff/logout"'));
    assert.match(
      form.slice(0, 400),
      /button--danger-solid/,
      'sign out is not styled as a destructive action',
    );
  });

  it('offers a way back to the public catalogue, signed in or not', async () => {
    // Including on the sign-in page, which previously had no bar at all —
    // arriving there from the public site left only a footer link.
    const anonymous = await get('/staff/login');
    const anonBar = anonymous.body.slice(0, anonymous.body.indexOf('</header>'));
    assert.ok(anonBar.includes('staff-bar__public'), 'the sign-in page has no way back');
    assert.ok(!anonBar.includes('/staff/logout'), 'the sign-in page offers sign out');
    assert.ok(!anonBar.includes('staff-tabs'), 'the sign-in page shows the staff tabs');

    const session = await login(app);
    const signedIn = await session.get('/staff');
    const bar = signedIn.body.slice(0, signedIn.body.indexOf('</header>'));
    assert.ok(bar.includes('staff-bar__public'), 'no way back when signed in');
  });

  it('gives the public staff link an icon', async () => {
    const body = (await get('/books')).body;
    const link = body.slice(
      body.indexOf('site-header__staff'),
      body.indexOf('</a>', body.indexOf('site-header__staff')),
    );
    assert.match(link, /<svg class="icon/, 'the staff sign-in link has no icon');
  });
});

describe('catalogue filters', () => {
  it('shows the filters without needing to open anything', async () => {
    const response = await get('/books');
    assert.ok(!response.body.includes('<details class="filters"'), 'filters are still collapsed');
    assert.match(response.body, /<form class="filters"/);
  });

  it('shows the same filters on the home page', async () => {
    const response = await get('/');
    assert.match(response.body, /<form class="filters"/);
    assert.match(response.body, /name="category" value="\d+"/);
  });

  it('offers only one search box per page', async () => {
    for (const url of ['/', '/books']) {
      const body = (await get(url)).body;
      const searchInputs = (body.match(/<input[^>]*type="search"[^>]*>/g) ?? []).filter((tag) =>
        tag.includes('name="q"'),
      );
      assert.equal(searchInputs.length, 1, `${url} has ${searchInputs.length} search boxes`);
    }
  });

  it('offers checkboxes rather than a multi-select', async () => {
    // A <select multiple> needs Ctrl+click to pick a second option, which
    // nothing on screen explains, and renders the chosen row in the browser's
    // grey so it reads as disabled. Checkboxes are one click and obvious.
    const response = await get('/books');
    assert.ok(!response.body.includes('multiple'), 'a multi-select is still in use');
    assert.match(response.body, /<input type="checkbox" name="category" value="\d+"/);
    assert.match(response.body, /<input type="checkbox" name="author" value="\d+"/);
    assert.match(response.body, /<input type="checkbox" name="year" value="\d+"/);
  });

  it('wraps each option in its own label, so the whole row is clickable', async () => {
    const response = await get('/books');
    assert.match(
      response.body,
      /<label class="filter__option">\s*<input type="checkbox"/,
      'the checkbox is not inside its label',
    );
  });

  it('treats two categories as "either", not "both"', async () => {
    const ancient = db.get('SELECT id FROM category WHERE name = ?', 'Αρχαία Γραμματεία');
    const foreign = db.get('SELECT id FROM category WHERE name = ?', 'Ξένη Λογοτεχνία');

    const one = await get(`/books?category=${ancient.id}`);
    assert.ok(one.body.includes('Οδύσσεια'));
    assert.ok(!one.body.includes('Pride and Prejudice'));

    const both = await get(`/books?category=${ancient.id}&category=${foreign.id}`);
    assert.ok(both.body.includes('Οδύσσεια'), 'the first category was dropped');
    assert.ok(both.body.includes('Pride and Prejudice'), 'the second category was dropped');
  });

  it('keeps every selected value when paginating', async () => {
    const category = db.get('SELECT id FROM category LIMIT 1');
    const extra = createCategory(db, { name: 'Δοκιμαστική Κατηγορία' });
    // Enough titles to force a second page.
    for (let i = 0; i < 30; i += 1) {
      createBook(db, { title: `Σελιδοποίηση ${i}`, categoryIds: [extra.id] });
    }

    const response = await get(`/books?category=${category.id}&category=${extra.id}`);
    assert.equal(response.statusCode, 200);

    const nextLink = (response.body.match(/href="(\/books\?[^"]*page=2[^"]*)"/) ?? [])[1];
    assert.ok(nextLink, 'no pagination link was produced');
    assert.ok(nextLink.includes(`category=${category.id}`), 'the first category was dropped');
    assert.ok(nextLink.includes(`category=${extra.id}`), 'the second category was dropped');
  });

  it('does not auto-submit the filter form', async () => {
    // With a multi-select, submitting on change would fire after the first
    // option is clicked and before the second is chosen.
    const response = await get('/books');
    const start = response.body.indexOf('<form class="filters"');
    const form = response.body.slice(start, response.body.indexOf('</form>', start));
    assert.ok(!form.includes('data-autosubmit'), 'the filter form auto-submits');
  });

  it('survives a hand-edited URL with nonsense values', async () => {
    for (const url of [
      '/books?category=abc',
      '/books?category=-1&author=0',
      '/books?year=notayear',
      '/books?category=1&category=1&category=1',
    ]) {
      assert.equal((await get(url)).statusCode, 200, url);
    }
  });
});

describe('lending without a barcode', () => {
  it('finds copies by title', async () => {
    const session = await login(app);
    const response = await session.get(`/staff/loans/checkout?q=${encodeURIComponent('οδυσσεια')}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('T-0001'), 'the matching copies are not listed');
  });

  it('finds copies by author, in any Greek casing', async () => {
    const session = await login(app);
    for (const q of ['Όμηρος', 'ομηροσ', 'ΟΜΗΡΟΣ']) {
      const response = await session.get(`/staff/loans/checkout?q=${encodeURIComponent(q)}`);
      assert.ok(response.body.includes('Οδύσσεια'), `"${q}" found nothing`);
    }
  });

  it('lends a copy that has no barcode at all', async () => {
    // The case the barcode-only flow could never handle.
    const session = await login(app);
    const copy = createCopy(db, fixtures.books.iliad, { shelfLocation: 'Α1-09' });
    assert.ok(copy.ok);

    const page = await session.get(`/staff/loans/checkout?copy=${copy.id}`);
    assert.equal(page.statusCode, 200);
    assert.ok(page.body.includes('Ιλιάδα'));

    const response = await session.post(
      '/staff/loans/checkout',
      { copy_id: copy.id, new_borrower_name: 'Χωρίς Barcode', new_borrower_class: 'Α2' },
      { tokenFrom: `/staff/loans/checkout?copy=${copy.id}` },
    );
    assert.equal(response.statusCode, 302);

    const loan = db.get(
      'SELECT id FROM loan WHERE copy_id = ? AND returned_at IS NULL',
      copy.id,
    );
    assert.ok(loan, 'the loan was not created');
  });

  it('offers no Choose action for a copy that is already out', async () => {
    const session = await login(app);
    const copy = db.get("SELECT id FROM copy WHERE barcode = 'T-0003'");
    await session.post(
      '/staff/loans/checkout',
      { copy_id: copy.id, new_borrower_name: 'Κάποιος' },
      { tokenFrom: `/staff/loans/checkout?copy=${copy.id}` },
    );

    const response = await session.get(`/staff/loans/checkout?q=${encodeURIComponent('ιλιαδα')}`);
    // The title still appears with its availability, but with no way to lend
    // it. Matched on the parameter rather than a whole URL, so the assertion
    // cannot be satisfied by the link merely being spelled differently.
    assert.ok(response.body.includes('Ιλιάδα'));
    const total = db.value('SELECT COUNT(*) FROM copy WHERE book_id = ?', fixtures.books.iliad);
    assert.ok(
      response.body.includes(`0 από ${total} διαθέσιμα`),
      'the title looks lendable although every copy is out',
    );
    assert.ok(
      !new RegExp(`copy=${copy.id}\\b`).test(response.body),
      'the copy that is already out is still offered',
    );
  });

  it('still accepts a scanned barcode', async () => {
    const session = await login(app);
    const response = await session.get('/staff/loans/checkout?barcode=T-0002');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('T-0002'));
  });

  it('reports a search that matches nothing', async () => {
    const session = await login(app);
    const response = await session.get('/staff/loans/checkout?q=zzznothingmatches');
    assert.ok(response.body.includes('Δεν βρέθηκαν βιβλία'));
  });

  it('shows a checkout refusal where the librarian is looking', async () => {
    // The reason comes from checkOut(), by which point the barcode lookup
    // field is off screen — an error attached to it would never be seen.
    const session = await login(app);
    const copy = db.get("SELECT id FROM copy WHERE barcode = 'T-0004'");
    const response = await session.post(
      '/staff/loans/checkout',
      { copy_id: copy.id, new_borrower_name: 'Χρονοταξιδιώτης', due_date: '2020-01-01' },
      { tokenFrom: `/staff/loans/checkout?copy=${copy.id}` },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('έχει ήδη περάσει'), 'the reason was not shown');
  });
});
