// Catalogue queries.
//
// All SQL for titles lives here. Two things in this file are load-bearing:
//
//   1. AVAILABLE_COPY — the one definition of "a copy is available right now".
//      Public availability must be derived, never stored, so every caller uses
//      this fragment rather than writing its own rule.
//
//   2. search_text / title_norm maintenance. Greek search only works because
//      these columns are rebuilt on every mutation; rebuildSearchText is
//      called from each write path below.
import { buildSearchText, normalize, queryTokens } from '../../lib/normalize.js';
import { now } from '../index.js';

/**
 * A copy counts as available when it is physically on the shelf *and* not
 * currently out on loan. Expects the copy table aliased as `c`.
 *
 * Note there is no 'on_loan' copy status: being on loan is a fact about the
 * loan table, so the two can never disagree.
 */
export const AVAILABLE_COPY = `
  c.status = 'available'
  AND NOT EXISTS (
    SELECT 1 FROM loan l WHERE l.copy_id = c.id AND l.returned_at IS NULL
  )
`;

/** Copies the library still holds. Withdrawn items are gone from the shelves. */
export const HELD_COPY = `c.status <> 'withdrawn'`;

// Correlated subqueries reused by the list and detail queries.
const AUTHORS_COLUMN = `
  (SELECT group_concat(a.name, ', ' ORDER BY ba.position, a.name_norm)
     FROM book_author ba
     JOIN author a ON a.id = ba.author_id
    WHERE ba.book_id = b.id) AS authors
`;

const COPIES_TOTAL_COLUMN = `
  (SELECT COUNT(*) FROM copy c WHERE c.book_id = b.id AND ${HELD_COPY}) AS copies_total
`;

const COPIES_AVAILABLE_COLUMN = `
  (SELECT COUNT(*) FROM copy c WHERE c.book_id = b.id AND ${AVAILABLE_COPY}) AS copies_available
`;

const LIST_COLUMNS = `
  b.id, b.title, b.subtitle, b.publication_year, b.language,
  b.cover_path, b.cover_thumb_path, b.archived_at, b.created_at, b.updated_at,
  ${AUTHORS_COLUMN},
  ${COPIES_TOTAL_COLUMN},
  ${COPIES_AVAILABLE_COLUMN}
`;

/**
 * Sort options, as a whitelist. User input selects a key; the SQL is never
 * built from the request, so sorting cannot be used for injection.
 *
 * Alphabetical sorts use the normalized columns, which order Greek correctly
 * under SQLite's default BINARY collation (see the migration comment).
 */
export const SORT_OPTIONS = {
  title: 'b.title_norm ASC, b.id ASC',
  title_desc: 'b.title_norm DESC, b.id DESC',
  author:
    "(SELECT a.name_norm FROM book_author ba JOIN author a ON a.id = ba.author_id " +
    'WHERE ba.book_id = b.id ORDER BY ba.position LIMIT 1) ASC, b.title_norm ASC',
  newest: 'b.created_at DESC, b.id DESC',
  oldest: 'b.created_at ASC, b.id ASC',
  // NULL years sort last in both directions rather than clumping at one end.
  year_desc: 'b.publication_year IS NULL, b.publication_year DESC, b.title_norm ASC',
  year: 'b.publication_year IS NULL, b.publication_year ASC, b.title_norm ASC',
};

export const DEFAULT_SORT = 'title';

/**
 * Build the WHERE clause and parameters for a set of filters.
 * @param {object} filters
 */
