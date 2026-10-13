// Which of the two interfaces a visitor sees.
//
// A second interface is being trialled beside the first. Rather than branch
// inside every route, the choice is resolved once per request and applied when
// a template name is turned into a path: `next/` is prefixed when the visitor
// asked for it and that template has actually been written.
//
// The flavour is matched against a list of two before it is used in a path. A
// query parameter that is not one of the two is simply not a flavour — there
// is no sanitising step to get wrong, because an arbitrary string never
// reaches the filesystem.
import fs from 'node:fs';
import path from 'node:path';

export const UI_COOKIE = 'ui';
export const UI_FLAVOURS = ['classic', 'next'];
export const DEFAULT_FLAVOUR = 'classic';

/** The directory inside the view root holding the second interface. */
const NEXT_DIR = 'next';

/**
 * Which interface this request wants: an explicit `?ui=` wins and is worth
 * remembering, otherwise the cookie, otherwise the default.
 *
 * @returns {{ flavour: string, fromQuery: boolean }}
 */
export function resolveFlavour(request) {
  const requested = request?.query?.ui;
  if (UI_FLAVOURS.includes(requested)) {
    return { flavour: requested, fromQuery: true };
  }

  const saved = request?.cookies?.[UI_COOKIE];
  if (UI_FLAVOURS.includes(saved)) {
    return { flavour: saved, fromQuery: false };
  }

  return { flavour: DEFAULT_FLAVOUR, fromQuery: false };
}

/**
 * Turn a template name into the one to render.
 *
 * Falls back to the classic template when the second interface has no copy of
 * it. That fallback is what lets the redesign land one screen at a time: a
 * route whose new template does not exist yet keeps working.
 *
 * @param {string} flavour
 * @param {string} template e.g. 'staff/loans' or 'layouts/public.ejs'
 * @param {{ viewsRoot: string }} options
 * @returns {string}
 */
export function resolveTemplate(flavour, template, { viewsRoot }) {
  if (flavour !== 'next' || typeof template !== 'string') return template;

  const candidate = `${NEXT_DIR}/${template}`;
  const withExtension = candidate.endsWith('.ejs') ? candidate : `${candidate}.ejs`;

  return fs.existsSync(path.join(viewsRoot, withExtension)) ? candidate : template;
}

/** The stylesheet a flavour is drawn with. */
export function stylesheetFor(flavour) {
  return flavour === 'next' ? '/assets/css/next.css' : '/assets/css/app.css';
}
