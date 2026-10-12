// Borrower administration — staff area only.
//
// PRIVACY: a borrower record is a display name and a class, nothing else. The
// form schema is strict about its shape, so a field added to the HTML without
// being added to the schema is ignored rather than stored. See the note at the
// top of migrations/002_circulation.sql before changing what is kept.
//
// Two removal paths are offered, deliberately:
//   anonymize — keeps the loan history, replaces the identifying fields. This
//               is the answer to "please remove my child's data" for a
//               borrower who has used the library.
//   delete    — only for a record with no loans at all.
import { logAction } from '../../db/queries/audit.js';
import {
  ANONYMIZED_NAME,
  anonymizeBorrower,
  createBorrower,
  deleteBorrower,
  distinctClasses,
  getBorrowerById,
  listBorrowers,
  updateBorrower,
} from '../../db/queries/borrowers.js';
import { listLoans } from '../../db/queries/loans.js';
import { addFlash } from '../../lib/flash.js';
import { buildUrl, pageWindow, resultRange, withParams } from '../../lib/urls.js';
import { borrowerFormSchema, parseForm } from '../../lib/validation.js';

export default async function staffBorrowerRoutes(app) {
  const db = app.db;
  const csrf = { preHandler: app.csrfProtection };

  // ---------------------------------------------------------------- list
  app.get('/staff/borrowers', async (request, reply) => {
    const q = typeof request.query?.q === 'string' ? request.query.q.slice(0, 200) : undefined;
    const page = Number(request.query?.page) || 1;

    const results = listBorrowers(db, { q, page, perPage: 30 });
    const kept = { q };

    return reply.renderStaff('staff/borrowers', {
      title: reply.locals.t('staff.borrowers.title'),
      results,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (p) => buildUrl('/staff/borrowers', withParams(kept, { page: p > 1 ? p : undefined })),
      q,
      classes: distinctClasses(db),
      values: { display_name: '', school_class: '', notes: '' },
      errors: {},
      editing: null,
    });
  });

  // -------------------------------------------------------------- one record
  app.get('/staff/borrowers/:id', async (request, reply) => {
    const borrower = loadBorrower(db, request.params.id);
    if (!borrower) return reply.callNotFound();

    return reply.renderStaff('staff/borrower', {
      title: borrower.display_name,
      borrower,
      loans: listLoans(db, { borrowerId: borrower.id, status: 'all', perPage: 50 }),
      values: {
        display_name: borrower.display_name,
        school_class: borrower.school_class ?? '',
        notes: borrower.notes ?? '',
      },
      errors: {},
      classes: distinctClasses(db),
      anonymizedName: ANONYMIZED_NAME,
    });
  });

  // -------------------------------------------------------------- create
  app.post('/staff/borrowers', csrf, async (request, reply) => {
    const parsed = parseForm(borrowerFormSchema, request.body);
    if (!parsed.ok) {
      return rerenderList(reply, request.body, parsed.errors);
    }

    const result = createBorrower(db, {
      displayName: parsed.data.display_name,
      schoolClass: parsed.data.school_class,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      return rerenderList(reply, request.body, { display_name: 'required' });
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'borrower.create',
      entity: 'borrower',
      entityId: result.id,
      // No name in the log: the id is enough to trace the action.
    });

    addFlash(request, 'success', 'staff.borrowers.created');
    return reply.redirect(`/staff/borrowers/${result.id}`, 302);
  });

  // -------------------------------------------------------------- update
  app.post('/staff/borrowers/:id', csrf, async (request, reply) => {
    const borrower = loadBorrower(db, request.params.id);
    if (!borrower) return reply.callNotFound();

    const parsed = parseForm(borrowerFormSchema, request.body);
    if (!parsed.ok) {
      reply.code(422);
      return reply.renderStaff('staff/borrower', {
        title: borrower.display_name,
        borrower,
        loans: listLoans(db, { borrowerId: borrower.id, status: 'all', perPage: 50 }),
        values: {
          display_name: request.body?.display_name ?? '',
          school_class: request.body?.school_class ?? '',
          notes: request.body?.notes ?? '',
        },
        errors: parsed.errors,
        classes: distinctClasses(db),
        anonymizedName: ANONYMIZED_NAME,
      });
    }

    const result = updateBorrower(db, borrower.id, {
      displayName: parsed.data.display_name,
      schoolClass: parsed.data.school_class,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      addFlash(request, 'error', `staff.borrowers.error.${result.reason}`);
      return reply.redirect(`/staff/borrowers/${borrower.id}`, 302);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'borrower.update',
      entity: 'borrower',
      entityId: borrower.id,
    });

    addFlash(request, 'success', 'staff.borrowers.saved');
    return reply.redirect(`/staff/borrowers/${borrower.id}`, 302);
  });

  // ----------------------------------------------------------- anonymize
  app.get('/staff/borrowers/:id/anonymize', async (request, reply) => {
    const borrower = loadBorrower(db, request.params.id);
    if (!borrower) return reply.callNotFound();

    return reply.renderStaff('staff/borrower-anonymize', {
      title: reply.locals.t('staff.borrowers.anonymizeTitle'),
      borrower,
      anonymizedName: ANONYMIZED_NAME,
      loanCount: borrower.total_loans,
    });
  });

  app.post('/staff/borrowers/:id/anonymize', csrf, async (request, reply) => {
    const borrower = loadBorrower(db, request.params.id);
    if (!borrower) return reply.callNotFound();

    const result = anonymizeBorrower(db, borrower.id);
    if (!result.ok) {
      addFlash(request, 'error', `staff.borrowers.error.${result.reason}`);
      return reply.redirect(`/staff/borrowers/${borrower.id}`, 302);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'borrower.anonymize',
      entity: 'borrower',
      entityId: borrower.id,
      detail: { keptLoans: borrower.total_loans },
    });

    addFlash(request, 'success', 'staff.borrowers.anonymized');
    return reply.redirect('/staff/borrowers', 302);
  });

  // -------------------------------------------------------------- delete
  app.get('/staff/borrowers/:id/delete', async (request, reply) => {
    const borrower = loadBorrower(db, request.params.id);
    if (!borrower) return reply.callNotFound();

    return reply.renderStaff('staff/borrower-delete', {
      title: reply.locals.t('staff.borrowers.deleteTitle'),
      borrower,
      canDelete: borrower.total_loans === 0,
    });
  });

  app.post('/staff/borrowers/:id/delete', csrf, async (request, reply) => {
    const borrower = loadBorrower(db, request.params.id);
    if (!borrower) return reply.callNotFound();

    const result = deleteBorrower(db, borrower.id);
    if (!result.ok) {
      // A borrower with history is kept; anonymization is the alternative.
      addFlash(request, 'error', `staff.borrowers.deleteBlocked.${result.reason}`);
      return reply.redirect(`/staff/borrowers/${borrower.id}/anonymize`, 302);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'borrower.delete',
      entity: 'borrower',
      entityId: borrower.id,
    });

    addFlash(request, 'success', 'staff.borrowers.deleted');
    return reply.redirect('/staff/borrowers', 302);
  });

  // ------------------------------------------------------------- helpers
  function rerenderList(reply, body, errors) {
    reply.code(422);
    const results = listBorrowers(db, { page: 1, perPage: 30 });
    return reply.renderStaff('staff/borrowers', {
      title: reply.locals.t('staff.borrowers.title'),
      results,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (p) => buildUrl('/staff/borrowers', { page: p > 1 ? p : undefined }),
      q: undefined,
      classes: distinctClasses(db),
      values: {
        display_name: body?.display_name ?? '',
        school_class: body?.school_class ?? '',
        notes: body?.notes ?? '',
      },
      errors,
      editing: null,
    });
  }
}

function loadBorrower(db, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return undefined;
  return getBorrowerById(db, id);
}
