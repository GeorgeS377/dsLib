// Public catalogue routes. No authentication, and no borrower data.
//
// Every query here goes through the public query helpers, which filter out
// archived titles and derive availability from copy status plus open loans.
// Nothing in this file reads the borrower or loan tables directly.
import { getBookById, listBooks, recentBooks } from '../../db/queries/books.js';
import { getAuthorById, listPublicAuthors } from '../../db/queries/authors.js';
import {
  getCategoryBySlug,
  listPublicCategories,
} from '../../db/queries/categories.js';
import { distinctLanguages, distinctYears } from '../../db/queries/books.js';
import { publicStats } from '../../db/queries/stats.js';
import { buildUrl, pageWindow, resultRange, withParams } from '../../lib/urls.js';
import {
  hasActiveFilters,
  preservedParams,
  searchFilters,
  searchQuerySchema,
} from '../../lib/validation.js';

const PER_PAGE = 24;

export default async function publicRoutes(app) {
  const db = app.db;

  // ------------------------------------------------------------------ home
  app.get('/', async (request, reply) => {
    const categories = listPublicCategories(db);
    // The filter bar is shared with the catalogue page and expects the same
    // shape, so an empty parsed query stands in for "nothing selected yet".
    const query = searchQuerySchema.parse({});

    return reply.render('public/home', {
      title: null,
      recent: recentBooks(db, 8),
      stats: publicStats(db),
      query,
      categories,
      authors: listPublicAuthors(db),
      years: distinctYears(db),
      languages: distinctLanguages(db),
      topCategories: categories.slice(0, 12),
      // The home page has its own prominent search field, so the header does
      // not repeat it. Every other page shows the header one.
      hideHeaderSearch: true,
    });
  });

  // -------------------------------------------------------- search & browse
  app.get('/books', async (request, reply) => {
    // Lenient parsing: a hand-edited URL yields a sensible page, not an error.
    const query = searchQuerySchema.parse(request.query ?? {});
    const filters = searchFilters(query, { perPage: PER_PAGE });
    const results = listBooks(db, filters);

    // One set of parameters, reused for every link on the page, so filters
    // cannot be dropped when paginating or re-sorting.
    const kept = preservedParams(query);

    return reply.render('public/search', {
      title: query.q
        ? reply.locals.t('search.resultsFor', { query: query.q })
        : reply.locals.t('search.title'),
      query,
      kept,
      results,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (page) => buildUrl('/books', withParams(kept, { page: page > 1 ? page : undefined })),
      sortUrl: (sort) => buildUrl('/books', withParams(kept, { sort, page: undefined })),
      clearUrl: buildUrl('/books', { q: query.q }),
      categories: listPublicCategories(db),
      authors: listPublicAuthors(db),
      years: distinctYears(db),
      languages: distinctLanguages(db),
      hasFilters: hasActiveFilters(query),
    });
  });

  // ---------------------------------------------------------- book details
  app.get('/books/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.callNotFound();

    // getBookById excludes archived titles unless asked, so an archived
    // record is a 404 for the public rather than a hidden-but-reachable page.
    const book = getBookById(db, id);
    if (!book) return reply.callNotFound();

    // Related titles: same first author, then same category. Cheap queries
    // against an indexed join, limited to a handful of rows.
    const related = book.authors[0]
      ? listBooks(db, { authorId: book.authors[0].id, perPage: 6 }).rows.filter(
          (row) => row.id !== book.id,
        )
      : [];

    // Distinct shelf locations, in order. A reader wants to know which shelf
    // to walk to, not how many copies sit on each.
    const shelfLocations = [
      ...new Set(
        book.copies
          .filter((copy) => copy.is_available && copy.shelf_location)
          .map((copy) => copy.shelf_location),
      ),
    ].sort();

    return reply.render('public/book', {
      title: book.title,
      metaDescription: (book.description ?? '').slice(0, 160) || undefined,
      book,
      shelfLocations,
      related: related.slice(0, 5),
      backUrl: refererSearchUrl(request),
    });
  });

  // ------------------------------------------------------------ categories
  app.get('/categories', async (_request, reply) =>
    reply.render('public/categories', {
      title: reply.locals.t('categories.title'),
      categories: listPublicCategories(db),
    }),
  );

  app.get('/categories/:slug', async (request, reply) => {
    const category = getCategoryBySlug(db, String(request.params.slug ?? ''));
    if (!category) return reply.callNotFound();

    const query = searchQuerySchema.parse(request.query ?? {});
    const results = listBooks(db, {
      ...searchFilters(query, { perPage: PER_PAGE }),
      categoryId: category.id,
    });
    const kept = preservedParams({ ...query, category: [] });
    const basePath = `/categories/${encodeURIComponent(category.slug)}`;

    return reply.render('public/collection', {
      title: category.name,
      heading: category.name,
      lead: category.description,
      results,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (page) => buildUrl(basePath, withParams(kept, { page: page > 1 ? page : undefined })),
      sortUrl: (sort) => buildUrl(basePath, withParams(kept, { sort, page: undefined })),
      query,
      kept,
    });
  });

  // --------------------------------------------------------------- authors
  app.get('/authors', async (request, reply) => {
    const q = typeof request.query?.q === 'string' ? request.query.q.slice(0, 100) : undefined;
    return reply.render('public/authors', {
      title: reply.locals.t('authors.title'),
      authors: listPublicAuthors(db, { q }),
      q,
    });
  });

  app.get('/authors/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id < 1) return reply.callNotFound();

    const author = getAuthorById(db, id);
    if (!author) return reply.callNotFound();

    const query = searchQuerySchema.parse(request.query ?? {});
    const results = listBooks(db, {
      ...searchFilters(query, { perPage: PER_PAGE }),
      authorId: author.id,
    });

    // An author whose every title is archived has no public page.
    if (results.total === 0 && !query.q) {
      const anyPublic = listBooks(db, { authorId: author.id, perPage: 1 }).total;
      if (anyPublic === 0) return reply.callNotFound();
    }

    const kept = preservedParams({ ...query, author: [] });
    const basePath = `/authors/${author.id}`;

    return reply.render('public/collection', {
      title: author.name,
      // The author's name alone. Greek has no gender-neutral way to say
      // "books by X" without knowing whether X is male or female, and
      // "του/της" reads like a form rather than a page.
      heading: reply.locals.t('authors.booksBy', { name: author.name }),
      lead: reply.locals.t('authors.leadForAuthor'),
      results,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (page) => buildUrl(basePath, withParams(kept, { page: page > 1 ? page : undefined })),
      sortUrl: (sort) => buildUrl(basePath, withParams(kept, { sort, page: undefined })),
      query,
      kept,
    });
  });
}

/**
 * A "back to results" link, but only when the visitor actually arrived from a
 * search on this site. Same-origin and path-prefix checked, so the header
 * cannot be used to plant an off-site or arbitrary link on the page.
 */
function refererSearchUrl(request) {
  const referer = request.headers?.referer;
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const host = request.headers.host;
    if (host && url.host !== host) return null;
    if (!['/books', '/categories', '/authors'].some((p) => url.pathname.startsWith(p))) return null;
    if (url.pathname.match(/^\/books\/\d+$/)) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}
