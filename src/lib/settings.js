// What the library calls itself, and the other handful of values a person can
// change from the browser.
//
// One rule, in one place, for every one of them:
//
//   1. the row in `setting`, if it is present and usable;
//   2. the environment variable, through src/config.js;
//   3. the schema default in src/config.js.
//
// That order is what lets a deployment that already exists upgrade and change
// nothing. It has no `setting` rows, so it keeps reading `.env` exactly as
// before. The first time somebody saves a name in the browser a row appears,
// and from then on the environment variable is inert — which the deployment
// guide says in those words, because a value read from two places and
// explained in none is worse than either place alone.
//
// Validation happens here, on the way out, rather than only at the form that
// writes it. A database can be edited by hand, restored from somewhere older,
// or carry a row written by a version of this code that allowed something this
// one does not. A row that fails validation is treated as absent, so the worst
// a bad value can do is put the old default back — never take every page down.
import { getSetting, setSetting } from '../db/queries/settings.js';

export const SETTING_KEYS = Object.freeze({
  libraryName: 'library_name',
  libraryIcon: 'library_icon',
  defaultLoanDays: 'default_loan_days',
  setupCompletedAt: 'setup_completed_at',
});

export const LIBRARY_NAME_MAX_LENGTH = 120;

// The same bounds src/config.js puts on DEFAULT_LOAN_DAYS. Stated here rather
// than imported because config.js validates an environment variable and this
// validates a database row: they agree today, and if they ever need to differ
// the two places are already separate.
export const MIN_LOAN_DAYS = 1;
export const MAX_LOAN_DAYS = 365;

/*
  Reads are cached per database.

  Every rendered page asks for the library's name and its icon, and the icon
  read also stats a file on disk, so without a cache the shared template
  locals would do two queries and a syscall on every request for values that
  change a few times a year.

  Keyed by the database handle rather than by setting name, because the test
  suite opens one database per file in a single process: a flat cache would
  hand one suite's library name to the next one that asked. A WeakMap also
  means a closed database's entry goes away with it.
*/
let caches = new WeakMap();

function cacheFor(db) {
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map();
    caches.set(db, cache);
  }
  return cache;
}

/** The stored text for a key, read through the cache. */
function read(db, key) {
  const cache = cacheFor(db);
  if (!cache.has(key)) cache.set(key, getSetting(db, key));
  return cache.get(key);
}

/**
 * Drop cached values so the next read goes to the database.
 *
 * With a database, only that one's entries; with nothing, every database's.
 * Callers should normally not need this: `saveSetting` does it for them.
 */
export function invalidateSettings(db) {
  // A WeakMap has no clear(), and a no-op here would be a silent lie — so
  // forgetting everything means starting with a new map.
  if (db) caches.delete(db);
  else caches = new WeakMap();
}

/**
 * Write a setting and forget the cached value in one move.
 *
 * The only writer anything outside this module should call. `setSetting` on
 * its own would leave a stale name in the cache until the process restarted,
 * so the renamed library would keep rendering under its old name — the kind
 * of bug that looks like a caching problem for an hour before it looks like a
 * missing line.
 */
export function saveSetting(db, key, value) {
  setSetting(db, key, value);
  cacheFor(db).set(key, String(value));
}

/**
 * What the library calls itself: shown in the bar on every page and in the
 * browser tab.
 * @returns {string}
 */
export function libraryName(db, config) {
  const stored = read(db, SETTING_KEYS.libraryName);
  const trimmed = typeof stored === 'string' ? stored.trim() : '';
  if (trimmed.length >= 1 && trimmed.length <= LIBRARY_NAME_MAX_LENGTH) return trimmed;
  return config.libraryName;
}

/**
 * How many days a loan runs when nobody says otherwise. Offered as the due
 * date at checkout, where a librarian can still change it for one loan.
 * @returns {number}
 */
export function defaultLoanDays(db, config) {
  const stored = read(db, SETTING_KEYS.defaultLoanDays);
  // Number('') and Number('  ') are both 0, which is out of range anyway, but
  // Number(null) is 0 too — so an absent row must not reach this.
  if (typeof stored === 'string' && stored.trim() !== '') {
    const days = Number(stored);
    if (Number.isInteger(days) && days >= MIN_LOAN_DAYS && days <= MAX_LOAN_DAYS) return days;
  }
  return config.defaultLoanDays;
}

/**
 * The stored file name of the library's icon, or null when it is using the
 * one that ships with the application.
 *
 * Returns the name as stored. Whether that name is safe to put in a path, and
 * whether the file is actually there, is settled where the icon is served —
 * see src/lib/upload.js and the locals in src/app.js.
 * @returns {string | null}
 */
export function libraryIcon(db) {
  const stored = read(db, SETTING_KEYS.libraryIcon);
  return typeof stored === 'string' && stored.trim() !== '' ? stored.trim() : null;
}

/**
 * When the browser setup was finished, or null if it never was.
 *
 * Not the gate on the setup page — that asks whether any staff account exists,
 * which is the condition that actually matters and cannot drift from the
 * truth. This is for the line the server logs at boot.
 * @returns {string | null}
 */
export function setupCompletedAt(db) {
  return read(db, SETTING_KEYS.setupCompletedAt);
}
