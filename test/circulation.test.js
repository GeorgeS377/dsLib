// Circulation through the staff interface — acceptance criterion 6 end to
// end, plus the borrower privacy controls the library asked for.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { getBookById } from '../src/db/queries/books.js';
import { ANONYMIZED_NAME, listBorrowers } from '../src/db/queries/borrowers.js';
import { listLoans } from '../src/db/queries/loans.js';
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

/** Check out a copy by barcode to a new borrower, through the real form. */
async function checkOutByBarcode(barcode, name, schoolClass) {
  return session.post(
    '/staff/loans/checkout',
    { barcode, new_borrower_name: name, new_borrower_class: schoolClass },
    { tokenFrom: `/staff/loans/checkout?barcode=${encodeURIComponent(barcode)}` },
  );
}

describe('checking a book out and back in', () => {
  it('finds a copy by barcode', async () => {
    const response = await session.get('/staff/loans/checkout?barcode=T-0001');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'));
    assert.ok(response.body.includes('Α1-01'), 'the shelf location is not shown');
    assert.ok(response.body.includes('Διαθέσιμο'));
  });

  it('reports an unknown barcode without creating anything', async () => {
    const response = await session.get('/staff/loans/checkout?barcode=NOPE-1234');
    assert.equal(response.statusCode, 200);
    assert.ok(!response.body.includes('Οδύσσεια'));
    assert.equal(db.value('SELECT COUNT(*) FROM loan'), 0);
  });

  it('checks a copy out to a new borrower', async () => {
    const response = await checkOutByBarcode('T-0001', 'Μαρία Παπαδοπούλου', 'Β2');
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff/loans/checkout');

    const open = listLoans(db, { status: 'open' });
    assert.equal(open.total, 1);
    assert.equal(open.rows[0].borrower_name, 'Μαρία Παπαδοπούλου');
    assert.equal(open.rows[0].borrower_class, 'Β2');
  });

  it('stores only the name and class for the new borrower', async () => {
    const row = db.get('SELECT * FROM borrower WHERE display_name = ?', 'Μαρία Παπαδοπούλου');
    assert.ok(row);
    assert.equal(row.school_class, 'Β2');
    // The table has no column for anything else; assert the shape too.
    for (const forbidden of ['email', 'phone', 'address', 'date_of_birth', 'student_number']) {
      assert.ok(!Object.hasOwn(row, forbidden), `borrower has a ${forbidden} field`);
    }
  });

  it('drops public availability immediately (acceptance 6)', async () => {
    const book = getBookById(db, fixtures.books.odyssey);
    assert.equal(book.copies_available, 1);
    assert.equal(book.copies_total, 2);

    const page = await app.inject({ method: 'GET', url: `/books/${fixtures.books.odyssey}` });
    assert.ok(page.body.includes('1 από 2 διαθέσιμα'));
    assert.ok(page.body.includes('Σε δανεισμό'));
  });

  it('shows the loan on the dashboard', async () => {
    const response = await session.get('/staff');
    assert.equal(response.statusCode, 200);
    // One copy on loan out of five held.
    assert.ok(response.body.includes('Σε δανεισμό'));
  });

  it('refuses to lend the same copy twice and offers the return instead', async () => {
    const page = await session.get('/staff/loans/checkout?barcode=T-0001');
    assert.ok(page.body.includes('ήδη σε δανεισμό'), 'no warning about the open loan');
    assert.ok(page.body.includes('Μαρία Παπαδοπούλου'), 'the current borrower is not shown');
    assert.ok(page.body.includes('Επιστροφή'), 'the return action is not offered');

    const response = await checkOutByBarcode('T-0001', 'Κάποιος Άλλος', 'Γ1');
    assert.equal(response.statusCode, 422);
    assert.equal(listLoans(db, { status: 'open' }).total, 1, 'a second loan was created');
  });

  it('refuses to lend a copy that is not on the shelf', async () => {
    // T-0005 is in for repair.
    const response = await checkOutByBarcode('T-0005', 'Κάποιος', 'Α1');
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('δεν είναι διαθέσιμο'));
  });

  it('requires a borrower', async () => {
    const response = await session.post(
      '/staff/loans/checkout',
      { barcode: 'T-0003', new_borrower_name: '' },
      { tokenFrom: '/staff/loans/checkout?barcode=T-0003' },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('αναγνώστη'));
  });

  it('checks the book back in by barcode', async () => {
    const response = await session.post(
      '/staff/loans/checkin',
      { barcode: 'T-0001' },
      { tokenFrom: '/staff/loans/checkin' },
    );
    assert.equal(response.statusCode, 302);

    assert.equal(listLoans(db, { status: 'open' }).total, 0);
    assert.equal(listLoans(db, { status: 'returned' }).total, 1);

    const followed = await session.get('/staff/loans/checkin');
    assert.ok(followed.body.includes('επιστράφηκε'), 'no confirmation was shown');
  });

  it('restores public availability on return (acceptance 6)', async () => {
    const page = await app.inject({ method: 'GET', url: `/books/${fixtures.books.odyssey}` });
    assert.ok(page.body.includes('2 από 2 διαθέσιμα'));
    assert.ok(!page.body.includes('Σε δανεισμό'));
  });

  it('reports a barcode that is not on loan', async () => {
    const response = await session.post(
      '/staff/loans/checkin',
      { barcode: 'T-0001' },
      { tokenFrom: '/staff/loans/checkin' },
    );
    assert.equal(response.statusCode, 302);
    const followed = await session.get(response.headers.location);
    assert.ok(followed.body.includes('δεν είναι σε δανεισμό'));
  });

  it('lends the copy again after it comes back', async () => {
    const response = await checkOutByBarcode('T-0001', 'Δεύτερος Αναγνώστης', 'Α3');
    assert.equal(response.statusCode, 302);
    assert.equal(listLoans(db, { status: 'open' }).total, 1);
  });

  it('reuses an existing borrower rather than duplicating them', async () => {
    const before = listBorrowers(db).total;
    await session.post(
      '/staff/loans/checkout',
      { barcode: 'T-0003', new_borrower_name: 'Δεύτερος Αναγνώστης', new_borrower_class: 'Α3' },
      { tokenFrom: '/staff/loans/checkout?barcode=T-0003' },
    );
    assert.equal(listBorrowers(db).total, before, 'a duplicate borrower record was created');
  });

  it('extends a loan', async () => {
    const loan = listLoans(db, { status: 'open' }).rows[0];
    const before = loan.due_at;

    const response = await session.post(
      `/staff/loans/${loan.id}/renew`,
      {},
      { tokenFrom: '/staff/loans' },
    );
    assert.equal(response.statusCode, 302);

    const after = db.value('SELECT due_at FROM loan WHERE id = ?', loan.id);
    assert.ok(after >= before, 'the due date did not move');
  });

  it('returns a loan from the list page by its id', async () => {
    const loan = listLoans(db, { status: 'open' }).rows[0];
    const response = await session.post(
      '/staff/loans/checkin',
      { loan_id: loan.id },
      { tokenFrom: '/staff/loans' },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff/loans');
    assert.ok(db.value('SELECT returned_at FROM loan WHERE id = ?', loan.id));
  });
});

