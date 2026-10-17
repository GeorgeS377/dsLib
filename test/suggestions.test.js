// What the server has to hand the browser for Greek-aware suggestions.
//
// The catalogue search already folds accents, case and final sigma. The
// suggestion lists could not, because a native <datalist> is matched by the
// browser against the literal accented text. So the folded form travels with
// each option and the browser folds only what is typed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { createBook } from '../src/db/queries/books.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { normalize } from '../src/lib/normalize.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { login, makeStaffUser } from './staff-helpers.js';

let app; let db; let dir; let session; let copyId;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  seedTestCatalogue(db);
  await makeStaffUser(db);
  createBorrower(db, { displayName: 'Νίκος Καζαντζάκης', schoolClass: 'Α1' });
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);
  copyId = db.get('SELECT id FROM copy LIMIT 1').id;
});

after(async () => { await app.close(); db.close(); cleanupDir(dir); });

const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

const pages = () => [
  ['/staff/books/new', 'author-options'],
  [`/staff/loans/checkout?copy=${copyId}`, 'reader-options'],
  ['/staff/borrowers', 'class-options'],
];

const unescape = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const listIn = (body, id) =>
  body.match(new RegExp(`<datalist id="${id}">([\\s\\S]*?)</datalist>`))?.[1];

describe('suggestions carry their folded form', () => {
  it('puts a data-fold on every option', async () => {
    for (const [url, listId] of pages()) {
      const list = listIn((await get(url)).body, listId);
      assert.ok(list, `${url} has no ${listId}`);
      const options = [...list.matchAll(/<option\b[^>]*>/g)].map((m) => m[0]);
      assert.ok(options.length > 0, `${url}: ${listId} is empty`);
      for (const option of options) {
        assert.match(option, /data-fold="/, `${url}: an option with no folded form: ${option}`);
      }
    }
  });

  it('folds exactly as the catalogue search does', async () => {
    for (const [url, listId] of pages()) {
      const list = listIn((await get(url)).body, listId);
      const pairs = [...list.matchAll(/<option value="([^"]*)"\s+data-fold="([^"]*)"/g)];
      assert.ok(pairs.length > 0, `${url}: no value/fold pairs in ${listId}`);
      for (const [, value, fold] of pairs) {
        assert.equal(
          unescape(fold), normalize(unescape(value)),
          `${url}: wrong fold for "${value}"`,
        );
      }
    }
  });

  it('keeps a comma intact in the value', async () => {
    createBook(db, { title: 'Με Κόμμα', authorNames: ['Παπαδόπουλος, Γιώργος'] });
    const list = listIn((await get('/staff/books/new')).body, 'author-options');
    assert.ok(list.includes('Παπαδόπουλος, Γιώργος'), 'the name was mangled or split');
  });

  it('still ships a native datalist, which is the no-scripting fallback', async () => {
    for (const [url, listId] of pages()) {
      const body = (await get(url)).body;
      assert.ok(body.includes(`<datalist id="${listId}">`), `${url} lost its fallback list`);
      assert.match(body, new RegExp(`list="${listId}"`), `${url}: no field points at it`);
    }
  });

  it('carries the reader class, so choosing a name still fills it', async () => {
    const body = (await get(`/staff/loans/checkout?copy=${copyId}`)).body;
    assert.match(body, /data-extra="Α1"/, 'the class no longer rides with the reader');
  });

  it('marks up every suggesting field for the script to find', async () => {
    for (const [url] of pages()) {
      const body = (await get(url)).body;
      const fields = body.match(/<input[^>]*\blist="[^"]*"[^>]*>/g) ?? [];
      assert.ok(fields.length > 0, `${url} has no suggesting field`);
      for (const field of fields) {
        assert.match(field, /data-suggest/, `${url}: a field the script will not see: ${field}`);
      }
    }
  });
});
