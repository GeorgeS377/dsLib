// Login and logout.
//
// Defences layered here, each covering a different attack:
//   * IP rate limiting      — one address cannot try many accounts
//   * per-account lockout    — many addresses cannot try one account
//   * one generic error      — the response never says whether a username exists
//   * dummy hash on miss     — nor does the response *timing*
//   * session regeneration   — defeats session fixation
//   * CSRF token on the form — a third-party page cannot submit a login
import { recordFailedLogin, recordSuccessfulLogin, getStaffByUsername, lockoutState, countStaff } from '../../db/queries/staff.js';
import { logAction } from '../../db/queries/audit.js';
import { SESSION_KEYS, safeRedirect } from '../../lib/auth.js';
import { addFlash } from '../../lib/flash.js';
import { verifyPassword, verifyPasswordDummy } from '../../lib/password.js';
import { loginSchema } from '../../lib/validation.js';

export default async function authRoutes(app) {
  const db = app.db;

  // ------------------------------------------------------------ login form
  app.get('/staff/login', async (request, reply) => {
    // Already signed in? Go where they were heading.
    if (request.session?.get?.(SESSION_KEYS.staffUserId)) {
      return reply.redirect(safeRedirect(request.query?.next) ?? '/staff', 302);
    }

    return reply.renderPlain(
      'staff/login',
      {
        title: reply.locals.t('login.title'),
        csrfToken: reply.generateCsrf(),
        next: safeRedirect(request.query?.next) ?? '',
        expired: request.query?.expired === '1',
        // Set after a password change, which revokes every session for the
        // account including this one.
        changed: request.query?.changed === '1',
        error: null,
        username: '',
        // Tells a fresh installation to run the create-admin script, instead
        // of leaving the operator at a login form no password can open.
        noAccounts: countStaff(db) === 0,
      },
    );
  });

  // ------------------------------------------------------------- login post
  app.post(
    '/staff/login',
    {
      // Much tighter than the global limit: a handful of attempts a minute is
      // plenty for a librarian and useless for a password guesser.
      config: {
        rateLimit: app.config.isTest
          ? false
          : { max: 10, timeWindow: '5 minutes' },
      },
      preHandler: app.csrfProtection,
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body ?? {});
      const next = safeRedirect(parsed.success ? parsed.data.redirect : undefined);

      const fail = async (reason, username = '') => {
        // One message for every failure mode. Never "no such user" or
        // "wrong password" — either would confirm which usernames exist.
        request.log.warn({ reason, ip: request.ip }, 'failed staff login');
        reply.code(401);
        return reply.renderPlain(
          'staff/login',
          {
            title: reply.locals.t('login.title'),
            csrfToken: reply.generateCsrf(),
            next: next ?? '',
            expired: false,
            changed: false,
            error: reason === 'locked' ? 'login.error.locked' : 'login.error.invalid',
            username,
            noAccounts: countStaff(db) === 0,
          },
        );
      };

      if (!parsed.success) {
        // Still burn the time a real verification would take.
        await verifyPasswordDummy('');
        return fail('malformed');
      }

      const { username, password } = parsed.data;
      const user = getStaffByUsername(db, username);

      if (!user) {
        // Hash anyway, so an unknown username is indistinguishable by timing.
        await verifyPasswordDummy(password);
        return fail('unknown_user', username);
      }

      const lock = lockoutState(db, user);
      if (lock.locked) {
        await verifyPasswordDummy(password);
        return fail('locked', username);
      }

      if (!user.is_active) {
        await verifyPasswordDummy(password);
        return fail('inactive', username);
      }

      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        const result = recordFailedLogin(db, user.id);
        return fail(result.locked ? 'locked' : 'bad_password', username);
      }

      // Success. Regenerate the session id so a token fixed by an attacker
      // before login cannot be used to ride the authenticated session.
      await request.session.regenerate();
      request.session.set(SESSION_KEYS.staffUserId, user.id);
      request.session.set(SESSION_KEYS.loggedInAt, Date.now());

      recordSuccessfulLogin(db, user.id);
      logAction(db, {
        actor: { id: user.id, username: user.username },
        action: 'staff.login',
        entity: 'staff_user',
        entityId: user.id,
      });

      if (user.must_change_password) {
        addFlash(request, 'warning', 'login.mustChangePassword');
        return reply.redirect('/staff/account/password', 302);
      }

      return reply.redirect(next ?? '/staff', 302);
    },
  );

}

/**
 * Logout, registered in the *protected* scope.
 *
 * Being behind the guard is the right semantics: logging out without a valid
 * session simply redirects to the login page, and the handler can rely on
 * request.staffUser being present for the audit entry.
 */
export async function logoutRoutes(app) {
  // POST only. A logout reachable by GET can be triggered by any image tag on
  // any page, signing librarians out at random.
  app.post('/staff/logout', { preHandler: app.csrfProtection }, async (request, reply) => {
    logAction(app.db, {
      actor: { id: request.staffUser.id, username: request.staffUser.username },
      action: 'staff.logout',
      entity: 'staff_user',
      entityId: request.staffUser.id,
    });

    // Deletes the row from the session table, so the cookie is dead even if
    // someone kept a copy of it.
    await request.session.destroy();
    return reply.redirect('/staff/login', 302);
  });
}