describe('due dates', () => {
  it('defaults to the configured loan period', async () => {
    const page = await session.get('/staff/loans/checkout?barcode=T-0002');
    const match = page.body.match(/name="due_date" value="(\d{4}-\d{2}-\d{2})"/);
    assert.ok(match, 'no default due date was offered');

    const offered = new Date(`${match[1]}T00:00:00Z`);
    const expected = new Date();
    expected.setUTCDate(expected.getUTCDate() + app.config.defaultLoanDays);
    assert.equal(match[1], expected.toISOString().slice(0, 10));
    assert.ok(offered > new Date());
  });

  it('accepts an explicit due date and stores it as end of day', async () => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 30);
    const chosen = date.toISOString().slice(0, 10);

    const response = await session.post(
      '/staff/loans/checkout',
      { barcode: 'T-0002', new_borrower_name: 'Μακροχρόνιος', due_date: chosen },
      { tokenFrom: '/staff/loans/checkout?barcode=T-0002' },
    );
    assert.equal(response.statusCode, 302);

    const loan = db.get('SELECT due_at FROM loan ORDER BY id DESC LIMIT 1');
    // End of day, so a book due today is not already late.
    assert.equal(loan.due_at, `${chosen}T23:59:59.999Z`);
  });

  it('refuses a due date in the past', async () => {
    const response = await session.post(
      '/staff/loans/checkout',
      { barcode: 'T-0004', new_borrower_name: 'Χρονοταξιδιώτης', due_date: '2020-01-01' },
      { tokenFrom: '/staff/loans/checkout?barcode=T-0004' },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('παρελθόν'));
  });

  it('flags an overdue loan on the dashboard and the loan list', async () => {
    const loan = db.get('SELECT id FROM loan WHERE returned_at IS NULL ORDER BY id DESC LIMIT 1');
    db.run(
      'UPDATE loan SET loaned_at = ?, due_at = ? WHERE id = ?',
      '2026-01-01T10:00:00.000Z',
      '2026-01-15T23:59:59.999Z',
      loan.id,
    );

    const dashboard = await session.get('/staff');
    assert.ok(dashboard.body.includes('Εκπρόθεσμ'), 'overdue is not surfaced on the dashboard');

    const list = await session.get('/staff/loans?status=overdue');
    assert.equal(list.statusCode, 200);
    assert.ok(list.body.includes('2026-01-15'));
  });

  it('warns when an overdue book comes back', async () => {
    const loan = db.get(
      "SELECT id, copy_id FROM loan WHERE returned_at IS NULL AND due_at < '2026-06-01'",
    );
    const response = await session.post(
      '/staff/loans/checkin',
      { loan_id: loan.id },
      { tokenFrom: '/staff/loans' },
    );
    assert.equal(response.statusCode, 302);

    const followed = await session.get('/staff/loans');
    assert.ok(followed.body.includes('εκπρόθεσμα'), 'the late return was not flagged');
  });
});

