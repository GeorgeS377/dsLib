// First-run setup in the browser.
//
// An admin deploys the library and sends a teacher the link. Everything the
// library needs to describe itself, the teacher does here: its name, its
// icon, the categories it files books under, how long a child keeps a book,
// and the account they will sign in with from then on.
//
// The gate is the whole security story, and it is deliberately not a token:
// a freshly deployed library holds nothing, so the worst a stranger who
// arrives first can do is make the teacher wonder why setup is already done.
// What the page must never do is still answer once the library is in use.
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { buildApp } from '../src/app.js';
import { listAllCategories } from '../src/db/queries/categories.js';
import { createStaffUser, listStaff } from '../src/db/queries/staff.js';
import {
  defaultLoanDays,
  invalidateSettings,
  libraryName,
  setupCompletedAt,
} from '../src/lib/settings.js';
import { cleanupDir, makeTestDb, testConfig } from './helpers.js';
import { TEST_PASSWORD, cookieHeader, csrfFrom } from './staff-helpers.js';

let app;
let db;
let dir;
let config;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  config = setup.config;
  db = makeTestDb();
  app = await buildApp({ config, logger: false, db });
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

/** A library with nothing in it: no accounts, no settings, no categories. */
beforeEach(() => {
  db.exec('DELETE FROM staff_user');
  db.exec('DELETE FROM setting');
  db.exec('DELETE FROM book_category');
  db.exec('DELETE FROM category');
  db.exec('DELETE FROM audit_log');
  invalidateSettings(db);
});

const get = (url, cookie = 'ui=next') =>
  app.inject({ method: 'GET', url, headers: { cookie } });

async function post(url, fields = {}, { tokenFrom = '/setup/library', cookie = 'ui=next' } = {}) {
  // The CSRF token is only half the check: its secret arrives as a cookie on
  // the GET, so the POST has to carry that back.
  const page = await get(tokenFrom, cookie);
  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: cookieHeader(page, cookie),
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: new URLSearchParams({ _csrf: csrfFrom(page.body), ...fields }).toString(),
  });
}

const png = (width, height) =>
  new Jimp({ width, height, color: 0xcc3366ff }).getBuffer('image/png');

