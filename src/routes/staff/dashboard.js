// Staff dashboard: the figures a librarian wants on arrival, plus quick
// actions. Every count comes from db/queries/stats.js, which derives
// availability with the same rule as the public catalogue.
import { overdueLoans } from '../../db/queries/loans.js';
import {
  dashboardStats,
  recentlyUpdatedBooks,
  titlesWithoutCopies,
} from '../../db/queries/stats.js';

export default async function dashboardRoutes(app) {
  const db = app.db;

  // The settings hub. Categories, authors, staff users and your own account
  // are reached from here rather than from the tab row, which keeps the tabs
  // to the four places a librarian actually works day to day.
  app.get('/staff/settings', async (_request, reply) => {
    const stats = dashboardStats(db);
    return reply.renderStaff('staff/settings', {
      title: reply.locals.t('staff.settings.title'),
      counts: {
        categories: stats.categories,
        authors: stats.authors,
        staff: db.value('SELECT COUNT(*) FROM staff_user') ?? 0,
      },
    });
  });

  app.get('/staff', async (_request, reply) => {
    const stats = dashboardStats(db);

    return reply.renderStaff('staff/dashboard', {
      title: reply.locals.t('staff.dashboard.title'),
      stats,
      recent: recentlyUpdatedBooks(db, 8),
      overdue: overdueLoans(db, 5),
      needingCopies: titlesWithoutCopies(db, 5),
    });
  });
}
