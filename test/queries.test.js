// Catalogue, copy and circulation queries.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  archiveBook,
  createBook,
  deleteBook,
  describeBookDeletability,
  distinctLanguages,
  distinctYears,
  findBookByIsbn13,
  getBookById,
  listBooks,
  rebuildAllSearchText,
  recentBooks,
  setBookAuthors,
  unarchiveBook,
  updateBook,
} from '../src/db/queries/books.js';
import { listAllAuthors, listPublicAuthors, mergeAuthors, renameAuthor } from '../src/db/queries/authors.js';
import { createCategory, listPublicCategories, updateCategory } from '../src/db/queries/categories.js';
import {
  barcodeInUse,
  createCopies,
  createCopy,
  deleteCopy,
  getCopyByBarcode,
  updateCopy,
} from '../src/db/queries/copies.js';
import { anonymizeBorrower, createBorrower, deleteBorrower } from '../src/db/queries/borrowers.js';
import { checkIn, checkInByBarcode, checkOut, listLoans, overdueLoans } from '../src/db/queries/loans.js';
import { createStaffUser, deleteStaffUser } from '../src/db/queries/staff.js';
import { dashboardStats, publicStats } from '../src/db/queries/stats.js';
import { logAction, recentAuditEntries } from '../src/db/queries/audit.js';
import { makeTestDb, seedTestCatalogue } from './helpers.js';

function setup() {
  const db = makeTestDb();
  const fixtures = seedTestCatalogue(db);
  return { db, ...fixtures };
}

describe('book search', () => {
  it('matches Greek titles regardless of case and accents', () => {
    const { db } = setup();
    for (const q of ['Οδύσσεια', 'οδυσσεια', 'ΟΔΥΣΣΕΙΑ', 'ΟΔΎΣΣΕΙΑ']) {
      const result = listBooks(db, { q });
      assert.equal(result.total, 1, `query "${q}" found ${result.total} results`);
      assert.equal(result.rows[0].title, 'Οδύσσεια');
    }
    db.close();
  });

  it('matches an author name with a final sigma typed either way', () => {
    const { db } = setup();
    for (const q of ['Καζαντζάκης', 'καζαντζακης', 'ΚΑΖΑΝΤΖΑΚΗΣ', 'καζαντζακησ']) {
      assert.equal(listBooks(db, { q }).total, 1, `query "${q}" failed`);
    }
    db.close();
  });

  it('matches partial words', () => {
    const { db } = setup();
    assert.ok(listBooks(db, { q: 'οδυσ' }).total >= 1);
    assert.ok(listBooks(db, { q: 'preju' }).total >= 1);
    db.close();
  });

  it('matches by ISBN', () => {
    const { db } = setup();
    assert.equal(listBooks(db, { q: '9780141439518' }).total, 1);
    db.close();
  });

  it('matches by publisher and by description keyword', () => {
    const { db } = setup();
    assert.ok(listBooks(db, { q: 'Penguin' }).total >= 1);
    assert.ok(listBooks(db, { q: 'Ιθάκη' }).total >= 1);
    db.close();
  });

  it('requires every token to match', () => {
    const { db } = setup();
    assert.equal(listBooks(db, { q: 'Οδύσσεια Όμηρος' }).total, 1);
    assert.equal(listBooks(db, { q: 'Οδύσσεια Austen' }).total, 0);
    db.close();
  });

  it('returns everything for a blank query', () => {
    const { db } = setup();
    assert.equal(listBooks(db, { q: '' }).total, 4);
    assert.equal(listBooks(db, { q: '   ' }).total, 4);
    db.close();
  });

  it('never returns archived titles to the public', () => {
    const { db } = setup();
    assert.equal(listBooks(db, { q: 'Αποσυρμένος' }).total, 0);
    assert.equal(listBooks(db, { q: 'Αποσυρμένος', includeArchived: true }).total, 1);
    db.close();
  });

  it('treats search-like punctuation as plain text', () => {
    const { db } = setup();
    // '%' and '_' are LIKE wildcards; normalization strips them, so a query of
    // bare wildcards matches nothing rather than everything.
    assert.equal(listBooks(db, { q: '%' }).total, 4);
    assert.equal(listBooks(db, { q: '_' }).total, 4);
    assert.equal(listBooks(db, { q: "'; DROP TABLE book; --" }).total, 0);
    // The table is still there.
    assert.equal(listBooks(db, {}).total, 4);
    db.close();
  });
});

