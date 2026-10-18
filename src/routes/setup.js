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
import { getSetting } from '../db/queries/settings.js';
import { countStaff } from '../db/queries/staff.js';
import { SETTING_KEYS, saveSetting } from '../lib/settings.js';
import { parseCropFields, storeBrandIcon } from '../lib/upload.js';
import { librarySetupSchema } from '../lib/validation.js';

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
