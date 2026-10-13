// Physical copy queries.
//
// A copy is one item on a shelf. Its `status` records its physical condition
// (available / repair / lost / withdrawn); whether it is currently out on loan
// is derived from the loan table, never stored here.
import { queryTokens } from '../../lib/normalize.js';
import { now } from '../index.js';
import { AVAILABLE_COPY } from './books.js';

/**
 * Copies of one title, with derived loan state, one page at a time.
 *
 * Paginated because a title bought in class sets can have scores of copies,
 * and rendering every one as an editable row made the page heavy enough to
 * stall the browser.
 */
export function listCopiesForBook(db, bookId, { page = 1, perPage = 20 } = {}) {
  const total = db.value('SELECT COUNT(*) FROM copy WHERE book_id = ?', bookId) ?? 0;
  const limit = Math.min(Math.max(perPage, 1), 100);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(page, 1), totalPages);

  const rows = db.all(
    `SELECT c.*,
            CASE WHEN ${AVAILABLE_COPY} THEN 1 ELSE 0 END AS is_available,
            l.id      AS open_loan_id,
            l.due_at  AS open_loan_due_at,
            l.borrower_id AS open_loan_borrower_id
       FROM copy c
       LEFT JOIN loan l ON l.copy_id = c.id AND l.returned_at IS NULL
      WHERE c.book_id = ?
      ORDER BY c.barcode IS NULL, c.barcode, c.id
      LIMIT ? OFFSET ?`,
    bookId,
    limit,
    (current - 1) * limit,
  );

  return { rows, total, page: current, perPage: limit, totalPages };
}

/**
 * Apply edits to several copies in one go.
 *
 * The copies table submits as a single form, because a form per row meant
 * editing three rows and pressing one Save silently discarded the other two.
 * Each copy is updated independently and its outcome reported, so one bad
 * barcode does not reject the other rows' legitimate edits.
 *
 * @returns {{ saved: number, failures: Array<{ id: number, reason: string, barcode: string|null }> }}
 */
export function updateCopies(db, edits) {
  const failures = [];
  let saved = 0;

  db.transaction(() => {
    for (const edit of edits) {
      const result = updateCopy(db, edit.id, edit);
      if (result.ok) {
        saved += 1;
      } else {
        const current = db.get('SELECT barcode FROM copy WHERE id = ?', edit.id);
        failures.push({ id: edit.id, reason: result.reason, barcode: current?.barcode ?? null });
      }
    }
  });

  return { saved, failures };
}

export function getCopyById(db, id) {
  return db.get(
    `SELECT c.*, b.title AS book_title, b.id AS book_id,
            CASE WHEN ${AVAILABLE_COPY} THEN 1 ELSE 0 END AS is_available
       FROM copy c JOIN book b ON b.id = c.book_id
      WHERE c.id = ?`,
    id,
  );
}

/** Find a copy by its barcode — the checkout desk's primary lookup. */
export function getCopyByBarcode(db, barcode) {
  const trimmed = String(barcode ?? '').trim();
  if (!trimmed) return undefined;
  return db.get(
    `SELECT c.*, b.title AS book_title, b.id AS book_id,
            CASE WHEN ${AVAILABLE_COPY} THEN 1 ELSE 0 END AS is_available
       FROM copy c JOIN book b ON b.id = c.book_id
      WHERE c.barcode = ?`,
    trimmed,
  );
}

/**
 * Find lendable titles by searching the catalogue.
 *
 * One row per title, not per copy. A title bought as a class set has dozens of
 * interchangeable copies, and listing each one gave the desk a screen of
 * identical rows with nothing to choose between. What a librarian needs here
 * is "a copy of this book"; the barcode field beside the search is how they
 * ask for one specific item.
 *
 * Each row carries the ids of its available copies, so the Add action can take
 * the next one that is not already in the basket.
 */
export function findLendableTitles(db, { q, limit = 20, barcodeHints = 5 } = {}) {
  const copies = findLendableCopies(db, { q, limit: 500 });

  const titles = new Map();
  for (const copy of copies) {
    if (!titles.has(copy.book_id)) {
      titles.set(copy.book_id, {
        book_id: copy.book_id,
        book_title: copy.book_title,
        authors: copy.authors,
        available_ids: [],
        barcodes: [],
        shelves: [],
        copy_count: 0,
      });
    }

    const title = titles.get(copy.book_id);
    title.copy_count += 1;
    if (copy.is_available) title.available_ids.push(copy.id);
    if (copy.barcode) title.barcodes.push(copy.barcode);
    if (copy.shelf_location && !title.shelves.includes(copy.shelf_location)) {
      title.shelves.push(copy.shelf_location);
    }
  }

  return [...titles.values()].slice(0, limit).map((title) => ({
    ...title,
    available_count: title.available_ids.length,
    // Barcodes identify a copy, so they are worth showing while there are few
    // enough to read. Past that they are just noise and the count says more.
    barcodes: title.barcodes.length <= barcodeHints ? title.barcodes : [],
  }));
}

/**
 * Find lendable copies by searching the catalogue.
 *
 * The desk needs this because a barcode is optional: a copy that was never
 * labelled had no way to be lent at all, and typing a barcode is slower than
 * typing a title even when one exists. Searches the same normalized
 * search_text the public catalogue uses, so Greek case and accents behave
 * identically here.
 */
