// A throwaway server for looking at the interface in a browser.
//
// The real development database has no seeded account by design — nobody
// should be able to sign in to a deployed library with a password that lives
// in the source tree. That makes it awkward to look at a staff page while
// building one, so this boots the app against a temporary database using the
// same fixtures the tests use, on its own port.
//
// Everything it creates lives in a temp directory and is thrown away when the
// process exits. It never touches data/library.db.
//
//   node scripts/review-server.js            → http://localhost:3100
//   node scripts/review-server.js 3200       → a different port
//
// Sign in with the credentials it prints. They unlock a database that exists
// for a few minutes in /tmp and nothing else.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createBook } from '../src/db/queries/books.js';
import { createBorrower } from '../src/db/queries/borrowers.js';
import { createCategory } from '../src/db/queries/categories.js';
import { createCopies, createCopy } from '../src/db/queries/copies.js';
import { checkOut } from '../src/db/queries/loans.js';
import { createAnnouncement } from '../src/db/queries/announcements.js';
import { createStaffUser } from '../src/db/queries/staff.js';

const PORT = Number(process.argv[2]) || 3100;
// Deliberately trivial, and safe only because of what this server is: a
// throwaway database in a temp directory, bound to 127.0.0.1, thrown away when
// the process stops. The rules that would reject this password live at the
// sign-in route and in scripts/create-admin.js, which is where they belong —
// nothing here relaxes them for the real application.
const USERNAME = 'admin';
const PASSWORD = 'admin';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dslib-review-'));
process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => process.exit(0));
}

const config = loadConfig({
  NODE_ENV: 'development',
  SESSION_SECRET: 'review-server-secret-that-is-long-enough-32',
  DATABASE_PATH: path.join(dir, 'review.db'),
  UPLOAD_DIR: path.join(dir, 'uploads'),
  LIBRARY_NAME: 'Σχολική Βιβλιοθήκη',
  DEFAULT_LANG: 'el',
  PORT: String(PORT),
});

const db = openDatabase(config.databasePath);
migrate(db);

const staff = await createStaffUser(db, {
  username: USERNAME,
  password: PASSWORD,
  displayName: 'Μαρία Λιβαδά',
  role: 'admin',
});

// Enough of a catalogue to see every state: a title with many copies, one
// fully out, one in repair, one with no copies at all.
const fiction = createCategory(db, { name: 'Ελληνική Λογοτεχνία' }).id;
const ancient = createCategory(db, { name: 'Αρχαία Γραμματεία' }).id;
const science = createCategory(db, { name: 'Επιστήμες' }).id;

const odyssey = createBook(db, {
  title: 'Οδύσσεια',
  authorNames: ['Όμηρος'],
  categoryIds: [ancient],
  publicationYear: 2010,
  description: 'Η επιστροφή του Οδυσσέα στην Ιθάκη.',
});
const iliad = createBook(db, { title: 'Ιλιάδα', authorNames: ['Όμηρος'], categoryIds: [ancient] });
const poems = createBook(db, {
  title: 'Ποιήματα',
  authorNames: ['Κωνσταντίνος Καβάφης'],
  categoryIds: [fiction],
});
const prince = createBook(db, {
  title: 'Ο Μικρός Πρίγκιπας',
  authorNames: ['Antoine de Saint-Exupéry'],
  categoryIds: [fiction],
});
const maths = createBook(db, {
  title: 'Μαθηματικά για το Λύκειο',
  authorNames: ['Μαρία Δημητρίου', 'Ανδρέας Παπαδόπουλος'],
  categoryIds: [science],
});
createBook(db, { title: 'Χωρίς Αντίτυπα', authorNames: ['Κανείς'], categoryIds: [science] });

createCopy(db, odyssey, { barcode: 'SL-0001', shelfLocation: 'Α1-01' });
createCopy(db, odyssey, { barcode: 'SL-0002', shelfLocation: 'Α1-01' });
createCopy(db, odyssey, { barcode: 'SL-0003', shelfLocation: 'Α1-01', status: 'repair' });
const iliadCopy = createCopy(db, iliad, { barcode: 'SL-0004', shelfLocation: 'Α1-02' }).id;
createCopy(db, poems, { barcode: 'SL-0005', shelfLocation: 'Β3-02' });
createCopy(db, poems, { barcode: 'SL-0006', shelfLocation: 'Β3-02' });
createCopies(db, prince, 24, { shelfLocation: 'Π1-05' });
createCopies(db, maths, 3, { shelfLocation: 'Ε1-01' });

// A couple of notices, including one still unpublished, so the front page
// shows the panel and the staff page shows both states.
createAnnouncement(db, {
  title: 'Ωράριο λειτουργίας',
  body: 'Δευτέρα έως Παρασκευή, 08:30–14:00. Τα διαλείμματα η βιβλιοθήκη είναι ανοιχτή.',
});
createAnnouncement(db, {
  title: 'Κανονισμός δανεισμού',
  body: 'Κάθε μαθητής κρατάει έως δύο βιβλία για δύο εβδομάδες.',
});
createAnnouncement(db, {
  title: 'Λέσχη ανάγνωσης — Νοέμβριος',
  body: 'Ανακοινώνεται στα τμήματα την επόμενη εβδομάδα.',
  isPublished: false,
});

const odysseas = createBorrower(db, { displayName: 'Οδυσσέας Μαρής', schoolClass: 'Β2' }).id;
const maria = createBorrower(db, { displayName: 'Μαρία Παπαδοπούλου', schoolClass: 'Γ1' }).id;
createBorrower(db, { displayName: 'Νίκος Στεφάνου', schoolClass: 'Α3' });

// One current loan and one that is already late, so the overdue states show.
checkOut(db, { copyId: iliadCopy, borrowerId: odysseas, loanDays: 14, staffUserId: staff.id });
const princeCopy = db.get('SELECT id FROM copy WHERE book_id = ? LIMIT 1', prince);
checkOut(db, {
  copyId: princeCopy.id,
  borrowerId: maria,
  dueAt: '2026-09-24',
  loanDays: 14,
  staffUserId: staff.id,
});

const app = await buildApp({ config, db });
await app.listen({ port: PORT, host: '127.0.0.1' });

console.log(`
  Review server      http://localhost:${PORT}
  Second interface   http://localhost:${PORT}/?ui=next
  Sign in            ${USERNAME} / ${PASSWORD}

  Temporary database ${dir} (removed on exit)
`);
