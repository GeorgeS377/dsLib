// Physical copy management for one title.
//
// Copies are where availability actually comes from, so the rules here are
// strict: a barcode is unique across the whole library, a copy that is out on
// loan cannot be quietly withdrawn, and a copy with loan history cannot be
// deleted — only withdrawn.
import { logAction } from '../../db/queries/audit.js';
import { getBookById } from '../../db/queries/books.js';
import {
  COPY_STATUSES,
  createCopies,
  createCopy,
  deleteCopy,
  describeCopyDeletability,
  getCopyById,
  listCopiesForBook,
  updateCopy,
} from '../../db/queries/copies.js';
import { listLoans } from '../../db/queries/loans.js';
import { addFlash } from '../../lib/flash.js';
import { bulkCopySchema, copyFormSchema, parseForm } from '../../lib/validation.js';

export default async function staffCopyRoutes(app) {
  const db = app.db;
  const csrf = { preHandler: app.csrfProtection };

  // ------------------------------------------------------------- copy list
  app.get('/staff/books/:id/copies', async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    return reply.renderStaff('staff/copies', {
      title: reply.locals.t('staff.copies.title', { title: book.title }),
      book,
      copies: listCopiesForBook(db, book.id),
      statuses: COPY_STATUSES,
      values: { barcode: '', shelf_location: '', status: 'available', notes: '' },
      errors: {},
    });
  });

  // --------------------------------------------------------- add one copy
  app.post('/staff/books/:id/copies', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    const parsed = parseForm(copyFormSchema, request.body);
    if (!parsed.ok) {
      return rerender(reply, book, request.body, parsed.errors);
    }

    const result = createCopy(db, book.id, {
      barcode: parsed.data.barcode,
      shelfLocation: parsed.data.shelf_location,
      status: parsed.data.status,
      notes: parsed.data.notes,
      acquiredAt: parsed.data.acquired_at,
    });

    if (!result.ok) {
      return rerender(reply, book, request.body, { barcode: result.reason });
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'copy.create',
      entity: 'copy',
      entityId: result.id,
      detail: { bookId: book.id },
    });

    addFlash(request, 'success', 'staff.copies.added');
    return reply.redirect(`/staff/books/${book.id}/copies`, 302);
  });

  // ------------------------------------------------------- add many copies
  // For a title the library bought in quantity. Barcodes are per-item, so
  // these are created without one and filled in individually afterwards.
  app.post('/staff/books/:id/copies/bulk', csrf, async (request, reply) => {
    const book = loadBook(db, request.params.id);
    if (!book) return reply.callNotFound();

    const parsed = parseForm(bulkCopySchema, request.body);
    if (!parsed.ok) {
      addFlash(request, 'error', 'staff.copies.error.badCount');
      return reply.redirect(`/staff/books/${book.id}/copies`, 302);
    }

    const ids = createCopies(db, book.id, parsed.data.count, {
      shelfLocation: parsed.data.shelf_location,
    });

    logAction(db, {
      actor: request.staffUser,
      action: 'copy.create.bulk',
      entity: 'book',
      entityId: book.id,
      detail: { count: ids.length },
    });

    addFlash(request, 'success', 'staff.copies.addedMany', { count: ids.length });
    return reply.redirect(`/staff/books/${book.id}/copies`, 302);
  });

  // ------------------------------------------------------------ edit a copy
  app.post('/staff/copies/:copyId', csrf, async (request, reply) => {
    const copy = loadCopy(db, request.params.copyId);
    if (!copy) return reply.callNotFound();

    const parsed = parseForm(copyFormSchema, request.body);
    if (!parsed.ok) {
      addFlash(request, 'error', 'staff.copies.error.invalid');
      return reply.redirect(`/staff/books/${copy.book_id}/copies`, 302);
    }

    const result = updateCopy(db, copy.id, {
      barcode: parsed.data.barcode,
      shelfLocation: parsed.data.shelf_location,
      status: parsed.data.status,
      notes: parsed.data.notes,
      acquiredAt: parsed.data.acquired_at,
    });

    if (!result.ok) {
      // 'on_loan' means the librarian tried to withdraw or write off a copy
      // that someone still has; the loan has to be closed first.
      addFlash(request, 'error', `staff.copies.error.${result.reason}`);
      return reply.redirect(`/staff/books/${copy.book_id}/copies`, 302);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'copy.update',
      entity: 'copy',
      entityId: copy.id,
      detail: { status: parsed.data.status ?? copy.status },
    });

    addFlash(request, 'success', 'staff.copies.saved');
    return reply.redirect(`/staff/books/${copy.book_id}/copies`, 302);
  });

  // ----------------------------------------------- delete (confirm first)
  app.get('/staff/copies/:copyId/delete', async (request, reply) => {
    const copy = loadCopy(db, request.params.copyId);
    if (!copy) return reply.callNotFound();

    return reply.renderStaff('staff/copy-delete', {
      title: reply.locals.t('staff.copies.deleteTitle'),
      copy,
      deletability: describeCopyDeletability(db, copy.id),
      loans: listLoans(db, { copyId: copy.id, perPage: 5 }),
    });
  });

  app.post('/staff/copies/:copyId/delete', csrf, async (request, reply) => {
    const copy = loadCopy(db, request.params.copyId);
    if (!copy) return reply.callNotFound();

    const result = deleteCopy(db, copy.id);
    if (!result.ok) {
      addFlash(request, 'error', `staff.copies.deleteBlocked.${result.reason}`);
      return reply.redirect(`/staff/books/${copy.book_id}/copies`, 302);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'copy.delete',
      entity: 'copy',
      entityId: copy.id,
      detail: { bookId: copy.book_id, barcode: copy.barcode },
    });

    addFlash(request, 'success', 'staff.copies.deleted');
    return reply.redirect(`/staff/books/${copy.book_id}/copies`, 302);
  });

  function rerender(reply, book, body, errors) {
    reply.code(422);
    return reply.renderStaff('staff/copies', {
      title: reply.locals.t('staff.copies.title', { title: book.title }),
      book,
      copies: listCopiesForBook(db, book.id),
      statuses: COPY_STATUSES,
      values: {
        barcode: body?.barcode ?? '',
        shelf_location: body?.shelf_location ?? '',
        status: body?.status ?? 'available',
        notes: body?.notes ?? '',
      },
      errors,
    });
  }
}

function loadBook(db, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return undefined;
  return getBookById(db, id, { includeArchived: true });
}

function loadCopy(db, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return undefined;
  return getCopyById(db, id);
}
