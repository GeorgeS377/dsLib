// Ρυθμίσεις → Η βιβλιοθήκη: the same three things the setup wizard asked for,
// afterwards and without the steps.
//
// The reason this page has to exist is the reason the wizard exists. A teacher
// who cannot open a terminal set the library's name on day one; if changing it
// later meant editing `.env`, they would have to go back to the admin for a
// typo in their own school's name.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { buildApp } from '../src/app.js';
import {
  SETTING_KEYS,
  defaultLoanDays,
  invalidateSettings,
  libraryIcon,
  libraryName,
} from '../src/lib/settings.js';
import { brandIconFile, storeBrandIcon } from '../src/lib/upload.js';
import { cleanupDir, makeTestDb, testConfig } from './helpers.js';
import { cookieHeader, csrfFrom, login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let config;
let uploadDir;
let adminSession;
let librarianSession;

const PATH = '/staff/settings/library';

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  config = setup.config;
  uploadDir = config.uploadDir;
  db = makeTestDb();
  await makeStaffUser(db);
  await makeStaffUser(db, {
    username: 'kostas',
    displayName: 'Κώστας',
    role: 'librarian',
  });
  app = await buildApp({ config, logger: false, db });
  await app.ready();
  adminSession = await login(app);
  librarianSession = await login(app, { username: 'kostas' });
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

beforeEach(() => {
  db.exec('DELETE FROM setting');
  invalidateSettings(db);
});

const get = (url, session = adminSession) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

async function post(url, fields = {}, session = adminSession) {
  const page = await get(PATH, session);
  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: cookieHeader(page, `${session.cookie}; ui=next`),
      'content-type': 'application/x-www-form-urlencoded',
    },
    payload: new URLSearchParams({ _csrf: csrfFrom(page.body), ...fields }).toString(),
  });
}

const png = (width, height) =>
  new Jimp({ width, height, color: 0x3366ccff }).getBuffer('image/png');

const iconFile = (name, size) => path.join(uploadDir, 'icons', brandIconFile(name, size));

/** Put an icon in place the way the wizard would have. */
async function existingIcon() {
  const stored = await storeBrandIcon(await png(300, 300), { uploadDir, maxBytes: 2_000_000 });
  assert.ok(stored.ok, stored.reason);
  db.exec('DELETE FROM setting');
  invalidateSettings(db);
  const { saveSetting } = await import('../src/lib/settings.js');
  saveSetting(db, SETTING_KEYS.libraryIcon, stored.iconName);
  return stored.iconName;
}

describe('who may open it', () => {
  it('admits an administrator', async () => {
    const page = await get(PATH);
    assert.equal(page.statusCode, 200);
  });

  it('refuses a librarian', async () => {
    // What the school's library is called is not a per-librarian preference.
    const page = await get(PATH, librarianSession);
    assert.equal(page.statusCode, 403);
  });

  it('refuses someone who is not signed in', async () => {
    const page = await app.inject({ method: 'GET', url: PATH, headers: { cookie: 'ui=next' } });
    assert.equal(page.statusCode, 302);
    assert.match(page.headers.location, /\/staff\/login/);
  });

  it('is reachable from the settings hub', async () => {
    const hub = await get('/staff/settings');
    assert.match(hub.body, new RegExp(`href="${PATH}"`));
  });

  it('is not offered to a librarian on the hub', async () => {
    const hub = await get('/staff/settings', librarianSession);
    assert.ok(!hub.body.includes(`href="${PATH}"`));
  });
});

