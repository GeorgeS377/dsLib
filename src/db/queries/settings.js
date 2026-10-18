// Settings queries: the SQL for the `setting` table and nothing else.
//
// Deliberately dumb. Everything that decides what a stored value *means* —
// whether it is usable, what to fall back to when it is not — lives in
// src/lib/settings.js. Callers outside that module should go through it
// rather than here, so a write cannot miss the cache invalidation.
import { now } from '../index.js';

/**
 * The raw stored text for a key, or null when nobody has set it.
 * @returns {string | null}
 */
export function getSetting(db, key) {
  const row = db.get('SELECT value FROM setting WHERE key = ?', key);
  return row ? row.value : null;
}

/** Write a value, replacing any previous one for the same key. */
export function setSetting(db, key, value) {
  db.run(
    `INSERT INTO setting (key, value, updated_at)
          VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                    updated_at = excluded.updated_at`,
    key,
    String(value),
    now(),
  );
}

/** Forget a setting, so reads fall back to the environment again. */
export function deleteSetting(db, key) {
  db.run('DELETE FROM setting WHERE key = ?', key);
}

/**
 * Every stored setting, as a plain object. For the settings page, which shows
 * them together, and for tests.
 * @returns {Record<string, string>}
 */
export function allSettings(db) {
  const rows = db.all('SELECT key, value FROM setting');
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}
