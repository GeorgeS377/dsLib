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
