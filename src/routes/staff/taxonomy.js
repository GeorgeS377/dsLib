// Categories and authors.
//
// Both are deduplicated on a normalized name, so the same subject or person
// cannot be entered twice in different casing or accentuation. Where a clash
// is detected the handler explains it rather than creating a near-duplicate.
import { logAction } from '../../db/queries/audit.js';
import {
  deleteAuthorIfUnused,
  listAllAuthors,
  mergeAuthors,
  renameAuthor,
} from '../../db/queries/authors.js';
import { rebuildSearchText } from '../../db/queries/books.js';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listAllCategories,
  updateCategory,
} from '../../db/queries/categories.js';
import { addFlash } from '../../lib/flash.js';
import { authorFormSchema, categoryFormSchema, parseForm } from '../../lib/validation.js';

export default async function staffTaxonomyRoutes(app) {
  const db = app.db;
  const csrf = { preHandler: app.csrfProtection };

  // ========================================================== categories
  app.get('/staff/categories', async (_request, reply) =>
    reply.renderStaff('staff/categories', {
      title: reply.locals.t('staff.categories.title'),
      categories: listAllCategories(db),
      values: { name: '', description: '' },
      errors: {},
      editing: null,
    }),
  );

  app.get('/staff/categories/:id', async (request, reply) => {
    const category = getCategoryById(db, Number(request.params.id));
    if (!category) return reply.callNotFound();

    return reply.renderStaff('staff/categories', {
      title: category.name,
      categories: listAllCategories(db),
      values: { name: category.name, description: category.description ?? '' },
      errors: {},
      editing: category,
    });
  });

  app.post('/staff/categories', csrf, async (request, reply) => {
    const parsed = parseForm(categoryFormSchema, request.body);
    if (!parsed.ok) {
      return rerenderCategories(reply, request.body, parsed.errors, null);
    }

    const result = createCategory(db, parsed.data);
    if (!result.ok) {
      return rerenderCategories(reply, request.body, { name: result.reason }, null, result.existing);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'category.create',
      entity: 'category',
      entityId: result.id,
      detail: { name: parsed.data.name },
    });

    addFlash(request, 'success', 'staff.categories.created', { name: parsed.data.name });
    return reply.redirect('/staff/categories', 302);
  });

  app.post('/staff/categories/:id', csrf, async (request, reply) => {
    const category = getCategoryById(db, Number(request.params.id));
    if (!category) return reply.callNotFound();

    const parsed = parseForm(categoryFormSchema, request.body);
    if (!parsed.ok) {
      return rerenderCategories(reply, request.body, parsed.errors, category);
    }

    const result = updateCategory(db, category.id, parsed.data);
    if (!result.ok) {
      return rerenderCategories(
        reply,
        request.body,
        { name: result.reason },
        category,
        result.existing,
      );
    }

    // The category name is part of every attached title's search index.
    reindexCategoryBooks(db, category.id);

    logAction(db, {
      actor: request.staffUser,
      action: 'category.update',
      entity: 'category',
      entityId: category.id,
      detail: { name: parsed.data.name },
    });

    addFlash(request, 'success', 'staff.categories.saved', { name: parsed.data.name });
    return reply.redirect('/staff/categories', 302);
  });

  app.get('/staff/categories/:id/delete', async (request, reply) => {
    const category = getCategoryById(db, Number(request.params.id));
    if (!category) return reply.callNotFound();

    const bookCount =
      db.value('SELECT COUNT(*) FROM book_category WHERE category_id = ?', category.id) ?? 0;

    return reply.renderStaff('staff/category-delete', {
      title: reply.locals.t('staff.categories.deleteTitle'),
      category,
      bookCount,
    });
  });

  app.post('/staff/categories/:id/delete', csrf, async (request, reply) => {
    const category = getCategoryById(db, Number(request.params.id));
    if (!category) return reply.callNotFound();

    // Collect the affected titles first: after the delete cascades, the join
    // rows are gone and we could no longer find which indexes to rebuild.
    const bookIds = db
      .all('SELECT book_id FROM book_category WHERE category_id = ?', category.id)
      .map((row) => row.book_id);

    const result = deleteCategory(db, category.id);
    for (const bookId of bookIds) rebuildSearchText(db, bookId);

    logAction(db, {
      actor: request.staffUser,
      action: 'category.delete',
      entity: 'category',
      entityId: category.id,
      detail: { name: category.name, detachedBooks: result.detachedBooks },
    });

    addFlash(request, 'success', 'staff.categories.deleted', {
      name: category.name,
      count: result.detachedBooks,
    });
    return reply.redirect('/staff/categories', 302);
  });

  // ============================================================== authors
  app.get('/staff/authors', async (_request, reply) =>
    reply.renderStaff('staff/authors', {
      title: reply.locals.t('staff.authors.title'),
      authors: listAllAuthors(db),
      editing: null,
      values: { name: '' },
      errors: {},
    }),
  );

  app.get('/staff/authors/:id', async (request, reply) => {
    const authors = listAllAuthors(db);
    const author = authors.find((a) => a.id === Number(request.params.id));
    if (!author) return reply.callNotFound();

    return reply.renderStaff('staff/authors', {
      title: author.name,
      authors,
      editing: author,
      values: { name: author.name },
      errors: {},
    });
  });

  app.post('/staff/authors/:id', csrf, async (request, reply) => {
    const author = listAllAuthors(db).find((a) => a.id === Number(request.params.id));
    if (!author) return reply.callNotFound();

    const parsed = parseForm(authorFormSchema, request.body);
    if (!parsed.ok) {
      reply.code(422);
      return reply.renderStaff('staff/authors', {
        title: author.name,
        authors: listAllAuthors(db),
        editing: author,
        values: { name: request.body?.name ?? '' },
        errors: parsed.errors,
      });
    }

    const result = renameAuthor(db, author.id, parsed.data.name);
    if (!result.ok) {
      reply.code(422);
      return reply.renderStaff('staff/authors', {
        title: author.name,
        authors: listAllAuthors(db),
        editing: author,
        values: { name: parsed.data.name },
        errors: { name: 'duplicate' },
        // Offer the merge, which is what the librarian almost certainly wants
        // when two spellings of one person exist.
        mergeTarget: listAllAuthors(db).find((a) => a.id === result.conflictId),
      });
    }

    reindexAuthorBooks(db, author.id);

    logAction(db, {
      actor: request.staffUser,
      action: 'author.rename',
      entity: 'author',
      entityId: author.id,
      detail: { name: parsed.data.name },
    });

    addFlash(request, 'success', 'staff.authors.saved', { name: parsed.data.name });
    return reply.redirect('/staff/authors', 302);
  });

  app.post('/staff/authors/:id/merge', csrf, async (request, reply) => {
    const sourceId = Number(request.params.id);
    const targetId = Number(request.body?.target_id);

    const authors = listAllAuthors(db);
    const source = authors.find((a) => a.id === sourceId);
    const target = authors.find((a) => a.id === targetId);
    if (!source || !target) return reply.callNotFound();

    // Capture the source's titles before the merge moves them.
    const bookIds = db
      .all('SELECT book_id FROM book_author WHERE author_id = ?', sourceId)
      .map((row) => row.book_id);

    const result = mergeAuthors(db, sourceId, targetId);
    if (!result.ok) {
      addFlash(request, 'error', 'staff.authors.mergeFailed');
      return reply.redirect('/staff/authors', 302);
    }

    for (const bookId of bookIds) rebuildSearchText(db, bookId);

    logAction(db, {
      actor: request.staffUser,
      action: 'author.merge',
      entity: 'author',
      entityId: targetId,
      detail: { mergedFrom: sourceId, books: bookIds.length },
    });

    addFlash(request, 'success', 'staff.authors.merged', {
      from: source.name,
      to: target.name,
    });
    return reply.redirect('/staff/authors', 302);
  });

  app.post('/staff/authors/:id/delete', csrf, async (request, reply) => {
    const author = listAllAuthors(db).find((a) => a.id === Number(request.params.id));
    if (!author) return reply.callNotFound();

    const result = deleteAuthorIfUnused(db, author.id);
    if (!result.ok) {
      addFlash(request, 'error', 'staff.authors.deleteBlocked', { count: result.bookCount });
      return reply.redirect('/staff/authors', 302);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'author.delete',
      entity: 'author',
      entityId: author.id,
      detail: { name: author.name },
    });

    addFlash(request, 'success', 'staff.authors.deleted', { name: author.name });
    return reply.redirect('/staff/authors', 302);
  });

  // ------------------------------------------------------------- helpers
  function rerenderCategories(reply, body, errors, editing, existing) {
    reply.code(422);
    return reply.renderStaff('staff/categories', {
      title: reply.locals.t('staff.categories.title'),
      categories: listAllCategories(db),
      values: { name: body?.name ?? '', description: body?.description ?? '' },
      errors,
      editing,
      existing,
    });
  }
}

/** Rebuild the search index of every title in a category. */
function reindexCategoryBooks(db, categoryId) {
  const ids = db
    .all('SELECT book_id FROM book_category WHERE category_id = ?', categoryId)
    .map((row) => row.book_id);
  db.transaction(() => {
    for (const id of ids) rebuildSearchText(db, id);
  });
}

/** Rebuild the search index of every title by an author. */
function reindexAuthorBooks(db, authorId) {
  const ids = db
    .all('SELECT book_id FROM book_author WHERE author_id = ?', authorId)
    .map((row) => row.book_id);
  db.transaction(() => {
    for (const id of ids) rebuildSearchText(db, id);
  });
}
