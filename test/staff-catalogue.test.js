// Catalogue management — acceptance criteria 5 (a librarian can create and
// edit a title and manage its copies) and 7 (validation prevents malformed
// input and duplicate identifiers).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { buildApp } from '../src/app.js';
import { getBookById, listBooks } from '../src/db/queries/books.js';
import { listAllAuthors } from '../src/db/queries/authors.js';
import { listAllCategories } from '../src/db/queries/categories.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { checkIn, checkOut } from '../src/db/queries/loans.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { csrfFrom, login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let uploadDir;
let fixtures;
let session;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  uploadDir = setup.config.uploadDir;
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

/** Submit a multipart form with one file part and a CSRF token. */
async function postFile(url, { filename, contentType, buffer, tokenFrom }) {
  const page = await session.get(tokenFrom);
  const token = csrfFrom(page.body);
  const boundary = '----dslibtestboundary';

  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from('Content-Disposition: form-data; name="_csrf"\r\n\r\n'),
    Buffer.from(`${token}\r\n`),
    Buffer.from(`--${boundary}\r\n`),
    Buffer.from(`Content-Disposition: form-data; name="cover"; filename="${filename}"\r\n`),
    Buffer.from(`Content-Type: ${contentType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: session.cookie,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });
}

async function makeJpeg({ width = 800, height = 1200 } = {}) {
  const image = new Jimp({ width, height, color: 0x3366ccff });
  return image.getBuffer('image/jpeg', { quality: 80 });
}

describe('creating and editing a title (acceptance 5)', () => {
  it('creates a title with authors and categories', async () => {
    const category = listAllCategories(db)[0];

    const response = await session.post(
      '/staff/books',
      {
        title: 'Το Κιβώτιο',
        subtitle: 'Μυθιστόρημα',
        authors: 'Άρης Αλεξάνδρου',
        categories: category.id,
        publisher: 'Εκδόσεις Κέδρος',
        publication_year: '1974',
        language: 'el',
        description: 'Ένας στρατιώτης γράφει αναφορές από τη φυλακή.',
      },
      { tokenFrom: '/staff/books/new' },
    );

    assert.equal(response.statusCode, 302);
    // Straight to copies, because a title with none is invisible as available.
    assert.match(response.headers.location, /^\/staff\/books\/\d+\/copies$/);

    const created = listBooks(db, { q: 'κιβωτιο' });
    assert.equal(created.total, 1);

    const book = getBookById(db, created.rows[0].id);
    assert.equal(book.title, 'Το Κιβώτιο');
    assert.equal(book.publication_year, 1974);
    assert.equal(book.authors[0].name, 'Άρης Αλεξάνδρου');
    assert.equal(book.categories[0].id, category.id);
  });

  it('makes the new title searchable by author and keyword immediately', async () => {
    assert.equal(listBooks(db, { q: 'αλεξανδρου' }).total, 1);
    assert.equal(listBooks(db, { q: 'ΑΛΕΞΑΝΔΡΟΥ' }).total, 1);
    assert.equal(listBooks(db, { q: 'φυλακη' }).total, 1);
    assert.equal(listBooks(db, { q: 'κεδρος' }).total, 1);
  });

  it('shows the new title on the public site', async () => {
    const id = listBooks(db, { q: 'κιβωτιο' }).rows[0].id;
    const response = await app.inject({ method: 'GET', url: `/books/${id}` });
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Το Κιβώτιο'));
    assert.ok(response.body.includes('Άρης Αλεξάνδρου'));
  });

  it('accepts multiple authors and keeps their order', async () => {
    const response = await session.post(
      '/staff/books',
      {
        title: 'Συλλογικός Τόμος',
        // Repeated fields, as the form submits them.
        authors: ['Πρώτος Συγγραφέας', 'Δεύτερος Συγγραφέας'],
      },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(response.statusCode, 302);

    const id = listBooks(db, { q: 'συλλογικοσ' }).rows[0].id;
    const book = getBookById(db, id);
    assert.deepEqual(
      book.authors.map((a) => a.name),
      ['Πρώτος Συγγραφέας', 'Δεύτερος Συγγραφέας'],
    );
  });

  it('reuses an existing author rather than duplicating them', async () => {
    const before = listAllAuthors(db).length;
    await session.post(
      '/staff/books',
      { title: 'Άλλος Τίτλος Ομήρου', authors: 'ΟΜΗΡΟΣ' },
      { tokenFrom: '/staff/books/new' },
    );
    const after = listAllAuthors(db);
    assert.equal(after.length, before, 'a duplicate author record was created');
    assert.equal(after.filter((a) => a.name_norm === 'ομηροσ').length, 1);
  });

  it('edits an existing title', async () => {
    const id = fixtures.books.iliad;
    const response = await session.post(
      `/staff/books/${id}`,
      {
        title: 'Ιλιάδα',
        subtitle: 'Νέα μετάφραση',
        authors: 'Όμηρος',
        publisher: 'Εκδόσεις Νέες',
        publication_year: '2020',
        language: 'el',
      },
      { tokenFrom: `/staff/books/${id}` },
    );

    assert.equal(response.statusCode, 302);
    const book = getBookById(db, id);
    assert.equal(book.subtitle, 'Νέα μετάφραση');
    assert.equal(book.publication_year, 2020);
    assert.equal(book.publisher, 'Εκδόσεις Νέες');
  });

  it('reindexes search when the title changes', async () => {
    const id = fixtures.books.zorba;
    await session.post(
      `/staff/books/${id}`,
      { title: 'Ο Καπετάν Μιχάλης', authors: 'Νίκος Καζαντζάκης' },
      { tokenFrom: `/staff/books/${id}` },
    );
    assert.equal(listBooks(db, { q: 'καπεταν μιχαλης' }).total, 1);
    assert.equal(listBooks(db, { q: 'ζορμπα' }).total, 0);
  });

  it('shows a flash confirmation after saving', async () => {
    const id = fixtures.books.odyssey;
    const saved = await session.post(
      `/staff/books/${id}`,
      { title: 'Οδύσσεια', authors: 'Όμηρος' },
      { tokenFrom: `/staff/books/${id}` },
    );
    const followed = await session.get(saved.headers.location);
    assert.ok(followed.body.includes('αποθηκεύτηκε'), 'no confirmation message was shown');
  });

  it('returns 404 for an unknown or malformed book id', async () => {
    for (const url of ['/staff/books/999999', '/staff/books/abc', '/staff/books/0']) {
      assert.equal((await session.get(url)).statusCode, 404, url);
    }
  });

  it('lets staff edit an archived title that the public cannot see', async () => {
    const id = fixtures.books.archived;
    assert.equal((await app.inject({ method: 'GET', url: `/books/${id}` })).statusCode, 404);
    assert.equal((await session.get(`/staff/books/${id}`)).statusCode, 200);
  });
});

describe('validation (acceptance 7)', () => {
  it('rejects a missing title and keeps the rest of the input', async () => {
    const response = await session.post(
      '/staff/books',
      { title: '   ', publisher: 'Εκδόσεις Δοκιμή', publication_year: '1999' },
      { tokenFrom: '/staff/books/new' },
    );

    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('error-summary'), 'no error summary was shown');
    // What the librarian typed is still in the form.
    assert.ok(response.body.includes('Εκδόσεις Δοκιμή'), 'the submitted input was lost');
    assert.ok(response.body.includes('1999'));
    assert.equal(listBooks(db, { q: 'δοκιμη' }).total, 0, 'an invalid title was saved');
  });

  it('rejects an ISBN that fails its check digit', async () => {
    const response = await session.post(
      '/staff/books',
      { title: 'Κακό ISBN', isbn: '9780141439519' },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('ISBN'));
    assert.equal(listBooks(db, { q: 'κακο isbn' }).total, 0);
  });

  it('accepts a valid ISBN-10 and stores its ISBN-13 form', async () => {
    const response = await session.post(
      '/staff/books',
      { title: 'Με ISBN-10', isbn: '0-13-110362-8' },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(response.statusCode, 302);

    const id = listBooks(db, { q: 'isbn 10' }).rows[0].id;
    const book = getBookById(db, id);
    assert.equal(book.isbn10, '0131103628');
    // 0-13-110362-8 is 978-0-13-110362-7 as an ISBN-13: the 978 prefix
    // changes the weighted sum, so the check digit changes too.
    assert.equal(book.isbn13, '9780131103627');
  });

  it('refuses a second active title with the same ISBN', async () => {
    const response = await session.post(
      '/staff/books',
      { title: 'Διπλότυπο', isbn: '9780141439518' },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(response.statusCode, 422);
    // And it points at the record that already has it.
    assert.ok(response.body.includes('Pride and Prejudice'));
    assert.equal(listBooks(db, { q: 'διπλοτυπο' }).total, 0);
  });

  it('rejects an out-of-range publication year', async () => {
    for (const year of ['999', '3000', '-5']) {
      const response = await session.post(
        '/staff/books',
        { title: `Έτος ${year}`, publication_year: year },
        { tokenFrom: '/staff/books/new' },
      );
      assert.equal(response.statusCode, 422, `year ${year} was accepted`);
    }
  });

  it('accepts an empty year, publisher and ISBN', async () => {
    const response = await session.post(
      '/staff/books',
      { title: 'Ελάχιστα Στοιχεία', publication_year: '', isbn: '', publisher: '' },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, listBooks(db, { q: 'ελαχιστα' }).rows[0].id);
    assert.equal(book.publication_year, null);
    assert.equal(book.isbn13, null);
  });

  it('does not store HTML from a description as markup', async () => {
    await session.post(
      '/staff/books',
      {
        title: 'Δοκιμή XSS',
        description: '<script>alert("xss")</script> και <img src=x onerror=alert(1)>',
      },
      { tokenFrom: '/staff/books/new' },
    );

    const id = listBooks(db, { q: 'xss' }).rows[0].id;

    // The payload is stored verbatim — escaping belongs at output, not at
    // input, so the librarian's text is never silently mangled.
    assert.ok(getBookById(db, id).description.includes('<script>'));

    for (const page of [
      (await app.inject({ method: 'GET', url: `/books/${id}` })).body,
      (await session.get(`/staff/books/${id}`)).body,
    ]) {
      // What matters is that no executable tag is produced. The substring
      // 'onerror=alert' does appear — inside escaped text, which is inert —
      // so assert on the tag forms a browser would actually run.
      assert.ok(!page.includes('<script>alert'), 'a script tag was rendered');
      assert.ok(!page.includes('<img src=x'), 'an img tag was rendered');
      assert.ok(!/<img[^>]*onerror/i.test(page), 'an onerror handler was rendered');
      assert.ok(page.includes('&lt;script&gt;'), 'the text was dropped rather than escaped');
    }
  });

  it('rejects an absurdly long title rather than truncating it', async () => {
    const response = await session.post(
      '/staff/books',
      { title: 'α'.repeat(600) },
      { tokenFrom: '/staff/books/new' },
    );
    assert.equal(response.statusCode, 422);
  });
});

describe('copy management (acceptance 5)', () => {
  let bookId;

  before(async () => {
    await session.post(
      '/staff/books',
      { title: 'Βιβλίο Αντιτύπων', authors: 'Δοκιμαστής' },
      { tokenFrom: '/staff/books/new' },
    );
    bookId = listBooks(db, { q: 'αντιτυπων' }).rows[0].id;
  });

  it('adds a copy with a barcode and shelf location', async () => {
    const response = await session.post(
      `/staff/books/${bookId}/copies`,
      { barcode: 'NEW-0001', shelf_location: 'Δ1-05', status: 'available' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookId);
    assert.equal(book.copies_total, 1);
    assert.equal(book.copies_available, 1);
    assert.equal(book.copies[0].barcode, 'NEW-0001');
    assert.equal(book.copies[0].shelf_location, 'Δ1-05');
  });

  it('refuses a barcode already used by another copy (acceptance 7)', async () => {
    const response = await session.post(
      `/staff/books/${bookId}/copies`,
      { barcode: 'NEW-0001', status: 'available' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('barcode') || response.body.includes('Barcode'));
    assert.equal(getBookById(db, bookId).copies_total, 1, 'a duplicate copy was created');
  });

  it('refuses a barcode used by a copy of a different title', async () => {
    const response = await session.post(
      `/staff/books/${bookId}/copies`,
      { barcode: 'T-0001', status: 'available' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 422);
  });

  it('adds several copies at once', async () => {
    const response = await session.post(
      `/staff/books/${bookId}/copies/bulk`,
      { count: '3', shelf_location: 'Δ1-05' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookId).copies_total, 4);
  });

  it('caps a bulk request rather than accepting any number', async () => {
    const response = await session.post(
      `/staff/books/${bookId}/copies/bulk`,
      { count: '100000' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    // Rejected by validation, so nothing is created.
    assert.equal(response.statusCode, 302);
    assert.ok(getBookById(db, bookId).copies_total < 200);
  });

  it('edits a copy', async () => {
    const copy = getBookById(db, bookId).copies[0];
    const response = await session.post(
      `/staff/copies/${copy.id}`,
      { barcode: 'NEW-9999', shelf_location: 'Ε2-01', status: 'repair' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 302);

    const updated = getBookById(db, bookId).copies.find((c) => c.id === copy.id);
    assert.equal(updated.barcode, 'NEW-9999');
    assert.equal(updated.status, 'repair');
    assert.equal(updated.is_available, 0, 'a copy in repair is still counted as available');
  });

  it('changes public availability as soon as a copy status changes (acceptance 6)', async () => {
    const before = await app.inject({ method: 'GET', url: `/books/${bookId}` });
    const beforeCounts = getBookById(db, bookId);
    assert.ok(before.body.includes(`${beforeCounts.copies_available} από ${beforeCounts.copies_total}`));

    const copy = getBookById(db, bookId).copies.find((c) => c.status === 'available');
    await session.post(
      `/staff/copies/${copy.id}`,
      { status: 'lost', barcode: copy.barcode || '', shelf_location: copy.shelf_location || '' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );

    const afterCounts = getBookById(db, bookId);
    assert.equal(afterCounts.copies_available, beforeCounts.copies_available - 1);
    const after = await app.inject({ method: 'GET', url: `/books/${bookId}` });
    assert.ok(after.body.includes(`${afterCounts.copies_available} από ${afterCounts.copies_total}`));
  });

  it('refuses to withdraw a copy that is out on loan', async () => {
    const copy = getBookById(db, bookId).copies.find((c) => c.status === 'available');
    const borrower = createBorrower(db, { displayName: 'Δανειολήπτης', schoolClass: 'Α1' });
    const loan = checkOut(db, { copyId: copy.id, borrowerId: borrower.id });
    assert.ok(loan.ok);

    const response = await session.post(
      `/staff/copies/${copy.id}`,
      { status: 'withdrawn', barcode: copy.barcode || '' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(response.statusCode, 302);

    const followed = await session.get(`/staff/books/${bookId}/copies`);
    assert.ok(followed.body.includes('δανεισμό'), 'no explanation was shown');
    assert.equal(
      getBookById(db, bookId).copies.find((c) => c.id === copy.id).status,
      'available',
      'the status changed despite the open loan',
    );

    checkIn(db, { loanId: loan.id });
  });

  it('refuses to delete a copy with loan history and offers withdrawal', async () => {
    const copy = getBookById(db, bookId).copies.find((c) => !c.open_loan_id && c.status === 'available');
    assert.ok(copy, 'no free copy to use for this test');
    const borrower = createBorrower(db, { displayName: 'Ιστορικό' });
    const loan = checkOut(db, { copyId: copy.id, borrowerId: borrower.id });
    checkIn(db, { loanId: loan.id });

    const confirmPage = await session.get(`/staff/copies/${copy.id}/delete`);
    assert.equal(confirmPage.statusCode, 200);
    assert.ok(confirmPage.body.includes('αποσυρμένο'), 'withdrawal was not offered');

    const response = await session.post(
      `/staff/copies/${copy.id}/delete`,
      {},
      { tokenFrom: `/staff/copies/${copy.id}/delete` },
    );
    assert.equal(response.statusCode, 302);
    assert.ok(db.get('SELECT 1 AS ok FROM copy WHERE id = ?', copy.id), 'the copy was deleted');
  });

  it('deletes a copy that was never lent', async () => {
    const added = await session.post(
      `/staff/books/${bookId}/copies`,
      { barcode: 'TEMP-0001', status: 'available' },
      { tokenFrom: `/staff/books/${bookId}/copies` },
    );
    assert.equal(added.statusCode, 302);

    const copy = db.get('SELECT id FROM copy WHERE barcode = ?', 'TEMP-0001');
    const response = await session.post(
      `/staff/copies/${copy.id}/delete`,
      {},
      { tokenFrom: `/staff/copies/${copy.id}/delete` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(db.get('SELECT 1 AS ok FROM copy WHERE id = ?', copy.id), undefined);
  });
});

describe('archiving and deleting a title', () => {
  it('archives a title, removing it from the public catalogue', async () => {
    const id = fixtures.books.austen;
    const response = await session.post(
      `/staff/books/${id}/archive`,
      {},
      { tokenFrom: `/staff/books/${id}` },
    );
    assert.equal(response.statusCode, 302);

    assert.equal((await app.inject({ method: 'GET', url: `/books/${id}` })).statusCode, 404);
    assert.ok(!(await app.inject({ method: 'GET', url: '/books' })).body.includes('Pride and Prejudice'));

    // The copies and their history survive.
    assert.ok(getBookById(db, id, { includeArchived: true }).copies.length > 0);
  });

  it('restores an archived title', async () => {
    const id = fixtures.books.austen;
    const response = await session.post(
      `/staff/books/${id}/unarchive`,
      {},
      { tokenFrom: `/staff/books/${id}` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal((await app.inject({ method: 'GET', url: `/books/${id}` })).statusCode, 200);
  });

  it('shows a confirmation page before deleting', async () => {
    const response = await session.get(`/staff/books/${fixtures.books.odyssey}/delete`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
    // Archiving is offered as the alternative.
    assert.ok(response.body.includes('Αρχειοθέτηση'));
  });

  it('refuses to delete a title with loan history and explains why', async () => {
    const id = fixtures.books.odyssey;
    const copy = getBookById(db, id).copies[0];
    const borrower = createBorrower(db, { displayName: 'Κάποιος' });
    const loan = checkOut(db, { copyId: copy.id, borrowerId: borrower.id });
    checkIn(db, { loanId: loan.id });

    const confirmPage = await session.get(`/staff/books/${id}/delete`);
    assert.ok(confirmPage.body.includes('ιστορικό δανεισμών'), 'the reason was not explained');

    const response = await session.post(
      `/staff/books/${id}/delete`,
      {},
      { tokenFrom: `/staff/books/${id}/delete` },
    );
    assert.equal(response.statusCode, 302);
    assert.ok(getBookById(db, id, { includeArchived: true }), 'the title was deleted anyway');
  });

  it('deletes a title with no loan history, and its copies', async () => {
    await session.post(
      '/staff/books',
      { title: 'Προς Διαγραφή' },
      { tokenFrom: '/staff/books/new' },
    );
    const id = listBooks(db, { q: 'διαγραφη' }).rows[0].id;
    await session.post(
      `/staff/books/${id}/copies`,
      { barcode: 'DEL-0001', status: 'available' },
      { tokenFrom: `/staff/books/${id}/copies` },
    );

    const response = await session.post(
      `/staff/books/${id}/delete`,
      {},
      { tokenFrom: `/staff/books/${id}/delete` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff/books');
    assert.equal(getBookById(db, id, { includeArchived: true }), undefined);
    assert.equal(db.value('SELECT COUNT(*) FROM copy WHERE book_id = ?', id), 0);
  });
});

describe('cover images', () => {
  let bookId;

  before(async () => {
    await session.post('/staff/books', { title: 'Με Εξώφυλλο' }, { tokenFrom: '/staff/books/new' });
    bookId = listBooks(db, { q: 'εξωφυλλο' }).rows[0].id;
  });

  it('accepts a JPEG and stores a display image and a thumbnail', async () => {
    const response = await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'cover.jpg',
      contentType: 'image/jpeg',
      buffer: await makeJpeg(),
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookId);
    assert.ok(book.cover_path, 'no cover path was recorded');
    assert.ok(book.cover_thumb_path, 'no thumbnail path was recorded');

    const coversDir = path.join(uploadDir, 'covers');
    assert.ok(fs.existsSync(path.join(coversDir, book.cover_path)));
    assert.ok(fs.existsSync(path.join(coversDir, book.cover_thumb_path)));

    // The stored name is a UUID, never the uploaded filename.
    assert.ok(!book.cover_path.includes('cover'), 'the client filename was used');
    assert.match(book.cover_path, /^[0-9a-f-]{36}\.jpg$/);
  });

  it('serves the cover on the public book page', async () => {
    const book = getBookById(db, bookId);
    const page = await app.inject({ method: 'GET', url: `/books/${bookId}` });
    assert.ok(page.body.includes(`/covers/${book.cover_path}`));

    const image = await app.inject({ method: 'GET', url: `/covers/${book.cover_path}` });
    assert.equal(image.statusCode, 200);
    assert.match(image.headers['content-type'], /image\/jpeg/);
  });

  it('resizes an oversized image down', async () => {
    const response = await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'big.jpg',
      contentType: 'image/jpeg',
      buffer: await makeJpeg({ width: 2000, height: 3000 }),
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookId);
    const stored = await Jimp.read(path.join(uploadDir, 'covers', book.cover_path));
    assert.ok(stored.width <= 600, `stored width was ${stored.width}`);

    const thumb = await Jimp.read(path.join(uploadDir, 'covers', book.cover_thumb_path));
    assert.ok(thumb.width <= 240, `thumbnail width was ${thumb.width}`);
  });

  it('strips metadata by re-encoding the image', async () => {
    // A JPEG carrying an EXIF comment segment. After processing, the comment
    // must be gone — this is what protects a librarian who photographs a cover
    // with a phone that records GPS coordinates.
    const marker = 'SECRETLOCATION';
    const original = await makeJpeg({ width: 400, height: 600 });
    const comment = Buffer.concat([
      Buffer.from([0xff, 0xfe]), // COM segment
      Buffer.from([0x00, marker.length + 2]),
      Buffer.from(marker, 'ascii'),
    ]);
    const withComment = Buffer.concat([original.subarray(0, 2), comment, original.subarray(2)]);
    assert.ok(withComment.includes(marker), 'the test fixture has no marker to strip');

    const response = await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'phone.jpg',
      contentType: 'image/jpeg',
      buffer: withComment,
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookId);
    const stored = fs.readFileSync(path.join(uploadDir, 'covers', book.cover_path));
    assert.ok(!stored.includes(marker), 'uploaded metadata survived into the served file');
  });

  it('deletes the previous files when a cover is replaced', async () => {
    const before = getBookById(db, bookId);
    const oldPath = path.join(uploadDir, 'covers', before.cover_path);
    assert.ok(fs.existsSync(oldPath));

    await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'replacement.jpg',
      contentType: 'image/jpeg',
      buffer: await makeJpeg({ width: 300, height: 450 }),
      tokenFrom: `/staff/books/${bookId}`,
    });

    assert.ok(!fs.existsSync(oldPath), 'the replaced file was left on disk');
    assert.ok(fs.existsSync(path.join(uploadDir, 'covers', getBookById(db, bookId).cover_path)));
  });

  it('removes a cover on request, including its files', async () => {
    const before = getBookById(db, bookId);
    const files = [before.cover_path, before.cover_thumb_path].map((n) =>
      path.join(uploadDir, 'covers', n),
    );

    const response = await session.post(
      `/staff/books/${bookId}/cover/delete`,
      {},
      { tokenFrom: `/staff/books/${bookId}` },
    );
    assert.equal(response.statusCode, 302);

    const after = getBookById(db, bookId);
    assert.equal(after.cover_path, null);
    for (const file of files) {
      assert.ok(!fs.existsSync(file), `${file} was left on disk`);
    }
  });

  it('refuses an SVG, whatever it claims to be', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const response = await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'evil.jpg',
      contentType: 'image/jpeg',
      buffer: svg,
      tokenFrom: `/staff/books/${bookId}`,
    });

    assert.equal(response.statusCode, 302);
    const followed = await session.get(`/staff/books/${bookId}`);
    assert.ok(followed.body.includes('JPEG'), 'no rejection message was shown');
    assert.equal(getBookById(db, bookId).cover_path, null, 'an SVG was stored as a cover');
  });

  it('refuses a script with an image extension and content type', async () => {
    const response = await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'shell.png',
      contentType: 'image/png',
      buffer: Buffer.from('<?php system($_GET["c"]); ?>'),
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookId).cover_path, null);
  });

  it('refuses a file larger than the configured limit', async () => {
    // Noise does not compress, so this reliably exceeds the 2 MB cap.
    const big = Buffer.alloc(3 * 1024 * 1024);
    for (let i = 0; i < big.length; i += 1) big[i] = (i * 7919) % 256;
    big[0] = 0xff;
    big[1] = 0xd8;
    big[2] = 0xff;

    const response = await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'huge.jpg',
      contentType: 'image/jpeg',
      buffer: big,
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.ok([302, 413].includes(response.statusCode), `got ${response.statusCode}`);
    assert.equal(getBookById(db, bookId).cover_path, null);
  });

  it('refuses a corrupt image with a valid signature', async () => {
    const response = await postFile(`/staff/books/${bookId}/cover`, {
      filename: 'broken.png',
      contentType: 'image/png',
      buffer: Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.from('not actually a png body at all'),
      ]),
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookId).cover_path, null);
  });

  it('cannot be reached without a session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/staff/books/${bookId}/cover`,
      headers: { accept: 'application/json' },
      payload: '',
    });
    assert.ok([401, 403].includes(response.statusCode));
  });
});