/** POST a multipart form of text fields plus an optional icon file. */
async function postMultipart(url, { fields = {}, file, tokenFrom = '/setup/library' } = {}) {
  const page = await get(tokenFrom);
  const token = csrfFrom(page.body);
  const cookie = cookieHeader(page, 'ui=next');
  const boundary = '----dslibsetup';
  const parts = [];
  const text = (name, value) =>
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  text('_csrf', token);
  for (const [name, value] of Object.entries(fields)) {
    for (const one of [].concat(value)) text(name, one);
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="icon"; filename="${file.filename}"\r\n` +
          `Content-Type: ${file.contentType}\r\n\r\n`,
      ),
    );
    parts.push(file.buffer, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(parts),
  });
}

/** Give the library an account, which is what closes setup. */
const claim = () =>
  createStaffUser(db, {
    username: 'maria',
    password: TEST_PASSWORD,
    displayName: 'Μαρία',
    role: 'admin',
  });

describe('the setup gate', () => {
  it('sends /setup to the first step while the library has no accounts', async () => {
    const page = await get('/setup');
    assert.equal(page.statusCode, 302);
    assert.equal(page.headers.location, '/setup/library');
  });

  it('serves the first step', async () => {
    const page = await get('/setup/library');
    assert.equal(page.statusCode, 200);
  });

  it('redirects every setup page to the login page once an account exists', async () => {
    await claim();
    for (const url of ['/setup', '/setup/library', '/setup/catalogue']) {
      const page = await get(url);
      assert.equal(page.statusCode, 302, url);
      assert.equal(page.headers.location, '/staff/login', url);
    }
  });

  it('refuses a setup POST once an account exists', async () => {
    // Someone with the form already open when the library was claimed.
    const page = await get('/setup/library');
    const token = csrfFrom(page.body);
    await claim();
    const response = await app.inject({
      method: 'POST',
      url: '/setup/library',
      headers: {
        cookie: cookieHeader(page, 'ui=next'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({ _csrf: token, library_name: 'Αργά' }).toString(),
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff/login');
  });

  it('redirects /staff/login to setup while setup is open', async () => {
    const page = await get('/staff/login');
    assert.equal(page.statusCode, 302);
    assert.equal(page.headers.location, '/setup');
  });

  it('leaves /staff/login alone once an account exists', async () => {
    await claim();
    const page = await get('/staff/login');
    assert.equal(page.statusCode, 200);
  });

  it('renders the new interface even when the cookie asks for the old one', async () => {
    // The old interface is retiring and was never given a setup page.
    const page = await get('/setup/library', 'ui=classic');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /ΒΗΜΑ 1 ΑΠΟ 3/);
  });

  it('marks the segments of the progress rule it has reached', async () => {
    // `<%=` escapes, so emitting a whole class attribute through it ships
    // class=&quot;is-done&quot; and the rule stays grey. This has now bitten
    // twice in this interface, so it gets a test rather than a third chance.
    const step2 = await get('/setup/catalogue');
    const done = step2.body.match(/class="is-done"/g) ?? [];
    assert.equal(done.length, 2, 'step 2 should mark two segments');
    assert.ok(!step2.body.includes('&quot;is-done&quot;'), 'the class attribute was escaped');
  });

  it('never ships an escaped class attribute', async () => {
    // The wider version of the bug above: any conditional class emitted
    // through the escaping output tag arrives as class=&quot;…&quot; and
    // styles nothing, on a page that otherwise looks fine. Two of these have
    // now shipped in this interface, so the whole wizard is checked.
    for (const url of ['/setup/library', '/setup/catalogue', '/setup/account']) {
      const page = await get(url);
      assert.ok(!page.body.includes('class=&quot;'), url);
    }
  });

  it('links the new interface stylesheet, not the old one', async () => {
    // Found in a browser, not by a test: renderSetup forced the new
    // *templates* while the shared locals still carried the stylesheet for
    // whichever flavour the cookie asked for. With no cookie — which is every
    // fresh deployment — the page rendered new markup against old CSS and
    // came out as unstyled text.
    for (const cookie of ['ui=classic', 'ui=next', '']) {
      const page = await get('/setup/library', cookie);
      assert.match(page.body, /href="[^"]*next\.css"/, `cookie: ${cookie || 'none'}`);
      assert.ok(!/href="[^"]*app\.css"/.test(page.body), `cookie: ${cookie || 'none'}`);
    }
  });

  it('keeps the public catalogue working while setup is open', async () => {
    for (const url of ['/', '/books', '/categories', '/authors']) {
      const page = await get(url);
      assert.equal(page.statusCode, 200, url);
    }
  });

  it('says Εγκατάσταση in the bar instead of offering a sign-out', async () => {
    const page = await get('/setup/library');
    assert.match(page.body, /Εγκατάσταση/);
  });

  it('keeps the theme and language links in the footer', async () => {
    // A teacher who wants the wizard in English should be able to have it.
    const page = await get('/setup/library');
    assert.match(page.body, /lang=en/);
    assert.match(page.body, /theme=dark/);
  });

  it('loads app.js, so the cropper and the reveal can enhance the form', async () => {
    // The plain layout once shipped without this tag and the password reveal
    // rendered and did nothing.
    const page = await get('/setup/library');
    assert.match(page.body, /src="\/assets\/js\/app\.js"/);
  });
});

describe('step 1', () => {
  it('shows the example as a placeholder, not as a filled-in value', async () => {
    const page = await get('/setup/library');
    assert.match(page.body, /placeholder="Βιβλιοθήκη 5ου Γυμνασίου Ηρακλείου"/);
    assert.ok(
      !page.body.includes('value="Σχολική Βιβλιοθήκη"'),
      'the default name was prefilled into the box',
    );
  });

  it('saves the name and moves to step 2', async () => {
    const response = await post('/setup/library', { library_name: '5ο Γυμνάσιο Ηρακλείου Αττικής' });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/setup/catalogue');

    const page = await get('/setup/catalogue');
    assert.match(page.body, /5ο Γυμνάσιο Ηρακλείου Αττικής/);
  });

  it('refuses a blank name and says so', async () => {
    const response = await post('/setup/library', { library_name: '   ' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /field__error|aria-invalid="true"/);
  });

  it('refuses a name over 120 characters', async () => {
    const response = await post('/setup/library', { library_name: 'α'.repeat(121) });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /field__error|aria-invalid="true"/);
  });

  it('prefills the saved name when the step is re-entered', async () => {
    await post('/setup/library', { library_name: 'Βιβλιοθήκη Α' });
    const page = await get('/setup/library');
    assert.match(page.body, /value="Βιβλιοθήκη Α"/);
  });

  it('requires a CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/setup/library',
      headers: { cookie: 'ui=next', 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ library_name: 'Χωρίς token' }).toString(),
    });
    assert.equal(response.statusCode, 403);
  });

  it('escapes a name containing markup when it echoes it back', async () => {
    await post('/setup/library', { library_name: '<script>x</script>' });
    const page = await get('/setup/library');
    assert.ok(!page.body.includes('<script>x</script>'));
  });

  it('saves an uploaded icon alongside the name', async () => {
    const response = await postMultipart('/setup/library', {
      fields: { library_name: 'Με εικονίδιο' },
      file: { filename: 'logo.png', contentType: 'image/png', buffer: await png(300, 300) },
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/setup/catalogue');

    const page = await get('/setup/catalogue');
    assert.match(page.body, /\/brand\/[0-9a-f-]{36}-32\.png/);
  });

  it('keeps the typed name when the icon is refused', async () => {
    // The lesson of the bare 413 on the book form: the reversible work must
    // survive a refusal of one field.
    const response = await postMultipart('/setup/library', {
      fields: { library_name: '5ο Γυμνάσιο Ηρακλείου Αττικής' },
      file: {
        filename: 'notes.txt',
        contentType: 'text/plain',
        buffer: Buffer.from('this is certainly not an image'),
      },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /value="5ο Γυμνάσιο Ηρακλείου Αττικής"/);
    assert.match(response.body, /field__error/);
  });

  it('saves the name even when no icon is chosen', async () => {
    const response = await postMultipart('/setup/library', {
      fields: { library_name: 'Χωρίς εικόνα' },
    });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/setup/catalogue');
  });

  it('wires the cover cropper with a square frame', async () => {
    // One cropper, two shapes: the book form keeps its 2:3, the icon is 1:1.
    // Asserted in the markup because the enhancement is what reads it, and a
    // renamed attribute would otherwise leave the control silently inert.
    const page = await get('/setup/library');
    assert.match(page.body, /data-cropper\b/);
    assert.match(page.body, /data-cropper-width="200"/);
    assert.match(page.body, /data-cropper-height="200"/);
    for (const field of ['x', 'y', 'w', 'h']) {
      assert.match(page.body, new RegExp(`name="crop_${field}" data-cropper-${field}`), field);
    }
    assert.match(page.body, /data-cropper-file/);
  });

  it('shows the shipped mark until an icon is uploaded', async () => {
    const page = await get('/setup/library');
    assert.ok(!page.body.includes('/brand/'));
  });

  it('creates no account and no categories of its own', async () => {
    await post('/setup/library', { library_name: 'Μόνο όνομα' });
    assert.equal(listStaff(db).length, 0);
    assert.equal(listAllCategories(db).length, 0);
  });
});

describe('step 2', () => {
  const categoryNames = () => listAllCategories(db).map((row) => row.name);

  const idOf = (name) => listAllCategories(db).find((row) => row.name === name)?.id;

  const postCatalogue = (fields) =>
    post('/setup/catalogue', fields, { tokenFrom: '/setup/catalogue' });

  it('starts with a short starter list already created', async () => {
    await get('/setup/catalogue');
    assert.deepEqual(categoryNames().sort(), ['Επιστήμες', 'Ιστορία', 'Λογοτεχνία', 'Παιδικά']);
  });

  it('creates the starter list once, not again on every visit', async () => {
    await get('/setup/catalogue');
    await get('/setup/catalogue');
    assert.equal(categoryNames().length, 4);
  });

  it('does not resurrect a starter category the teacher removed', async () => {
    await get('/setup/catalogue');
    await postCatalogue({ remove: String(idOf('Ιστορία')) });
    await get('/setup/catalogue');
    assert.ok(!categoryNames().includes('Ιστορία'));
  });

  it('adds a typed category with no JavaScript and shows it', async () => {
    await get('/setup/catalogue');
    const response = await postCatalogue({ add: '1', category_name: 'Μυθολογία' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Μυθολογία/);
    assert.ok(categoryNames().includes('Μυθολογία'));
  });

  it('refuses a category that already exists under folding', async () => {
    // 'ιστορια' beside 'Ιστορία' is the same subject twice.
    await get('/setup/catalogue');
    const response = await postCatalogue({ add: '1', category_name: 'ΙΣΤΟΡΙΑ' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /field__error/);
    assert.equal(categoryNames().filter((name) => name === 'ΙΣΤΟΡΙΑ').length, 0);
  });

  it('ignores an empty add rather than complaining', async () => {
    await get('/setup/catalogue');
    const response = await postCatalogue({ add: '1', category_name: '   ' });
    assert.equal(response.statusCode, 200);
    assert.equal(categoryNames().length, 4);
  });

  it('removes a category when its × is submitted', async () => {
    await get('/setup/catalogue');
    const response = await postCatalogue({ remove: String(idOf('Παιδικά')) });
    assert.equal(response.statusCode, 200);
    assert.ok(!categoryNames().includes('Παιδικά'));
  });

  it('shrugs at a removal of something that is not there', async () => {
    await get('/setup/catalogue');
    const response = await postCatalogue({ remove: '98765' });
    assert.equal(response.statusCode, 200);
    assert.equal(categoryNames().length, 4);
  });

  it('shrugs at a removal that is not even a number', async () => {
    await get('/setup/catalogue');
    const response = await postCatalogue({ remove: '../../etc/passwd' });
    assert.equal(response.statusCode, 200);
    assert.equal(categoryNames().length, 4);
  });

  it('offers 14 days to begin with', async () => {
    const page = await get('/setup/catalogue');
    assert.match(page.body, /value="14"/);
  });

  it('saves the loan period and moves to step 3', async () => {
    await get('/setup/catalogue');
    const response = await postCatalogue({ next: '1', loan_days: '21' });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/setup/account');
    assert.equal(defaultLoanDays(db, config), 21);
  });

  it('refuses a loan period outside 1 to 365', async () => {
    await get('/setup/catalogue');
    for (const bad of ['0', '-3', '400', 'abc', '']) {
      const response = await postCatalogue({ next: '1', loan_days: bad });
      assert.equal(response.statusCode, 200, bad);
      assert.match(response.body, /field__error|aria-invalid="true"/, bad);
    }
    assert.equal(defaultLoanDays(db, config), config.defaultLoanDays);
  });

  it('keeps the categories when the loan period is refused', async () => {
    await get('/setup/catalogue');
    await postCatalogue({ add: '1', category_name: 'Μυθολογία' });
    const response = await postCatalogue({ next: '1', loan_days: '0' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /Μυθολογία/);
    assert.ok(categoryNames().includes('Μυθολογία'));
  });

  it('prefills the saved loan period when the step is re-entered', async () => {
    await get('/setup/catalogue');
    await postCatalogue({ next: '1', loan_days: '7' });
    const page = await get('/setup/catalogue');
    assert.match(page.body, /value="7"/);
  });

  it('offers a link back to step 1', async () => {
    const page = await get('/setup/catalogue');
    assert.match(page.body, /href="\/setup\/library"/);
  });

  it('shows the name chosen in step 1 in the bar', async () => {
    await post('/setup/library', { library_name: '5ο Γυμνάσιο Ηρακλείου Αττικής' });
    const page = await get('/setup/catalogue');
    assert.match(page.body, /5ο Γυμνάσιο Ηρακλείου Αττικής/);
  });

  it('requires a CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/setup/catalogue',
      headers: { cookie: 'ui=next', 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ next: '1', loan_days: '14' }).toString(),
    });
    assert.equal(response.statusCode, 403);
  });

  it('creates no account of its own', async () => {
    await get('/setup/catalogue');
    await postCatalogue({ next: '1', loan_days: '14' });
    assert.equal(listStaff(db).length, 0);
  });
});

describe('step 3', () => {
  const account = {
    username: 'maria',
    display_name: 'Μαρία',
    password: 'a-long-enough-test-passphrase',
    password_confirm: 'a-long-enough-test-passphrase',
  };

  const postAccount = (fields) =>
    post('/setup/account', fields, { tokenFrom: '/setup/account' });

  const auditRows = () => db.all("SELECT * FROM audit_log WHERE action = 'staff.create'");

  it('creates one administrator and lands on the dashboard', async () => {
    const response = await postAccount(account);
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff');

    const staff = listStaff(db);
    assert.equal(staff.length, 1);
    assert.equal(staff[0].username, 'maria');
    assert.equal(staff[0].role, 'admin');
  });

  it('signs the teacher in, with no second trip through the login form', async () => {
    const response = await postAccount(account);
    const cookie = cookieHeader(response, 'ui=next');
    const dashboard = await app.inject({ method: 'GET', url: '/staff', headers: { cookie } });
    assert.equal(dashboard.statusCode, 200);
  });

  it('sets ui=next so the teacher continues in the interface they just used', async () => {
    const response = await postAccount(account);
    const cookies = [].concat(response.headers['set-cookie'] ?? []).join(';');
    assert.match(cookies, /\bui=next\b/);
  });

  it('writes an audit row naming setup as the way in', async () => {
    await postAccount(account);
    const rows = auditRows();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].username, 'maria');
    assert.equal(JSON.parse(rows[0].detail).via, 'setup');
  });

  it('keeps the password out of the audit row', async () => {
    await postAccount(account);
    assert.ok(!auditRows()[0].detail.includes('passphrase'));
  });

  it('stamps when setup was completed', async () => {
    await postAccount(account);
    assert.match(setupCompletedAt(db) ?? '', /^\d{4}-\d{2}-\d{2}/);
  });

  it('closes setup for good', async () => {
    await postAccount(account);
    for (const url of ['/setup', '/setup/library', '/setup/catalogue', '/setup/account']) {
      const page = await get(url);
      assert.equal(page.statusCode, 302, url);
      assert.equal(page.headers.location, '/staff/login', url);
    }
  });

  it('refuses a password under 8 characters', async () => {
    const response = await postAccount({ ...account, password: 'abcdefg', password_confirm: 'abcdefg' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /field__error|aria-invalid="true"/);
    assert.equal(listStaff(db).length, 0);
  });

  it('refuses a password on the blocklist', async () => {
    const response = await postAccount({ ...account, password: 'password', password_confirm: 'password' });
    assert.equal(response.statusCode, 200);
    assert.equal(listStaff(db).length, 0);
  });

  it('refuses two entries that do not match', async () => {
    const response = await postAccount({ ...account, password_confirm: 'something-else-entirely' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /field__error|aria-invalid="true"/);
    assert.equal(listStaff(db).length, 0);
  });

  it('refuses a username that is not plain ASCII', async () => {
    // Usernames stay unambiguous at the login prompt; the display name
    // carries the Greek spelling.
    const response = await postAccount({ ...account, username: 'μαρία' });
    assert.equal(response.statusCode, 200);
    assert.equal(listStaff(db).length, 0);
  });

  it('keeps the username and display name when the password is refused', async () => {
    const response = await postAccount({ ...account, password: 'short', password_confirm: 'short' });
    assert.match(response.body, /value="maria"/);
    assert.match(response.body, /value="Μαρία"/);
  });

  it('never echoes the refused password back into the form', async () => {
    const response = await postAccount({ ...account, password: 'short', password_confirm: 'short' });
    assert.ok(!response.body.includes('value="short"'));
  });

  it('keeps the name, icon and categories when the password is refused', async () => {
    await post('/setup/library', { library_name: '5ο Γυμνάσιο Ηρακλείου Αττικής' });
    await get('/setup/catalogue');
    await postAccount({ ...account, password: 'short', password_confirm: 'short' });

    assert.match(libraryName(db, config), /5ο Γυμνάσιο/);
    assert.equal(listAllCategories(db).length, 4);
  });

  it('creates no second administrator when two requests race', async () => {
    // Both pass the gate, both await the password hash, both try to insert.
    const first = await get('/setup/account');
    const second = await get('/setup/account');

    const fire = (page, username) =>
      app.inject({
        method: 'POST',
        url: '/setup/account',
        headers: {
          cookie: cookieHeader(page, 'ui=next'),
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: new URLSearchParams({
          _csrf: csrfFrom(page.body),
          ...account,
          username,
        }).toString(),
      });

    const [a, b] = await Promise.all([fire(first, 'maria'), fire(second, 'kostas')]);

    assert.equal(listStaff(db).length, 1, 'two administrators were created');
    const codes = [a.statusCode, b.statusCode].sort();
    assert.deepEqual(codes, [302, 302]);
    // The loser is sent to the sign-in page, not shown a failure.
    const locations = [a.headers.location, b.headers.location].sort();
    assert.deepEqual(locations, ['/staff', '/staff/login']);
  });

  it('has no email field', async () => {
    const page = await get('/setup/account');
    assert.ok(!page.body.includes('name="email"'));
  });

  it('offers a reveal control for the password', async () => {
    const page = await get('/setup/account');
    assert.match(page.body, /data-reveal/);
  });

  it('offers a link back to step 2', async () => {
    const page = await get('/setup/account');
    assert.match(page.body, /href="\/setup\/catalogue"/);
  });

  it('requires a CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/setup/account',
      headers: { cookie: 'ui=next', 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams(account).toString(),
    });
    assert.equal(response.statusCode, 403);
  });
});

describe('the boot log', () => {
  /**
   * Boot an app and return everything it logged.
   *
   * Fastify 5 wants a configuration object for `logger`, so the capture is a
   * stream rather than a fake logger object.
   */
  async function bootWith(seedAccount) {
    const setup = testConfig();
    const freshDb = makeTestDb();
    if (seedAccount) {
      await createStaffUser(freshDb, {
        username: 'already',
        password: TEST_PASSWORD,
        displayName: 'Ήδη',
        role: 'admin',
      });
    }

    const written = [];
    const freshApp = await buildApp({
      config: setup.config,
      logger: { level: 'info', stream: { write: (chunk) => written.push(chunk) } },
      db: freshDb,
    });
    await freshApp.ready();
    await freshApp.close();
    freshDb.close();
    cleanupDir(setup.dir);
    return written.join('');
  }

  it('says setup is still open on a library with no accounts', async () => {
    // So an admin can tell at a glance whether the teacher got there first.
    const output = await bootWith(false);
    assert.match(output, /\/setup is open/);
  });

  it('says nothing about an open setup once the library has an account', async () => {
    const output = await bootWith(true);
    assert.ok(!/\/setup is open/.test(output), output);
  });
});
