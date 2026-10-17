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

  it('keeps the title when the cover is too large to accept', async () => {
    // A phone photo of a book cover is routinely several megabytes -- the
    // exact input this feature exists for. The transport used to refuse the
    // whole request, so the librarian lost every field they had typed and
    // got a bare 413 instead of a page.
    const huge = Buffer.alloc(Math.round(3.5 * 1024 * 1024), 0);
    // A real JPEG header, so it is the size that stops it and nothing else.
    (await jpeg({ width: 40, height: 60 })).copy(huge);

    const response = await postMultipart('/staff/books', {
      fields: { title: 'Τεράστιο Εξώφυλλο' },
      file: { filename: 'huge.jpg', contentType: 'image/jpeg', buffer: huge },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302, `the whole submission was refused (${response.statusCode})`);

    const book = bookNamed('τεραστιο');
    assert.ok(book, 'the title was lost along with the oversized cover');
    assert.equal(getBookById(db, book.id).cover_path, null, 'an oversized cover was stored anyway');
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

describe('a cover kept across a rejected form', () => {
  // An ISBN already in the catalogue is refused, so the form comes back with
  // everything the librarian typed — except, until now, the cover.
  const seededIsbn = '9780141439518';
  const rejected = (fields, file) => postMultipart('/staff/books', {
    fields: { isbn: seededIsbn, ...fields },
    file,
    tokenFrom: '/staff/books/new',
  });
  const pendingIn = (body) => ({
    cover: body.match(/name="pending_cover" value="([^"]+)"/)?.[1],
    thumb: body.match(/name="pending_thumb" value="([^"]+)"/)?.[1],
  });

  it('comes back with the form instead of vanishing', async () => {
    const response = await rejected(
      { title: 'Απορρίφθηκε' },
      { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    assert.equal(response.statusCode, 422);
    const { cover } = pendingIn(response.body);
    assert.ok(cover, 'the cover was not kept');
    assert.ok(fs.existsSync(path.join(uploadDir, 'covers', cover)), 'kept but not stored');
    assert.ok(response.body.includes('/covers/'), 'the librarian cannot see it survived');
  });

  it('is saved when the form finally goes through', async () => {
    const first = await rejected(
      { title: 'Δεύτερη Προσπάθεια' },
      { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    const { cover, thumb } = pendingIn(first.body);

    const second = await postMultipart('/staff/books', {
      fields: { title: 'Δεύτερη Προσπάθεια', pending_cover: cover, pending_thumb: thumb },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(second.statusCode, 302);
    assert.equal(getBookById(db, bookNamed('δευτερη προσπαθεια').id).cover_path, cover);
  });

  it('keeps the framing, because the crop is already applied', async () => {
    const first = await rejected(
      { title: 'Κομμένο Απορριφθέν', crop_x: '100', crop_y: '200', crop_w: '400', crop_h: '600' },
      { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    const { cover } = pendingIn(first.body);
    const image = await Jimp.read(path.join(uploadDir, 'covers', cover));
    assert.equal(image.width, 400);
    assert.equal(image.height, 600);
  });

  it('leaves nothing behind when a second rejection replaces it', async () => {
    const first = await rejected(
      { title: 'Δύο Απορρίψεις' },
      { filename: 'a.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    const firstPending = pendingIn(first.body);

    const second = await postMultipart('/staff/books', {
      fields: {
        isbn: seededIsbn, title: 'Δύο Απορρίψεις',
        pending_cover: firstPending.cover, pending_thumb: firstPending.thumb,
      },
      file: {
        filename: 'b.jpg',
        contentType: 'image/jpeg',
        buffer: await jpeg({ width: 600, height: 900 }),
      },
      tokenFrom: '/staff/books/new',
    });
    const secondPending = pendingIn(second.body);
    assert.ok(secondPending.cover, 'the replacement was not kept');
    assert.notEqual(secondPending.cover, firstPending.cover, 'the new file did not replace it');
    assert.ok(
      !fs.existsSync(path.join(uploadDir, 'covers', firstPending.cover)),
      'the replaced file was orphaned',
    );
  });

  it('ignores a pending name that was tampered with', async () => {
    // The filename comes back off a form, so it is untrusted like anything
    // else that arrives from a browser.
    for (const name of ['../../etc/passwd', 'not-a-uuid.jpg', '/etc/passwd']) {
      const response = await postMultipart('/staff/books', {
        fields: { title: 'Πειραγμένο Όνομα', pending_cover: name, pending_thumb: name },
        tokenFrom: '/staff/books/new',
      });
      assert.equal(response.statusCode, 302);
      const book = bookNamed('πειραγμενο ονομα');
      assert.equal(getBookById(db, book.id).cover_path, null, `accepted "${name}"`);
      db.run('DELETE FROM book WHERE id = ?', book.id);
    }
  });
});

describe('a pending cover cannot be used to reach another book\'s files', () => {
  // The filenames come back off a form, so "is it shaped like one of ours"
  // is not enough: it has to be a file that is waiting, not one a title is
  // already using. Without that, passing a victim's filename made two rows
  // name the same files, and deleting the cover from the second one unlinked
  // the first one's cover while its row still pointed at it.
  const seededIsbn = '9780141439518';

  async function bookWithCover(title) {
    await postMultipart('/staff/books', {
      fields: { title },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    return getBookById(db, bookNamed(normalizeish(title)).id);
  }
  const normalizeish = (t) => t.toLowerCase();

  it('refuses a filename another title already owns', async () => {
    const victim = await bookWithCover('Θύμα Εξωφύλλου');
    assert.ok(victim.cover_path, 'the victim has no cover to steal');

    const response = await postMultipart('/staff/books', {
      fields: {
        title: 'Κλέφτης Εξωφύλλου',
        pending_cover: victim.cover_path,
        pending_thumb: victim.cover_thumb_path,
      },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);

    const thief = getBookById(db, bookNamed('κλεφτησ').id);
    assert.equal(thief.cover_path, null, 'one title adopted another title\'s cover');
    assert.equal(
      getBookById(db, victim.id).cover_path, victim.cover_path,
      'the victim lost its cover',
    );
    assert.ok(
      fs.existsSync(path.join(uploadDir, 'covers', victim.cover_path)),
      'the victim\'s file was unlinked',
    );
  });

  it('refuses it on the edit route too', async () => {
    const victim = await bookWithCover('Δεύτερο Θύμα');
    const other = await bookWithCover('Άλλος Τίτλος');

    const response = await postMultipart(`/staff/books/${other.id}`, {
      fields: {
        title: 'Άλλος Τίτλος',
        pending_cover: victim.cover_path,
        pending_thumb: victim.cover_thumb_path,
      },
      tokenFrom: `/staff/books/${other.id}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(
      getBookById(db, other.id).cover_path, other.cover_path,
      'the edit route adopted another title\'s cover',
    );
    assert.ok(fs.existsSync(path.join(uploadDir, 'covers', victim.cover_path)));
  });

  it('still lets a title keep its own cover through a rejected edit', async () => {
    // The guard must not refuse a book re-adopting what it already has.
    const book = await bookWithCover('Δικό Του Εξώφυλλο');
    const response = await postMultipart(`/staff/books/${book.id}`, {
      fields: {
        title: 'Δικό Του Εξώφυλλο',
        pending_cover: book.cover_path,
        pending_thumb: book.cover_thumb_path,
      },
      tokenFrom: `/staff/books/${book.id}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, book.id).cover_path, book.cover_path, 'it lost its own cover');
    assert.ok(fs.existsSync(path.join(uploadDir, 'covers', book.cover_path)));
  });

  it('ignores a pending cover whose files have been swept away', async () => {
    // The sweep deletes orphans older than a day. A form left open longer
    // than that would otherwise save a title pointing at nothing.
    const first = await postMultipart('/staff/books', {
      fields: { isbn: seededIsbn, title: 'Σκουπισμένο Εκκρεμές' },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    const cover = first.body.match(/name="pending_cover" value="([^"]+)"/)[1];
    const thumb = first.body.match(/name="pending_thumb" value="([^"]+)"/)[1];
    fs.rmSync(path.join(uploadDir, 'covers', cover));
    fs.rmSync(path.join(uploadDir, 'covers', thumb));

    const second = await postMultipart('/staff/books', {
      fields: { title: 'Σκουπισμένο Εκκρεμές', pending_cover: cover, pending_thumb: thumb },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(second.statusCode, 302);
    assert.equal(
      getBookById(db, bookNamed('σκουπισμενο').id).cover_path, null,
      'the title was saved pointing at a file that is gone',
    );
  });

  it('keeps the good kept cover when a newly chosen file is unusable', async () => {
    const first = await postMultipart('/staff/books', {
      fields: { isbn: seededIsbn, title: 'Καλό Κρατημένο' },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    const cover = first.body.match(/name="pending_cover" value="([^"]+)"/)[1];
    const thumb = first.body.match(/name="pending_thumb" value="([^"]+)"/)[1];

    const second = await postMultipart('/staff/books', {
      fields: { title: 'Καλό Κρατημένο', pending_cover: cover, pending_thumb: thumb },
      // A PDF renamed .jpg — the good framed cover should not go with it.
      file: { filename: 'bad.jpg', contentType: 'image/jpeg', buffer: Buffer.from('%PDF-1.4 not an image') },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(second.statusCode, 302);
    assert.equal(
      getBookById(db, bookNamed('καλο κρατημενο').id).cover_path, cover,
      'the good kept cover was discarded along with the bad new file',
    );
  });
});
