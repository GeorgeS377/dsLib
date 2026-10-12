// Circulation: checking copies out and back in.
//
// Borrower names appear on these pages. They are reachable only inside the
// authenticated staff scope, and no public template reads the loan or borrower
// tables — test/privacy.test.js asserts that.
import { logAction } from '../../db/queries/audit.js';
import {
  findOrCreateBorrower,
  getBorrowerById,
  suggestBorrowers,
} from '../../db/queries/borrowers.js';
import { getCopyByBarcode, getCopyById } from '../../db/queries/copies.js';
import {
  checkIn,
  checkInByBarcode,
  checkOut,
  getLoanById,
  listLoans,
  renewLoan,
} from '../../db/queries/loans.js';
import { addFlash } from '../../lib/flash.js';
import { buildUrl, pageWindow, resultRange, withParams } from '../../lib/urls.js';
import { checkinSchema, checkoutSchema, parseForm } from '../../lib/validation.js';

const STATUSES = ['open', 'overdue', 'returned', 'all'];

export default async function staffLoanRoutes(app) {
  const db = app.db;
  const csrf = { preHandler: app.csrfProtection };

  // ------------------------------------------------------------- loan list
  app.get('/staff/loans', async (request, reply) => {
    const status = STATUSES.includes(request.query?.status) ? request.query.status : 'open';
    const page = Number(request.query?.page) || 1;
    const borrowerId = Number(request.query?.borrower) || undefined;
    const bookId = Number(request.query?.book) || undefined;

    const results = listLoans(db, { status, page, borrowerId, bookId, perPage: 30 });
    const kept = { status, borrower: borrowerId, book: bookId };

    return reply.renderStaff('staff/loans', {
      title: reply.locals.t('staff.loans.title'),
      results,
      status,
      statuses: STATUSES,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (p) => buildUrl('/staff/loans', withParams(kept, { page: p > 1 ? p : undefined })),
      statusUrl: (s) => buildUrl('/staff/loans', { status: s }),
      borrower: borrowerId ? getBorrowerById(db, borrowerId) : null,
    });
  });

  // -------------------------------------------------------------- checkout
  app.get('/staff/loans/checkout', async (request, reply) => {
    // A barcode may arrive in the query from a scanner typing into the URL
    // bar, or from a link on the copies page.
    const barcode = typeof request.query?.barcode === 'string' ? request.query.barcode : '';
    const copy = barcode ? getCopyByBarcode(db, barcode) : undefined;

    return reply.renderStaff('staff/checkout', {
      title: reply.locals.t('staff.loans.checkout'),
      barcode,
      copy,
      openLoan: copy ? getOpenLoan(db, copy.id) : null,
      suggestions: [],
      values: { barcode, borrower_id: '', new_borrower_name: '', new_borrower_class: '', due_date: defaultDue(app.config.defaultLoanDays) },
      errors: {},
    });
  });

  app.post('/staff/loans/checkout', csrf, async (request, reply) => {
    const parsed = parseForm(checkoutSchema, request.body);
    if (!parsed.ok) {
      return rerenderCheckout(reply, request.body, parsed.errors);
    }

    const data = parsed.data;

    // Identify the copy, by id or by barcode.
    const copy = data.copy_id
      ? getCopyById(db, data.copy_id)
      : data.barcode
        ? getCopyByBarcode(db, data.barcode)
        : undefined;

    if (!copy) {
      return rerenderCheckout(reply, request.body, { barcode: 'copy_not_found' });
    }

    // Identify the borrower: an existing one, or a new record with the two
    // fields the library is allowed to keep.
    let borrowerId = data.borrower_id;
    if (!borrowerId) {
      if (!data.new_borrower_name) {
        return rerenderCheckout(reply, request.body, { borrower_id: 'borrower_required' }, copy);
      }
      const created = findOrCreateBorrower(db, {
        displayName: data.new_borrower_name,
        schoolClass: data.new_borrower_class,
      });
      if (!created.ok) {
        return rerenderCheckout(reply, request.body, { new_borrower_name: 'required' }, copy);
      }
      borrowerId = created.id;
    }

    const result = checkOut(db, {
      copyId: copy.id,
      borrowerId,
      loanDays: app.config.defaultLoanDays,
      dueAt: data.due_date,
      staffUserId: request.staffUser.id,
    });

    if (!result.ok) {
      return rerenderCheckout(reply, request.body, { barcode: result.reason }, copy);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'loan.checkout',
      entity: 'loan',
      entityId: result.id,
      // The borrower id is enough to trace this; the name is not logged.
      detail: { copyId: copy.id, borrowerId, dueAt: result.dueAt },
    });

    const borrower = getBorrowerById(db, borrowerId);
    addFlash(request, 'success', 'staff.loans.checkedOut', {
      title: copy.book_title,
      borrower: borrower.display_name,
      date: result.dueAt.slice(0, 10),
    });

    // Back to an empty form, ready for the next book in the queue.
    return reply.redirect('/staff/loans/checkout', 302);
  });

  // --------------------------------------------------------------- check in
  app.get('/staff/loans/checkin', async (request, reply) => {
    const barcode = typeof request.query?.barcode === 'string' ? request.query.barcode : '';
    return reply.renderStaff('staff/checkin', {
      title: reply.locals.t('staff.loans.checkin'),
      barcode,
      errors: {},
      recent: listLoans(db, { status: 'returned', perPage: 5 }).rows,
    });
  });

  app.post('/staff/loans/checkin', csrf, async (request, reply) => {
    const parsed = parseForm(checkinSchema, request.body);
    if (!parsed.ok) {
      addFlash(request, 'error', 'staff.loans.error.barcode_required');
      return reply.redirect('/staff/loans/checkin', 302);
    }

    const { barcode, loan_id: loanId } = parsed.data;
    const result = loanId
      ? checkIn(db, { loanId, staffUserId: request.staffUser.id })
      : checkInByBarcode(db, { barcode, staffUserId: request.staffUser.id });

    if (!result.ok) {
      addFlash(request, 'error', `staff.loans.error.${result.reason}`);
      return reply.redirect(
        loanId ? '/staff/loans' : `/staff/loans/checkin?barcode=${encodeURIComponent(barcode ?? '')}`,
        302,
      );
    }

    const loan = getLoanById(db, result.loanId);
    logAction(db, {
      actor: request.staffUser,
      action: 'loan.checkin',
      entity: 'loan',
      entityId: result.loanId,
      detail: { copyId: loan?.copy_id, wasOverdue: result.wasOverdue },
    });

    addFlash(
      request,
      result.wasOverdue ? 'warning' : 'success',
      result.wasOverdue ? 'staff.loans.returnedLate' : 'staff.loans.returned',
      { title: loan?.book_title ?? '' },
    );

    return reply.redirect(loanId ? '/staff/loans' : '/staff/loans/checkin', 302);
  });

  // ------------------------------------------------------------------ renew
  app.post('/staff/loans/:id/renew', csrf, async (request, reply) => {
    const id = Number(request.params.id);
    const result = renewLoan(db, { loanId: id, loanDays: app.config.defaultLoanDays });

    if (!result.ok) {
      addFlash(request, 'error', `staff.loans.error.${result.reason}`);
      return reply.redirect('/staff/loans', 302);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'loan.renew',
      entity: 'loan',
      entityId: id,
      detail: { dueAt: result.dueAt },
    });

    addFlash(request, 'success', 'staff.loans.renewed', { date: result.dueAt.slice(0, 10) });
    return reply.redirect('/staff/loans', 302);
  });

  // --------------------------------------------------------------- helpers
  function rerenderCheckout(reply, body, errors, copy) {
    reply.code(422);
    const barcode = body?.barcode ?? '';
    const resolvedCopy = copy ?? (barcode ? getCopyByBarcode(db, barcode) : undefined);

    return reply.renderStaff('staff/checkout', {
      title: reply.locals.t('staff.loans.checkout'),
      barcode,
      copy: resolvedCopy,
      openLoan: resolvedCopy ? getOpenLoan(db, resolvedCopy.id) : null,
      suggestions: body?.new_borrower_name
        ? suggestBorrowers(db, body.new_borrower_name, 5)
        : [],
      values: {
        barcode,
        borrower_id: body?.borrower_id ?? '',
        new_borrower_name: body?.new_borrower_name ?? '',
        new_borrower_class: body?.new_borrower_class ?? '',
        due_date: body?.due_date || defaultDue(app.config.defaultLoanDays),
      },
      errors,
    });
  }
}

function getOpenLoan(db, copyId) {
  return db.get(
    `SELECT l.id, l.due_at, b.display_name AS borrower_name, b.school_class
       FROM loan l JOIN borrower b ON b.id = l.borrower_id
      WHERE l.copy_id = ? AND l.returned_at IS NULL`,
    copyId,
  );
}

/** The date the due-date field is pre-filled with. */
function defaultDue(loanDays) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(loanDays));
  return date.toISOString().slice(0, 10);
}
