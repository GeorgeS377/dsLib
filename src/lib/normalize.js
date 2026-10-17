// Greek-aware text normalization for search.
//
// Why this exists: SQLite's LIKE and lower() only fold ASCII. Verified on
// SQLite 3.51.2 — lower('ΟΔΥΣΣΕΙΑ') returns 'ΟΔΥΣΣΕΙΑ' unchanged. So a Greek
// search term would never match a differently-cased or accented title if we
// relied on the database. Nor would an ICU-enabled build help: it lowercases
// but does not strip accents, and does not unify final sigma.
//
// Instead, every searchable string is normalized here and stored in a
// search_text column, and the user's query is normalized the same way before
// comparison. Both sides go through one function, so they always agree.

// Combining diacritical marks (U+0300–U+036F). After NFD decomposition this
// covers Greek tonos and dialytika as well as Latin accents, so 'ά' -> 'α' and
// 'ü' -> 'u'. Includes 'ΐ'/'ΰ', which decompose into two marks.
const COMBINING_MARKS = /[̀-ͯ]/g;

// Anything that is not a letter or a digit becomes a space, so punctuation,
// dashes and quotes never block a match.
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]+/gu;

/**
 * Fold a string into its searchable form: no accents, lowercase, no
 * punctuation, single-spaced, final sigma unified with medial sigma.
 *
 * normalize('Ὀδύσσεια')  -> 'οδυσσεια'
 * normalize('ΟΔΥΣΣΕΙΑ')  -> 'οδυσσεια'
 * normalize('Καζαντζάκης') -> 'καζαντζακησ'   (final ς folded to σ)
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalize(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    // Lowercase first, so a trailing 'Σ' becomes 'ς' or 'σ' before folding.
    .toLowerCase()
    // Greek final sigma: 'οδυσσευς' and 'οδυσσευσ' must be the same token.
    .replaceAll('ς', 'σ')
    .replace(NON_ALPHANUMERIC, ' ')
    .trim();
}

/**
 * The body of `normalize`, as source the browser can run.
 *
 * `src/public/js/app.js` is served to the browser exactly as written — no
 * bundler, no build step — so it cannot import this module, and the suggestion
 * lists need to fold what the librarian types before matching it. The copy in
 * app.js is pasted from here verbatim; a test in test/suggestions.test.js
 * asserts it still matches, and test/normalize.test.js runs both against the
 * same Greek samples.
 *
 * Why the duplication is worth guarding rather than avoiding: suggestions that
 * folded differently from the catalogue search would offer a name, then fail
 * to find it. One authority, one copy, one test holding them together.
 *
 * Kept in step with `normalize` above: NFD, strip combining marks, lowercase,
 * final sigma, non-alphanumerics to spaces, trim.
 */
export const BROWSER_FOLD_SOURCE = `
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase()
    .replaceAll('\\u03c2', '\\u03c3')
    .replace(/[^\\p{L}\\p{N}]+/gu, ' ')
    .trim();
`;

/**
 * Build the haystack stored in a search_text column. Accepts any mix of
 * strings, numbers, nulls and arrays; de-duplicates tokens so repeated words
 * (a title echoed in its description) do not bloat the column.
 *
 * @param {...unknown} parts
 * @returns {string}
 */
export function buildSearchText(...parts) {
  const tokens = new Set();
  const visit = (part) => {
    if (part === null || part === undefined) return;
    if (Array.isArray(part)) {
      part.forEach(visit);
      return;
    }
    for (const token of normalize(part).split(' ')) {
      if (token) tokens.add(token);
    }
  };
  parts.forEach(visit);
  return [...tokens].join(' ');
}

/**
 * Split a user's query into normalized tokens for matching. Tokens are
 * de-duplicated and capped so a pathological query cannot build a huge SQL
 * statement.
 *
 * @param {unknown} query
 * @param {{ maxTokens?: number }} [options]
 * @returns {string[]}
 */
export function queryTokens(query, { maxTokens = 10 } = {}) {
  const normalized = normalize(query);
  if (!normalized) return [];
  return [...new Set(normalized.split(' ').filter(Boolean))].slice(0, maxTokens);
}

/**
 * URL-safe slug, used for category links. Greek letters are transliterated to
 * Latin so that slugs stay readable in a URL bar and in logs.
 *
 * slugify('Ελληνική Λογοτεχνία') -> 'elliniki-logotechnia'
 *
 * @param {unknown} value
 * @returns {string}
 */
export function slugify(value) {
  const normalized = normalize(value);
  if (!normalized) return '';
  let out = '';
  for (const char of normalized) {
    out += GREEK_TO_LATIN[char] ?? char;
  }
  return out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Applied after normalize(), so only lowercase unaccented Greek appears here
// and final sigma has already been folded to 'σ'.
const GREEK_TO_LATIN = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th',
  ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p',
  ρ: 'r', σ: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};

export default normalize;
