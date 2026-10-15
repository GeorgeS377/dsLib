// Circulation queries — staff area only.
//
// Loan rows are the source of truth for whether a copy is out. The database
// enforces one open loan per copy (unique partial index
// idx_loan_one_open_per_copy), so two librarians checking out the same copy at
// the same moment cannot both succeed: the loser gets a constraint error,
// which checkOut() translates into a clear result object.
import { queryTokens } from '../../lib/normalize.js';
import { now } from '../index.js';

/** Loan rows joined to their copy, title and borrower. */
const LOAN_COLUMNS = `
  l.id, l.copy_id, l.borrower_id, l.loaned_at, l.due_at, l.returned_at,
  c.barcode, c.shelf_location,
  b.id AS book_id, b.title AS book_title,
  br.display_name AS borrower_name, br.school_class AS borrower_class,
  br.is_anonymized AS borrower_anonymized,
  CASE WHEN l.returned_at IS NULL AND l.due_at < ? THEN 1 ELSE 0 END AS is_overdue
`;

const LOAN_JOINS = `
  FROM loan l
  JOIN copy c      ON c.id = l.copy_id
  JOIN book b      ON b.id = c.book_id
  JOIN borrower br ON br.id = l.borrower_id
`;

/**
 * Check a copy out to a borrower.
 *
 * @param {import('../index.js').Database} db
 * @param {object} params
 * @param {number} params.copyId
 * @param {number} params.borrowerId
 * @param {number} [params.loanDays] Loan period in days.
 * @param {string} [params.dueAt] Explicit due date (ISO), overrides loanDays.
 * @param {number} [params.staffUserId]
 * @returns {{ ok: true, id: number, dueAt: string } | { ok: false, reason: string }}
 */
