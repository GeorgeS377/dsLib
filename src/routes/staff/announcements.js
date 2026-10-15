// The notices shown on the front page.
//
// Content rather than catalogue: the library writes these, and the only
// decisions here are the ones a librarian makes — what it says, whether it is
// showing yet, and what order they come in.
import { logAction } from '../../db/queries/audit.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  moveAnnouncement,
  updateAnnouncement,
} from '../../db/queries/announcements.js';
import { addFlash } from '../../lib/flash.js';
import { announcementFormSchema, parseForm } from '../../lib/validation.js';

export default async function staffAnnouncementRoutes(app) {
  const db = app.db;
  const csrf = { preHandler: app.csrfProtection };

  app.get('/staff/announcements', async (request, reply) => {
    const editingId = Number(request.query?.edit);
    const editing = Number.isInteger(editingId) ? getAnnouncementById(db, editingId) : undefined;

    return reply.renderStaff('staff/announcements', {
      title: reply.locals.t('staff.announcements.title'),
      announcements: listAnnouncements(db),
      editing: editing ?? null,
      values: {
        title: editing?.title ?? '',
        body: editing?.body ?? '',
        is_published: editing ? Boolean(editing.is_published) : true,
      },
      errors: {},
    });
  });

  app.post('/staff/announcements', csrf, async (request, reply) => {
    const parsed = parseForm(announcementFormSchema, request.body);
    if (!parsed.ok) {
      return rerender(reply, request.body, parsed.errors);
    }

    const result = createAnnouncement(db, {
      title: parsed.data.title,
      body: parsed.data.body,
      isPublished: parsed.data.is_published,
    });
    if (!result.ok) {
      return rerender(reply, request.body, { title: result.reason });
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'announcement.create',
      entity: 'announcement',
      entityId: result.id,
    });
    addFlash(request, 'success', 'staff.announcements.created');
    return reply.redirect('/staff/announcements', 302);
  });

  app.post('/staff/announcements/:id', csrf, async (request, reply) => {
    const existing = loadAnnouncement(db, request.params.id);
    if (!existing) return reply.callNotFound();

    const parsed = parseForm(announcementFormSchema, request.body);
    if (!parsed.ok) {
      return rerender(reply, request.body, parsed.errors, existing);
    }

    const result = updateAnnouncement(db, existing.id, {
      title: parsed.data.title,
      body: parsed.data.body,
      isPublished: parsed.data.is_published,
    });
    if (!result.ok) {
      return rerender(reply, request.body, { title: result.reason }, existing);
    }

    logAction(db, {
      actor: request.staffUser,
      action: 'announcement.update',
      entity: 'announcement',
      entityId: existing.id,
    });
    addFlash(request, 'success', 'staff.announcements.saved');
    return reply.redirect('/staff/announcements', 302);
  });

  app.post('/staff/announcements/:id/move', csrf, async (request, reply) => {
    const existing = loadAnnouncement(db, request.params.id);
    if (!existing) return reply.callNotFound();

    const direction = request.body?.direction === 'up' ? 'up' : 'down';
    moveAnnouncement(db, existing.id, direction);
    return reply.redirect('/staff/announcements', 302);
  });

  app.post('/staff/announcements/:id/delete', csrf, async (request, reply) => {
    const existing = loadAnnouncement(db, request.params.id);
    if (!existing) return reply.callNotFound();

    deleteAnnouncement(db, existing.id);
    logAction(db, {
      actor: request.staffUser,
      action: 'announcement.delete',
      entity: 'announcement',
      entityId: existing.id,
      detail: { title: existing.title },
    });
    addFlash(request, 'success', 'staff.announcements.deleted');
    return reply.redirect('/staff/announcements', 302);
  });

  function rerender(reply, body, errors, editing) {
    reply.code(422);
    return reply.renderStaff('staff/announcements', {
      title: reply.locals.t('staff.announcements.title'),
      announcements: listAnnouncements(db),
      editing: editing ?? null,
      values: {
        title: body?.title ?? '',
        body: body?.body ?? '',
        is_published: Boolean(body?.is_published),
      },
      errors,
    });
  }
}

function loadAnnouncement(db, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) return undefined;
  return getAnnouncementById(db, id);
}
