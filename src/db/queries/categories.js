// Category queries. Like authors, categories are deduplicated on their
// normalized name so the same subject cannot be entered twice in different
// casing or accentuation.
import { normalize, slugify } from '../../lib/normalize.js';
import { now } from '../index.js';

/** Categories with at least one public title, for the browse page. */
export function listPublicCategories(db) {
  return db.all(
    `SELECT c.id, c.name, c.slug, c.description,
            COUNT(DISTINCT b.id) AS book_count
       FROM category c
       JOIN book_category bc ON bc.category_id = c.id
       JOIN book b           ON b.id = bc.book_id AND b.archived_at IS NULL
      GROUP BY c.id
      ORDER BY c.name_norm`,
  );
}

/** Every category, including empty ones. For the staff area. */
export function listAllCategories(db) {
  return db.all(
    `SELECT c.id, c.name, c.slug, c.description, c.created_at,
            (SELECT COUNT(*) FROM book_category bc WHERE bc.category_id = c.id) AS book_count
       FROM category c
      ORDER BY c.name_norm`,
  );
}

export function getCategoryById(db, id) {
  return db.get('SELECT * FROM category WHERE id = ?', id);
}

export function getCategoryBySlug(db, slug) {
  return db.get('SELECT * FROM category WHERE slug = ?', slug);
}

/**
 * Create a category, refusing a name that already exists under normalization.
 * @returns {{ ok: true, id: number } | { ok: false, reason: 'duplicate', existing: object }}
 */
export function createCategory(db, { name, description } = {}) {
  const trimmed = String(name ?? '').trim();
  const nameNorm = normalize(trimmed);
  if (!nameNorm) return { ok: false, reason: 'empty' };

  const existing = db.get('SELECT id, name FROM category WHERE name_norm = ?', nameNorm);
  if (existing) return { ok: false, reason: 'duplicate', existing };

  const timestamp = now();
  const result = db.run(
    `INSERT INTO category (name, name_norm, slug, description, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    trimmed,
    nameNorm,
    uniqueSlug(db, trimmed),
    description?.trim() || null,
    timestamp,
    timestamp,
  );
  return { ok: true, id: Number(result.lastInsertRowid) };
}

/**
 * Update a category. The slug is deliberately left alone once created so that
 * existing links and bookmarks keep working after a rename.
 */
export function updateCategory(db, id, { name, description } = {}) {
  const trimmed = String(name ?? '').trim();
  const nameNorm = normalize(trimmed);
  if (!nameNorm) return { ok: false, reason: 'empty' };

  const clash = db.get(
    'SELECT id, name FROM category WHERE name_norm = ? AND id <> ?',
    nameNorm,
    id,
  );
  if (clash) return { ok: false, reason: 'duplicate', existing: clash };

  db.run(
    'UPDATE category SET name = ?, name_norm = ?, description = ?, updated_at = ? WHERE id = ?',
    trimmed,
    nameNorm,
    description?.trim() || null,
    now(),
    id,
  );
  return { ok: true };
}

/**
 * Delete a category. Safe by design: removing a category detaches it from its
 * titles (via cascade) but never deletes a title, so the worst case is that
 * books become uncategorized.
 */
export function deleteCategory(db, id) {
  return db.transaction(() => {
    const bookCount = db.value('SELECT COUNT(*) FROM book_category WHERE category_id = ?', id) ?? 0;
    db.run('DELETE FROM category WHERE id = ?', id);
    return { ok: true, detachedBooks: bookCount };
  });
}

/**
 * Build a slug that is not already taken, appending -2, -3 and so on.
 * Falls back to 'category-<n>' when the name transliterates to nothing.
 */
function uniqueSlug(db, name) {
  const base = slugify(name) || 'category';
  let candidate = base;
  let suffix = 2;
  while (db.get('SELECT 1 AS ok FROM category WHERE slug = ?', candidate)) {
    candidate = `${base}-${suffix++}`;
  }
  return candidate;
}