describe('book filters, sorting and pagination', () => {
  it('filters by category', () => {
    const { db, categories } = setup();
    const result = listBooks(db, { categoryId: categories.ancient });
    assert.deepEqual(result.rows.map((r) => r.title).sort(), ['Ιλιάδα', 'Οδύσσεια']);
    db.close();
  });

  it('filters by author', () => {
    const { db } = setup();
    const homer = listPublicAuthors(db).find((a) => a.name === 'Όμηρος');
    assert.equal(listBooks(db, { authorId: homer.id }).total, 2);
    db.close();
  });

  it('filters by year and language', () => {
    const { db } = setup();
    assert.equal(listBooks(db, { year: 1946 }).total, 1);
    assert.equal(listBooks(db, { language: 'en' }).total, 1);
    assert.equal(listBooks(db, { language: 'el' }).total, 3);
    db.close();
  });

  it('filters by availability, excluding copies that are not on the shelf', () => {
    const { db } = setup();
    // The Austen copy is in for repair, so the title is not available.
    const available = listBooks(db, { availableOnly: true });
    assert.ok(!available.rows.some((r) => r.title === 'Pride and Prejudice'));
    assert.equal(available.total, 3);
    db.close();
  });

  it('combines filters', () => {
    const { db, categories } = setup();
    const result = listBooks(db, { categoryId: categories.ancient, q: 'Ιλιάδα', year: 1996 });
    assert.equal(result.total, 1);
    db.close();
  });

  it('sorts alphabetically in correct Greek order', () => {
    const { db } = setup();
    const titles = listBooks(db, { sort: 'title' }).rows.map((r) => r.title);
    assert.deepEqual(titles, [
      'Pride and Prejudice',
      'Βίος και Πολιτεία του Αλέξη Ζορμπά',
      'Ιλιάδα',
      'Οδύσσεια',
    ]);
    db.close();
  });

  it('sorts by year in both directions, with unknown years last', () => {
    const { db } = setup();
    const noYear = createBook(db, { title: 'Χωρίς Χρονολογία' });
    assert.ok(noYear);

    const ascending = listBooks(db, { sort: 'year' }).rows.map((r) => r.publication_year);
    assert.deepEqual(ascending, [1946, 1996, 1998, 2003, null]);

    const descending = listBooks(db, { sort: 'year_desc' }).rows.map((r) => r.publication_year);
    assert.deepEqual(descending, [2003, 1998, 1996, 1946, null]);
    db.close();
  });

  it('sorts by author and by date added', () => {
    const { db } = setup();
    const byAuthor = listBooks(db, { sort: 'author' }).rows.map((r) => r.authors);
    assert.equal(byAuthor[0], 'Jane Austen');

    const newest = listBooks(db, { sort: 'newest' }).rows;
    assert.ok(newest.length === 4);
    db.close();
  });

  it('ignores an unknown sort key instead of failing', () => {
    const { db } = setup();
    const result = listBooks(db, { sort: 'title; DROP TABLE book' });
    assert.equal(result.total, 4);
    db.close();
  });

  it('paginates and clamps the page number into range', () => {
    const { db } = setup();
    const page1 = listBooks(db, { perPage: 2, page: 1, sort: 'title' });
    assert.equal(page1.rows.length, 2);
    assert.equal(page1.totalPages, 2);
    assert.equal(page1.total, 4);

    const page2 = listBooks(db, { perPage: 2, page: 2, sort: 'title' });
    assert.equal(page2.rows.length, 2);
    assert.notEqual(page1.rows[0].id, page2.rows[0].id);

    // Out-of-range pages clamp rather than returning an empty list.
    assert.equal(listBooks(db, { perPage: 2, page: 99 }).page, 2);
    assert.equal(listBooks(db, { perPage: 2, page: 0 }).page, 1);
    assert.equal(listBooks(db, { perPage: 2, page: -5 }).page, 1);
    db.close();
  });

  it('caps the page size', () => {
    const { db } = setup();
    assert.equal(listBooks(db, { perPage: 10_000 }).perPage, 100);
    db.close();
  });

  it('lists the years and languages present, for filter menus', () => {
    const { db } = setup();
    assert.deepEqual(distinctYears(db), [2003, 1998, 1996, 1946]);
    assert.deepEqual(distinctLanguages(db), ['el', 'en']);
    db.close();
  });
});

