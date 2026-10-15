// The second interface's shell: the bar, the bottom nav, the stylesheet.
//
// These pin the decisions from the mockup session that are structural rather
// than cosmetic — what sits where, and what is reachable without a tap.
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
let session;

const NEXT = { cookie: 'ui=next' };

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

const get = (url, options = {}) => app.inject({ method: 'GET', url, ...options });

// session.get() sets the cookie header itself, so the flavour has to travel
// alongside the session rather than as an extra header.
const staff = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

describe('the second interface shell', () => {
  it('serves its own stylesheet and not the first interface\'s', async () => {
    const response = await get('/', { headers: NEXT });
    assert.ok(response.body.includes('/assets/css/next.css'));
    assert.ok(!response.body.includes('/assets/css/app.css'));
  });

  it('puts the library on the left and the account on the right', async () => {
    const response = await staff('/staff');
    assert.equal(response.statusCode, 200);
    const brand = response.body.indexOf('bar__brand');
    const who = response.body.indexOf('bar__who');
    assert.ok(brand > -1, 'no brand in the bar');
    assert.ok(who > -1, 'no account in the bar');
    assert.ok(brand < who, 'the account comes before the library name');
  });

  it('gives staff pages a bottom nav of the four everyday pages', async () => {
    const response = await staff('/staff');
    const nav = response.body.slice(response.body.indexOf('tabbar'));
    for (const label of ['Αναζήτηση', 'Κατάλογος', 'Δανεισμοί', 'Αναγνώστες']) {
      assert.ok(nav.includes(label), `${label} is missing from the bottom nav`);
    }
  });

  it('marks exactly one item in each navigation as the current page', async () => {
    // Two navigations exist — the bar on a wide screen, the tab bar on a
    // phone — and only one is ever visible. Each marks the page once; what
    // would be wrong is two items inside the same nav.
    const response = await staff('/staff/loans');
    const navs = response.body.match(/<nav[\s\S]*?<\/nav>/g) ?? [];
    assert.ok(navs.length >= 2, 'expected a top bar and a bottom bar');
    for (const nav of navs) {
      const marks = (nav.match(/aria-current="page"/g) ?? []).length;
      assert.ok(marks <= 1, `${marks} items in one navigation claim to be the current page`);
    }
    assert.ok(
      navs.some((nav) => nav.includes('aria-current="page"')),
      'no navigation says which page this is',
    );
  });

  it('keeps language and theme out of the staff bar', async () => {
    // They are not desk-side decisions and do not earn space on a narrow
    // screen; the footer carries them.
    const response = await staff('/staff');
    const bar = response.body.slice(
      response.body.indexOf('<header'),
      response.body.indexOf('</header>'),
    );
    assert.ok(!bar.includes('lang=en'), 'the language toggle is in the bar');
    assert.ok(!bar.includes('theme=dark'), 'the theme toggle is in the bar');
    assert.ok(response.body.includes('lang=en'), 'the language toggle is gone entirely');
  });

  it('sets nothing in capitals, which would strip Greek accents', async () => {
    const css = await get('/assets/css/next.css');
    const declarations = css.body.toLowerCase().replace(/\s+/g, '');
    for (const banned of ['text-transform:uppercase', 'text-transform:capitalize']) {
      assert.ok(!declarations.includes(banned), `${banned} renders Greek without its accents`);
    }
  });

  it('never puts white text on the orange', async () => {
    // #fb6222 behind white is 3.1:1, under the 4.5:1 a person needs to read
    // it. Orange is a mark, a rule and a pale badge — never a text backdrop.
    const css = await get('/assets/css/next.css');
    const rules = css.body.toLowerCase().replace(/\s+/g, '');
    assert.ok(!/background:#fb6222;color:#fff/.test(rules), 'white text on orange');
    assert.ok(!/color:#fff;background:#fb6222/.test(rules), 'white text on orange');
  });

  it('carries no inline styles, which its own policy would block', async () => {
    // The app sends style-src 'self' with no 'unsafe-inline', so a style
    // attribute is not merely untidy — the browser drops it and the element
    // renders unstyled. Nothing in the first interface uses one either.
    const session2 = session;
    const urls = [
      ['/', NEXT],
      ['/books', NEXT],
      ['/books/1', NEXT],
      ['/categories', NEXT],
      ['/authors', NEXT],
      ['/staff/login', NEXT],
    ];
    for (const [url, headers] of urls) {
      const response = await get(url, { headers });
      const found = response.body.match(/\sstyle="[^"]*"/g) ?? [];
      assert.deepEqual(found, [], `${url} has inline styles: ${found.slice(0, 3)}`);
    }

    for (const url of ['/staff', '/staff/search?q=a', '/staff/books', '/staff/loans',
                       '/staff/borrowers', '/staff/settings', '/staff/account']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: `${session2.cookie}; ui=next` },
      });
      const found = response.body.match(/\sstyle="[^"]*"/g) ?? [];
      assert.deepEqual(found, [], `${url} has inline styles: ${found.slice(0, 3)}`);
    }
  });

  it('switches the sign-in page too', async () => {
    // The sign-in page renders through reply.view rather than the decorators,
    // so it was the one page the flavour never reached — and the one page a
    // teacher sees first.
    const response = await get('/staff/login', { headers: NEXT });
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('/assets/css/next.css'), 'the sign-in page did not switch');
    assert.ok(!response.body.includes('/assets/css/app.css'));
  });

  it('says what went wrong when a sign-in fails', async () => {
    // The route hands over a whole translation key; a template that prefixes
    // it again renders the key itself at the person who mistyped.
    const form = await get('/staff/login', { headers: NEXT });
    const token = form.body.match(/name="_csrf"\s+value="([^"]+)"/)[1];
    // One cookie arrives as a string, several as an array.
    const raw = form.headers['set-cookie'] ?? [];
    const cookies = (Array.isArray(raw) ? raw : [raw])
      .map((c) => c.split(';')[0]).join('; ');

    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: {
        cookie: `${cookies}; ui=next`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        _csrf: token, username: 'maria', password: 'definitely-wrong',
      }).toString(),
    });

    assert.equal(response.statusCode, 401);
    assert.ok(response.body.includes('Λάθος όνομα χρήστη ή κωδικός.'), 'no reason shown');
    assert.ok(!response.body.includes('login.error'), 'a translation key was shown instead');
  });

  it('styles every kind of text input it uses', async () => {
    // A field whose type is missing from the stylesheet renders as a browser
    // default — a box a third the width of the ones around it. Comparing the
    // two lists catches that without needing to look.
    const css = (await get('/assets/css/next.css')).body;
    const styled = new Set(
      [...css.matchAll(/input\[type="([a-z]+)"\]/g)].map((m) => m[1]),
    );

    const views = path.join(process.cwd(), 'src', 'views', 'next');
    const used = new Set();
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ejs')) {
          for (const m of fs.readFileSync(full, 'utf8').matchAll(/type="([a-z]+)"/g)) {
            used.add(m[1]);
          }
        }
      }
    };
    walk(views);

    // These carry their own rules or need none.
    const exempt = new Set(['hidden', 'checkbox', 'radio', 'submit', 'button', 'file']);
    const unstyled = [...used].filter((type) => !styled.has(type) && !exempt.has(type));
    assert.deepEqual(unstyled, [], `input types with no styling: ${unstyled}`);
  });

  it('declares a policy that forbids inline styles', async () => {
    const response = await get('/', { headers: NEXT });
    const csp = response.headers['content-security-policy'] ?? '';
    assert.match(csp, /style-src [^;]*'self'/, 'no style-src policy');
    assert.ok(!csp.includes("style-src 'self' 'unsafe-inline'"), 'the policy was loosened');
  });

  it('still renders light by default and dark when asked', async () => {
    const light = await get('/', { headers: NEXT });
    assert.ok(!light.body.includes('data-theme="dark"'));

    const dark = await get('/?theme=dark', { headers: NEXT });
    assert.ok(dark.body.includes('data-theme="dark"'));
  });
});