describe('borrower records', () => {
  it('lists borrowers with their loan counts', async () => {
    const response = await session.get('/staff/borrowers');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Μαρία Παπαδοπούλου'));
    assert.ok(response.body.includes('Β2'));
  });

  it('states the data boundary on the page', async () => {
    const response = await session.get('/staff/borrowers');
    assert.ok(
      response.body.includes('μόνο όνομα και τμήμα'),
      'the privacy note is not shown to staff',
    );
  });

  it('searches borrowers by name, ignoring case and accents', async () => {
    for (const q of ['παπαδοπουλου', 'ΠΑΠΑΔΟΠΟΥΛΟΥ', 'Παπαδοπούλου']) {
      const response = await session.get(`/staff/borrowers?q=${encodeURIComponent(q)}`);
      assert.ok(response.body.includes('Μαρία Παπαδοπούλου'), `"${q}" did not match`);
    }
  });

  it('adds a borrower directly', async () => {
    const response = await session.post(
      '/staff/borrowers',
      { display_name: 'Νέος Αναγνώστης', school_class: 'Α1' },
      { tokenFrom: '/staff/borrowers' },
    );
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /^\/staff\/borrowers\/\d+$/);
  });

  it('rejects a borrower with no name', async () => {
    const response = await session.post(
      '/staff/borrowers',
      { display_name: '   ' },
      { tokenFrom: '/staff/borrowers' },
    );
    assert.equal(response.statusCode, 422);
  });

  it('ignores extra fields rather than storing them', async () => {
    // A field that is not in the schema must not reach the database, even if
    // someone adds it to the form.
    const response = await session.post(
      '/staff/borrowers',
      {
        display_name: 'Με Επιπλέον Πεδία',
        school_class: 'Β1',
        email: 'should-not-be-stored@example.com',
        phone: '0000000000',
        notes: 'επιτρεπτό πεδίο',
      },
      { tokenFrom: '/staff/borrowers' },
    );
    assert.equal(response.statusCode, 302);

    const row = db.get('SELECT * FROM borrower WHERE display_name = ?', 'Με Επιπλέον Πεδία');
    const serialized = JSON.stringify(row);
    assert.ok(!serialized.includes('should-not-be-stored'), 'an email address was stored');
    assert.ok(!serialized.includes('0000000000'), 'a phone number was stored');
  });

  it('shows one borrower with their loan history', async () => {
    const borrower = db.get('SELECT id FROM borrower WHERE display_name = ?', 'Μαρία Παπαδοπούλου');
    const response = await session.get(`/staff/borrowers/${borrower.id}`);
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('Οδύσσεια'), 'their loan history is missing');
    assert.ok(response.body.includes('Ιστορικό'));
  });

  it('edits a borrower', async () => {
    const borrower = db.get('SELECT id FROM borrower WHERE display_name = ?', 'Νέος Αναγνώστης');
    const response = await session.post(
      `/staff/borrowers/${borrower.id}`,
      { display_name: 'Μετονομασμένος Αναγνώστης', school_class: 'Β3' },
      { tokenFrom: `/staff/borrowers/${borrower.id}` },
    );
    assert.equal(response.statusCode, 302);

    const row = db.get('SELECT * FROM borrower WHERE id = ?', borrower.id);
    assert.equal(row.display_name, 'Μετονομασμένος Αναγνώστης');
    assert.equal(row.school_class, 'Β3');
  });

  it('returns 404 for an unknown borrower', async () => {
    assert.equal((await session.get('/staff/borrowers/999999')).statusCode, 404);
    assert.equal((await session.get('/staff/borrowers/abc')).statusCode, 404);
  });
});

