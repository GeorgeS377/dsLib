// Helpers for driving the staff area in tests.
//
// These go through the real HTTP surface — login form, CSRF token, session
// cookie — rather than reaching past it. A test that skipped the login would
// not prove the login works.
import assert from 'node:assert/strict';
import { createStaffUser } from '../src/db/queries/staff.js';

export const TEST_PASSWORD = 'a-long-enough-test-passphrase';

/** Create a staff account directly in the database. */
export async function makeStaffUser(db, overrides = {}) {
  const result = await createStaffUser(db, {
    username: 'maria',
    password: TEST_PASSWORD,
    displayName: 'Μαρία Λιβαδά',
    role: 'admin',
    ...overrides,
  });
  assert.ok(result.ok, `could not create test staff user: ${result.reason}`);
  return result;
}

/** Collect a cookie header string from an injected response. */
export function cookieHeader(response, previous = '') {
  const jar = new Map();
  for (const part of previous.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name) jar.set(name, rest.join('='));
  }
  for (const cookie of response.cookies ?? []) {
    jar.set(cookie.name, cookie.value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

/** Pull the CSRF token out of a rendered form. */
export function csrfFrom(body) {
  const match = body.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match, 'no CSRF token found in the rendered form');
  return match[1];
}

/**
 * Log in through the real form and return a session you can use for later
 * requests, plus a helper that submits forms with a valid CSRF token.
 *
 * @param {import('fastify').FastifyInstance} app
 * @param {{ username?: string, password?: string }} [credentials]
 */
export async function login(app, { username = 'maria', password = TEST_PASSWORD } = {}) {
  const form = await app.inject({ method: 'GET', url: '/staff/login' });
  const token = csrfFrom(form.body);
  const cookies = cookieHeader(form);

  const response = await app.inject({
    method: 'POST',
    url: '/staff/login',
    headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ _csrf: token, username, password }).toString(),
  });

  assert.equal(response.statusCode, 302, `login failed: ${response.statusCode}`);
  const session = cookieHeader(response, cookies);

  return {
    cookie: session,
    response,

    /** GET a staff page with the session attached. */
    get: (url) => app.inject({ method: 'GET', url, headers: { cookie: session } }),

    /**
     * POST a form: fetches the page first to obtain a fresh CSRF token, then
     * submits. This is exactly what a browser does.
     */
    post: async (url, fields = {}, { tokenFrom = url, method = 'POST' } = {}) => {
      const page = await app.inject({ method: 'GET', url: tokenFrom, headers: { cookie: session } });
      const formToken = csrfFrom(page.body);
      return app.inject({
        method,
        url,
        headers: { cookie: session, 'content-type': 'application/x-www-form-urlencoded' },
        payload: encodeFields({ _csrf: formToken, ...fields }),
      });
    },

    /** POST without a CSRF token, to prove the protection is active. */
    postWithoutCsrf: (url, fields = {}) =>
      app.inject({
        method: 'POST',
        url,
        headers: { cookie: session, 'content-type': 'application/x-www-form-urlencoded' },
        payload: encodeFields(fields),
      }),
  };
}

/**
 * Encode form fields the way a browser does.
 *
 * An array value becomes repeated entries with the same name — which is how a
 * form with several inputs called `authors` actually submits. Passing the
 * array through String() instead would join it with a comma and arrive as one
 * value, quietly testing something the browser never sends.
 */
export function encodeFields(fields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const list = Array.isArray(value) ? value : [value];
    for (const item of list) {
      if (item === undefined || item === null) continue;
      params.append(key, typeof item === 'boolean' ? (item ? '1' : '') : String(item));
    }
  }
  return params.toString();
}
