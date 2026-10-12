// A SQLite-backed session store for @fastify/session.
//
// Why not the default in-memory store: it loses every session on restart, and
// it grows without bound because nothing evicts expired entries. More
// importantly, a server-side store is what makes "log out" and "session
// expiry" real — the server forgets the session, so a stolen cookie stops
// working. With a stateless cookie the server has no way to revoke anything.
//
// Implements the express-session store interface that @fastify/session
// expects: get / set / destroy, each taking a Node-style callback.
import { now } from '../db/index.js';

/** How often to sweep expired rows, in milliseconds. */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export class SqliteSessionStore {
  /**
   * @param {import('../db/index.js').Database} db
   * @param {{ cleanupIntervalMs?: number }} [options]
   */
  constructor(db, { cleanupIntervalMs = CLEANUP_INTERVAL_MS } = {}) {
    this.db = db;
    this.cleanupIntervalMs = cleanupIntervalMs;
    this.timer = null;
    this.startCleanup();
  }

  /**
   * Look up a session. An expired row is treated as absent and deleted, so an
   * expired cookie can never be revived.
   */
  get(sessionId, callback) {
    try {
      const row = this.db.get('SELECT data, expires_at FROM session WHERE sid = ?', sessionId);
      if (!row) return callback(null, null);

      if (row.expires_at <= Date.now()) {
        this.db.run('DELETE FROM session WHERE sid = ?', sessionId);
        return callback(null, null);
      }

      return callback(null, JSON.parse(row.data));
    } catch (error) {
      // A corrupt row should log the user out, not crash the request.
      try {
        this.db.run('DELETE FROM session WHERE sid = ?', sessionId);
      } catch {
        /* nothing more to do */
      }
      return callback(null, null);
    }
  }

  /** Create or replace a session. */
  set(sessionId, session, callback) {
    try {
      const expiresAt = expiryOf(session);
      this.db.run(
        `INSERT INTO session (sid, data, expires_at, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (sid) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
        sessionId,
        JSON.stringify(session),
        expiresAt,
        now(),
      );
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  /** Forget a session. This is what makes logout effective server-side. */
  destroy(sessionId, callback) {
    try {
      this.db.run('DELETE FROM session WHERE sid = ?', sessionId);
      return callback(null);
    } catch (error) {
      return callback(error);
    }
  }

  /** Delete every expired row. Returns how many were removed. */
  cleanup() {
    try {
      return this.db.run('DELETE FROM session WHERE expires_at <= ?', Date.now()).changes;
    } catch {
      return 0;
    }
  }

  /** Remove every session — used when revoking all staff sessions at once. */
  destroyAll() {
    return this.db.run('DELETE FROM session').changes;
  }

  /** Remove every session belonging to one staff account. */
  destroyForUser(staffUserId) {
    const rows = this.db.all('SELECT sid, data FROM session');
    let removed = 0;
    for (const row of rows) {
      try {
        const data = JSON.parse(row.data);
        if (data?.staffUserId === staffUserId) {
          this.db.run('DELETE FROM session WHERE sid = ?', row.sid);
          removed += 1;
        }
      } catch {
        /* skip unparseable rows; cleanup() will collect them when they expire */
      }
    }
    return removed;
  }

  startCleanup() {
    if (this.timer) return;
    this.timer = setInterval(() => this.cleanup(), this.cleanupIntervalMs);
    // Do not hold the process open just for the sweep.
    this.timer.unref?.();
  }

  stopCleanup() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Work out when a session row should expire, from the cookie the session
 * carries. Falls back to one hour if the session has no expiry at all, so a
 * malformed session cannot become immortal.
 */
function expiryOf(session) {
  const expires = session?.cookie?.expires;
  if (expires) {
    const timestamp = expires instanceof Date ? expires.getTime() : new Date(expires).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  const maxAge = session?.cookie?.maxAge;
  if (Number.isFinite(maxAge)) return Date.now() + Number(maxAge);
  return Date.now() + 3_600_000;
}

export default SqliteSessionStore;