export function checkOut(db, { copyId, borrowerId, loanDays = 14, dueAt, staffUserId } = {}) {
  const copy = db.get('SELECT * FROM copy WHERE id = ?', copyId);
  if (!copy) return { ok: false, reason: 'copy_not_found' };

  // A copy that is not on the shelf cannot be lent, whatever its loan state.
  if (copy.status !== 'available') {
    return { ok: false, reason: 'copy_not_available', status: copy.status };
  }

  const borrower = db.get('SELECT * FROM borrower WHERE id = ?', borrowerId);
  if (!borrower) return { ok: false, reason: 'borrower_not_found' };
  if (borrower.is_anonymized) return { ok: false, reason: 'borrower_anonymized' };

  const existing = db.get('SELECT id FROM loan WHERE copy_id = ? AND returned_at IS NULL', copyId);
  if (existing) return { ok: false, reason: 'already_on_loan', loanId: existing.id };

  const loanedAt = now();
  // Normalize whatever the caller gave us to end-of-day (see endOfDay).
  const due = dueAt ? endOfDay(dueAt) : addDays(loanedAt, loanDays);

  // A due date in the past would violate the schema's due_at >= loaned_at
  // check. Refuse it here with a clear reason instead of surfacing a
  // constraint error to the librarian.
  if (due < loanedAt) return { ok: false, reason: 'due_date_in_past', dueAt: due };

  try {
    const result = db.run(
      `INSERT INTO loan (copy_id, borrower_id, issued_by, loaned_at, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      copyId,
      borrowerId,
      staffUserId ?? null,
      loanedAt,
      due,
      loanedAt,
      loanedAt,
    );
    return { ok: true, id: Number(result.lastInsertRowid), dueAt: due };
  } catch (error) {
    // The unique partial index caught a concurrent checkout of the same copy.
    // Report it as a normal refusal rather than a crash.
    if (String(error.message).includes('UNIQUE constraint failed')) {
      return { ok: false, reason: 'already_on_loan' };
    }
    throw error;
  }
}

/**
 * Record a return.
 * @returns {{ ok: true, loanId: number, wasOverdue: boolean } | { ok: false, reason: string }}
 */
export function checkIn(db, { loanId, staffUserId } = {}) {
  const loan = db.get('SELECT * FROM loan WHERE id = ?', loanId);
  if (!loan) return { ok: false, reason: 'loan_not_found' };
  if (loan.returned_at) return { ok: false, reason: 'already_returned' };

  const timestamp = now();
  db.run(
    'UPDATE loan SET returned_at = ?, returned_by = ?, updated_at = ? WHERE id = ?',
    timestamp,
    staffUserId ?? null,
    timestamp,
    loanId,
  );
  return { ok: true, loanId, wasOverdue: loan.due_at < timestamp };
}

/** Return by barcode, the desk's usual path. */
export function checkInByBarcode(db, { barcode, staffUserId } = {}) {
  const trimmed = String(barcode ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'barcode_required' };

  const copy = db.get('SELECT id FROM copy WHERE barcode = ?', trimmed);
  if (!copy) return { ok: false, reason: 'copy_not_found' };

  const loan = db.get('SELECT id FROM loan WHERE copy_id = ? AND returned_at IS NULL', copy.id);
  if (!loan) return { ok: false, reason: 'not_on_loan', copyId: copy.id };

  return checkIn(db, { loanId: loan.id, staffUserId });
}

/** Extend an open loan's due date. */
export function renewLoan(db, { loanId, loanDays = 14 } = {}) {
  const loan = db.get('SELECT * FROM loan WHERE id = ?', loanId);
  if (!loan) return { ok: false, reason: 'loan_not_found' };
  if (loan.returned_at) return { ok: false, reason: 'already_returned' };

  const timestamp = now();
  const due = addDays(timestamp, loanDays);
  db.run('UPDATE loan SET due_at = ?, updated_at = ? WHERE id = ?', due, timestamp, loanId);
  return { ok: true, dueAt: due };
}

/**
 * List loans with filters and pagination.
 * @param {object} [filters]
 * @param {'open'|'overdue'|'returned'|'all'} [filters.status]
 * @param {number} [filters.borrowerId]
 * @param {number} [filters.bookId]
 * @param {number} [filters.copyId]
 */
export function listLoans(db, filters = {}) {
  const clauses = [];
  const params = [];
  const timestamp = now();

  switch (filters.status) {
    case 'open':
      clauses.push('l.returned_at IS NULL');
      break;
    case 'overdue':
      clauses.push('l.returned_at IS NULL AND l.due_at < ?');
      params.push(timestamp);
      break;
    case 'returned':
      clauses.push('l.returned_at IS NOT NULL');
      break;
    default:
      break;
  }

  // Free text over the three things written on a loan: what the book is, who
  // has it, and the label on the copy. Normalized for the title and the name
  // so Greek case and accents behave as they do everywhere else; the barcode
  // is matched as typed, because that is what a scanner sends.
  const tokens = queryTokens(filters.q);
  if (tokens.length > 0) {
    for (const token of tokens) {
      clauses.push('(b.search_text LIKE ? OR br.name_norm LIKE ? OR c.barcode = ?)');
      params.push(`%${token}%`, `%${token}%`, String(filters.q).trim());
    }
  }

  if (filters.borrowerId) {
    clauses.push('l.borrower_id = ?');
    params.push(filters.borrowerId);
  }
  if (filters.bookId) {
    clauses.push('b.id = ?');
    params.push(filters.bookId);
  }
  if (filters.copyId) {
    clauses.push('l.copy_id = ?');
    params.push(filters.copyId);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.value(`SELECT COUNT(*) ${LOAN_JOINS} ${where}`, ...params) ?? 0;
  const perPage = Math.min(Math.max(filters.perPage ?? 30, 1), 100);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(filters.page ?? 1, 1), totalPages);

  // Open loans sort by urgency; returned history sorts most recent first.
  const orderBy =
    filters.status === 'returned'
      ? 'l.returned_at DESC, l.id DESC'
      : 'l.returned_at IS NOT NULL, l.due_at ASC, l.id ASC';

  const rows = db.all(
    `SELECT ${LOAN_COLUMNS} ${LOAN_JOINS} ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    timestamp,
    ...params,
    perPage,
    (page - 1) * perPage,
  );

  return { rows, total, page, perPage, totalPages };
}

export function getLoanById(db, id) {
  return db.get(`SELECT ${LOAN_COLUMNS} ${LOAN_JOINS} WHERE l.id = ?`, now(), id);
}

/** The open loan on a copy, if there is one. */
export function getOpenLoanForCopy(db, copyId) {
  return db.get(
    `SELECT ${LOAN_COLUMNS} ${LOAN_JOINS} WHERE l.copy_id = ? AND l.returned_at IS NULL`,
    now(),
    copyId,
  );
}

/** Overdue loans, most overdue first. For the dashboard. */
export function overdueLoans(db, limit = 50) {
  const timestamp = now();
  return db.all(
    `SELECT ${LOAN_COLUMNS} ${LOAN_JOINS}
      WHERE l.returned_at IS NULL AND l.due_at < ?
      ORDER BY l.due_at ASC
      LIMIT ?`,
    timestamp,
    timestamp,
    limit,
  );
}

/**
 * The last instant of a given day, in UTC.
 *
 * Due dates are stored as end-of-day rather than as the moment of checkout.
 * Two reasons:
 *
 *   1. A book due "on the 26th" is not late at 09:00 on the 26th — it is late
 *      once the 26th is over. Comparing `due_at < now` then gives the answer a
 *      librarian expects, with no date arithmetic at the call site.
 *
 *   2. The staff form submits a plain date (2026-10-26). Stored verbatim that
 *      string sorts *before* the checkout timestamp, which would both trip the
 *      schema's `due_at >= loaned_at` check and mark a fresh loan overdue.
 *
 * @param {string|Date} value An ISO timestamp or a YYYY-MM-DD date.
 */
export function endOfDay(value) {
  const text = typeof value === 'string' ? value : value.toISOString();
  const datePart = text.slice(0, 10);
  return `${datePart}T23:59:59.999Z`;
}

/** Add whole days to a timestamp, returning the end of the resulting day. */
export function addDays(isoTimestamp, days) {
  const date = new Date(isoTimestamp);
  date.setUTCDate(date.getUTCDate() + Number(days));
  return endOfDay(date);
}
