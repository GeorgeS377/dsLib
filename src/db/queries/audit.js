// Staff action log.
//
// Records what changed and who changed it, for the cases where a librarian
// asks "who archived this title?". Deliberately narrow: spec §9 requires
// logging important staff actions *without* logging passwords, session tokens
// or unnecessary borrower data, so the detail field is a short structured
// summary written by the caller, never a dump of a request body.
import { now } from '../index.js';

/** Keys that must never reach the log, whatever a caller passes. */
const FORBIDDEN_DETAIL_KEYS = new Set([
  'password',
  'passwordConfirm',
  'password_hash',
  'passwordHash',
  'token',
  'csrfToken',
  'sessionId',
  'sid',
  'cookie',
  // Borrower identities are not an audit concern; the loan row already links
  // the action to a borrower id for staff who need it.
  'displayName',
  'display_name',
  'borrowerName',
  'borrower_name',
  'schoolClass',
  'school_class',
]);

/**
 * Append an entry.
 *
 * @param {import('../index.js').Database} db
 * @param {object} entry
 * @param {{ id?: number, username?: string }} [entry.actor] The acting librarian.
 * @param {string} entry.action e.g. 'book.archive'
 * @param {string} [entry.entity] e.g. 'book'
 * @param {number} [entry.entityId]
 * @param {Record<string, unknown>} [entry.detail] Short, non-sensitive summary.
 */
export function logAction(db, { actor, action, entity, entityId, detail } = {}) {
  db.run(
    `INSERT INTO audit_log (staff_user_id, username, action, entity, entity_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    actor?.id ?? null,
    actor?.username ?? null,
    action,
    entity ?? null,
    entityId ?? null,
    detail ? JSON.stringify(scrub(detail)) : null,
    now(),
  );
}

/** Drop forbidden keys and truncate long values before storing. */
function scrub(detail) {
  const safe = {};
  for (const [key, value] of Object.entries(detail)) {
    if (FORBIDDEN_DETAIL_KEYS.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') {
      safe[key] = Array.isArray(value) ? value.length : '[object]';
      continue;
    }
    const asText = String(value);
    safe[key] = asText.length > 200 ? `${asText.slice(0, 200)}…` : asText;
  }
  return safe;
}

/** Recent entries, newest first. */
export function recentAuditEntries(db, { limit = 50, entity, entityId } = {}) {
  const clauses = [];
  const params = [];
  if (entity) {
    clauses.push('entity = ?');
    params.push(entity);
  }
  if (entityId) {
    clauses.push('entity_id = ?');
    params.push(entityId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  return db.all(
    `SELECT id, staff_user_id, username, action, entity, entity_id, detail, created_at
       FROM audit_log ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT ?`,
    ...params,
    Math.min(Math.max(limit, 1), 200),
  );
}