describe('the library settings page', () => {
  it('shows the name and loan period in use', async () => {
    const { saveSetting } = await import('../src/lib/settings.js');
    saveSetting(db, SETTING_KEYS.libraryName, '5ο Γυμνάσιο Ηρακλείου Αττικής');
    saveSetting(db, SETTING_KEYS.defaultLoanDays, '21');

    const page = await get(PATH);
    assert.match(page.body, /value="5ο Γυμνάσιο Ηρακλείου Αττικής"/);
    assert.match(page.body, /value="21"/);
  });

  it('prefills the environment values when nothing has been saved', async () => {
    const page = await get(PATH);
    assert.match(page.body, /value="Σχολική Βιβλιοθήκη"/);
    assert.match(page.body, new RegExp(`value="${config.defaultLoanDays}"`));
  });

  it('saves a new name and shows it on the public site at once', async () => {
    const response = await post(PATH, {
      library_name: 'Βιβλιοθήκη Β',
      loan_days: String(config.defaultLoanDays),
    });
    assert.equal(response.statusCode, 302);
    assert.equal(libraryName(db, config), 'Βιβλιοθήκη Β');

    // The public bar and tab title, which is where the library's own name
    // belongs. The staff bar deliberately says "Διαχείριση βιβλιοθήκης"
    // instead — see views/next/partials/topbar.ejs.
    const home = await app.inject({ method: 'GET', url: '/', headers: { cookie: 'ui=next' } });
    assert.match(home.body, /Βιβλιοθήκη Β/);
  });

  it('saves a new loan period', async () => {
    await post(PATH, { library_name: 'Βιβλιοθήκη', loan_days: '30' });
    assert.equal(defaultLoanDays(db, config), 30);
  });

  it('refuses a blank name and keeps the old one', async () => {
    const { saveSetting } = await import('../src/lib/settings.js');
    saveSetting(db, SETTING_KEYS.libraryName, 'Κρατήσου');

    const response = await post(PATH, { library_name: '   ', loan_days: '14' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /field__error|aria-invalid="true"/);
    assert.equal(libraryName(db, config), 'Κρατήσου');
  });

  it('refuses a loan period outside 1 to 365 and keeps the old one', async () => {
    const { saveSetting } = await import('../src/lib/settings.js');
    saveSetting(db, SETTING_KEYS.defaultLoanDays, '21');

    for (const bad of ['0', '400', 'abc']) {
      const response = await post(PATH, { library_name: 'Βιβλιοθήκη', loan_days: bad });
      assert.equal(response.statusCode, 200, bad);
      assert.equal(defaultLoanDays(db, config), 21, bad);
    }
  });

  it('requires a CSRF token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: PATH,
      headers: {
        cookie: `${adminSession.cookie}; ui=next`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({ library_name: 'Χωρίς', loan_days: '14' }).toString(),
    });
    assert.equal(response.statusCode, 403);
  });

  it('writes an audit row when the name changes', async () => {
    await post(PATH, { library_name: 'Καινούργιο', loan_days: '14' });
    const row = db.get("SELECT * FROM audit_log WHERE action = 'settings.update' ORDER BY id DESC");
    assert.ok(row, 'no audit row was written');
  });
});

describe('changing the icon', () => {
  /** POST the form with an icon attached. */
  async function postWithIcon({ fields = {}, file }) {
    const page = await get(PATH);
    const boundary = '----dslibsettings';
    const parts = [];
    const text = (name, value) =>
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
        ),
      );
    text('_csrf', csrfFrom(page.body));
    for (const [name, value] of Object.entries(fields)) text(name, value);
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
      url: PATH,
      headers: {
        cookie: cookieHeader(page, `${adminSession.cookie}; ui=next`),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: Buffer.concat(parts),
    });
  }

  it('replaces the icon and deletes the files the old one used', async () => {
    const old = await existingIcon();
    const response = await postWithIcon({
      fields: { library_name: 'Βιβλιοθήκη', loan_days: '14' },
      file: { filename: 'new.png', contentType: 'image/png', buffer: await png(400, 400) },
    });
    assert.equal(response.statusCode, 302);

    const now = libraryIcon(db);
    assert.ok(now && now !== old, 'the icon did not change');
    assert.equal(fs.existsSync(iconFile(now, 32)), true, 'the new icon was not written');
    assert.equal(fs.existsSync(iconFile(old, 32)), false, 'the old icon was left behind');
  });

  it('keeps the old icon when the new one is refused', async () => {
    const old = await existingIcon();
    const response = await postWithIcon({
      fields: { library_name: 'Βιβλιοθήκη', loan_days: '14' },
      file: {
        filename: 'notes.txt',
        contentType: 'text/plain',
        buffer: Buffer.from('not an image'),
      },
    });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /field__error/);
    assert.equal(libraryIcon(db), old);
    assert.equal(fs.existsSync(iconFile(old, 32)), true);
  });

  it('removes the icon and falls back to the one that ships with the app', async () => {
    const old = await existingIcon();
    const response = await post(`${PATH}/icon/remove`);
    assert.equal(response.statusCode, 302);

    assert.equal(libraryIcon(db), null);
    for (const size of [32, 180, 512]) {
      assert.equal(fs.existsSync(iconFile(old, size)), false, `size ${size} was left behind`);
    }

    const page = await get('/staff');
    assert.match(page.body, /\/assets\/icon\.svg/);
  });

  it('offers no removal control when there is no icon to remove', async () => {
    const page = await get(PATH);
    assert.ok(!page.body.includes(`${PATH}/icon/remove`));
  });

  it('leaves the name alone when only the icon changes', async () => {
    const { saveSetting } = await import('../src/lib/settings.js');
    saveSetting(db, SETTING_KEYS.libraryName, 'Αμετάβλητο');
    await postWithIcon({
      fields: { library_name: 'Αμετάβλητο', loan_days: '14' },
      file: { filename: 'x.png', contentType: 'image/png', buffer: await png(200, 200) },
    });
    assert.equal(libraryName(db, config), 'Αμετάβλητο');
  });
});
