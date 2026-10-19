// First-run setup in the browser.
//
// The deployment this is written for has two people in it. An admin clones
// the repository, writes `.env`, starts the service and puts Nginx in front —
// all of which needs a shell. Then they send a teacher the link, and the
// teacher does everything about the *library*: what it is called, what icon
// it wears, which categories it files books under, how long a child keeps a
// book, and the account they will sign in with from then on.
//
// == Why there is no code in the link ==
//
// The obvious objection is that an open setup page lets whoever finds the new
// address first claim the administrator account. The answer, and it is the
// right one, is that a freshly deployed library holds nothing: no catalogue,
// no borrowers, no names. The worst a stranger can do is leave the teacher
// wondering why setup is already finished, which an admin fixes with
// create-admin and a deactivation.
//
// So it is a plain link, with nothing to copy off the server. What this file
// must get right instead is that the page stops existing the moment the
// library has an account — and that a claim is *visible*, through the audit
// log and the line the server prints at boot, rather than silent.
//
// == Why the steps are in this order ==
//
// Each step writes what it collected and redirects to the next, so an
// interrupted setup resumes: nothing is held in the session, and every step
// prefills from what is already saved. Creating the account comes last
// because it is the only irreversible act in the sequence, and because a
// refused password must not be able to lose the name, the icon or the
// categories that came before it.
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listAllCategories,
} from '../db/queries/categories.js';
import { logAction } from '../db/queries/audit.js';
import { createAnnouncement } from '../db/queries/announcements.js';
import { getSetting } from '../db/queries/settings.js';
import { claimFirstAdmin, countStaff } from '../db/queries/staff.js';
import { now } from '../db/index.js';
import { SESSION_KEYS } from '../lib/auth.js';
import { MIN_PASSWORD_LENGTH, checkPasswordStrength, hashPassword } from '../lib/password.js';
import { SETTING_KEYS, defaultLoanDays, saveSetting } from '../lib/settings.js';
import { UI_COOKIE } from '../lib/ui-flavour.js';
import { parseCropFields, storeBrandIcon } from '../lib/upload.js';
import {
  catalogueSetupSchema,
  fieldErrors,
  librarySetupSchema,
  staffUserFormSchema,
} from '../lib/validation.js';

/*
  The list the teacher starts from.

  Short on purpose. A long checklist invites picking rather than thinking, and
  what a school shelves is not something this file can know — so these are
  four obvious ones to delete from, not a taxonomy to adopt.
*/
export const STARTER_CATEGORIES = ['Λογοτεχνία', 'Ιστορία', 'Επιστήμες', 'Παιδικά'];

/**
 * Is the library still unclaimed?
 *
 * Staff accounts, not the `setup_completed_at` stamp, because the condition
 * that matters is "can anybody sign in" and that cannot drift from the truth.
 * A stamp could be missing on a library somebody made an account in by hand,
 * or present on one whose accounts were all deleted.
 */
export function isSetupOpen(db) {
  return countStaff(db) === 0;
}