describe('availability derivation', () => {
  it('counts copies on the shelf as available', () => {
    const { db, books } = setup();
    const book = getBookById(db, books.odyssey);
    assert.equal(book.copies_total, 2);
    assert.equal(book.copies_available, 2);
    db.close();
  });

  it('drops availability when a copy goes out on loan', () => {
    const { db, books, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία', schoolClass: 'Β2' });

    checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id, loanDays: 14 });

    const book = getBookById(db, books.odyssey);
    assert.equal(book.copies_total, 2, 'the library still holds both copies');
    assert.equal(book.copies_available, 1, 'but only one is on the shelf');
    db.close();
  });

  it('restores availability on return', () => {
    const { db, books, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία' });
    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    checkIn(db, { loanId: loan.id });
    assert.equal(getBookById(db, books.odyssey).copies_available, 2);
    db.close();
  });

  it('excludes copies in repair, lost or withdrawn from availability', () => {
    const { db, books, copies } = setup();
    assert.equal(getBookById(db, books.austen).copies_available, 0);
    assert.equal(getBookById(db, books.austen).copies_total, 1, 'repair copies are still held');

    updateCopy(db, copies.austenA, { status: 'withdrawn' });
    assert.equal(getBookById(db, books.austen).copies_total, 0, 'withdrawn copies are not held');
    db.close();
  });

  it('agrees with the dashboard figures', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Γιώργος' });
    checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    const stats = dashboardStats(db);
    assert.equal(stats.titles, 4);
    assert.equal(stats.archived_titles, 1);
    assert.equal(stats.copies_total, 5);
    // 5 held, minus 1 on loan, minus 1 in repair.
    assert.equal(stats.copies_available, 3);
    assert.equal(stats.copies_on_loan, 1);
    assert.equal(stats.copies_repair, 1);

    // The public figure counts only non-archived titles' copies.
    assert.equal(publicStats(db).copies_available, 3);
    db.close();
  });
});

describe('authors', () => {
  it('deduplicates authors differing only in case or accents', () => {
    const { db } = setup();
    createBook(db, { title: 'Α', authorNames: ['ΟΜΗΡΟΣ'] });
    createBook(db, { title: 'Β', authorNames: ['όμηρος'] });

    const homers = listAllAuthors(db).filter((a) => a.name_norm === 'ομηροσ');
    assert.equal(homers.length, 1, 'the same author was stored twice');
    assert.equal(homers[0].book_count, 4);
    db.close();
  });

  it('preserves the order authors were entered in', () => {
    const { db } = setup();
    const id = createBook(db, { title: 'Συλλογικό', authorNames: ['Ζήτα', 'Άλφα'] });
    assert.deepEqual(getBookById(db, id).authors.map((a) => a.name), ['Ζήτα', 'Άλφα']);
    db.close();
  });

  it('ignores blank and duplicate author entries', () => {
    const { db } = setup();
    const id = createBook(db, { title: 'Χ', authorNames: ['Άλφα', '  ', 'ΑΛΦΑ', ''] });
    assert.equal(getBookById(db, id).authors.length, 1);
    db.close();
  });

  it('omits authors whose every title is archived from public listings', () => {
    const { db } = setup();
    const names = listPublicAuthors(db).map((a) => a.name);
    assert.ok(!names.includes('Άγνωστος'));
    assert.ok(listAllAuthors(db).some((a) => a.name === 'Άγνωστος'));
    db.close();
  });

  it('refuses a rename that would collide with another author', () => {
    const { db } = setup();
    const authors = listAllAuthors(db);
    const homer = authors.find((a) => a.name === 'Όμηρος');
    const result = renameAuthor(db, homer.id, 'Νίκος Καζαντζάκης');
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'duplicate');
    db.close();
  });

  it('merges one author into another, moving their titles', () => {
    const { db } = setup();
    createBook(db, { title: 'Παραλλαγή', authorNames: ['Ομηρος ο Ποιητης'] });
    const authors = listAllAuthors(db);
    const target = authors.find((a) => a.name === 'Όμηρος');
    const source = authors.find((a) => a.name === 'Ομηρος ο Ποιητης');

    mergeAuthors(db, source.id, target.id);

    assert.equal(listAllAuthors(db).some((a) => a.id === source.id), false);
    assert.equal(listAllAuthors(db).find((a) => a.id === target.id).book_count, 3);
    db.close();
  });
});