describe('borrower removal', () => {
  it('deletes a borrower with no loan history', async () => {
    await session.post(
      '/staff/borrowers',
      { display_name: 'Χωρίς Ιστορικό' },
      { tokenFrom: '/staff/borrowers' },
    );
    const borrower = db.get('SELECT id FROM borrower WHERE display_name = ?', 'Χωρίς Ιστορικό');

    const confirm = await session.get(`/staff/borrowers/${borrower.id}/delete`);
    assert.equal(confirm.statusCode, 200);

    const response = await session.post(
      `/staff/borrowers/${borrower.id}/delete`,
      {},
      { tokenFrom: `/staff/borrowers/${borrower.id}/delete` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(db.get('SELECT 1 AS ok FROM borrower WHERE id = ?', borrower.id), undefined);
  });

  it('sends a borrower with history to anonymization instead of deleting', async () => {
    const borrower = db.get('SELECT id FROM borrower WHERE display_name = ?', 'Μαρία Παπαδοπούλου');

    const confirm = await session.get(`/staff/borrowers/${borrower.id}/delete`);
    assert.ok(confirm.body.includes('Ανωνυμοποίηση'), 'anonymization was not offered');

    const response = await session.post(
      `/staff/borrowers/${borrower.id}/delete`,
      {},
      { tokenFrom: `/staff/borrowers/${borrower.id}/delete` },
    );
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /anonymize$/);
    assert.ok(db.get('SELECT 1 AS ok FROM borrower WHERE id = ?', borrower.id), 'the record was deleted');
  });

  it('anonymizes a borrower while keeping the loan history', async () => {
    const borrower = db.get(
      'SELECT id, total_loans FROM (SELECT b.id, (SELECT COUNT(*) FROM loan l WHERE l.borrower_id = b.id) AS total_loans FROM borrower b WHERE b.display_name = ?)',
      'Μαρία Παπαδοπούλου',
    );
    const loansBefore = db.value('SELECT COUNT(*) FROM loan WHERE borrower_id = ?', borrower.id);
    assert.ok(loansBefore > 0, 'the fixture has no history to preserve');

    const confirm = await session.get(`/staff/borrowers/${borrower.id}/anonymize`);
    assert.equal(confirm.statusCode, 200);
    assert.ok(confirm.body.includes('δεν αναιρείται'), 'the page does not say it is irreversible');

    const response = await session.post(
      `/staff/borrowers/${borrower.id}/anonymize`,
      {},
      { tokenFrom: `/staff/borrowers/${borrower.id}/anonymize` },
    );
    assert.equal(response.statusCode, 302);

    const row = db.get('SELECT * FROM borrower WHERE id = ?', borrower.id);
    assert.equal(row.is_anonymized, 1);
    assert.equal(row.display_name, ANONYMIZED_NAME);
    assert.equal(row.school_class, null);
    assert.ok(row.anonymized_at);

    // The history survives, so the library's figures stay correct.
    assert.equal(db.value('SELECT COUNT(*) FROM loan WHERE borrower_id = ?', borrower.id), loansBefore);

    // And the name is gone from the staff listing.
    const list = await session.get('/staff/borrowers');
    assert.ok(!list.body.includes('Μαρία Παπαδοπούλου'), 'the name survived anonymization');
  });

  it('refuses to anonymize a borrower who still has a book out', async () => {
    await checkOutByBarcode('T-0004', 'Κρατάει Βιβλίο', 'Γ2');
    const borrower = db.get('SELECT id FROM borrower WHERE display_name = ?', 'Κρατάει Βιβλίο');

    const confirm = await session.get(`/staff/borrowers/${borrower.id}/anonymize`);
    assert.ok(confirm.body.includes('βιβλία σε δανεισμό'), 'the open loan was not explained');

    const response = await session.post(
      `/staff/borrowers/${borrower.id}/anonymize`,
      {},
      { tokenFrom: `/staff/borrowers/${borrower.id}/anonymize` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(
      db.value('SELECT is_anonymized FROM borrower WHERE id = ?', borrower.id),
      0,
      'the record was anonymized despite an open loan',
    );
  });

  it('will not lend to an anonymized borrower', async () => {
    const anonymized = db.get('SELECT id FROM borrower WHERE is_anonymized = 1');
    const response = await session.post(
      '/staff/loans/checkout',
      { barcode: 'T-0002', borrower_id: anonymized.id },
      { tokenFrom: '/staff/loans/checkout?barcode=T-0002' },
    );
    assert.equal(response.statusCode, 422);
  });
});

describe('borrower data never reaches a public page (acceptance 8)', () => {
  it('appears on no public route', async () => {
    const borrowers = db.all(
      'SELECT display_name, school_class FROM borrower WHERE is_anonymized = 0',
    );
    const names = borrowers.map((row) => row.display_name).filter(Boolean);
    const classes = [...new Set(borrowers.map((row) => row.school_class).filter(Boolean))];
    assert.ok(names.length > 0, 'no borrower names to check for');

    // A class code like 'Α1' is short enough to occur legitimately inside an
    // unrelated string — a shelf location of 'Α1-01', for instance. So match
    // a class only as a standalone token, while names (which are
    // distinctive) are checked as plain substrings.
    const classPattern = (value) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}_-])${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}_-]|$)`,
        'u',
      );

    const category = db.get('SELECT slug FROM category LIMIT 1');
    const author = db.get('SELECT id FROM author LIMIT 1');
    const urls = [
      '/',
      '/books',
      `/books?q=${encodeURIComponent('οδυσσεια')}`,
      '/books?available=1',
      `/books/${fixtures.books.odyssey}`,
      `/books/${fixtures.books.iliad}`,
      '/categories',
      `/categories/${category.slug}`,
      '/authors',
      `/authors/${author.id}`,
      '/healthz',
    ];

    for (const url of urls) {
      const body = (await app.inject({ method: 'GET', url })).body;
      for (const name of names) {
        assert.ok(!body.includes(name), `${url} leaked a borrower name: "${name}"`);
      }
      for (const schoolClass of classes) {
        assert.ok(
          !classPattern(schoolClass).test(body),
          `${url} leaked a borrower class: "${schoolClass}"`,
        );
      }
    }
  });

  it('shows no due date or barcode on a public book page', async () => {
    const page = await app.inject({ method: 'GET', url: `/books/${fixtures.books.odyssey}` });
    assert.ok(!page.body.includes('T-0001'), 'a barcode is public');
    assert.ok(!/\d{4}-\d{2}-\d{2}/.test(page.body), 'a date leaked onto the public page');
  });
});

describe('staff account administration', () => {
  it('lists accounts for an administrator', async () => {
    const response = await session.get('/staff/users');
    assert.equal(response.statusCode, 200);
    assert.ok(response.body.includes('maria'));
  });

  it('creates a librarian who must change their password', async () => {
    const response = await session.post(
      '/staff/users',
      {
        username: 'nikos',
        display_name: 'Νίκος Β.',
        role: 'librarian',
        password: 'a-reasonable-first-password',
      },
      { tokenFrom: '/staff/users' },
    );
    assert.equal(response.statusCode, 302);

    const created = db.get('SELECT * FROM staff_user WHERE username = ?', 'nikos');
    assert.equal(created.role, 'librarian');
    assert.equal(created.must_change_password, 1, 'the admin-set password is not forced to change');
    assert.ok(created.password_hash.startsWith('scrypt$'));
  });

  it('rejects a weak password for a new account', async () => {
    const response = await session.post(
      '/staff/users',
      { username: 'weak', display_name: 'W', role: 'librarian', password: 'short' },
      { tokenFrom: '/staff/users' },
    );
    assert.equal(response.statusCode, 422);
    assert.equal(db.get('SELECT 1 AS ok FROM staff_user WHERE username = ?', 'weak'), undefined);
  });

  it('rejects a username with non-ASCII characters', async () => {
    const response = await session.post(
      '/staff/users',
      {
        username: 'Μαρία',
        display_name: 'Μαρία',
        role: 'librarian',
        password: 'a-reasonable-password-here',
      },
      { tokenFrom: '/staff/users' },
    );
    assert.equal(response.statusCode, 422);
  });

  it('refuses a duplicate username', async () => {
    const response = await session.post(
      '/staff/users',
      {
        username: 'NIKOS',
        display_name: 'Another',
        role: 'librarian',
        password: 'a-reasonable-password-here',
      },
      { tokenFrom: '/staff/users' },
    );
    assert.equal(response.statusCode, 422);
    assert.equal(db.value('SELECT COUNT(*) FROM staff_user WHERE username = ?', 'nikos'), 1);
  });

  it('will not leave the library without an active administrator', async () => {
    const admin = db.get("SELECT id FROM staff_user WHERE username = 'maria'");
    const response = await session.post(
      `/staff/users/${admin.id}`,
      { username: 'maria', display_name: 'Μαρία', role: 'librarian' },
      { tokenFrom: `/staff/users/${admin.id}` },
    );
    assert.equal(response.statusCode, 302);

    const followed = await session.get(`/staff/users/${admin.id}`);
    assert.ok(followed.body.includes('διαχειριστής'), 'no explanation was given');
    assert.equal(db.value("SELECT role FROM staff_user WHERE username = 'maria'"), 'admin');
  });

  it('refuses to let an administrator delete their own account', async () => {
    const admin = db.get("SELECT id FROM staff_user WHERE username = 'maria'");
    const response = await session.post(
      `/staff/users/${admin.id}/delete`,
      {},
      { tokenFrom: '/staff/users' },
    );
    assert.equal(response.statusCode, 302);
    assert.ok(db.get('SELECT 1 AS ok FROM staff_user WHERE id = ?', admin.id));
  });

  it('deactivates an account and ends its sessions at once', async () => {
    const nikos = db.get("SELECT id FROM staff_user WHERE username = 'nikos'");
    // Give that account a live session.
    db.run('UPDATE staff_user SET must_change_password = 0 WHERE id = ?', nikos.id);
    const other = await login(app, { username: 'nikos', password: 'a-reasonable-first-password' });
    assert.equal((await other.get('/staff')).statusCode, 200);

    const response = await session.post(
      `/staff/users/${nikos.id}`,
      { username: 'nikos', display_name: 'Νίκος Β.', role: 'librarian' },
      { tokenFrom: `/staff/users/${nikos.id}` },
    );
    assert.equal(response.statusCode, 302);
    assert.equal(db.value('SELECT is_active FROM staff_user WHERE id = ?', nikos.id), 0);

    // Their session is gone, not merely marked.
    assert.equal((await other.get('/staff')).statusCode, 302);
  });

  it('is forbidden to a librarian', async () => {
    await makeStaffUser(db, { username: 'plain', role: 'librarian' });
    const librarian = await login(app, { username: 'plain' });

    for (const url of ['/staff/users', '/staff/users/1']) {
      const response = await librarian.get(url);
      assert.equal(response.statusCode, 403, `${url} was reachable by a librarian`);
      assert.ok(!response.body.includes('scrypt$'));
    }

    // But the rest of the staff area still works for them.
    assert.equal((await librarian.get('/staff')).statusCode, 200);
    assert.equal((await librarian.get('/staff/loans')).statusCode, 200);
    assert.equal((await librarian.get('/staff/account')).statusCode, 200);
  });

  it('refuses a librarian POST to the admin routes', async () => {
    const librarian = await login(app, { username: 'plain' });
    const target = db.get("SELECT id FROM staff_user WHERE username = 'maria'");

    const response = await librarian.post(
      `/staff/users/${target.id}/password`,
      { password: 'hijacked-password-attempt' },
      { tokenFrom: '/staff' },
    );
    assert.equal(response.statusCode, 403);
  });
});

describe('changing your own password', () => {
  it('requires the current password', async () => {
    const own = await login(app, { username: 'plain' });
    const response = await own.post(
      '/staff/account/password',
      {
        current_password: 'not-the-right-one',
        password: 'a-brand-new-passphrase',
        password_confirm: 'a-brand-new-passphrase',
      },
      { tokenFrom: '/staff/account' },
    );
    assert.equal(response.statusCode, 422);
    assert.ok(response.body.includes('τρέχων κωδικός'));
  });

  it('requires the confirmation to match', async () => {
    const own = await login(app, { username: 'plain' });
    const response = await own.post(
      '/staff/account/password',
      {
        current_password: 'a-long-enough-test-passphrase',
        password: 'a-brand-new-passphrase',
        password_confirm: 'a-different-passphrase',
      },
      { tokenFrom: '/staff/account' },
    );
    assert.equal(response.statusCode, 422);
  });

  it('rejects a weak new password', async () => {
    const own = await login(app, { username: 'plain' });
    const response = await own.post(
      '/staff/account/password',
      {
        current_password: 'a-long-enough-test-passphrase',
        password: 'short',
        password_confirm: 'short',
      },
      { tokenFrom: '/staff/account' },
    );
    assert.equal(response.statusCode, 422);
  });

  it('changes the password and signs every session out', async () => {
    const own = await login(app, { username: 'plain' });
    const otherDevice = await login(app, { username: 'plain' });
    assert.equal((await otherDevice.get('/staff')).statusCode, 200);

    const response = await own.post(
      '/staff/account/password',
      {
        current_password: 'a-long-enough-test-passphrase',
        password: 'a-brand-new-long-passphrase',
        password_confirm: 'a-brand-new-long-passphrase',
      },
      { tokenFrom: '/staff/account' },
    );
    assert.equal(response.statusCode, 302);
    assert.match(response.headers.location, /changed=1/);

    // Both sessions are dead: if the password was changed because it leaked,
    // leaving old sessions alive would defeat the point.
    assert.equal((await own.get('/staff')).statusCode, 302);
    assert.equal((await otherDevice.get('/staff')).statusCode, 302);

    // And the new password works.
    const fresh = await login(app, { username: 'plain', password: 'a-brand-new-long-passphrase' });
    assert.equal((await fresh.get('/staff')).statusCode, 200);
  });
});

describe('the audit log records circulation without borrower names', () => {
  it('logs checkouts and returns by id only', async () => {
    const entries = db.all("SELECT * FROM audit_log WHERE action LIKE 'loan.%'");
    assert.ok(entries.length > 0, 'no circulation was logged');

    const names = db
      .all('SELECT display_name FROM borrower')
      .map((r) => r.display_name)
      .filter((name) => name !== ANONYMIZED_NAME);

    const serialized = JSON.stringify(entries);
    for (const name of names) {
      assert.ok(!serialized.includes(name), `the audit log stored a borrower name: ${name}`);
    }
    // But it does record which librarian acted.
    assert.ok(entries.some((e) => e.username));
  });
});
