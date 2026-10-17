// Catalogue management: create, edit, archive and delete titles.
//
// Every handler re-validates on the server. Every mutation is a POST guarded
// by a CSRF token, ends in a redirect with a flash message (so a refresh does
// not repeat it), and is written to the audit log.
import { logAction } from '../../db/queries/audit.js';
import {
  archiveBook,
  createBook,
  deleteBook,
  describeBookDeletability,
  distinctLanguages,
  findBookByIsbn13,
  getBookById,
  listBooks,
  setBookCover,
  unarchiveBook,
  updateBook,
} from '../../db/queries/books.js';
import { listAllCategories } from '../../db/queries/categories.js';
import { addFlash } from '../../lib/flash.js';
import { buildUrl, pageWindow, resultRange, withParams } from '../../lib/urls.js';
import { parseCropFields, removeCoverFiles, storeCoverImage } from '../../lib/upload.js';
import { bookFormSchema, parseForm, parseIsbn } from '../../lib/validation.js';

const PER_PAGE = 25;

export default async function staffBookRoutes(app) {
  const db = app.db;
  const csrf = { preHandler: app.csrfProtection };

  /**
   * Store the cover that came with a submitted form, if one did.
   *
   * Shared by all three ways a cover arrives — creating a title, editing one,
   * and the standalone upload the first interface still uses — so the audit
   * entry, the crop and the deletion of the file being replaced happen the
   * same way whichever door it came through.
   *
   * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
   *   `reason: 'empty'` when the form carried no file at all.
   */
  async function saveCover(request, book) {
    // multipart is registered with attachFieldsToBody: 'keyValues', so a file
    // arrives as a Buffer already capped at maxUploadBytes.
    const uploaded = request.body?.cover;
    if (!Buffer.isBuffer(uploaded) || uploaded.length === 0) {
      return { ok: false, reason: 'empty' };
    }

    const stored = await storeCoverImage(uploaded, {
      uploadDir: app.config.uploadDir,
      maxBytes: app.config.maxUploadBytes,
      crop: parseCropFields(request.body),
    });
    if (!stored.ok) {
      if (stored.error) request.log.error({ err: stored.error }, 'cover upload failed');
      return stored;
    }

    // Point the record at the new files first, then delete the old ones —
    // never the other way round, so a failure cannot leave the record naming
    // a file that is gone.
    const previous = [book.cover_path, book.cover_thumb_path].filter(Boolean);
    setBookCover(db, book.id, { coverPath: stored.coverPath, thumbPath: stored.thumbPath });
    await removeCoverFiles(app.config.uploadDir, ...previous);

    logAction(db, {
      actor: request.staffUser,
      action: 'book.cover.replace',
      entity: 'book',
      entityId: book.id,
    });

    return { ok: true };
  }

  // ------------------------------------------------------------------- list
  app.get('/staff/books', async (request, reply) => {
    const q = typeof request.query?.q === 'string' ? request.query.q.slice(0, 200) : undefined;
    const archived = request.query?.archived === 'only' ? 'only' : undefined;
    const page = Number(request.query?.page) || 1;
    const sort = typeof request.query?.sort === 'string' ? request.query.sort : 'title';

    const results = listBooks(db, {
      q,
      sort,
      page,
      perPage: PER_PAGE,
      archived,
      // Staff see archived titles when they ask; the default view hides them
      // so the list mirrors what the public catalogue contains.
      includeArchived: archived === 'only',
    });

    const kept = { q, archived, sort };
    return reply.renderStaff('staff/book-list', {
      title: reply.locals.t('staff.books.title'),
      results,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (p) => buildUrl('/staff/books', withParams(kept, { page: p > 1 ? p : undefined })),
      query: { q, archived, sort },
      kept,
    });
  });

  // ------------------------------------------------------------- new / edit
  app.get('/staff/books/new', async (_request, reply) =>
    reply.renderStaff('staff/book-form', {
      title: reply.locals.t('staff.books.new'),
      book: null,
      values: emptyValues(),
      errors: {},
      categories: listAllCategories(db),
      languages: distinctLanguages(db),
    }),
  );

  app.get('/staff/books/:id', async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    return reply.renderStaff('staff/book-form', {
      title: book.title,
      book,
      values: valuesFromBook(book),
      errors: {},
      categories: listAllCategories(db),
      languages: distinctLanguages(db),
      deletability: describeBookDeletability(db, book.id),
    });
  });

  // ----------------------------------------------------------------- create
  app.post('/staff/books', csrf, async (request, reply) => {
    const parsed = parseForm(bookFormSchema, request.body);
    if (!parsed.ok) {
      return rerenderForm(reply, { book: null, body: request.body, errors: parsed.errors });
    }

    const isbn = parseIsbn(parsed.data.isbn);
    if (!isbn.ok) {
      return rerenderForm(reply, {
        book: null,
        body: request.body,
        errors: { isbn: 'invalid_isbn' },
      });
    }

    // An ISBN identifies an edition, so warn rather than silently create a
    // second record for the same book.
    if (isbn.isbn13) {
      const existing = findBookByIsbn13(db, isbn.isbn13);
      if (existing) {
        return rerenderForm(reply, {
          book: null,
          body: request.body,
          errors: { isbn: 'duplicate_isbn' },
          duplicate: existing,
        });
      }
    }

    const id = createBook(db, {
      ...parsed.data,
      isbn13: isbn.isbn13,
      isbn10: isbn.isbn10,
    });

    logAction(db, {
      actor: request.staffUser,
      action: 'book.create',
      entity: 'book',
      entityId: id,
      detail: { title: parsed.data.title },
    });

    addFlash(request, 'success', 'staff.books.created', { title: parsed.data.title });

    // The cover rides along with the title now. If it fails, the title still
    // stands: a bad JPEG must not throw away metadata that was just typed in.
    const cover = await saveCover(request, { id, cover_path: null, cover_thumb_path: null });
    if (!cover.ok && cover.reason !== 'empty') {
      addFlash(request, 'error', `staff.cover.error.${cover.reason}`);
    }

    // Straight to copies: a title with no copies is invisible as "available",
    // so this is almost always the next thing the librarian needs.
    return reply.redirect(`/staff/books/${id}/copies`, 302);
  });

  // ----------------------------------------------------------------- update
  app.post('/staff/books/:id', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    const parsed = parseForm(bookFormSchema, request.body);
    if (!parsed.ok) {
      return rerenderForm(reply, { book, body: request.body, errors: parsed.errors });
    }

    const isbn = parseIsbn(parsed.data.isbn);
    if (!isbn.ok) {
      return rerenderForm(reply, { book, body: request.body, errors: { isbn: 'invalid_isbn' } });
    }
    if (isbn.isbn13) {
      const existing = findBookByIsbn13(db, isbn.isbn13, { excludeId: book.id });
      if (existing) {
        return rerenderForm(reply, {
          book,
          body: request.body,
          errors: { isbn: 'duplicate_isbn' },
          duplicate: existing,
        });
      }
    }

    updateBook(db, book.id, {
      ...parsed.data,
      isbn13: isbn.isbn13,
      isbn10: isbn.isbn10,
    });

    logAction(db, {
      actor: request.staffUser,
      action: 'book.update',
      entity: 'book',
      entityId: book.id,
      detail: { title: parsed.data.title },
    });

    addFlash(request, 'success', 'staff.books.saved', { title: parsed.data.title });

    // An empty cover field means "leave the cover alone", not "clear it".
    const cover = await saveCover(request, book);
    if (!cover.ok && cover.reason !== 'empty') {
      addFlash(request, 'error', `staff.cover.error.${cover.reason}`);
    }

    return reply.redirect(`/staff/books/${book.id}`, 302);
  });

  // ------------------------------------------------------------ cover image
  app.post('/staff/books/:id/cover', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    // Kept for the first interface, which uploads a cover on its own rather
    // than alongside the title.
    const cover = await saveCover(request, book);
    if (!cover.ok) {
      addFlash(request, 'error', `staff.cover.error.${cover.reason}`);
      return reply.redirect(`/staff/books/${book.id}`, 302);
    }

    addFlash(request, 'success', 'staff.cover.saved');
    return reply.redirect(`/staff/books/${book.id}`, 302);
  });

  app.post('/staff/books/:id/cover/delete', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    setBookCover(db, book.id, { coverPath: null, thumbPath: null });
    await removeCoverFiles(
      app.config.uploadDir,
      ...[book.cover_path, book.cover_thumb_path].filter(Boolean),
    );

    logAction(db, {
      actor: request.staffUser,
      action: 'book.cover.delete',
      entity: 'book',
      entityId: book.id,
    });

    addFlash(request, 'success', 'staff.cover.removed');
    return reply.redirect(`/staff/books/${book.id}`, 302);
  });

  // ------------------------------------------------------ archive / restore
  app.post('/staff/books/:id/archive', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    archiveBook(db, book.id);
    logAction(db, {
      actor: request.staffUser,
      action: 'book.archive',
      entity: 'book',
      entityId: book.id,
      detail: { title: book.title },
    });

    addFlash(request, 'success', 'staff.books.archived', { title: book.title });
    return reply.redirect(`/staff/books/${book.id}`, 302);
  });

  app.post('/staff/books/:id/unarchive', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    unarchiveBook(db, book.id);
    logAction(db, {
      actor: request.staffUser,
      action: 'book.unarchive',
      entity: 'book',
      entityId: book.id,
      detail: { title: book.title },
    });

    addFlash(request, 'success', 'staff.books.restored', { title: book.title });
    return reply.redirect(`/staff/books/${book.id}`, 302);
  });

  // ------------------------------------------------- delete (confirm first)
  // A GET confirmation page, so the destructive action always takes two
  // deliberate steps and works without JavaScript.
  app.get('/staff/books/:id/delete', async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    return reply.renderStaff('staff/book-delete', {
      title: reply.locals.t('staff.books.deleteTitle'),
      book,
      deletability: describeBookDeletability(db, book.id),
    });
  });

  app.post('/staff/books/:id/delete', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    const { deletable, reason } = describeBookDeletability(db, book.id);
    if (!deletable) {
      // Refuse and explain; the confirmation page offers archiving instead.
      addFlash(request, 'error', `staff.books.deleteBlocked.${reason}`);
      return reply.redirect(`/staff/books/${book.id}`, 302);
    }

    const covers = [book.cover_path, book.cover_thumb_path].filter(Boolean);
    deleteBook(db, book.id);
    await removeCoverFiles(app.config.uploadDir, ...covers);

    logAction(db, {
      actor: request.staffUser,
      action: 'book.delete',
      entity: 'book',
      entityId: book.id,
      detail: { title: book.title },
    });

    addFlash(request, 'success', 'staff.books.deleted', { title: book.title });
    return reply.redirect('/staff/books', 302);
  });

  // ------------------------------------------------------------- helpers
  function rerenderForm(reply, { book, body, errors, duplicate }) {
    reply.code(422);
    return reply.renderStaff('staff/book-form', {
      title: book ? book.title : reply.locals.t('staff.books.new'),
      book,
      // Re-render with what the librarian typed, so nothing is lost.
      values: valuesFromBody(body),
      errors,
      duplicate,
      categories: listAllCategories(db),
      languages: distinctLanguages(db),
      deletability: book ? describeBookDeletability(db, book.id) : undefined,
    });
  }
}

