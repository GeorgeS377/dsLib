// Announcements shown on the front page.
//
// Ordinary content, written by staff: no derived values, no joins, nothing
// else in the system depends on it. The only rule worth stating is that the
// public list is a different list from the staff one — a notice can be
// written days before it should be read.
import { now } from '../index.js';

/** Every announcement, drafts included, in the order staff put them. */
export function listAnnouncements(db) {
  return db.all('SELECT * FROM announcement ORDER BY position, id DESC');
}

/** Only what a visitor should see. */
export function listPublishedAnnouncements(db) {
  return db.all(
    'SELECT * FROM announcement WHERE is_published = 1 ORDER BY position, id DESC',
  );
}

export function getAnnouncementById(db, id) {
  return db.get('SELECT * FROM announcement WHERE id = ?', id);
}

/**
 * Write a new announcement. It goes to the top, because the thing just
 * written is usually the thing that matters.
 *
 * @returns {{ ok: true, id: number } | { ok: false, reason: 'required' }}
 */
export function createAnnouncement(db, { title, body, isPublished = true } = {}) {
  const trimmedTitle = String(title ?? '').trim();
  if (!trimmedTitle) return { ok: false, reason: 'required' };

  const timestamp = now();
  const top = (db.value('SELECT MIN(position) FROM announcement') ?? 0) - 1;

  const result = db.run(
    `INSERT INTO announcement (title, body, is_published, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    trimmedTitle,
    String(body ?? '').trim() || null,
    isPublished ? 1 : 0,
    top,
    timestamp,
    timestamp,
  );
  return { ok: true, id: Number(result.lastInsertRowid) };
}

/**
 * Change one. Fields left undefined keep their current value, so publishing
 * does not require re-sending the text.
 *
 * @returns {{ ok: true } | { ok: false, reason: 'not_found' | 'required' }}
 */
export function updateAnnouncement(db, id, { title, body, isPublished } = {}) {
  const current = getAnnouncementById(db, id);
  if (!current) return { ok: false, reason: 'not_found' };

  const nextTitle = title === undefined ? current.title : String(title).trim();
  if (!nextTitle) return { ok: false, reason: 'required' };

  db.run(
    `UPDATE announcement
        SET title = ?, body = ?, is_published = ?, updated_at = ?
      WHERE id = ?`,
    nextTitle,
    body === undefined ? current.body : String(body).trim() || null,
    isPublished === undefined ? current.is_published : isPublished ? 1 : 0,
    now(),
    id,
  );
  return { ok: true };
}

/**
 * Move one up or down the list by swapping it with its neighbour.
 *
 * Swapping rather than renumbering keeps the operation to two rows, and means
 * an announcement at an end simply has no neighbour to swap with — which is
 * why moving past an end does nothing rather than erroring.
 */
export function moveAnnouncement(db, id, direction) {
  const ordered = listAnnouncements(db);
  const index = ordered.findIndex((item) => item.id === Number(id));
  if (index === -1) return { ok: false, reason: 'not_found' };

  const neighbour = ordered[direction === 'up' ? index - 1 : index + 1];
  if (!neighbour) return { ok: true };

  const current = ordered[index];
  const timestamp = now();
  db.transaction(() => {
    // Positions can collide after a swap of equal values, so renumber the two
    // rows from their list positions rather than trading the stored numbers.
    db.run('UPDATE announcement SET position = ?, updated_at = ? WHERE id = ?',
      direction === 'up' ? index - 1 : index + 1, timestamp, current.id);
    db.run('UPDATE announcement SET position = ?, updated_at = ? WHERE id = ?',
      index, timestamp, neighbour.id);
  });
  return { ok: true };
}

export function deleteAnnouncement(db, id) {
  db.run('DELETE FROM announcement WHERE id = ?', id);
  return { ok: true };
}
