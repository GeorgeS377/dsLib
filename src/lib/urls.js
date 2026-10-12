// URL building for the catalogue.
//
// The spec requires filters and search terms to survive moving between result
// pages. Rather than rebuilding query strings by hand in each template (where
// one forgotten parameter silently loses the user's filters), every link goes
// through buildUrl, and the search route hands templates a prepared set of
// link builders.

/**
 * Build a path with a query string, dropping empty values so the URL stays
 * readable: /books?q=ιλιάδα rather than /books?q=ιλιάδα&year=&sort=&page=1.
 *
 * @param {string} basePath
 * @param {Record<string, unknown>} params
 * @returns {string}
 */
export function buildUrl(basePath, params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== null && item !== undefined && item !== '') search.append(key, String(item));
      }
      continue;
    }
    search.append(key, String(value));
  }

  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/**
 * Copy a set of parameters, overriding some. Used to build "same search, next
 * page" and "same search, different sort" links.
 *
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} overrides
 */
export function withParams(params, overrides) {
  return { ...params, ...overrides };
}

/**
 * Work out which page numbers to show in a pagination control.
 *
 * Returns a compact window around the current page plus the first and last
 * pages, with nulls marking gaps where the template renders an ellipsis:
 *   [1, null, 7, 8, 9, null, 42]
 *
 * @param {number} current
 * @param {number} total
 * @param {number} [window] Pages either side of the current one.
 * @returns {(number|null)[]}
 */
export function pageWindow(current, total, window = 2) {
  if (total <= 1) return [1];

  const pages = new Set([1, total]);
  for (let page = current - window; page <= current + window; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) result.push(null);
    result.push(page);
    previous = page;
  }
  return result;
}

/**
 * Describe which results are on the current page, for "showing 25–48 of 120".
 */
export function resultRange({ page, perPage, total }) {
  if (total === 0) return { from: 0, to: 0, total: 0 };
  const from = (page - 1) * perPage + 1;
  return { from, to: Math.min(page * perPage, total), total };
}