describe('categories', () => {
  it('refuses a duplicate name under normalization', () => {
    const { db } = setup();
    const result = createCategory(db, { name: 'ελληνικη λογοτεχνια' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'duplicate');
    db.close();
  });

  it('generates a readable Latin slug and keeps it unique', () => {
    const { db } = setup();
    const first = listPublicCategories(db).find((c) => c.name === 'Ελληνική Λογοτεχνία');
    assert.equal(first.slug, 'elliniki-logotechnia');

    const second = createCategory(db, { name: 'Ελληνική Λογοτεχνία Β' });
    assert.ok(second.ok);
    db.close();
  });

  it('keeps the slug stable across a rename, so links keep working', () => {
    const { db } = setup();
    const category = listPublicCategories(db).find((c) => c.name === 'Ελληνική Λογοτεχνία');
    updateCategory(db, category.id, { name: 'Νεοελληνική Λογοτεχνία' });
    const after = listPublicCategories(db).find((c) => c.id === category.id);
    assert.equal(after.slug, 'elliniki-logotechnia');
    assert.equal(after.name, 'Νεοελληνική Λογοτεχνία');
    db.close();
  });

  it('lists only categories with public titles', () => {
    const { db } = setup();
    createCategory(db, { name: 'Κενή Κατηγορία' });
    assert.ok(!listPublicCategories(db).some((c) => c.name === 'Κενή Κατηγορία'));
    db.close();
  });
});

describe('copies', () => {
  it('rejects a duplicate barcode', () => {
    const { db, books } = setup();
    const result = createCopy(db, books.iliad, { barcode: 'T-0001' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'duplicate_barcode');
    db.close();
  });

  it('allows many copies without barcodes', () => {
    const { db, books } = setup();
    assert.ok(createCopy(db, books.iliad, {}).ok);
    assert.ok(createCopy(db, books.iliad, {}).ok);
    assert.equal(getBookById(db, books.iliad).copies_total, 3);
    db.close();
  });

  it('adds copies in bulk, capped', () => {
    const { db, books } = setup();
    assert.equal(createCopies(db, books.iliad, 5).length, 5);
    assert.equal(createCopies(db, books.iliad, 10_000).length, 100);
    db.close();
  });

  it('finds a copy by barcode', () => {
    const { db } = setup();
    const copy = getCopyByBarcode(db, 'T-0001');
    assert.equal(copy.book_title, 'Οδύσσεια');
    assert.equal(copy.is_available, 1);
    assert.equal(getCopyByBarcode(db, 'NOPE'), undefined);
    db.close();
  });

  it('reports whether a barcode is taken, ignoring the copy being edited', () => {
    const { db, copies } = setup();
    assert.equal(barcodeInUse(db, 'T-0001'), true);
    assert.equal(barcodeInUse(db, 'T-0001', { excludeId: copies.odysseyA }), false);
    assert.equal(barcodeInUse(db, ''), false);
    db.close();
  });

  it('refuses to withdraw a copy that is out on loan', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία' });
    checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    const result = updateCopy(db, copies.odysseyA, { status: 'withdrawn' });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'on_loan');
    db.close();
  });

  it('refuses to delete a copy with loan history, directing to withdrawal', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία' });
    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });
    checkIn(db, { loanId: loan.id });

    const result = deleteCopy(db, copies.odysseyA);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'has_loans');

    // Withdrawing it instead works, and keeps the history.
    assert.ok(updateCopy(db, copies.odysseyA, { status: 'withdrawn' }).ok);
    db.close();
  });

  it('deletes a copy that has never been lent', () => {
    const { db, copies } = setup();
    assert.ok(deleteCopy(db, copies.odysseyB).ok);
    db.close();
  });
});

