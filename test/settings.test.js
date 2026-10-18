// Settings that a teacher can edit in the browser.
//
// The library's name and its loan period used to be readable only from
// `.env`, which the person running the library cannot reach. They now have a
// home in the database, and the rule for which wins is the whole point of
// this file: a row beats the environment variable, which beats the schema
// default. That order is what lets an existing deployment upgrade and change
// nothing until somebody saves in the browser.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { getSetting, setSetting } from '../src/db/queries/settings.js';
import {
  LIBRARY_NAME_MAX_LENGTH,
  SETTING_KEYS,
  defaultLoanDays,
  invalidateSettings,
  libraryName,
  saveSetting,
  setupCompletedAt,
} from '../src/lib/settings.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let config;
let fixtures;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  config = setup.config;
  db = makeTestDb();
  fixtures = seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config, logger: false, db });
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

/** Clear every setting row, so one test cannot colour the next. */
function clearSettings() {
  db.exec('DELETE FROM setting');
  invalidateSettings(db);
}

describe('settings resolution', () => {
  it('falls back to the environment variable when no row exists', () => {
    clearSettings();
    assert.equal(libraryName(db, config), 'Σχολική Βιβλιοθήκη');
    assert.equal(defaultLoanDays(db, config), config.defaultLoanDays);
  });

  it('prefers the row over the environment variable', () => {
    clearSettings();
    setSetting(db, SETTING_KEYS.libraryName, '5ο Γυμνάσιο Ηρακλείου Αττικής');
    invalidateSettings(db);
    assert.equal(libraryName(db, config), '5ο Γυμνάσιο Ηρακλείου Αττικής');
  });

  it('ignores a row that is not a usable loan period', () => {
    // Review Focus 2: a hand-edited database must not take every page down.
    for (const bad of ['abc', '', '0', '-5', '400', '7.5', '  ']) {
      clearSettings();
      setSetting(db, SETTING_KEYS.defaultLoanDays, bad);
      invalidateSettings(db);
      assert.equal(defaultLoanDays(db, config), config.defaultLoanDays, `for ${JSON.stringify(bad)}`);
    }
  });

  it('accepts a loan period at either end of the allowed range', () => {
    for (const good of ['1', '365', '21']) {
      clearSettings();
      saveSetting(db, SETTING_KEYS.defaultLoanDays, good);
      assert.equal(defaultLoanDays(db, config), Number(good));
    }
  });

  it('ignores a blank or over-long library name row', () => {
    // Review Focus 4.
    clearSettings();
    setSetting(db, SETTING_KEYS.libraryName, '   ');
    invalidateSettings(db);
    assert.equal(libraryName(db, config), 'Σχολική Βιβλιοθήκη');

    setSetting(db, SETTING_KEYS.libraryName, 'α'.repeat(LIBRARY_NAME_MAX_LENGTH + 1));
    invalidateSettings(db);
    assert.equal(libraryName(db, config), 'Σχολική Βιβλιοθήκη');
  });

  it('accepts a name exactly at the length limit', () => {
    clearSettings();
    const name = 'α'.repeat(LIBRARY_NAME_MAX_LENGTH);
    saveSetting(db, SETTING_KEYS.libraryName, name);
    assert.equal(libraryName(db, config), name);
  });

  it('trims a stored name rather than rendering its whitespace', () => {
    clearSettings();
    setSetting(db, SETTING_KEYS.libraryName, '  Βιβλιοθήκη  ');
    invalidateSettings(db);
    assert.equal(libraryName(db, config), 'Βιβλιοθήκη');
  });

  it('serves a value written through saveSetting without an explicit invalidate', () => {
    // The cache must not outlive its own writer. Reading first is what puts
    // the stale value in the cache, so the order here is the test.
    clearSettings();
    assert.equal(libraryName(db, config), 'Σχολική Βιβλιοθήκη');
    saveSetting(db, SETTING_KEYS.libraryName, 'Νέο όνομα');
    assert.equal(libraryName(db, config), 'Νέο όνομα');
  });

  it('keeps two databases apart', () => {
    // Several libraries never share a process in production, but the test
    // suite opens one database per file. A cache keyed only by setting name
    // would hand one suite's name to another.
    const other = makeTestDb();
    try {
      clearSettings();
      saveSetting(db, SETTING_KEYS.libraryName, 'Πρώτη');
      saveSetting(other, SETTING_KEYS.libraryName, 'Δεύτερη');
      assert.equal(libraryName(db, config), 'Πρώτη');
      assert.equal(libraryName(other, config), 'Δεύτερη');
    } finally {
      other.close();
    }
  });

  it('reports no setup stamp until one is written', () => {
    clearSettings();
    assert.equal(setupCompletedAt(db), null);
    saveSetting(db, SETTING_KEYS.setupCompletedAt, '2026-10-18T09:00:00Z');
    assert.equal(setupCompletedAt(db), '2026-10-18T09:00:00Z');
  });
});