export default async function setupRoutes(app) {
  const db = app.db;

  /*
    One guard, as a hook on the whole scope, rather than a check at the top of
    each handler. A forgotten check in a file like this is not a bug, it is an
    administrator factory open to the internet — so the safe arrangement is
    the one where adding a route cannot forget it.
  */
  app.addHook('preHandler', async (_request, reply) => {
    if (!isSetupOpen(db)) return reply.redirect('/staff/login', 302);
    return undefined;
  });

  // Tighter than the global limit, in the same spirit as the login form: a
  // teacher needs a handful of submissions and nothing else does.
  const rateLimit = {
    config: {
      rateLimit: app.config.isTest ? false : { max: 30, timeWindow: '5 minutes' },
    },
  };

  app.get('/setup', async (_request, reply) => reply.redirect('/setup/library', 302));

  // ----------------------------------------------- step 1: name and icon
  app.get('/setup/library', async (_request, reply) =>
    renderLibraryStep(reply, { name: storedName() }),
  );

  app.post(
    '/setup/library',
    { ...rateLimit, preHandler: app.csrfProtection },
    async (request, reply) => {
      const body = request.body ?? {};
      const parsed = librarySetupSchema.safeParse({ library_name: body.library_name });

      if (!parsed.success) {
        return renderLibraryStep(reply, {
          name: typeof body.library_name === 'string' ? body.library_name : '',
          nameError: parsed.error.issues[0]?.message ?? 'invalid',
        });
      }

      // The name is saved before the icon is even looked at, so a refused
      // image cannot cost the teacher the thing they typed. The re-render
      // below then finds the name already stored.
      saveSetting(db, SETTING_KEYS.libraryName, parsed.data.library_name);

      const upload = body.icon;
      if (Buffer.isBuffer(upload) && upload.length > 0) {
        const stored = await storeBrandIcon(upload, {
          uploadDir: app.config.uploadDir,
          maxBytes: app.config.maxUploadBytes,
          crop: parseCropFields(body),
        });

        if (!stored.ok) {
          return renderLibraryStep(reply, {
            name: parsed.data.library_name,
            iconError: stored.reason,
          });
        }
        saveSetting(db, SETTING_KEYS.libraryIcon, stored.iconName);
      }

      return reply.redirect('/setup/catalogue', 302);
    },
  );

  /** Render step 1, with whatever is already known and whatever went wrong. */
  function renderLibraryStep(reply, { name = '', nameError = null, iconError = null } = {}) {
    return reply.renderSetup('setup/step-library', {
      title: reply.locals.t('setup.library.title'),
      csrfToken: reply.generateCsrf(),
      step: 1,
      name,
      nameError,
      iconError,
      maxUploadMb: Math.round(app.config.maxUploadBytes / (1024 * 1024)),
    });
  }

  // ------------------------------------- step 2: categories and loan period
  //
  // The categories are a list the teacher builds, not a menu they pick from.
  // A few are there to begin with so the page is not an empty box, each goes
  // with its ×, and the field adds whatever this school actually shelves.
  //
  // All three things the step can do — add, remove, continue — are submit
  // buttons in one form, and there is no JavaScript behind any of them. The
  // only thing an enhancement could buy is skipping one round trip on a page
  // a school sees once; the shortcut it invites — striking a chip out of the
  // DOM without telling the server — would put a list on screen that
  // disagrees with the list in the database.
  app.get('/setup/catalogue', async (_request, reply) => {
    seedStarterCategories();
    return renderCatalogueStep(reply);
  });

  app.post(
    '/setup/catalogue',
    { ...rateLimit, preHandler: app.csrfProtection },
    async (request, reply) => {
      const body = request.body ?? {};

      if (body.add !== undefined) {
        const name = typeof body.category_name === 'string' ? body.category_name.trim() : '';
        // Nothing typed is not a mistake worth a message: the teacher pressed
        // the button to see what it did.
        if (name === '') return renderCatalogueStep(reply);

        const created = createCategory(db, { name });
        return renderCatalogueStep(reply, {
          categoryError: created.ok ? null : created.reason,
          categoryName: created.ok ? '' : name,
          // Back in the box they were just typing in, so adding three
          // subjects is type-enter-type-enter rather than type-enter-reach.
          focusAdd: true,
        });
      }

      if (body.remove !== undefined) {
        // Straight off a form, so: a number, and one that is really a
        // category. Anything else re-renders untouched rather than erroring —
        // a stale × from a page left open is not worth a failure page.
        const id = Number(body.remove);
        if (Number.isInteger(id) && getCategoryById(db, id)) deleteCategory(db, id);
        return renderCatalogueStep(reply);
      }

      const parsed = catalogueSetupSchema.safeParse({ loan_days: body.loan_days });
      if (!parsed.success) {
        return renderCatalogueStep(reply, {
          loanDays: typeof body.loan_days === 'string' ? body.loan_days : '',
          loanError: parsed.error.issues[0]?.message ?? 'invalid',
        });
      }

      saveSetting(db, SETTING_KEYS.defaultLoanDays, String(parsed.data.loan_days));
      return reply.redirect('/setup/account', 302);
    },
  );

  /**
   * Put a few categories in place, once.
   *
   * Only when there are none at all, so a teacher who removes Ιστορία does
   * not find it back on the next page load — which is exactly what a
   * "create the defaults if missing" rule would have done.
   */
  function seedStarterCategories() {
    if (listAllCategories(db).length > 0) return;
    for (const name of STARTER_CATEGORIES) createCategory(db, { name });
  }

  function renderCatalogueStep(
    reply,
    {
      categoryError = null,
      categoryName = '',
      loanDays = null,
      loanError = null,
      focusAdd = false,
    } = {},
  ) {
    return reply.renderSetup('setup/step-catalogue', {
      title: reply.locals.t('setup.catalogue.title'),
      csrfToken: reply.generateCsrf(),
      step: 2,
      categories: listAllCategories(db),
      categoryError,
      categoryName,
      loanDays: loanDays ?? String(defaultLoanDays(db, app.config)),
      loanError,
      focusAdd,
    });
  }

  // ---------------------------------------------------- step 3: the account
  //
  // Last, and alone, because it is the only thing here that cannot be undone
  // — and because it is what closes the page. Everything before it is a
  // setting a librarian can change later from Ρυθμίσεις.
  app.get('/setup/account', async (_request, reply) => renderAccountStep(reply));

  app.post(
    '/setup/account',
    { ...rateLimit, preHandler: app.csrfProtection },
    async (request, reply) => {
      const body = request.body ?? {};
      const values = {
        username: typeof body.username === 'string' ? body.username.trim() : '',
        display_name: typeof body.display_name === 'string' ? body.display_name.trim() : '',
      };

      // The wizard asks for no email: it is optional on an account, the step
      // already has four boxes, and it can be added later on the account page.
      const parsed = staffUserFormSchema.safeParse({
        ...values,
        role: 'admin',
        is_active: true,
      });

      if (!parsed.success) {
        return renderAccountStep(reply, { values, errors: fieldErrors(parsed.error) });
      }

      const password = typeof body.password === 'string' ? body.password : '';
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        return renderAccountStep(reply, { values, errors: { password: strength.reason } });
      }
      if (password !== body.password_confirm) {
        return renderAccountStep(reply, { values, errors: { password_confirm: 'mismatch' } });
      }

      // Hashed out here so the claim below is one uninterrupted transaction.
      const passwordHash = await hashPassword(password);
      const claimed = claimFirstAdmin(db, {
        username: parsed.data.username,
        displayName: parsed.data.display_name,
        passwordHash,
      });

      if (!claimed.ok) {
        // Somebody else finished setup while this form was open. There is
        // nothing to fix and nothing to explain: the library has an account
        // now, and the sign-in page is where that leads.
        if (claimed.reason === 'already_claimed') return reply.redirect('/staff/login', 302);
        return renderAccountStep(reply, { values, errors: { username: claimed.reason } });
      }

      logAction(db, {
        actor: { id: claimed.id, username: parsed.data.username },
        action: 'staff.create',
        entity: 'staff_user',
        entityId: claimed.id,
        // `via` and the address are what make a claim visible: if a stranger
        // got to the link before the teacher, this row is how anyone finds out.
        detail: { role: 'admin', via: 'setup', ip: request.ip },
      });

      saveSetting(db, SETTING_KEYS.setupCompletedAt, now());

      // A ready-made notice so the public page is not blank on day one.
      // The librarian can edit the text or delete it from Ρυθμίσεις → Ανακοινώσεις.
      createAnnouncement(db, {
        title: 'Καλωσήρθατε στην βιβλιοθήκη σας!',
        body: 'Μπορείτε να επεξεργαστείτε αυτήν την ανακοίνωση στις ρυθμίσεις.',
        isPublished: true,
      });

      // Straight in. Sending a teacher who has just chosen a password to a
      // login form to type it again would be asking them to prove they were
      // paying attention.
      await request.session.regenerate();
      request.session.set(SESSION_KEYS.staffUserId, claimed.id);
      request.session.set(SESSION_KEYS.loggedInAt, Date.now());

      // They set this library up in the new interface; dropping them into the
      // old one on the next page would read as a different application.
      reply.setCookie(UI_COOKIE, 'next', {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: app.config.isProduction,
        maxAge: 365 * 24 * 60 * 60,
      });

      return reply.redirect('/staff', 302);
    },
  );

  function renderAccountStep(reply, { values = { username: '', display_name: '' }, errors = {} } = {}) {
    return reply.renderSetup('setup/step-account', {
      title: reply.locals.t('setup.account.title'),
      csrfToken: reply.generateCsrf(),
      step: 3,
      values,
      errors,
      minPasswordLength: MIN_PASSWORD_LENGTH,
    });
  }

  /**
   * The name already saved, or empty.
   *
   * The stored row, read directly, rather than the resolved name: on a fresh
   * library nothing is stored and the box must come up empty so the example
   * placeholder shows. Resolving would hand back "Σχολική Βιβλιοθήκη" from
   * the environment and invite a teacher to press Συνέχεια, leaving the
   * library named after the software.
   */
  function storedName() {
    return getSetting(db, SETTING_KEYS.libraryName) ?? '';
  }
}