describe('archiving and deletion', () => {
  it('hides an archived title from the public but keeps its data', () => {
    const { db, books } = setup();
    archiveBook(db, books.odyssey);

    assert.equal(getBookById(db, books.odyssey), undefined);
    const staffView = getBookById(db, books.odyssey, { includeArchived: true });
    assert.ok(staffView.archived_at);
    assert.equal(staffView.copies.length, 2);

    unarchiveBook(db, books.odyssey);
    assert.ok(getBookById(db, books.odyssey));
    db.close();
  });

  it('refuses to delete a title with loan history', () => {
    const { db, books, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία' });
    checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    assert.equal(describeBookDeletability(db, books.odyssey).deletable, false);
    assert.throws(() => deleteBook(db, books.odyssey), /cannot be deleted/);

    // Archiving is always available as the safe alternative.
    assert.equal(archiveBook(db, books.odyssey), 1);
    db.close();
  });

  it('deletes a title that has no loan history, along with its copies', () => {
    const { db, books } = setup();
    assert.equal(describeBookDeletability(db, books.iliad).deletable, true);
    assert.equal(deleteBook(db, books.iliad), 1);
    assert.equal(getBookById(db, books.iliad), undefined);
    assert.equal(db.value('SELECT COUNT(*) FROM copy WHERE book_id = ?', books.iliad), 0);
    db.close();
  });

  it('frees an ISBN for re-cataloguing once a title is archived', () => {
    const { db, books } = setup();
    assert.ok(findBookByIsbn13(db, '9780141439518'));

    archiveBook(db, books.austen);
    assert.equal(findBookByIsbn13(db, '9780141439518'), undefined);
    // The same ISBN can now be used by a new record.
    assert.ok(createBook(db, { title: 'Pride and Prejudice (νέα έκδοση)', isbn13: '9780141439518' }));
    db.close();
  });

  it('rejects two active titles sharing an ISBN', () => {
    const { db } = setup();
    assert.throws(
      () => createBook(db, { title: 'Αντίγραφο', isbn13: '9780141439518' }),
      /UNIQUE constraint failed/,
    );
    db.close();
  });
});

describe('search index maintenance', () => {
  it('reindexes when the title changes', () => {
    const { db, books } = setup();
    updateBook(db, books.iliad, { title: 'Ραψωδία' });
    assert.equal(listBooks(db, { q: 'ραψωδια' }).total, 1);
    assert.equal(listBooks(db, { q: 'ιλιαδα' }).total, 0);
    db.close();
  });

  it('reindexes when authors change', () => {
    const { db, books } = setup();
    setBookAuthors(db, books.iliad, ['Νέος Συγγραφέας']);
    // setBookAuthors alone does not reindex; updateBook is the public path.
    updateBook(db, books.iliad, { authorNames: ['Νέος Συγγραφέας'] });
    assert.equal(listBooks(db, { q: 'νεος συγγραφεας' }).total, 1);
    db.close();
  });

  it('rebuilds every index from scratch', () => {
    const { db } = setup();
    db.run("UPDATE book SET search_text = ''");
    assert.equal(listBooks(db, { q: 'οδυσσεια' }).total, 0);

    assert.equal(rebuildAllSearchText(db), 5);
    assert.equal(listBooks(db, { q: 'οδυσσεια' }).total, 1);
    db.close();
  });

  it('lists recently added titles, excluding archived ones', () => {
    const { db } = setup();
    const recent = recentBooks(db, 10);
    assert.equal(recent.length, 4);
    assert.ok(!recent.some((b) => b.title === 'Αποσυρμένος Τίτλος'));
    db.close();
  });
});

describe('circulation', () => {
  it('checks a copy out and back in', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία Π.', schoolClass: 'Β2' });

    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id, loanDays: 14 });
    assert.ok(loan.ok);
    assert.ok(loan.dueAt > new Date().toISOString());

    const open = listLoans(db, { status: 'open' });
    assert.equal(open.total, 1);
    assert.equal(open.rows[0].borrower_name, 'Μαρία Π.');

    assert.ok(checkIn(db, { loanId: loan.id }).ok);
    assert.equal(listLoans(db, { status: 'open' }).total, 0);
    assert.equal(listLoans(db, { status: 'returned' }).total, 1);
    db.close();
  });

  it('refuses to lend the same copy twice', () => {
    const { db, copies } = setup();
    const a = createBorrower(db, { displayName: 'Α' });
    const b = createBorrower(db, { displayName: 'Β' });

    assert.ok(checkOut(db, { copyId: copies.odysseyA, borrowerId: a.id }).ok);
    const second = checkOut(db, { copyId: copies.odysseyA, borrowerId: b.id });
    assert.equal(second.ok, false);
    assert.equal(second.reason, 'already_on_loan');
    db.close();
  });

  it('refuses to lend a copy that is not on the shelf', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Α' });
    const result = checkOut(db, { copyId: copies.austenA, borrowerId: borrower.id });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'copy_not_available');
    assert.equal(result.status, 'repair');
    db.close();
  });

  it('allows the copy to be lent again after it comes back', () => {
    const { db, copies } = setup();
    const a = createBorrower(db, { displayName: 'Α' });
    const b = createBorrower(db, { displayName: 'Β' });

    const first = checkOut(db, { copyId: copies.odysseyA, borrowerId: a.id });
    checkIn(db, { loanId: first.id });
    assert.ok(checkOut(db, { copyId: copies.odysseyA, borrowerId: b.id }).ok);
    db.close();
  });

  it('returns by barcode and reports a copy that was not out', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Α' });
    checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    assert.ok(checkInByBarcode(db, { barcode: 'T-0001' }).ok);
    assert.equal(checkInByBarcode(db, { barcode: 'T-0001' }).reason, 'not_on_loan');
    assert.equal(checkInByBarcode(db, { barcode: 'NOPE' }).reason, 'copy_not_found');
    db.close();
  });

  it('will not return the same loan twice', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Α' });
    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    assert.ok(checkIn(db, { loanId: loan.id }).ok);
    assert.equal(checkIn(db, { loanId: loan.id }).reason, 'already_returned');
    db.close();
  });

  it('refuses a due date in the past', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Α' });
    const result = checkOut(db, {
      copyId: copies.odysseyA,
      borrowerId: borrower.id,
      dueAt: '2020-01-01',
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'due_date_in_past');
    db.close();
  });

  it('treats a book due today as not yet overdue', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Α' });
    const today = new Date().toISOString().slice(0, 10);

    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id, dueAt: today });
    assert.ok(loan.ok, `checkout failed: ${loan.reason}`);
    // Due at the end of today, so nothing is late yet.
    assert.equal(loan.dueAt, `${today}T23:59:59.999Z`);
    assert.equal(overdueLoans(db).length, 0);
    db.close();
  });

  it('identifies overdue loans', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Α' });
    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    // Nothing in the application can create an already-overdue loan — the
    // schema's due_at >= loaned_at check prevents it on insert *and* update.
    // So simulate time passing: a loan taken out in January, due mid-January,
    // never returned.
    db.run(
      'UPDATE loan SET loaned_at = ?, due_at = ? WHERE id = ?',
      '2026-01-01T10:00:00.000Z',
      '2026-01-15T23:59:59.999Z',
      loan.id,
    );

    assert.equal(overdueLoans(db).length, 1);
    assert.equal(listLoans(db, { status: 'overdue' }).total, 1);
    assert.equal(listLoans(db, { status: 'overdue' }).rows[0].is_overdue, 1);
    assert.equal(dashboardStats(db).overdue, 1);

    checkIn(db, { loanId: loan.id });
    assert.equal(overdueLoans(db).length, 0);
    db.close();
  });

  it('filters loan history by borrower and by title', () => {
    const { db, books, copies } = setup();
    const a = createBorrower(db, { displayName: 'Α' });
    const b = createBorrower(db, { displayName: 'Β' });
    checkOut(db, { copyId: copies.odysseyA, borrowerId: a.id });
    checkOut(db, { copyId: copies.iliadA, borrowerId: b.id });

    assert.equal(listLoans(db, { borrowerId: a.id }).total, 1);
    assert.equal(listLoans(db, { bookId: books.iliad }).total, 1);
    assert.equal(listLoans(db, { copyId: copies.odysseyA }).total, 1);
    db.close();
  });
});