function buildWhere(filters = {}) {
  const clauses = [];
  const params = [];

  // Archived titles are invisible to the public. Staff pass includeArchived.
  if (filters.archived === 'only') {
    clauses.push('b.archived_at IS NOT NULL');
  } else if (!filters.includeArchived) {
    clauses.push('b.archived_at IS NULL');
  }

  // Full-text-ish search: every token must appear somewhere in search_text.
  // Tokens come from normalize(), which strips everything that is not a letter
  // or digit — so they cannot contain LIKE wildcards (% or _).
  for (const token of queryTokens(filters.q)) {
    clauses.push('b.search_text LIKE ?');
    params.push(`%${token}%`);
  }

  if (filters.categoryId) {
    clauses.push(
      'EXISTS (SELECT 1 FROM book_category bc WHERE bc.book_id = b.id AND bc.category_id = ?)',
    );
    params.push(filters.categoryId);
  }

  if (filters.authorId) {
    clauses.push(
      'EXISTS (SELECT 1 FROM book_author ba WHERE ba.book_id = b.id AND ba.author_id = ?)',
    );
    params.push(filters.authorId);
  }

  if (filters.year) {
    clauses.push('b.publication_year = ?');
    params.push(filters.year);
  }

  if (filters.language) {
    clauses.push('b.language = ?');
    params.push(filters.language);
  }

  if (filters.availableOnly) {
    clauses.push(`EXISTS (SELECT 1 FROM copy c WHERE c.book_id = b.id AND ${AVAILABLE_COPY})`);
  }

  return {
    sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}

/**
 * Search and browse titles, with filters, sorting and pagination.
 *
 * @param {import('../index.js').Database} db
 * @param {object} [filters]
 * @param {string} [filters.q] Free-text query.
 * @param {number} [filters.categoryId]
 * @param {number} [filters.authorId]
 * @param {number} [filters.year]
 * @param {string} [filters.language]
 * @param {boolean} [filters.availableOnly]
 * @param {boolean} [filters.includeArchived] Staff only.
 * @param {'only'} [filters.archived] Show archived titles exclusively.
 * @param {keyof SORT_OPTIONS} [filters.sort]
 * @param {number} [filters.page] 1-based.
 * @param {number} [filters.perPage]
 */
export function listBooks(db, filters = {}) {
  const where = buildWhere(filters);
  const orderBy = SORT_OPTIONS[filters.sort] ?? SORT_OPTIONS[DEFAULT_SORT];

  const perPage = clamp(filters.perPage ?? 24, 1, 100);
  const total = db.value(`SELECT COUNT(*) FROM book b ${where.sql}`, ...where.params) ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = clamp(filters.page ?? 1, 1, totalPages);

  const rows = db.all(
    `SELECT ${LIST_COLUMNS} FROM book b ${where.sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...where.params,
    perPage,
    (page - 1) * perPage,
  );

  return { rows, total, page, perPage, totalPages };
}

/** Most recently added titles, for the home page. */
export function recentBooks(db, limit = 8) {
  return db.all(
    `SELECT ${LIST_COLUMNS}
       FROM book b
      WHERE b.archived_at IS NULL
      ORDER BY b.created_at DESC, b.id DESC
      LIMIT ?`,
    clamp(limit, 1, 50),
  );
}

/**
 * One title with its authors, categories and copies.
 * @returns {object|undefined}
 */
export function getBookById(db, id, { includeArchived = false } = {}) {
  const book = db.get(
    `SELECT b.*, ${COPIES_TOTAL_COLUMN}, ${COPIES_AVAILABLE_COLUMN}
       FROM book b
      WHERE b.id = ?${includeArchived ? '' : ' AND b.archived_at IS NULL'}`,
    id,
  );
  if (!book) return undefined;

  book.authors = db.all(
    `SELECT a.id, a.name, ba.position
       FROM book_author ba JOIN author a ON a.id = ba.author_id
      WHERE ba.book_id = ?
      ORDER BY ba.position, a.name_norm`,
    id,
  );

  book.categories = db.all(
    `SELECT c.id, c.name, c.slug
       FROM book_category bc JOIN category c ON c.id = bc.category_id
      WHERE bc.book_id = ?
      ORDER BY c.name_norm`,
    id,
  );

  // Each copy carries its derived availability, so templates never recompute.
  book.copies = db.all(
    `SELECT c.id, c.barcode, c.shelf_location, c.status, c.notes, c.acquired_at,
            CASE WHEN ${AVAILABLE_COPY} THEN 1 ELSE 0 END AS is_available,
            (SELECT l.id FROM loan l WHERE l.copy_id = c.id AND l.returned_at IS NULL) AS open_loan_id,
            (SELECT l.due_at FROM loan l WHERE l.copy_id = c.id AND l.returned_at IS NULL) AS due_at
       FROM copy c
      WHERE c.book_id = ?
      ORDER BY c.barcode IS NULL, c.barcode, c.id`,
    id,
  );

  return book;
}

/** Look up a title by ISBN-13, used to warn about duplicates. */
export function findBookByIsbn13(db, isbn13, { excludeId } = {}) {
  if (!isbn13) return undefined;
  return db.get(
    `SELECT id, title, archived_at FROM book
      WHERE isbn13 = ? AND archived_at IS NULL${excludeId ? ' AND id <> ?' : ''}`,
    isbn13,
    ...(excludeId ? [excludeId] : []),
  );
}

const WRITABLE_FIELDS = [
  'title',
  'subtitle',
  'isbn13',
  'isbn10',
  'publisher',
  'publication_year',
  'edition',
  'language',
  'description',
];

/**
 * Insert a title together with its authors and categories, in one
 * transaction, then build its search index.
 *
 * @param {import('../index.js').Database} db
 * @param {object} data Validated field values.
 * @param {string[]} [data.authorNames]
 * @param {number[]} [data.categoryIds]
 * @returns {number} the new book id
 */
export function createBook(db, data) {
  return db.transaction(() => {
    const timestamp = now();
    const result = db.run(
      `INSERT INTO book (title, title_norm, subtitle, isbn13, isbn10, publisher,
                         publication_year, edition, language, description,
                         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.title,
      normalize(data.title),
      data.subtitle ?? null,
      data.isbn13 ?? null,
      data.isbn10 ?? null,
      data.publisher ?? null,
      data.publication_year ?? null,
      data.edition ?? null,
      data.language ?? null,
      data.description ?? null,
      timestamp,
      timestamp,
    );

    const bookId = Number(result.lastInsertRowid);
    if (data.authorNames) setBookAuthors(db, bookId, data.authorNames);
    if (data.categoryIds) setBookCategories(db, bookId, data.categoryIds);
    rebuildSearchText(db, bookId);
    return bookId;
  });
}

