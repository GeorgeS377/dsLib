// Staff account queries.
//
// This file never handles plaintext passwords beyond passing them to
// lib/password.js for hashing. It stores only the hash string.
import { hashPassword } from '../../lib/password.js';
import { now } from '../index.js';

/** Failed attempts allowed before an account is temporarily locked. */
export const MAX_FAILED_LOGINS = 5;
/** How long the lock lasts. */
export const LOCKOUT_MINUTES = 15;

export function getStaffByUsername(db, username) {
  const trimmed = String(username ?? '').trim();
  if (!trimmed) return undefined;
  // The username column is COLLATE NOCASE, so this comparison is
  // case-insensitive without needing lower() on either side.
  return db.get('SELECT * FROM staff_user WHERE username = ?', trimmed);
}

export function getStaffById(db, id) {
  return db.get(
    `SELECT id, username, email, display_name, role, is_active,
            must_change_password, last_login_at, created_at
       FROM staff_user WHERE id = ?`,
    id,
  );
}

export function listStaff(db) {
  return db.all(
    `SELECT id, username, email, display_name, role, is_active,
            must_change_password, last_login_at, locked_until, created_at
       FROM staff_user
      ORDER BY username`,
  );
}

export function countStaff(db) {
  return db.value('SELECT COUNT(*) FROM staff_user') ?? 0;
}

export function countActiveAdmins(db, { excludeId } = {}) {
  return (
    db.value(
      `SELECT COUNT(*) FROM staff_user
        WHERE role = 'admin' AND is_active = 1${excludeId ? ' AND id <> ?' : ''}`,
      ...(excludeId ? [excludeId] : []),
    ) ?? 0
  );
}

/**
 * Create a staff account. The password is hashed here; the plaintext is never
 * stored, logged, or returned.
 *
 * @returns {{ ok: true, id: number } | { ok: false, reason: 'duplicate_username' }}
 */
export async function createStaffUser(
  db,
  { username, password, displayName, email, role = 'librarian', mustChangePassword = false } = {},
) {
  const trimmed = String(username ?? '').trim();
  if (getStaffByUsername(db, trimmed)) return { ok: false, reason: 'duplicate_username' };

  const passwordHash = await hashPassword(password);
  const timestamp = now();
  const result = db.run(
    `INSERT INTO staff_user (username, email, password_hash, display_name, role,
                             must_change_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    trimmed,
    email?.trim() || null,
    passwordHash,
    String(displayName ?? '').trim() || trimmed,
    role,
    mustChangePassword ? 1 : 0,
    timestamp,
    timestamp,
  );
  return { ok: true, id: Number(result.lastInsertRowid) };
}

export async function setStaffPassword(db, id, password) {
  const passwordHash = await hashPassword(password);
  db.run(
    `UPDATE staff_user
        SET password_hash = ?, must_change_password = 0, failed_login_count = 0,
            locked_until = NULL, updated_at = ?
      WHERE id = ?`,
    passwordHash,
    now(),
    id,
  );
  return { ok: true };
}

export function updateStaffUser(db, id, { displayName, email, role, isActive } = {}) {
  const current = db.get('SELECT * FROM staff_user WHERE id = ?', id);
  if (!current) return { ok: false, reason: 'not_found' };

  // Never allow the library to lock itself out of its own admin area.
  const losingAdmin =
    (role !== undefined && role !== 'admin' && current.role === 'admin') ||
    (isActive === false && current.role === 'admin');
  if (losingAdmin && countActiveAdmins(db, { excludeId: id }) === 0) {
    return { ok: false, reason: 'last_admin' };
  }

  db.run(
    `UPDATE staff_user
        SET display_name = ?, email = ?, role = ?, is_active = ?, updated_at = ?
      WHERE id = ?`,
    displayName === undefined ? current.display_name : String(displayName).trim(),
    email === undefined ? current.email : email?.trim() || null,
    role === undefined ? current.role : role,
    isActive === undefined ? current.is_active : isActive ? 1 : 0,
    now(),
    id,
  );
  return { ok: true };
}

/**
 * Delete a staff account. The audit log keeps the username as text, so the
 * trail of what they did survives.
 */
export function deleteStaffUser(db, id) {
  const current = db.get('SELECT * FROM staff_user WHERE id = ?', id);
  if (!current) return { ok: false, reason: 'not_found' };
  if (current.role === 'admin' && countActiveAdmins(db, { excludeId: id }) === 0) {
    return { ok: false, reason: 'last_admin' };
  }
  db.run('DELETE FROM staff_user WHERE id = ?', id);
  return { ok: true };
}

/** Whether an account is currently locked out, and until when. */
export function lockoutState(db, user) {
  if (!user?.locked_until) return { locked: false };
  const until = user.locked_until;
  if (until > now()) return { locked: true, until };
  // The lock has expired; clear it so the counter starts fresh.
  db.run(
    'UPDATE staff_user SET locked_until = NULL, failed_login_count = 0, updated_at = ? WHERE id = ?',
    now(),
    user.id,
  );
  return { locked: false };
}

/**
 * Record a failed login and lock the account once the threshold is reached.
 * This is per-account throttling; rate limiting by IP happens separately, so
 * neither a single account nor a single address can be hammered.
 */
export function recordFailedLogin(db, userId) {
  const timestamp = now();
  db.run(
    'UPDATE staff_user SET failed_login_count = failed_login_count + 1, updated_at = ? WHERE id = ?',
    timestamp,
    userId,
  );
  const count = db.value('SELECT failed_login_count FROM staff_user WHERE id = ?', userId) ?? 0;

  if (count >= MAX_FAILED_LOGINS) {
    const until = new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString();
    db.run(
      'UPDATE staff_user SET locked_until = ?, failed_login_count = 0, updated_at = ? WHERE id = ?',
      until,
      timestamp,
      userId,
    );
    return { locked: true, until };
  }
  return { locked: false, attempts: count, remaining: MAX_FAILED_LOGINS - count };
}

export function recordSuccessfulLogin(db, userId) {
  const timestamp = now();
  db.run(
    `UPDATE staff_user
        SET last_login_at = ?, failed_login_count = 0, locked_until = NULL, updated_at = ?
      WHERE id = ?`,
    timestamp,
    timestamp,
    userId,
  );
}
