// The staff area.
//
// Structure matters here. Login lives in an *unprotected* child scope, and
// everything else lives in a *protected* child scope carrying a single
// onRequest guard. Because the guard is attached to the scope rather than to
// individual routes, a new staff route is protected by virtue of where it is
// registered — there is no per-route checklist to forget.
//
//   /staff/login            public (the login form itself)
//   /staff/*                requires a valid staff session
//   /staff/users/*          additionally requires the admin role
import { requireAdmin, requireStaff } from '../../lib/auth.js';
import { takeFlash } from '../../lib/flash.js';
import authRoutes, { logoutRoutes } from './auth.js';
import dashboardRoutes from './dashboard.js';

export default async function staffRoutes(app) {
  // --------------------------------------------------- unauthenticated part
  await app.register(async (publicScope) => {
    await publicScope.register(authRoutes);
  });

  // ------------------------------------------------------- protected part
  await app.register(async (protectedScope) => {
    protectedScope.addHook('onRequest', requireStaff(protectedScope));

    // Staff template locals: the signed-in user, a CSRF token for forms, and
    // any flash message carried over a redirect.
    protectedScope.addHook('preHandler', async (request, reply) => {
      reply.locals = {
        ...reply.locals,
        staffUser: request.staffUser,
        csrfToken: reply.generateCsrf(),
        flash: takeFlash(request),
      };
    });

    // Render inside the staff layout rather than the public one.
    protectedScope.decorateReply('renderStaff', function renderStaff(template, data = {}) {
      return this.view(template, { ...this.locals, ...data }, { layout: 'layouts/staff.ejs' });
    });

    protectedScope.decorate('requireAdmin', requireAdmin);

    await protectedScope.register(logoutRoutes);
    await protectedScope.register(dashboardRoutes);
  });
}