describe('the setting table', () => {
  it('stores one row per key, overwriting on a second write', () => {
    clearSettings();
    setSetting(db, SETTING_KEYS.libraryName, 'Πρώτο');
    setSetting(db, SETTING_KEYS.libraryName, 'Δεύτερο');
    assert.equal(getSetting(db, SETTING_KEYS.libraryName), 'Δεύτερο');
    const rows = db.all('SELECT key FROM setting WHERE key = ?', SETTING_KEYS.libraryName);
    assert.equal(rows.length, 1);
  });

  it('stamps updated_at on every write', () => {
    clearSettings();
    setSetting(db, SETTING_KEYS.libraryName, 'Κάτι');
    const row = db.get('SELECT updated_at FROM setting WHERE key = ?', SETTING_KEYS.libraryName);
    assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}/);
  });

  it('returns null for a key that was never written', () => {
    clearSettings();
    assert.equal(getSetting(db, 'nothing_here'), null);
  });
});

describe('the library name on a page', () => {
  const get = (url, cookie = 'ui=next') =>
    app.inject({ method: 'GET', url, headers: { cookie } });

  it('shows the row value, not the environment value, once set', async () => {
    clearSettings();
    saveSetting(db, SETTING_KEYS.libraryName, '5ο Γυμνάσιο Ηρακλείου Αττικής');
    const page = await get('/');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /5ο Γυμνάσιο Ηρακλείου Αττικής/);
    assert.ok(
      !page.body.includes('<span>Σχολική Βιβλιοθήκη</span>'),
      'the environment name is still in the bar',
    );
  });

  it('escapes a name containing markup in the title and the bar', async () => {
    // Review Focus 4. The name reaches both a <title> and the bar, and it is
    // typed by a person in a browser, so it is untrusted like any other input.
    clearSettings();
    saveSetting(db, SETTING_KEYS.libraryName, '<script>x</script>&"');
    const page = await get('/');
    assert.equal(page.statusCode, 200);
    assert.ok(!page.body.includes('<script>x</script>'), 'the name was not escaped');
    assert.match(page.body, /&lt;script&gt;/);
  });

  it('falls back to the environment name when the row is unusable', async () => {
    clearSettings();
    setSetting(db, SETTING_KEYS.libraryName, '');
    invalidateSettings(db);
    const page = await get('/');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Σχολική Βιβλιοθήκη/);
  });

  it('reaches the old interface too', async () => {
    clearSettings();
    saveSetting(db, SETTING_KEYS.libraryName, 'Και στο παλιό');
    const page = await get('/', 'ui=classic');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /Και στο παλιό/);
  });
});

describe('the loan period on the checkout form', () => {
  it('offers the row value as the default due date', async () => {
    clearSettings();
    saveSetting(db, SETTING_KEYS.defaultLoanDays, '21');
    const session = await login(app);
    // The checkout page sends an empty selection back to the search, so a
    // copy has to be picked for the form — and its due date — to render.
    const page = await app.inject({
      method: 'GET',
      url: `/staff/loans/checkout?copy=${fixtures.copies.odysseyA}`,
      headers: { cookie: `${session.cookie}; ui=next` },
    });
    assert.equal(page.statusCode, 200);

    const due = new Date();
    due.setDate(due.getDate() + 21);
    const expected = due.toISOString().slice(0, 10);
    assert.match(page.body, new RegExp(expected));
  });
});
