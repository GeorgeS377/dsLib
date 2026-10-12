// One-shot messages carried across a redirect.
//
// Every staff mutation ends in a redirect (post/redirect/get), so the
// confirmation or error has to survive one hop. Messages live in the session
// and are consumed on read.
//
// Messages are stored as a translation key plus variables, not as finished
// text, so a message set in one language and read after a language switch is
// rendered in the language the reader is actually using.
import { SESSION_KEYS } from './auth.js';

const MAX_MESSAGES = 10;

/**
 * Queue a message for the next page the user sees.
 *
 * @param {import('fastify').FastifyRequest} request
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {string} key Translation key.
 * @param {Record<string, string|number>} [vars]
 */
export function addFlash(request, type, key, vars) {
  if (!request.session) return;
  const existing = read(request);
  existing.push({ type, key, vars: vars ?? null });
  request.session.set(SESSION_KEYS.flash, existing.slice(-MAX_MESSAGES));
}

/** Read and clear the queued messages. */
export function takeFlash(request) {
  if (!request.session) return [];
  const messages = read(request);
  if (messages.length > 0) request.session.set(SESSION_KEYS.flash, []);
  return messages;
}

function read(request) {
  const value = request.session.get(SESSION_KEYS.flash);
  return Array.isArray(value) ? value : [];
}
