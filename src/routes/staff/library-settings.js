// Ρυθμίσεις → Η βιβλιοθήκη.
//
// The same three things the first-run wizard asked for, afterwards and
// without the steps: the library's name, its icon, and how long a loan runs
// by default.
//
// This page is the reason the wizard can exist at all. A teacher who cannot
// open a terminal names the library on the first day; without somewhere to
// change it later, a typo in their own school's name would mean going back to
// whoever has shell access. The two screens therefore write exactly the same
// settings through exactly the same helpers.
//
// Administrators only. What a school's library is called is not a
// per-librarian preference, and the icon is the mark on every page.
import { logAction } from '../../db/queries/audit.js';
import {
  SETTING_KEYS,
  defaultLoanDays,
  forgetSetting,
  libraryIcon,
  libraryName,
  saveSetting,
} from '../../lib/settings.js';
import { addFlash } from '../../lib/flash.js';
import { parseCropFields, removeBrandIcon, storeBrandIcon } from '../../lib/upload.js';
import { catalogueSetupSchema, librarySetupSchema } from '../../lib/validation.js';

export default async function libraryRoutes(app) {
  const db = app.db;

  // The whole file sits behind the administrator check, the way the staff
  // account pages do — one hook on the scope, so adding a route here cannot
  // forget it.
  await app.register(async (scope) => {
  scope.addHook('preHandler', app.requireAdmin);

  scope.get('/staff/settings/library', async (_request, reply) => render(reply));

  scope.post(
    '/staff/settings/library',
    { preHandler: app.csrfProtection },
    async (request, reply) => {
      const body = request.body ?? {};
      const typed = {
        name: typeof body.library_name === 'string' ? body.library_name : '',
        loanDays: typeof body.loan_days === 'string' ? body.loan_days : '',
      };

      const name = librarySetupSchema.safeParse({ library_name: typed.name });
      const loan = catalogueSetupSchema.safeParse({ loan_days: typed.loanDays });

      if (!name.success || !loan.success) {
        return render(reply, {
          values: typed,
          errors: {
            library_name: name.success ? null : (name.error.issues[0]?.message ?? 'invalid'),
            loan_days: loan.success ? null : (loan.error.issues[0]?.message ?? 'invalid'),
          },
        });
      }

      // The icon first, because it is the only part that can still fail. If
      // it does, nothing has been written and the page comes back with both
      // typed values intact — rather than a library that has been half
      // renamed.
      const upload = body.icon;
      let newIcon = null;
      if (Buffer.isBuffer(upload) && upload.length > 0) {
        const stored = await storeBrandIcon(upload, {
          uploadDir: app.config.uploadDir,
          maxBytes: app.config.maxUploadBytes,
          crop: parseCropFields(body),
        });
        if (!stored.ok) {
          return render(reply, { values: typed, errors: { icon: stored.reason } });
        }
        newIcon = stored.iconName;
      }

      const previous = libraryIcon(db);
      saveSetting(db, SETTING_KEYS.libraryName, name.data.library_name);
      saveSetting(db, SETTING_KEYS.defaultLoanDays, String(loan.data.loan_days));
      if (newIcon) saveSetting(db, SETTING_KEYS.libraryIcon, newIcon);

      // Only once the new one is recorded. The other order loses the icon
      // entirely if anything between the two fails.
      if (newIcon && previous && previous !== newIcon) {
        await removeBrandIcon(app.config.uploadDir, previous);
      }

      logAction(db, {
        actor: request.staffUser,
        action: 'settings.update',
        entity: 'setting',
        detail: { name: true, loanDays: loan.data.loan_days, icon: newIcon ? 'replaced' : 'kept' },
      });

      addFlash(request, 'success', 'staff.library.saved');
      return reply.redirect('/staff/settings/library', 302);
    },
  );

  scope.post(
    '/staff/settings/library/icon/remove',
    { preHandler: app.csrfProtection },
    async (request, reply) => {
      const current = libraryIcon(db);
      if (current) {
        // The row goes first. A file that outlives its row is harmless — the
        // locals already treat a missing file as no icon — but a row pointing
        // at a deleted file would have every page stat a path that is not
        // there.
        forgetSetting(db, SETTING_KEYS.libraryIcon);
        await removeBrandIcon(app.config.uploadDir, current);

        logAction(db, {
          actor: request.staffUser,
          action: 'settings.update',
          entity: 'setting',
          detail: { icon: 'removed' },
        });
      }

      addFlash(request, 'success', 'staff.library.iconRemoved');
      return reply.redirect('/staff/settings/library', 302);
    },
  );

  });

  function render(reply, { values = null, errors = {} } = {}) {
    return reply.renderStaff('staff/library-settings', {
      title: reply.locals.t('staff.library.title'),
      csrfToken: reply.generateCsrf(),
      values: values ?? {
        name: libraryName(db, app.config),
        loanDays: String(defaultLoanDays(db, app.config)),
      },
      errors,
      maxUploadMb: Math.round(app.config.maxUploadBytes / (1024 * 1024)),
    });
  }
}