describe('categories and authors management', () => {
  it('creates a category with a transliterated slug', async () => {
    const response = await session.post(
      '/staff/categories',
      { name: 'Φιλοσοφία', description: 'Αρχαία και νεότερη φιλοσοφία.' },
      { tokenFrom: '/staff/categories' },
    );
    assert.equal(response.statusCode, 302);

    const created = listAllCategories(db).find((c) => c.name === 'Φιλοσοφία');
    assert.ok(created);
    assert.equal(created.slug, 'filosofia');
  });

  it('refuses a duplicate category name under normalization (acceptance 7)', async () => {
    const response = await session.post(
      '/staff/categories',
      { name: 'ΦΙΛΟΣΟΦΙΑ' },
      { tokenFrom: '/staff/categories' },
    );
    assert.equal(response.statusCode, 422);
    assert.equal(listAllCategories(db).filter((c) => c.name_norm === 'φιλοσοφια').length, 1);
  });

  it('keeps the slug stable across a rename', async () => {
    const category = listAllCategories(db).find((c) => c.name === 'Φιλοσοφία');
    const response = await session.post(
      `/staff/categories/${category.id}`,
      { name: 'Φιλοσοφία και Λογική' },
      { tokenFrom: `/staff/categories/${category.id}` },
    );
    assert.equal(response.statusCode, 302);

    const renamed = listAllCategories(db).find((c) => c.id === category.id);
    assert.equal(renamed.name, 'Φιλοσοφία και Λογική');
    assert.equal(renamed.slug, 'filosofia', 'the slug changed and old links would break');
  });

  it('reindexes titles when a category is renamed', async () => {
    const category = listAllCategories(db).find((c) => c.slug === 'filosofia');
    await session.post(
      '/staff/books',
      { title: 'Περί Ψυχής', categories: category.id },
      { tokenFrom: '/staff/books/new' },
    );

    await session.post(
      `/staff/categories/${category.id}`,
      { name: 'Μεταφυσική' },
      { tokenFrom: `/staff/categories/${category.id}` },
    );

    // The new category name is searchable on its titles.
    assert.ok(listBooks(db, { q: 'μεταφυσικη' }).total >= 1);
  });

  it('detaches but does not delete titles when a category is removed', async () => {
    const category = listAllCategories(db).find((c) => c.slug === 'filosofia');
    const bookId = listBooks(db, { q: 'περι ψυχησ' }).rows[0].id;

    const confirmPage = await session.get(`/staff/categories/${category.id}/delete`);
    assert.equal(confirmPage.statusCode, 200);

    const response = await session.post(
      `/staff/categories/${category.id}/delete`,
      {},
      { tokenFrom: `/staff/categories/${category.id}/delete` },
    );
    assert.equal(response.statusCode, 302);

    assert.ok(getBookById(db, bookId), 'the title was deleted with its category');
    assert.equal(getBookById(db, bookId).categories.length, 0);
  });

  it('renames an author and reindexes their titles', async () => {
    const author = listAllAuthors(db).find((a) => a.name === 'Δοκιμαστής');
    const response = await session.post(
      `/staff/authors/${author.id}`,
      { name: 'Δοκιμαστής Μετονομασμένος' },
      { tokenFrom: `/staff/authors/${author.id}` },
    );
    assert.equal(response.statusCode, 302);
    assert.ok(listBooks(db, { q: 'μετονομασμενος' }).total >= 1);
  });

  it('offers a merge when a rename would collide', async () => {
    const authors = listAllAuthors(db);
    const source = authors.find((a) => a.name === 'Πρώτος Συγγραφέας');
    const target = authors.find((a) => a.name === 'Δεύτερος Συγγραφέας');

    const response = await session.post(
      `/staff/authors/${source.id}`,
      { name: target.name },
      { tokenFrom: `/staff/authors/${source.id}` },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('Συγχώνευση'), 'no merge was offered');
  });

  it('merges two author records, moving the titles', async () => {
    const authors = listAllAuthors(db);
    const source = authors.find((a) => a.name === 'Πρώτος Συγγραφέας');
    const target = authors.find((a) => a.name === 'Δεύτερος Συγγραφέας');

    // The union of their titles, not the sum of their counts: these two are
    // co-authors of the same book, and the merge must not try to attach the
    // target to a title it already has (which would violate the composite
    // primary key on book_author).
    const expected =
      db.value(
        `SELECT COUNT(DISTINCT book_id) FROM book_author WHERE author_id IN (?, ?)`,
        source.id,
        target.id,
      ) ?? 0;

    const response = await session.post(
      `/staff/authors/${source.id}/merge`,
      { target_id: target.id },
      { tokenFrom: `/staff/authors/${source.id}` },
    );
    assert.equal(response.statusCode, 302);

    const after = listAllAuthors(db);
    assert.equal(after.some((a) => a.id === source.id), false, 'the source author remains');
    assert.equal(after.find((a) => a.id === target.id).book_count, expected);
  });

  it('refuses to delete an author who still has titles', async () => {
    const author = listAllAuthors(db).find((a) => a.book_count > 0);
    const response = await session.post(
      `/staff/authors/${author.id}/delete`,
      {},
      { tokenFrom: '/staff/authors' },
    );
    assert.equal(response.statusCode, 302);
    assert.ok(
      listAllAuthors(db).some((a) => a.id === author.id),
      'an author with titles was deleted',
    );
  });
});

describe('every staff mutation requires a CSRF token', () => {
  it('rejects each POST without one', async () => {
    const bookId = fixtures.books.iliad;
    const copyId = getBookById(db, bookId, { includeArchived: true }).copies[0]?.id;
    const category = listAllCategories(db)[0];

    const urls = [
      '/staff/books',
      `/staff/books/${bookId}`,
      `/staff/books/${bookId}/archive`,
      `/staff/books/${bookId}/unarchive`,
      `/staff/books/${bookId}/delete`,
      `/staff/books/${bookId}/copies`,
      `/staff/books/${bookId}/copies/bulk`,
      '/staff/categories',
      `/staff/categories/${category.id}`,
      `/staff/categories/${category.id}/delete`,
    ];
    if (copyId) urls.push(`/staff/copies/${copyId}`, `/staff/copies/${copyId}/delete`);

    for (const url of urls) {
      const response = await session.postWithoutCsrf(url, { title: 'Χωρίς Token' });
      assert.equal(response.statusCode, 403, `${url} accepted a request with no CSRF token`);
    }

    assert.equal(listBooks(db, { q: 'χωρισ token' }).total, 0, 'a forged request created a record');
  });
});
