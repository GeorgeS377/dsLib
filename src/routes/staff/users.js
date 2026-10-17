// Staff accounts and the signed-in user's own account page.
//
// Account administration is restricted to the admin role via a second guard
// on this scope — requireStaff has already established who the user is, and
// requireAdmin narrows it. The database additionally refuses to leave the
// library with no active administrator.
import { logAction } from '../../db/queries/audit.js';
import {
  createStaffUser,
  deleteStaffUser,
  getStaffByUsername,
  listStaff,
  setStaffPassword,
  updateStaffUser,
} from '../../db/queries/staff.js';
import { addFlash } from '../../lib/flash.js';
import { MIN_PASSWORD_LENGTH, checkPasswordStrength, verifyPassword } from '../../lib/password.js';
import { parseForm, passwordChangeSchema, staffUserFormSchema } from '../../lib/validation.js';

export default async function staffUserRoutes(app) {
  const db = app.db;
  const csrf = { preHandler: app.csrfProtection };

  // ============================================= the signed-in user's own
  // Available to every librarian: their own details and password.
  app.get('/staff/account', async (request, reply) =>
    reply.renderStaff('staff/account', {
      title: reply.locals.t('staff.account.title'),
      errors: {},
      minPasswordLength: MIN_PASSWORD_LENGTH,
    }),
  );

  // There is deliberately no GET for /staff/account/password: it rendered the
  // same page as /staff/account, differing only by a flag no template read,
  // and nothing linked to it. The POST below is the form's target.

  app.post('/staff/account/password', csrf, async (request, reply) => {
    const parsed = parseForm(passwordChangeSchema, request.body);
    if (!parsed.ok) {
      return rerenderAccount(reply, parsed.errors);
    }

    const { current_password: current, password, password_confirm: confirm } = parsed.data;

    // Require the current password: a hijacked session should not be able to
    // lock the real owner out by changing it.
    const user = getStaffByUsername(db, request.staffUser.username);
    if (!user || !(await verifyPassword(current, user.password_hash))) {
      return rerenderAccount(reply, { current_password: 'incorrect' });
    }

    if (password !== confirm) {
      return rerenderAccount(reply, { password_confirm: 'mismatch' });
    }

    const strength = checkPasswordStrength(password);
    if (!strength.ok) {
      return rerenderAccount(reply, { password: strength.reason });
    }

    await setStaffPassword(db, user.id, password);

    // Every other session for this account is revoked: if the password was
    // changed because it may have leaked, leaving old sessions alive would
    // defeat the point.
    app.sessionStore.destroyForUser(user.id);

    logAction(db, {
      actor: request.staffUser,
      action: 'staff.password.change',
      entity: 'staff_user',
      entityId: user.id,
    });

    // This session was revoked too, so send them back to log in afresh.
    await request.session.destroy();
    return reply.redirect('/staff/login?changed=1', 302);
  });

  // ================================================= administration only
  await app.register(async (adminScope) => {
    adminScope.addHook('preHandler', app.requireAdmin);

    adminScope.get('/staff/users', async (_request, reply) =>
      reply.renderStaff('staff/users', {
        title: reply.locals.t('staff.users.title'),
        users: listStaff(db),
        values: { username: '', display_name: '', email: '', role: 'librarian' },
        errors: {},
        editing: null,
        minPasswordLength: MIN_PASSWORD_LENGTH,
      }),
    );

    adminScope.get('/staff/users/:id', async (request, reply) => {
      const user = listStaff(db).find((u) => u.id === Number(request.params.id));
      if (!user) return reply.callNotFound();

      return reply.renderStaff('staff/users', {
        title: user.username,
        users: listStaff(db),
        values: {
          username: user.username,
          display_name: user.display_name,
          email: user.email ?? '',
          role: user.role,
          is_active: Boolean(user.is_active),
        },
        errors: {},
        editing: user,
        minPasswordLength: MIN_PASSWORD_LENGTH,
      });
    });

    adminScope.post('/staff/users', csrf, async (request, reply) => {
      const parsed = parseForm(staffUserFormSchema, request.body);
      if (!parsed.ok) {
        return rerenderUsers(reply, request.body, parsed.errors, null);
      }

      // A new account needs a password, and it must meet the same policy as
      // every other. There is no default password anywhere in this app.
      const password = parsed.data.password ?? '';
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        return rerenderUsers(reply, request.body, { password: strength.reason }, null);
      }

      const result = await createStaffUser(db, {
        username: parsed.data.username,
        password,
        displayName: parsed.data.display_name,
        email: parsed.data.email || null,
        role: parsed.data.role,
        // The creator knows this password, so the new user must replace it.
        mustChangePassword: true,
      });

      if (!result.ok) {
        return rerenderUsers(reply, request.body, { username: result.reason }, null);
      }

      logAction(db, {
        actor: request.staffUser,
        action: 'staff.create',
        entity: 'staff_user',
        entityId: result.id,
        detail: { role: parsed.data.role },
      });

      addFlash(request, 'success', 'staff.users.created', { username: parsed.data.username });
      return reply.redirect('/staff/users', 302);
    });

    adminScope.post('/staff/users/:id', csrf, async (request, reply) => {
      const user = listStaff(db).find((u) => u.id === Number(request.params.id));
      if (!user) return reply.callNotFound();

      const parsed = parseForm(staffUserFormSchema, request.body);
      if (!parsed.ok) {
        return rerenderUsers(reply, request.body, parsed.errors, user);
      }

      const result = updateStaffUser(db, user.id, {
        displayName: parsed.data.display_name,
        email: parsed.data.email || null,
        role: parsed.data.role,
        isActive: parsed.data.is_active,
      });

      if (!result.ok) {
        // 'last_admin': the library would be left unable to manage accounts.
        addFlash(request, 'error', `staff.users.error.${result.reason}`);
        return reply.redirect(`/staff/users/${user.id}`, 302);
      }

      // Deactivating an account should end its sessions immediately, not at
      // the next expiry.
      if (parsed.data.is_active === false) {
        app.sessionStore.destroyForUser(user.id);
      }

      logAction(db, {
        actor: request.staffUser,
        action: 'staff.update',
        entity: 'staff_user',
        entityId: user.id,
        detail: { role: parsed.data.role, active: parsed.data.is_active },
      });

      addFlash(request, 'success', 'staff.users.saved', { username: user.username });
      return reply.redirect('/staff/users', 302);
    });

    adminScope.post('/staff/users/:id/password', csrf, async (request, reply) => {
      const user = listStaff(db).find((u) => u.id === Number(request.params.id));
      if (!user) return reply.callNotFound();

      const password = typeof request.body?.password === 'string' ? request.body.password : '';
      const strength = checkPasswordStrength(password);
      if (!strength.ok) {
        addFlash(request, 'error', `staff.users.error.password_${strength.reason}`);
        return reply.redirect(`/staff/users/${user.id}`, 302);
      }

      await setStaffPassword(db, user.id, password);
      // The admin now knows this password, so require a change at next login.
      db.run('UPDATE staff_user SET must_change_password = 1 WHERE id = ?', user.id);
      app.sessionStore.destroyForUser(user.id);

      logAction(db, {
        actor: request.staffUser,
        action: 'staff.password.reset',
        entity: 'staff_user',
        entityId: user.id,
      });

      addFlash(request, 'success', 'staff.users.passwordReset', { username: user.username });
      return reply.redirect('/staff/users', 302);
    });

    /**
     * Confirm before removing an account.
     *
     * Every other destructive action in the second interface asks on a page
     * of its own rather than in a dialog, so the question survives having no
     * scripting. The first interface keeps its inline button and has no such
     * page, so it is sent back to the list rather than shown a template it
     * does not have.
     */
    adminScope.get('/staff/users/:id/delete', async (request, reply) => {
      if (request.uiFlavour !== 'next') return reply.redirect('/staff/users', 302);

      const user = listStaff(db).find((u) => u.id === Number(request.params.id));
      if (!user) return reply.callNotFound();
      // Asking the question at all would imply it could be answered.
      if (user.id === request.staffUser.id) return reply.redirect('/staff/users', 302);

      return reply.renderStaff('staff/user-delete', {
        title: reply.locals.t('staff.users.deleteConfirm', { username: user.username }),
        user,
      });
    });

    adminScope.post('/staff/users/:id/delete', csrf, async (request, reply) => {
      const user = listStaff(db).find((u) => u.id === Number(request.params.id));
      if (!user) return reply.callNotFound();

      if (user.id === request.staffUser.id) {
        addFlash(request, 'error', 'staff.users.error.self');
        return reply.redirect('/staff/users', 302);
      }

      const result = deleteStaffUser(db, user.id);
      if (!result.ok) {
        addFlash(request, 'error', `staff.users.error.${result.reason}`);
        return reply.redirect('/staff/users', 302);
      }

      app.sessionStore.destroyForUser(user.id);

      // The audit log keeps the username as text, so this person's trail
      // survives the deletion of their account.
      logAction(db, {
        actor: request.staffUser,
        action: 'staff.delete',
        entity: 'staff_user',
        entityId: user.id,
        detail: { username: user.username },
      });

      addFlash(request, 'success', 'staff.users.deleted', { username: user.username });
      return reply.redirect('/staff/users', 302);
    });

    function rerenderUsers(reply, body, errors, editing) {
      reply.code(422);
      return reply.renderStaff('staff/users', {
        title: reply.locals.t('staff.users.title'),
        users: listStaff(db),
        values: {
          username: body?.username ?? '',
          display_name: body?.display_name ?? '',
          email: body?.email ?? '',
          role: body?.role ?? 'librarian',
          is_active: body?.is_active !== undefined,
        },
        errors,
        editing,
        minPasswordLength: MIN_PASSWORD_LENGTH,
      });
    }
  });

  function rerenderAccount(reply, errors) {
    reply.code(422);
    return reply.renderStaff('staff/account', {
      title: reply.locals.t('staff.account.title'),
      errors,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      focusPassword: true,
    });
  }
}