describe('borrower privacy controls', () => {
  it('stores only a name and a class', () => {
    const { db } = setup();
    const result = createBorrower(db, {
      displayName: 'Μαρία Παπαδοπούλου',
      schoolClass: 'Β2',
      // Fields a future caller might pass are not stored.
      email: 'should-not-be-stored@example.com',
      dateOfBirth: '2010-01-01',
    });

    const row = db.get('SELECT * FROM borrower WHERE id = ?', result.id);
    assert.equal(row.display_name, 'Μαρία Παπαδοπούλου');
    assert.equal(row.school_class, 'Β2');
    const columns = Object.keys(row);
    for (const forbidden of ['email', 'date_of_birth', 'phone', 'address', 'student_number']) {
      assert.ok(!columns.includes(forbidden), `borrower table has a ${forbidden} column`);
    }
    db.close();
  });

  it('anonymizes a borrower while keeping their loan history', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία Παπαδοπούλου', schoolClass: 'Β2' });
    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });
    checkIn(db, { loanId: loan.id });

    assert.ok(anonymizeBorrower(db, borrower.id).ok);

    const row = db.get('SELECT * FROM borrower WHERE id = ?', borrower.id);
    assert.equal(row.is_anonymized, 1);
    assert.ok(!row.display_name.includes('Παπαδοπούλου'));
    assert.equal(row.school_class, null);
    assert.equal(row.name_norm, '');

    // The loan itself survives, so counts and reports stay correct.
    assert.equal(listLoans(db, { status: 'returned' }).total, 1);
    db.close();
  });

  it('refuses to anonymize a borrower who still has a book out', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία' });
    checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });

    const result = anonymizeBorrower(db, borrower.id);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'open_loans');
    db.close();
  });

  it('will not lend to an anonymized borrower', () => {
    const { db, copies } = setup();
    const borrower = createBorrower(db, { displayName: 'Μαρία' });
    anonymizeBorrower(db, borrower.id);

    const result = checkOut(db, { copyId: copies.odysseyA, borrowerId: borrower.id });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'borrower_anonymized');
    db.close();
  });

  it('deletes a borrower with no history, but blocks one with history', () => {
    const { db, copies } = setup();
    const fresh = createBorrower(db, { displayName: 'Νέος' });
    assert.ok(deleteBorrower(db, fresh.id).ok);

    const used = createBorrower(db, { displayName: 'Παλιός' });
    const loan = checkOut(db, { copyId: copies.odysseyA, borrowerId: used.id });
    checkIn(db, { loanId: loan.id });

    const result = deleteBorrower(db, used.id);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'has_loans');
    db.close();
  });
});

