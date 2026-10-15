// Circulation: checking copies out and back in.
//
// Borrower names appear on these pages. They are reachable only inside the
// authenticated staff scope, and no public template reads the loan or borrower
// tables — test/privacy.test.js asserts that.
import { logAction } from '../../db/queries/audit.js';
import {
  findOrCreateBorrower,
  getBorrowerById,
  listBorrowerOptions,
  suggestBorrowers,
} from '../../db/queries/borrowers.js';
import { findLendableTitles, getCopyByBarcode, getCopyById } from '../../db/queries/copies.js';
import {
  checkIn,
  checkInByBarcode,
  checkOut,
  getLoanById,
  listLoans,
  renewLoan,
} from '../../db/queries/loans.js';
import { safeRedirect } from '../../lib/auth.js';
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
    const q = typeof request.query?.q === 'string' ? request.query.q.slice(0, 200) : '';

    const results = listLoans(db, { status, page, borrowerId, bookId, q, perPage: 30 });
    // The search travels with every link on the page, so changing the status
    // filter narrows what you were already looking at rather than starting over.
    const kept = { status, borrower: borrowerId, book: bookId, q: q || undefined };

    return reply.renderStaff('staff/loans', {
      title: reply.locals.t('staff.loans.title'),
      results,
      status,
      statuses: STATUSES,
      range: resultRange(results),
      pages: pageWindow(results.page, results.totalPages),
      pageUrl: (p) => buildUrl('/staff/loans', withParams(kept, { page: p > 1 ? p : undefined })),
      q,
      statusUrl: (s) => buildUrl('/staff/loans', withParams(kept, { status: s, page: undefined })),
      borrower: borrowerId ? getBorrowerById(db, borrowerId) : null,
    });
  });

  // -------------------------------------------------------------- checkout
  //
  // The desk builds up a selection of copies and then says who is taking
  // them, because a student arriving with three books is one transaction, not
  // three. Copies accumulate in the query string (?copy=1&copy=2), so the
  // selection survives a new search and needs no JavaScript.
  app.get('/staff/loans/checkout', async (request, reply) => {
    // Three ways to add a copy, in the order a desk actually uses them:
    //   copy=<id>  picked from the search results below
    //   barcode=   typed or scanned
    //   q=         searched by title or author
    const barcode = typeof request.query?.barcode === 'string' ? request.query.barcode : '';
    const searchTerm = typeof request.query?.q === 'string' ? request.query.q.slice(0, 200) : '';

    const ids = idsFrom(request.query?.copy);
    if (barcode) {
      const scanned = getCopyByBarcode(db, barcode);
      if (scanned) ids.push(scanned.id);
    }

    const selected = loadSelection(db, ids);

    // Nothing chosen, nothing searched for, nothing scanned: this page can do
    // nothing from here that the search cannot do better, and two places to
    // start the same job is one too many. Send them to the one that finds
    // readers too.
    //
    // A barcode that matched nothing still belongs here: being told the scan
    // found no copy is the answer to what was asked, and bouncing someone to
    // another page instead of answering is worse than the duplicate was.
    if (selected.length === 0 && !searchTerm && !barcode) {
      return reply.redirect('/staff', 302);
    }

    // The search stays up while copies are selected, so the next book can be
    // added without starting over.
    const matches = searchTerm ? findLendableTitles(db, { q: searchTerm }) : [];

    return reply.renderStaff('staff/checkout', {
      title: reply.locals.t('staff.loans.checkout'),
      barcode,
      searchTerm,
      matches,
      selected,
      selectionUrl: (changes) =>
        buildUrl('/staff/loans/checkout', { q: searchTerm || undefined, ...changes }),
      suggestions: [],
      readers: listBorrowerOptions(db),
      values: {
        barcode,
        borrower_id: '',
        new_borrower_name: '',
        new_borrower_class: '',
        due_date: defaultDue(app.config.defaultLoanDays),
      },
      errors: {},
    });
  });

  app.post('/staff/loans/checkout', csrf, async (request, reply) => {
    const parsed = parseForm(checkoutSchema, request.body);
    if (!parsed.ok) {
      return rerenderCheckout(reply, request.body, parsed.errors);
    }

    const data = parsed.data;

    // Identify the copies: selected by id, or the single one just scanned.
    const ids = [...data.copy_id];
    if (ids.length === 0 && data.barcode) {
      const scanned = getCopyByBarcode(db, data.barcode);
      if (scanned) ids.push(scanned.id);
    }

    const copies = loadSelection(db, ids);
    if (copies.length === 0) {
      return rerenderCheckout(reply, request.body, { barcode: 'copy_not_found' });
    }

    // Identify the borrower: an existing one, or a new record with the two
    // fields the library is allowed to keep.
    let borrowerId = data.borrower_id;
    if (!borrowerId) {
      if (!data.new_borrower_name) {
        return rerenderCheckout(reply, request.body, { borrower_id: 'borrower_required' });
      }
      const created = findOrCreateBorrower(db, {
        displayName: data.new_borrower_name,
        schoolClass: data.new_borrower_class,
      });
      if (!created.ok) {
        return rerenderCheckout(reply, request.body, { new_borrower_name: 'required' });
      }
      borrowerId = created.id;
    }

    // Each copy is lent independently: one copy someone else took in the
    // meantime must not cancel the rest of the student's pile.
    const lent = [];
    const refused = [];
    for (const copy of copies) {
      const result = checkOut(db, {
        copyId: copy.id,
        borrowerId,
        loanDays: app.config.defaultLoanDays,
        dueAt: data.due_date,
        staffUserId: request.staffUser.id,
      });

      if (result.ok) {
        lent.push({ copy, result });
        logAction(db, {
          actor: request.staffUser,
          action: 'loan.checkout',
          entity: 'loan',
          entityId: result.id,
          // The borrower id is enough to trace this; the name is not logged.
          detail: { copyId: copy.id, borrowerId, dueAt: result.dueAt },
        });
      } else {
        refused.push({ copy, reason: result.reason });
      }
    }

    // Nothing went out: no part of this happened, so it can still be
    // corrected in place. The reason goes on the checkout itself — by now a
    // copy is chosen and the barcode lookup field is off screen, so an error
    // attached to it would never be seen.
    if (lent.length === 0) {
      return rerenderCheckout(reply, request.body, { checkout: refused[0].reason });
    }

    const borrower = getBorrowerById(db, borrowerId);

    if (lent.length === 1) {
      addFlash(request, 'success', 'staff.loans.checkedOut', {
        title: lent[0].copy.book_title,
        borrower: borrower.display_name,
        date: lent[0].result.dueAt.slice(0, 10),
      });
    } else {
      addFlash(request, 'success', 'staff.loans.checkedOutMany', {
        count: lent.length,
        borrower: borrower.display_name,
        date: lent[0].result.dueAt.slice(0, 10),
      });
    }

    // Part of it went out, so the refusals cannot be shown as form errors.
    // Each one is named instead, so nothing disappears silently.
    for (const { copy, reason } of refused) {
      addFlash(request, 'error', `staff.loans.refused.${reason}`, {
        copy: copy.barcode || copy.book_title,
      });
    }

    // Back to the search, ready for the next reader in the queue. The empty
    // lending page is not a place to land: it has nothing on it.
    return reply.redirect('/staff', 302);
  });

  // --------------------------------------------------------------- check in
  //
  // The second interface has no page for this and links to it from nowhere:
  // returning a book is an action on a loan, and every loan is already on
  // screen somewhere — the reader's page, the loan list, or the search, which
  // reads a scanned barcode too. A page whose only job was to accept a
  // barcode was a third place to start the same thing, and the emptiest.
  //
  // The route stays because the first interface still has that page and still
  // links to it, and this branch does not change the first interface.
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

    // A return started from a borrower's page comes back to that page rather
    // than dumping the librarian on the loan list. Through safeRedirect, so
    // the field is held to the same rules as the post-login redirect and
    // cannot be turned into an open redirect or a header injection.
    const back = safeRedirect(parsed.data.redirect_to);

    if (!result.ok) {
      addFlash(request, 'error', `staff.loans.error.${result.reason}`);
      return reply.redirect(
        back ??
          (loanId
            ? '/staff/loans'
            : `/staff/loans/checkin?barcode=${encodeURIComponent(barcode ?? '')}`),
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

    return reply.redirect(back ?? (loanId ? '/staff/loans' : '/staff/loans/checkin'), 302);
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
  // Re-render the desk with the selection intact, so a rejected submission
  // never costs the librarian the pile of books they had already gathered.
  function rerenderCheckout(reply, body, errors) {
    reply.code(422);
    const barcode = body?.barcode ?? '';

    const ids = idsFrom(body?.copy_id);
    if (ids.length === 0 && barcode) {
      const scanned = getCopyByBarcode(db, barcode);
      if (scanned) ids.push(scanned.id);
    }

    return reply.renderStaff('staff/checkout', {
      title: reply.locals.t('staff.loans.checkout'),
      barcode,
      searchTerm: '',
      matches: [],
      selected: loadSelection(db, ids),
      selectionUrl: (changes) => buildUrl('/staff/loans/checkout', changes),
      suggestions: body?.new_borrower_name
        ? suggestBorrowers(db, body.new_borrower_name, 5)
        : [],
      readers: listBorrowerOptions(db),
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

/** Copy ids from a query or form value that may be absent, single, or a list. */
function idsFrom(value) {
  return []
    .concat(value ?? [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

/**
 * The selected copies, deduplicated, in the order they were added, each with
 * its current loan — so the desk sees straight away which of them is a
 * problem before naming a borrower.
 */
function loadSelection(db, ids) {
  const selection = [];
  const seen = new Set();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const copy = getCopyById(db, id);
    if (copy) selection.push({ ...copy, open_loan: getOpenLoan(db, copy.id) });
  }

  return selection;
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