/** Update a title's fields, relationships and search index. */
export function updateBook(db, id, data) {
  return db.transaction(() => {
    const assignments = [];
    const params = [];

    for (const field of WRITABLE_FIELDS) {
      if (Object.hasOwn(data, field)) {
        assignments.push(`${field} = ?`);
        params.push(data[field] ?? null);
      }
    }
    if (Object.hasOwn(data, 'title')) {
      assignments.push('title_norm = ?');
      params.push(normalize(data.title));
    }

    if (assignments.length > 0) {
      assignments.push('updated_at = ?');
      params.push(now());
      db.run(`UPDATE book SET ${assignments.join(', ')} WHERE id = ?`, ...params, id);
    }

    if (data.authorNames) setBookAuthors(db, id, data.authorNames);
    if (data.categoryIds) setBookCategories(db, id, data.categoryIds);
    rebuildSearchText(db, id);
    return true;
  });
}

/** Record the stored cover paths. Pass nulls to clear them. */
export function setBookCover(db, id, { coverPath, thumbPath }) {
  db.run(
    'UPDATE book SET cover_path = ?, cover_thumb_path = ?, updated_at = ? WHERE id = ?',
    coverPath ?? null,
    thumbPath ?? null,
    now(),
    id,
  );
}

/**
 * Archive a title: it disappears from the public catalogue but keeps its
 * copies and loan history. This is the default way to retire a record.
 */
export function archiveBook(db, id) {
  const timestamp = now();
  return db.run(
    'UPDATE book SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL',
    timestamp,
    timestamp,
    id,
  ).changes;
}

export function unarchiveBook(db, id) {
  return db.run(
    'UPDATE book SET archived_at = NULL, updated_at = ? WHERE id = ?',
    now(),
    id,
  ).changes;
}

/**
 * Whether a title can be permanently deleted. Anything with copies that have
 * loan history must be archived instead, so the history is never orphaned.
 * @returns {{ deletable: boolean, reason?: string, copies: number, loans: number }}
 */
export function describeBookDeletability(db, id) {
  const copies = db.value('SELECT COUNT(*) FROM copy WHERE book_id = ?', id) ?? 0;
  const loans =
    db.value(
      'SELECT COUNT(*) FROM loan WHERE copy_id IN (SELECT id FROM copy WHERE book_id = ?)',
      id,
    ) ?? 0;

  if (loans > 0) return { deletable: false, reason: 'has_loans', copies, loans };
  return { deletable: true, copies, loans };
}

/**
 * Permanently delete a title and its copies. Refuses when loan history
 * exists — callers should archive instead.
 */
export function deleteBook(db, id) {
  return db.transaction(() => {
    const { deletable, reason } = describeBookDeletability(db, id);
    if (!deletable) {
      const error = new Error(`Book ${id} cannot be deleted: ${reason}`);
      error.code = 'BOOK_NOT_DELETABLE';
      error.reason = reason;
      throw error;
    }
    db.run('DELETE FROM copy WHERE book_id = ?', id);
    // book_author and book_category cascade.
    return db.run('DELETE FROM book WHERE id = ?', id).changes;
  });
}