export function findLendableCopies(db, { q, limit = 20 } = {}) {
  const tokens = queryTokens(q);
  if (tokens.length === 0) return [];

  const clauses = tokens.map(() => 'b.search_text LIKE ?');
  const params = tokens.map((token) => `%${token}%`);

  return db.all(
    `SELECT c.id, c.barcode, c.shelf_location, c.status,
            b.id AS book_id, b.title AS book_title,
            (SELECT group_concat(a.name, ', ' ORDER BY ba.position)
               FROM book_author ba JOIN author a ON a.id = ba.author_id
              WHERE ba.book_id = b.id) AS authors,
            CASE WHEN ${AVAILABLE_COPY} THEN 1 ELSE 0 END AS is_available,
            (SELECT l.due_at FROM loan l
              WHERE l.copy_id = c.id AND l.returned_at IS NULL) AS open_loan_due_at
       FROM copy c
       JOIN book b ON b.id = c.book_id
      WHERE ${clauses.join(' AND ')}
        AND c.status <> 'withdrawn'
      ORDER BY
        CASE WHEN ${AVAILABLE_COPY} THEN 0 ELSE 1 END,
        b.title_norm,
        c.barcode IS NULL, c.barcode
      LIMIT ?`,
    ...params,
    limit,
  );
}

/** Whether a barcode is already in use, optionally ignoring one copy. */
export function barcodeInUse(db, barcode, { excludeId } = {}) {
  const trimmed = String(barcode ?? '').trim();
  if (!trimmed) return false;
  const row = db.get(
    `SELECT id FROM copy WHERE barcode = ?${excludeId ? ' AND id <> ?' : ''}`,
    trimmed,
    ...(excludeId ? [excludeId] : []),
  );
  return Boolean(row);
}

/**
 * Add one copy to a title.
 * @returns {{ ok: true, id: number } | { ok: false, reason: 'duplicate_barcode' }}
 */
export function createCopy(db, bookId, { barcode, shelfLocation, status, notes, acquiredAt } = {}) {
  const trimmedBarcode = String(barcode ?? '').trim() || null;
  if (trimmedBarcode && barcodeInUse(db, trimmedBarcode)) {
    return { ok: false, reason: 'duplicate_barcode' };
  }

  const timestamp = now();
  const result = db.run(
    `INSERT INTO copy (book_id, barcode, shelf_location, status, notes, acquired_at,
                       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    bookId,
    trimmedBarcode,
    shelfLocation?.trim() || null,
    status ?? 'available',
    notes?.trim() || null,
    acquiredAt ?? null,
    timestamp,
    timestamp,
  );
  return { ok: true, id: Number(result.lastInsertRowid) };
}

/**
 * Add several copies at once, for a title the library bought in quantity.
 * Barcodes are left empty — they are per-item and entered individually.
 */
export function createCopies(db, bookId, count, { shelfLocation } = {}) {
  const howMany = Math.min(Math.max(Number(count) || 0, 0), 100);
  const ids = [];
  db.transaction(() => {
    for (let i = 0; i < howMany; i += 1) {
      const result = createCopy(db, bookId, { shelfLocation });
      if (result.ok) ids.push(result.id);
    }
  });
  return ids;
}

/**
 * Update a copy. Changing status to 'withdrawn' or 'lost' while the copy is
 * out on loan is rejected: the loan must be closed first, otherwise the
 * availability figures would describe an item nobody can account for.
 */
export function updateCopy(db, id, { barcode, shelfLocation, status, notes, acquiredAt } = {}) {
  const current = db.get('SELECT * FROM copy WHERE id = ?', id);
  if (!current) return { ok: false, reason: 'not_found' };

  const trimmedBarcode = barcode === undefined ? current.barcode : String(barcode ?? '').trim() || null;
  if (trimmedBarcode && barcodeInUse(db, trimmedBarcode, { excludeId: id })) {
    return { ok: false, reason: 'duplicate_barcode' };
  }

  const nextStatus = status ?? current.status;
  if (nextStatus !== 'available' && nextStatus !== current.status) {
    const openLoan = db.get(
      'SELECT id FROM loan WHERE copy_id = ? AND returned_at IS NULL',
      id,
    );
    if (openLoan) return { ok: false, reason: 'on_loan', loanId: openLoan.id };
  }

  db.run(
    `UPDATE copy
        SET barcode = ?, shelf_location = ?, status = ?, notes = ?, acquired_at = ?,
            updated_at = ?
      WHERE id = ?`,
    trimmedBarcode,
    shelfLocation === undefined ? current.shelf_location : shelfLocation?.trim() || null,
    nextStatus,
    notes === undefined ? current.notes : notes?.trim() || null,
    acquiredAt === undefined ? current.acquired_at : acquiredAt || null,
    now(),
    id,
  );
  return { ok: true };
}

/**
 * Whether a copy may be permanently deleted. A copy with loan history must be
 * withdrawn instead, so the history keeps pointing at a real item.
 */
export function describeCopyDeletability(db, id) {
  const loans = db.value('SELECT COUNT(*) FROM loan WHERE copy_id = ?', id) ?? 0;
  const open = db.value(
    'SELECT COUNT(*) FROM loan WHERE copy_id = ? AND returned_at IS NULL',
    id,
  ) ?? 0;

  if (open > 0) return { deletable: false, reason: 'on_loan', loans };
  if (loans > 0) return { deletable: false, reason: 'has_loans', loans };
  return { deletable: true, loans };
}

export function deleteCopy(db, id) {
  const { deletable, reason } = describeCopyDeletability(db, id);
  if (!deletable) return { ok: false, reason };
  db.run('DELETE FROM copy WHERE id = ?', id);
  return { ok: true };
}

/** Mark a copy as withdrawn — the non-destructive alternative to deletion. */
export function withdrawCopy(db, id) {
  return updateCopy(db, id, { status: 'withdrawn' });
}

/** The statuses a librarian may choose, in display order. */
export const COPY_STATUSES = ['available', 'repair', 'lost', 'withdrawn'];
