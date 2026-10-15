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
import { resolveTemplate } from '../../lib/ui-flavour.js';
import authRoutes, { logoutRoutes } from './auth.js';
import staffAnnouncementRoutes from './announcements.js';
import staffBookRoutes from './books.js';
import staffBorrowerRoutes from './borrowers.js';
import staffCopyRoutes from './copies.js';
import dashboardRoutes from './dashboard.js';
import staffLoanRoutes from './loans.js';
import staffSearchRoutes from './search.js';
import staffTaxonomyRoutes from './taxonomy.js';
import staffUserRoutes from './users.js';

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
        // Shown in the cover upload hint, so the limit the templates advertise
        // is always the limit the server actually enforces.
        maxUploadMb: Math.round(protectedScope.config.maxUploadBytes / (1024 * 1024)),
        defaultLoanDays: protectedScope.config.defaultLoanDays,
      };
    });

    // Render inside the staff layout rather than the public one.
    protectedScope.decorateReply('renderStaff', function renderStaff(template, data = {}) {
      const flavour = this.request.uiFlavour;
      const resolve = (name) =>
        resolveTemplate(flavour, name, { viewsRoot: protectedScope.viewsRoot });
      return this.view(
        resolve(template),
        { ...this.locals, ...data },
        { layout: resolve('layouts/staff.ejs') },
      );
    });

    protectedScope.decorate('requireAdmin', requireAdmin);

    await protectedScope.register(logoutRoutes);
    await protectedScope.register(dashboardRoutes);
    await protectedScope.register(staffBookRoutes);
    await protectedScope.register(staffCopyRoutes);
    await protectedScope.register(staffTaxonomyRoutes);
    await protectedScope.register(staffLoanRoutes);
    await protectedScope.register(staffSearchRoutes);
    await protectedScope.register(staffAnnouncementRoutes);
    await protectedScope.register(staffBorrowerRoutes);
    await protectedScope.register(staffUserRoutes);
  });
}