/**
 * Rebuild one title's normalized search haystack from everything a visitor
 * might search by. Must be called after any change to the title, its authors
 * or its categories — otherwise search silently goes stale.
 */
export function rebuildSearchText(db, bookId) {
  const book = db.get(
    `SELECT title, subtitle, isbn13, isbn10, publisher, edition, language, description
       FROM book WHERE id = ?`,
    bookId,
  );
  if (!book) return false;

  const authors = db
    .all(
      `SELECT a.name FROM book_author ba JOIN author a ON a.id = ba.author_id
        WHERE ba.book_id = ?`,
      bookId,
    )
    .map((r) => r.name);

  const categories = db
    .all(
      `SELECT c.name FROM book_category bc JOIN category c ON c.id = bc.category_id
        WHERE bc.book_id = ?`,
      bookId,
    )
    .map((r) => r.name);

  const searchText = buildSearchText(
    book.title,
    book.subtitle,
    authors,
    categories,
    book.publisher,
    book.edition,
    book.language,
    book.isbn13,
    book.isbn10,
    book.description,
  );

  db.run('UPDATE book SET search_text = ?, title_norm = ? WHERE id = ?',
    searchText,
    normalize(book.title),
    bookId,
  );
  return true;
}

/** Rebuild every title's search index. Used by scripts/reindex-search.js. */
export function rebuildAllSearchText(db) {
  const ids = db.all('SELECT id FROM book').map((r) => r.id);
  db.transaction(() => {
    for (const id of ids) rebuildSearchText(db, id);
  });
  return ids.length;
}

/**
 * Replace a title's author list, creating authors that do not exist yet.
 * Authors are matched on their normalized name, so 'ΟΜΗΡΟΣ' and 'Όμηρος' are
 * recognised as the same person rather than duplicated.
 */
export function setBookAuthors(db, bookId, names) {
  db.run('DELETE FROM book_author WHERE book_id = ?', bookId);
  let position = 0;
  const seen = new Set();

  for (const rawName of names) {
    const name = String(rawName ?? '').trim();
    if (!name) continue;
    const nameNorm = normalize(name);
    if (!nameNorm || seen.has(nameNorm)) continue;
    seen.add(nameNorm);

    const authorId = upsertAuthor(db, name, nameNorm);
    db.run(
      'INSERT INTO book_author (book_id, author_id, position) VALUES (?, ?, ?)',
      bookId,
      authorId,
      position++,
    );
  }
}

function upsertAuthor(db, name, nameNorm) {
  const existing = db.get('SELECT id FROM author WHERE name_norm = ?', nameNorm);
  if (existing) return existing.id;
  const timestamp = now();
  const result = db.run(
    'INSERT INTO author (name, name_norm, created_at, updated_at) VALUES (?, ?, ?, ?)',
    name,
    nameNorm,
    timestamp,
    timestamp,
  );
  return Number(result.lastInsertRowid);
}

/** Replace a title's category list. Unknown ids are ignored. */
export function setBookCategories(db, bookId, categoryIds) {
  db.run('DELETE FROM book_category WHERE book_id = ?', bookId);
  const seen = new Set();
  for (const rawId of categoryIds) {
    const id = Number(rawId);
    if (!Number.isInteger(id) || seen.has(id)) continue;
    seen.add(id);
    if (!db.get('SELECT 1 AS ok FROM category WHERE id = ?', id)) continue;
    db.run('INSERT INTO book_category (book_id, category_id) VALUES (?, ?)', bookId, id);
  }
}

/** Publication years present in the public catalogue, for the filter menu. */
export function distinctYears(db) {
  return db
    .all(
      `SELECT DISTINCT publication_year AS year FROM book
        WHERE archived_at IS NULL AND publication_year IS NOT NULL
        ORDER BY year DESC`,
    )
    .map((r) => r.year);
}

/** Languages present in the public catalogue, for the filter menu. */
export function distinctLanguages(db) {
  return db
    .all(
      `SELECT DISTINCT language FROM book
        WHERE archived_at IS NULL AND language IS NOT NULL AND trim(language) <> ''
        ORDER BY language`,
    )
    .map((r) => r.language);
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
