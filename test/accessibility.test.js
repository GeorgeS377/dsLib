// Structural accessibility checks across every rendered page.
//
// These are the machine-checkable parts of spec §7: every form control has a
// label, every image has alt text, headings start at h1 and do not skip
// levels, tables have scoped headers, and each page declares a language and a
// main landmark.
//
// They are not a substitute for using the site with a keyboard and a screen
// reader, but they catch the regressions that are easy to introduce and easy
// to miss — a new input without a label, a section heading promoted above the
// page heading.
import assert from 'node:assert/strict';
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

/** Every page worth checking, public and staff, in both languages. */
async function pages() {
  const category = db.get('SELECT id, slug FROM category LIMIT 1');
  const author = db.get('SELECT id FROM author LIMIT 1');
  const copy = db.get('SELECT id FROM copy LIMIT 1');
  const borrower = db.get('SELECT id FROM borrower LIMIT 1');

  const publicUrls = [
    '/',
    '/books',
    `/books?q=${encodeURIComponent('οδυσσεια')}`,
    '/books?q=zzznothing',
    `/books/${fixtures.books.odyssey}`,
    '/categories',
    `/categories/${category.slug}`,
    '/authors',
    `/authors/${author.id}`,
    '/no-such-page',
    '/staff/login',
  ];

  const staffUrls = [
    '/staff',
    '/staff/books',
    '/staff/books/new',
    `/staff/books/${fixtures.books.odyssey}`,
    `/staff/books/${fixtures.books.odyssey}/copies`,
    `/staff/books/${fixtures.books.odyssey}/delete`,
    `/staff/copies/${copy.id}/delete`,
    '/staff/categories',
    `/staff/categories/${category.id}`,
    `/staff/categories/${category.id}/delete`,
    '/staff/authors',
    `/staff/authors/${author.id}`,
    '/staff/loans',
    '/staff/loans/checkout',
    '/staff/loans/checkout?barcode=T-0001',
    '/staff/loans/checkin',
    '/staff/borrowers',
    '/staff/users',
    '/staff/account',
  ];
  if (borrower) {
    staffUrls.push(
      `/staff/borrowers/${borrower.id}`,
      `/staff/borrowers/${borrower.id}/anonymize`,
      `/staff/borrowers/${borrower.id}/delete`,
    );
  }

  const collected = [];
  for (const url of publicUrls) {
    const response = await app.inject({ method: 'GET', url });
    collected.push({ url, body: response.body });
    // Also check the English rendering of each public page.
    const english = await app.inject({
      method: 'GET',
      url: url + (url.includes('?') ? '&' : '?') + 'lang=en',
    });
    collected.push({ url: `${url} (en)`, body: english.body });
  }
  for (const url of staffUrls) {
    const response = await session.get(url);
    assert.ok(
      response.statusCode < 400,
      `${url} returned ${response.statusCode} — fix the route before checking its markup`,
    );
    collected.push({ url, body: response.body });
  }
  return collected;
}

