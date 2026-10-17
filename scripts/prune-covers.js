#!/usr/bin/env node
// Delete cover images no book refers to.
//
// Why orphans exist at all: when a book form is refused — a duplicate ISBN, an
// impossible year — the cover that came with it is stored immediately, so the
// librarian's framing survives the correction. A browser will never re-populate
// a file input, so storing it is the only way to hand it back. Abandon the form
// at that point and the pair of files stays behind with nothing pointing at it.
//
// That is a deliberate trade: a stray file costs disk, and losing a cover
// somebody chose and framed costs their time. This sweeps up the stray ones.
//
// Safe to run while the site is up. Two things make it so:
//   * only files matching the UUID shape this app writes are ever candidates,
//     so nothing a person put in the directory can be deleted;
//   * a file younger than the threshold is left alone, because it may be
//     waiting out a form that is still open on somebody's screen.
//
// Usage:
//   npm run prune-covers                  delete orphans older than 24 hours
//   npm run prune-covers -- --dry-run     list them, delete nothing
//   npm run prune-covers -- --hours 72    use a different threshold
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { config as defaultConfig } from '../src/config.js';
import { closeDatabase, getDatabase } from '../src/db/index.js';
import { isSafeStoredName } from '../src/lib/upload.js';

/**
 * Remove cover files no book refers to.
 *
 * @param {object} db An open database.
 * @param {object} options
 * @param {string} options.uploadDir Base upload directory; covers/ sits inside.
 * @param {number} [options.olderThanHours] Leave anything younger than this.
 * @param {boolean} [options.dryRun] Report what would go, delete nothing.
 * @returns {{ removed: string[], kept: number }}
 */
export function pruneCovers(db, { uploadDir, olderThanHours = 24, dryRun = false } = {}) {
  const coversDir = path.join(uploadDir, 'covers');
  if (!fs.existsSync(coversDir)) return { removed: [], kept: 0 };

  // Both columns, because a thumbnail is referenced separately from the
  // display image and deleting one would leave a book with half a cover.
  const inUse = new Set();
  for (const row of db.all(
    `SELECT cover_path, cover_thumb_path FROM book
      WHERE cover_path IS NOT NULL OR cover_thumb_path IS NOT NULL`,
  )) {
    if (row.cover_path) inUse.add(row.cover_path);
    if (row.cover_thumb_path) inUse.add(row.cover_thumb_path);
  }

  const cutoff = Date.now() - olderThanHours * 3600_000;
  const removed = [];
  let kept = 0;

  for (const name of fs.readdirSync(coversDir)) {
    // Anything this module did not write is not its business.
    if (!isSafeStoredName(name)) continue;

    if (inUse.has(name)) {
      kept += 1;
      continue;
    }

    const full = path.join(coversDir, name);
    if (fs.statSync(full).mtimeMs > cutoff) {
      // Young enough to belong to a form somebody still has open.
      kept += 1;
      continue;
    }

    if (!dryRun) fs.unlinkSync(full);
    removed.push(name);
  }

  return { removed, kept };
}

/**
 * Read the options, from the command line and from npm.
 *
 * `npm run prune-covers --dry-run` does not pass the flag along — npm claims
 * it and sets npm_config_dry_run instead — so the script would see no flag
 * and delete for real. That is the wrong way round for a footgun: the
 * spelling that looks safest must not be the destructive one. Both forms are
 * honoured, and `-- --dry-run` still works.
 */
export function parseArgs(argv, env = process.env) {
  const args = {
    dryRun: env.npm_config_dry_run === 'true' || env.npm_config_dry_run === '',
    hours: 24,
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    if (argv[i] === '--hours') args.hours = Number(argv[i + 1]) || args.hours;
  }
  return args;
}

// Only when run directly, so importing this in a test does not sweep anything.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = parseArgs(process.argv.slice(2));
  const db = getDatabase();
  try {
    const { removed, kept } = pruneCovers(db, {
      uploadDir: defaultConfig.uploadDir,
      olderThanHours: args.hours,
      dryRun: args.dryRun,
    });
    const verb = args.dryRun ? 'Would remove' : 'Removed';
    console.log(`${verb} ${removed.length} orphaned cover file(s); kept ${kept}.`);
    for (const name of removed) console.log(`  ${name}`);
  } finally {
    closeDatabase();
  }
}
