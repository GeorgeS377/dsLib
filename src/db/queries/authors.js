// Author queries. Authors are deduplicated on their normalized name, so
// 'Καζαντζάκης', 'ΚΑΖΑΝΤΖΑΚΗΣ' and 'Καζαντζακης' are one person.
import { normalize } from '../../lib/normalize.js';
import { now } from '../index.js';
import { AVAILABLE_COPY } from './books.js';

/**
 * Authors that have at least one title in the public catalogue, with counts.
 * Authors whose every title is archived are omitted — a public page listing
 * them would always be empty.
 */
export function listPublicAuthors(db, { q } = {}) {
  const params = [];
  let filter = '';
  if (normalize(q)) {
    filter = 'AND a.name_norm LIKE ?';
    params.push(`%${normalize(q)}%`);
  }

  return db.all(
    `SELECT a.id, a.name,
            COUNT(DISTINCT b.id) AS book_count
       FROM author a
       JOIN book_author ba ON ba.author_id = a.id
       JOIN book b         ON b.id = ba.book_id AND b.archived_at IS NULL
      WHERE 1 = 1 ${filter}
      GROUP BY a.id
      ORDER BY a.name_norm`,
    ...params,
  );
}

/** Every author, with title counts including archived ones. For staff. */
export function listAllAuthors(db) {
  return db.all(
    `SELECT a.id, a.name, a.name_norm, a.created_at,
            (SELECT COUNT(*) FROM book_author ba WHERE ba.author_id = a.id) AS book_count
       FROM author a
      ORDER BY a.name_norm`,
  );
}

export function getAuthorById(db, id) {
  return db.get('SELECT id, name, name_norm, sort_name FROM author WHERE id = ?', id);
}

/** Name suggestions for the author autocomplete on the book form. */
export function suggestAuthors(db, q, limit = 10) {
  const normalized = normalize(q);
  if (!normalized) return [];
  return db
    .all(
      `SELECT name FROM author WHERE name_norm LIKE ? ORDER BY name_norm LIMIT ?`,
      `%${normalized}%`,
      limit,
    )
    .map((r) => r.name);
}

/**
 * Rename an author. Returns a conflict marker rather than throwing when the
 * new name collides with another author, so the caller can offer a merge.
 * @returns {{ ok: true } | { ok: false, reason: 'duplicate', conflictId: number }}
 */
export function renameAuthor(db, id, name) {
  const nameNorm = normalize(name);
  const clash = db.get('SELECT id FROM author WHERE name_norm = ? AND id <> ?', nameNorm, id);
  if (clash) return { ok: false, reason: 'duplicate', conflictId: clash.id };

  db.run(
    'UPDATE author SET name = ?, name_norm = ?, updated_at = ? WHERE id = ?',
    name.trim(),
    nameNorm,
    now(),
    id,
  );
  return { ok: true };
}

/**
 * Move every title from one author to another and delete the source. Used to
 * clean up duplicates that predate normalization, or typos entered as new
 * authors.
 */
export function mergeAuthors(db, sourceId, targetId) {
  if (Number(sourceId) === Number(targetId)) return { ok: false, reason: 'same' };
  return db.transaction(() => {
    // Re-point only where the target is not already attached, to respect the
    // composite primary key on book_author.
    db.run(
      `UPDATE book_author SET author_id = ?
        WHERE author_id = ?
          AND book_id NOT IN (SELECT book_id FROM book_author WHERE author_id = ?)`,
      targetId,
      sourceId,
      targetId,
    );
    db.run('DELETE FROM book_author WHERE author_id = ?', sourceId);
    db.run('DELETE FROM author WHERE id = ?', sourceId);
    return { ok: true };
  });
}

/** Delete an author that has no titles. */
export function deleteAuthorIfUnused(db, id) {
  const count = db.value('SELECT COUNT(*) FROM book_author WHERE author_id = ?', id) ?? 0;
  if (count > 0) return { ok: false, reason: 'in_use', bookCount: count };
  db.run('DELETE FROM author WHERE id = ?', id);
  return { ok: true };
}

/** Remove authors left with no titles, e.g. after a title was deleted. */
export function pruneOrphanAuthors(db) {
  return db.run(
    'DELETE FROM author WHERE id NOT IN (SELECT DISTINCT author_id FROM book_author)',
  ).changes;
}

/** Availability totals for one author's titles, shown on the author page. */
export function authorCopyCounts(db, authorId) {
  return db.get(
    `SELECT
       (SELECT COUNT(*) FROM copy c
          JOIN book b ON b.id = c.book_id AND b.archived_at IS NULL
          JOIN book_author ba ON ba.book_id = b.id
         WHERE ba.author_id = ? AND ${AVAILABLE_COPY}) AS available`,
    authorId,
  );
}