/** Load a title by id, including archived ones (staff may edit those). */
function loadBook(db, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return undefined;
  return getBookById(db, id, { includeArchived: true });
}

function emptyValues() {
  return {
    title: '',
    subtitle: '',
    isbn: '',
    publisher: '',
    publication_year: '',
    edition: '',
    language: '',
    description: '',
    authors: [''],
    categories: [],
  };
}

function valuesFromBook(book) {
  return {
    title: book.title ?? '',
    subtitle: book.subtitle ?? '',
    isbn: book.isbn13 ?? book.isbn10 ?? '',
    publisher: book.publisher ?? '',
    publication_year: book.publication_year ?? '',
    edition: book.edition ?? '',
    language: book.language ?? '',
    description: book.description ?? '',
    authors: book.authors.length > 0 ? book.authors.map((a) => a.name) : [''],
    categories: book.categories.map((c) => c.id),
  };
}

/** Rebuild form values from a rejected submission. */
function valuesFromBody(body = {}) {
  // Blank author rows are dropped before re-rendering. The form always adds
  // one spare row, so echoing back the blank rows the browser posted made the
  // form grow by a row on every rejected submission.
  const authors = []
    .concat(body.authors ?? [])
    .filter((name) => String(name).trim() !== '');
  const categories = body.categories === undefined ? [] : [].concat(body.categories);
  return {
    title: body.title ?? '',
    subtitle: body.subtitle ?? '',
    isbn: body.isbn ?? '',
    publisher: body.publisher ?? '',
    publication_year: body.publication_year ?? '',
    edition: body.edition ?? '',
    language: body.language ?? '',
    description: body.description ?? '',
    authors: authors.length > 0 ? authors : [''],
    categories: categories.map(Number).filter(Number.isInteger),
  };
}