describe('audit log', () => {
  it('records an action against a real staff account', async () => {
    const { db } = setup();
    const staff = await createStaffUser(db, {
      username: 'maria',
      password: 'a-long-enough-test-password',
      displayName: 'Μαρία',
      role: 'admin',
    });

    logAction(db, {
      actor: { id: staff.id, username: 'maria' },
      action: 'book.archive',
      entity: 'book',
      entityId: 7,
      detail: { title: 'Οδύσσεια' },
    });

    const entries = recentAuditEntries(db);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].action, 'book.archive');
    assert.equal(entries[0].username, 'maria');
    db.close();
  });

  it('keeps the trail when the staff account is deleted', async () => {
    const { db } = setup();
    const staff = await createStaffUser(db, {
      username: 'admin1',
      password: 'a-long-enough-test-password',
      displayName: 'A',
      role: 'admin',
    });
    await createStaffUser(db, {
      username: 'admin2',
      password: 'a-long-enough-test-password',
      displayName: 'B',
      role: 'admin',
    });

    logAction(db, { actor: { id: staff.id, username: 'admin1' }, action: 'book.create' });
    deleteStaffUser(db, staff.id);

    const entry = recentAuditEntries(db)[0];
    assert.equal(entry.staff_user_id, null, 'the link is cleared');
    assert.equal(entry.username, 'admin1', 'but the username survives as text');
    db.close();
  });

  it('strips credentials and borrower identities from the detail field', () => {
    const { db } = setup();
    logAction(db, {
      action: 'loan.create',
      detail: {
        password: 'hunter2',
        token: 'abc123',
        displayName: 'Μαρία Παπαδοπούλου',
        school_class: 'Β2',
        copyId: 5,
      },
    });

    const detail = recentAuditEntries(db)[0].detail;
    assert.ok(!detail.includes('hunter2'));
    assert.ok(!detail.includes('abc123'));
    assert.ok(!detail.includes('Παπαδοπούλου'));
    assert.ok(!detail.includes('Β2'));
    assert.ok(detail.includes('copyId'));
    db.close();
  });

  it('truncates long values', () => {
    const { db } = setup();
    logAction(db, { action: 'x', detail: { note: 'α'.repeat(500) } });
    assert.ok(recentAuditEntries(db)[0].detail.length < 400);
    db.close();
  });
});
