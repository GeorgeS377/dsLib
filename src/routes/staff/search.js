// The desk's one search.
//
// This is the second interface's home: rather than a console the teacher has
// to navigate, the page asks what they are looking for and hangs the actions
// off the answer. It sits inside the authenticated scope like every other
// staff route, so reader names never reach a stranger.
import { searchEverything } from '../../db/queries/search.js';

export default async function staffSearchRoutes(app) {
  const db = app.db;

  app.get('/staff/search', async (request, reply) => {
    const q = typeof request.query?.q === 'string' ? request.query.q.slice(0, 200) : '';
    const { books, borrowers } = searchEverything(db, { q });

    return reply.renderStaff('staff/search', {
      title: reply.locals.t('staff.search.title'),
      q,
      books,
      borrowers,
      // Distinguishes "nothing typed yet" from "nothing matched", which are
      // different things to say to someone.
      searched: q.trim().length > 0,
    });
  });
}
