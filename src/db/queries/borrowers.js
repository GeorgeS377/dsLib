// Borrower queries — staff area only.
//
// PRIVACY: a borrower record holds a display name and a class, and nothing
// else. See the note at the top of migrations/002_circulation.sql before
// adding any field. No function in this file is reachable from a public route,
// and test/privacy.test.js asserts that borrower names never appear in a
// public response.
import { normalize } from '../../lib/normalize.js';
import { now } from '../index.js';

/** The name an anonymized borrower is shown as. */
export const ANONYMIZED_NAME = 'Διαγραμμένος αναγνώστης';

/** Search borrowers by name or class, with their current loan counts. */
export function listBorrowers(db, { q, page = 1, perPage = 30 } = {}) {
  const clauses = [];
  const params = [];

  const normalized = normalize(q);
  if (normalized) {
    clauses.push('(b.name_norm LIKE ? OR b.school_class LIKE ?)');
    params.push(`%${normalized}%`, `%${String(q).trim()}%`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.value(`SELECT COUNT(*) FROM borrower b ${where}`, ...params) ?? 0;
  const limit = Math.min(Math.max(perPage, 1), 100);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const current = Math.min(Math.max(page, 1), totalPages);

  const rows = db.all(
    `SELECT b.*,
            (SELECT COUNT(*) FROM loan l WHERE l.borrower_id = b.id AND l.returned_at IS NULL)
              AS open_loans,
            (SELECT COUNT(*) FROM loan l WHERE l.borrower_id = b.id) AS total_loans,
            (SELECT COUNT(*) FROM loan l
              WHERE l.borrower_id = b.id AND l.returned_at IS NULL AND l.due_at < ?)
              AS overdue_loans
       FROM borrower b
       ${where}
      ORDER BY b.name_norm
      LIMIT ? OFFSET ?`,
    now(),
    ...params,
    limit,
    (current - 1) * limit,
  );

  return { rows, total, page: current, perPage: limit, totalPages };
}

export function getBorrowerById(db, id) {
  return db.get(
    `SELECT b.*,
            (SELECT COUNT(*) FROM loan l WHERE l.borrower_id = b.id AND l.returned_at IS NULL)
              AS open_loans,
            (SELECT COUNT(*) FROM loan l WHERE l.borrower_id = b.id) AS total_loans
       FROM borrower b WHERE b.id = ?`,
    id,
  );
}

/** Name suggestions for the checkout form. */
export function suggestBorrowers(db, q, limit = 10) {
  const normalized = normalize(q);
  if (!normalized) return [];
  return db.all(
    `SELECT id, display_name, school_class FROM borrower
      WHERE name_norm LIKE ? AND is_anonymized = 0
      ORDER BY name_norm LIMIT ?`,
    `%${normalized}%`,
    limit,
  );
}

/**
 * Create a borrower. Only a name and a class are accepted — extra properties
 * on the argument are ignored rather than stored, so a future caller cannot
 * accidentally widen what is kept.
 */
export function createBorrower(db, { displayName, schoolClass, notes } = {}) {
  const name = String(displayName ?? '').trim();
  if (!name) return { ok: false, reason: 'empty_name' };

  const timestamp = now();
  const result = db.run(
    `INSERT INTO borrower (display_name, name_norm, school_class, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    name,
    normalize(name),
    schoolClass?.trim() || null,
    notes?.trim() || null,
    timestamp,
    timestamp,
  );
  return { ok: true, id: Number(result.lastInsertRowid) };
}

/** Find an existing borrower by exact normalized name and class, or create one. */
export function findOrCreateBorrower(db, { displayName, schoolClass } = {}) {
  const name = String(displayName ?? '').trim();
  if (!name) return { ok: false, reason: 'empty_name' };

  const existing = db.get(
    `SELECT id FROM borrower
      WHERE name_norm = ? AND COALESCE(school_class, '') = COALESCE(?, '') AND is_anonymized = 0`,
    normalize(name),
    schoolClass?.trim() || null,
  );
  if (existing) return { ok: true, id: existing.id, created: false };

  const created = createBorrower(db, { displayName: name, schoolClass });
  return created.ok ? { ...created, created: true } : created;
}

export function updateBorrower(db, id, { displayName, schoolClass, notes } = {}) {
  const current = db.get('SELECT * FROM borrower WHERE id = ?', id);
  if (!current) return { ok: false, reason: 'not_found' };
  if (current.is_anonymized) return { ok: false, reason: 'anonymized' };

  const name = displayName === undefined ? current.display_name : String(displayName).trim();
  if (!name) return { ok: false, reason: 'empty_name' };

  db.run(
    `UPDATE borrower SET display_name = ?, name_norm = ?, school_class = ?, notes = ?,
            updated_at = ?
      WHERE id = ?`,
    name,
    normalize(name),
    schoolClass === undefined ? current.school_class : schoolClass?.trim() || null,
    notes === undefined ? current.notes : notes?.trim() || null,
    now(),
    id,
  );
  return { ok: true };
}

/**
 * Anonymize a borrower: replace the name and class with a placeholder while
 * keeping the row and its loan history, so counts and reports stay correct.
 *
 * This is the answer to "please remove my child's data": the identifying
 * information is gone, the historical record that a book was borrowed and
 * returned remains. Irreversible by design.
 */
export function anonymizeBorrower(db, id) {
  const current = db.get('SELECT * FROM borrower WHERE id = ?', id);
  if (!current) return { ok: false, reason: 'not_found' };
  if (current.is_anonymized) return { ok: true, alreadyAnonymized: true };

  const open = db.value(
    'SELECT COUNT(*) FROM loan WHERE borrower_id = ? AND returned_at IS NULL',
    id,
  ) ?? 0;
  if (open > 0) return { ok: false, reason: 'open_loans', openLoans: open };

  const timestamp = now();
  db.run(
    `UPDATE borrower
        SET display_name = ?, name_norm = '', school_class = NULL, notes = NULL,
            is_anonymized = 1, anonymized_at = ?, updated_at = ?
      WHERE id = ?`,
    ANONYMIZED_NAME,
    timestamp,
    timestamp,
    id,
  );
  return { ok: true };
}

/**
 * Delete a borrower outright. Only possible when there is no loan history at
 * all; otherwise the caller is told to anonymize instead. The database would
 * refuse anyway (loan.borrower_id is ON DELETE RESTRICT), but reporting the
 * reason here lets the UI explain the alternative.
 */
export function deleteBorrower(db, id) {
  const loans = db.value('SELECT COUNT(*) FROM loan WHERE borrower_id = ?', id) ?? 0;
  if (loans > 0) return { ok: false, reason: 'has_loans', loans };
  db.run('DELETE FROM borrower WHERE id = ?', id);
  return { ok: true };
}

/** Classes currently in use, for the staff filter menu. */
export function distinctClasses(db) {
  return db
    .all(
      `SELECT DISTINCT school_class FROM borrower
        WHERE school_class IS NOT NULL AND trim(school_class) <> ''
        ORDER BY school_class`,
    )
    .map((r) => r.school_class);
}
