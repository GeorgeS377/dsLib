// One search across the two things a desk looks for.
//
// A teacher holding a book searches the title; a teacher chasing an overdue
// one has only the student's name. Two separate search pages would mean
// knowing which one you are in before you start typing, which is exactly the
// kind of thing an occasional user should not have to know.
//
// There is no new SQL here: this composes the two searches the system already
// has, so a title found by this box behaves identically to one found by the
// catalogue, and a reader identically to one found on the readers page.
import { findLendableTitles } from './copies.js';
import { listBorrowers } from './borrowers.js';
import { queryTokens } from '../../lib/normalize.js';

/**
 * Search the catalogue and the readers together.
 *
 * @param {object} db
 * @param {{ q?: string, limit?: number }} options
 * @returns {{ books: object[], borrowers: object[] }}
 */
export function searchEverything(db, { q, limit = 20 } = {}) {
  // A blank box must not be read as "everything". Tokenising first means the
  // decision is made the same way the catalogue search makes it.
  if (queryTokens(q).length === 0) {
    return { books: [], borrowers: [] };
  }

  return {
    books: findLendableTitles(db, { q, limit }),
    borrowers: listBorrowers(db, { q, perPage: limit }).rows,
  };
}