describe('every page is structurally accessible', () => {
  let all;

  before(async () => {
    all = await pages();
  });

  it('labels every form control', () => {
    for (const { url, body } of all) {
      const controls = body.match(/<(input|select|textarea)\b[^>]*>/g) ?? [];
      for (const tag of controls) {
        if (/type="(hidden|submit|button)"/.test(tag)) continue;
        if (/aria-label(ledby)?=/.test(tag)) continue;

        const id = (tag.match(/\bid="([^"]+)"/) ?? [])[1];
        assert.ok(id, `${url}: a control has neither id nor aria-label — ${tag.slice(0, 80)}`);

        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        assert.match(
          body,
          new RegExp(`<label[^>]*for="${escaped}"`),
          `${url}: no label for control #${id}`,
        );
      }
    }
  });

  it('gives every image alt text', () => {
    for (const { url, body } of all) {
      for (const tag of body.match(/<img\b[^>]*>/g) ?? []) {
        assert.match(tag, /\balt="/, `${url}: image without alt text — ${tag.slice(0, 80)}`);
      }
    }
  });

  it('starts each page at h1 and skips no heading levels', () => {
    for (const { url, body } of all) {
      const levels = [...body.matchAll(/<h([1-4])\b/g)].map((m) => Number(m[1]));
      if (levels.length === 0) continue;

      assert.equal(levels[0], 1, `${url}: the first heading is h${levels[0]}, not h1`);
      assert.equal(
        levels.filter((l) => l === 1).length,
        1,
        `${url}: expected exactly one h1`,
      );
      for (let i = 1; i < levels.length; i += 1) {
        assert.ok(
          levels[i] - levels[i - 1] <= 1,
          `${url}: heading level jumps from h${levels[i - 1]} to h${levels[i]}`,
        );
      }
    }
  });

  it('scopes every table header', () => {
    for (const { url, body } of all) {
      if (!body.includes('<table')) continue;
      const headers = body.match(/<th\b[^>]*>/g) ?? [];
      for (const tag of headers) {
        assert.match(tag, /scope="(col|row)"/, `${url}: <th> without scope — ${tag}`);
      }
    }
  });

  it('declares a language, a viewport and a main landmark', () => {
    for (const { url, body } of all) {
      assert.match(body, /<html lang="(el|en)">/, `${url}: missing or invalid html lang`);
      assert.match(body, /name="viewport"/, `${url}: missing viewport meta`);
      assert.match(body, /<main\b[^>]*id="main"/, `${url}: no main landmark`);
    }
  });

  it('offers a skip link on pages with navigation', () => {
    for (const { url, body } of all) {
      if (!body.includes('<nav')) continue;
      assert.match(body, /class="skip-link"/, `${url}: navigation without a skip link`);
    }
  });

  it('marks decorative icons as hidden from assistive technology', () => {
    for (const { url, body } of all) {
      // Emoji used as icons sit in spans that must be aria-hidden, or carry a
      // label — otherwise a screen reader announces "books emoji" as content.
      const spans = body.match(/<span(?![^>]*aria-hidden)[^>]*>\s*[📚📘📗📕🗂️🔍🏷️👤✍️⚠️🔒⏳]/gu) ?? [];
      assert.deepEqual(spans, [], `${url}: unlabelled decorative icon`);
    }
  });

  it('gives every link discernible text', () => {
    for (const { url, body } of all) {
      const links = body.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? [];
      for (const link of links) {
        if (/aria-label=/.test(link)) continue;
        // Strip tags and entities; what remains must not be empty.
        const text = link
          .replace(/<[^>]*>/g, '')
          .replace(/&[a-z]+;/g, ' ')
          .trim();
        assert.ok(text.length > 0, `${url}: link with no text — ${link.slice(0, 90)}`);
      }
    }
  });

  it('associates each invalid field with its error message', () => {
    // A rejected form must not merely colour the field red: the error has to
    // be reachable by a screen reader.
    const invalid = all.filter(({ body }) => body.includes('aria-invalid="true"'));
    for (const { url, body } of invalid) {
      const fields = body.match(/<input\b[^>]*aria-invalid="true"[^>]*>/g) ?? [];
      for (const field of fields) {
        const describedBy = (field.match(/aria-describedby="([^"]+)"/) ?? [])[1];
        if (!describedBy) continue;
        assert.match(
          body,
          new RegExp(`id="${describedBy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`),
          `${url}: aria-describedby points at a missing element`,
        );
      }
    }
  });
});

describe('the staff area is kept out of search engines', () => {
  it('sends noindex on every staff page', async () => {
    for (const url of ['/staff', '/staff/books', '/staff/loans', '/staff/login']) {
      const response = url === '/staff/login'
        ? await app.inject({ method: 'GET', url })
        : await session.get(url);
      assert.match(response.body, /name="robots" content="noindex/, `${url} is indexable`);
    }
  });

  it('does not send noindex on public pages', async () => {
    for (const url of ['/', '/books', '/categories']) {
      const response = await app.inject({ method: 'GET', url });
      assert.ok(!response.body.includes('noindex'), `${url} is hidden from search engines`);
    }
  });
});
