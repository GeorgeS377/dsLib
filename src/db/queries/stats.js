// Dashboard figures.
//
// Every count here derives availability from the same rule as the public
// catalogue (books.js AVAILABLE_COPY), so the dashboard and the public pages
// can never disagree about how many copies are on the shelf.
import { now } from '../index.js';
import { AVAILABLE_COPY, HELD_COPY } from './books.js';

/** Headline counters for the staff dashboard. */
export function dashboardStats(db) {
  const timestamp = now();
  return db.get(
    `SELECT
       (SELECT COUNT(*) FROM book WHERE archived_at IS NULL)     AS titles,
       (SELECT COUNT(*) FROM book WHERE archived_at IS NOT NULL) AS archived_titles,
       (SELECT COUNT(*) FROM copy c WHERE ${HELD_COPY})          AS copies_total,
       (SELECT COUNT(*) FROM copy c WHERE ${AVAILABLE_COPY})     AS copies_available,
       (SELECT COUNT(*) FROM loan WHERE returned_at IS NULL)     AS copies_on_loan,
       (SELECT COUNT(*) FROM loan WHERE returned_at IS NULL AND due_at < ?) AS overdue,
       (SELECT COUNT(*) FROM copy WHERE status = 'lost')         AS copies_lost,
       (SELECT COUNT(*) FROM copy WHERE status = 'repair')       AS copies_repair,
       (SELECT COUNT(*) FROM copy WHERE status = 'withdrawn')    AS copies_withdrawn,
       (SELECT COUNT(*) FROM author)                             AS authors,
       (SELECT COUNT(*) FROM category)                           AS categories,
       (SELECT COUNT(*) FROM borrower WHERE is_anonymized = 0)   AS borrowers`,
    timestamp,
  );
}

/** Counts for the public home page. */
export function publicStats(db) {
  return db.get(
    `SELECT
       (SELECT COUNT(*) FROM book WHERE archived_at IS NULL) AS titles,
       (SELECT COUNT(*) FROM copy c
          JOIN book b ON b.id = c.book_id AND b.archived_at IS NULL
         WHERE ${AVAILABLE_COPY}) AS copies_available,
       (SELECT COUNT(DISTINCT c.id) FROM category c
          JOIN book_category bc ON bc.category_id = c.id
          JOIN book b ON b.id = bc.book_id AND b.archived_at IS NULL) AS categories`,
  );
}

/** Titles touched most recently, for the dashboard's activity panel. */
export function recentlyUpdatedBooks(db, limit = 8) {
  return db.all(
    `SELECT b.id, b.title, b.created_at, b.updated_at, b.archived_at,
            (SELECT COUNT(*) FROM copy c WHERE c.book_id = b.id AND ${HELD_COPY}) AS copies_total
       FROM book b
      ORDER BY b.updated_at DESC, b.id DESC
      LIMIT ?`,
    limit,
  );
}

/** Titles with no copies at all — usually an unfinished cataloguing job. */
export function titlesWithoutCopies(db, limit = 20) {
  return db.all(
    `SELECT b.id, b.title FROM book b
      WHERE b.archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM copy c WHERE c.book_id = b.id)
      ORDER BY b.created_at DESC
      LIMIT ?`,
    limit,
  );
}

/**
 * Loan counts per month for a simple report. Returns the most recent months
 * first. Contains no borrower information.
 */
export function loansPerMonth(db, months = 12) {
  return db.all(
    `SELECT substr(loaned_at, 1, 7) AS month, COUNT(*) AS loans
       FROM loan
      GROUP BY month
      ORDER BY month DESC
      LIMIT ?`,
    months,
  );
}

/** Most borrowed titles. Aggregate only — no borrower identities. */
export function mostBorrowedTitles(db, limit = 10) {
  return db.all(
    `SELECT b.id, b.title, COUNT(l.id) AS loan_count
       FROM loan l
       JOIN copy c ON c.id = l.copy_id
       JOIN book b ON b.id = c.book_id
      GROUP BY b.id
      ORDER BY loan_count DESC, b.title_norm
      LIMIT ?`,
    limit,
  );
}
