// A cover saved alongside the title that owns it.
//
// The cover used to be a second errand: save the title, come back, upload.
// Now one post carries both, which raises the question these tests answer —
// what happens to the title when the cover is the thing that goes wrong.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { buildApp } from '../src/app.js';
import { getBookById, listBooks } from '../src/db/queries/books.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { csrfFrom, login, makeStaffUser } from './staff-helpers.js';

let app; let db; let dir; let session; let uploadDir;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  uploadDir = setup.config.uploadDir;
  db = makeTestDb();
  seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);
});

after(async () => { await app.close(); db.close(); cleanupDir(dir); });

const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

const jpeg = async ({ width = 800, height = 1200 } = {}) =>
  new Jimp({ width, height, color: 0x3366ccff }).getBuffer('image/jpeg', { quality: 80 });

/** POST a multipart form of text fields plus an optional file. */
async function postMultipart(url, { fields = {}, file, tokenFrom }) {
  const token = csrfFrom((await get(tokenFrom)).body);
  const boundary = '----dslibcover';
  const parts = [];
  const text = (name, value) => parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  ));
  text('_csrf', token);
  for (const [name, value] of Object.entries(fields)) {
    for (const one of [].concat(value)) text(name, one);
  }
  if (file) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="${file.filename}"\r\n`
      + `Content-Type: ${file.contentType}\r\n\r\n`,
    ));
    parts.push(file.buffer, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: `${session.cookie}; ui=next`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(parts),
  });
}

const bookNamed = (q) => listBooks(db, { q }).rows[0];

describe('a cover saved with a new title', () => {
  it('creates the title and its cover in one post', async () => {
    const response = await postMultipart('/staff/books', {
      fields: { title: 'Με Εξώφυλλο Εξαρχής', authors: ['Όμηρος', ''] },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookNamed('εξαρχης').id);
    assert.ok(book.cover_path, 'the title was created without its cover');
    assert.ok(fs.existsSync(path.join(uploadDir, 'covers', book.cover_path)));
  });

  it('applies the crop coordinates sent with it', async () => {
    const response = await postMultipart('/staff/books', {
      fields: {
        title: 'Κομμένο Εξώφυλλο',
        crop_x: '100', crop_y: '200', crop_w: '400', crop_h: '600',
      },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookNamed('κομμενο').id);
    const image = await Jimp.read(path.join(uploadDir, 'covers', book.cover_path));
    assert.equal(image.width, 400);
    assert.equal(image.height, 600);
  });

  it('creates the title with no cover when no file is chosen', async () => {
    const response = await postMultipart('/staff/books', {
      fields: { title: 'Χωρίς Εξώφυλλο' },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookNamed('χωρις εξωφυλλο').id).cover_path, null);
  });

  it('keeps the title when the cover is unreadable', async () => {
    // Losing typed metadata to a bad file is the one outcome worth avoiding.
    const response = await postMultipart('/staff/books', {
      fields: { title: 'Χαλασμένο Αρχείο' },
      file: {
        filename: 'c.jpg',
        contentType: 'image/jpeg',
        buffer: Buffer.from('not an image at all'),
      },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);
    const book = bookNamed('χαλασμενο');
    assert.ok(book, 'the title was lost with the cover');
    assert.equal(getBookById(db, book.id).cover_path, null);
  });

  it('ignores crop coordinates that arrive with no file', async () => {
    const response = await postMultipart('/staff/books', {
      fields: {
        title: 'Μόνο Συντεταγμένες',
        crop_x: '10', crop_y: '10', crop_w: '50', crop_h: '75',
      },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookNamed('μονο συντεταγμενες').id).cover_path, null);
  });
});

describe('a cover saved with an edit', () => {
  let bookId;

  before(async () => {
    await postMultipart('/staff/books', {
      fields: { title: 'Προς Επεξεργασία' },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    bookId = bookNamed('επεξεργασια').id;
  });

  it('replaces the cover and deletes the file it replaced', async () => {
    const before = getBookById(db, bookId).cover_path;
    const response = await postMultipart(`/staff/books/${bookId}`, {
      fields: { title: 'Προς Επεξεργασία' },
      file: {
        filename: 'n.jpg',
        contentType: 'image/jpeg',
        buffer: await jpeg({ width: 600, height: 900 }),
      },
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);

    const after = getBookById(db, bookId).cover_path;
    assert.notEqual(after, before, 'the cover was not replaced');
    assert.ok(!fs.existsSync(path.join(uploadDir, 'covers', before)), 'the old file was left behind');
  });

  it('keeps the existing cover when the field is left empty', async () => {
    const before = getBookById(db, bookId).cover_path;
    const response = await postMultipart(`/staff/books/${bookId}`, {
      fields: { title: 'Προς Επεξεργασία Ξανά' },
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookId).cover_path, before, 'saving the title cleared the cover');
  });
});

describe('removing a cover from the second interface', () => {
  it('posts to a route that exists', async () => {
    const bookId = bookNamed('επεξεργασια').id;
    assert.ok(getBookById(db, bookId).cover_path, 'nothing to remove, so this proves nothing');

    const page = await get(`/staff/books/${bookId}`);
    const actions = [...page.body.matchAll(/action="([^"]*\/cover\/[^"]*)"/g)].map((m) => m[1]);
    assert.ok(actions.length > 0, 'the page offers no way to remove the cover');
    assert.deepEqual(
      actions.filter((a) => !a.endsWith('/cover/delete')),
      [],
      `the second interface posts somewhere that 404s: ${actions}`,
    );
  });

  it('actually removes it', async () => {
    const bookId = bookNamed('επεξεργασια').id;
    assert.ok(getBookById(db, bookId).cover_path, 'nothing to remove, so this proves nothing');

    const response = await postMultipart(`/staff/books/${bookId}/cover/delete`, {
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookId).cover_path, null);
  });
});
