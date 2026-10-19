// Acceptance criterion 4: a visitor cannot reach staff pages or staff APIs
// without authentication.
//
// The central test here walks Fastify's live route table and asserts that
// every /staff route except the login form refuses an anonymous request. It
// discovers routes rather than listing them, so a staff route added later is
// covered automatically — and if someone registers one outside the protected
// scope, this test fails.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { translate } from '../src/lib/i18n.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { TEST_PASSWORD, cookieHeader, csrfFrom, login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let fixtures;

/** Routes that are meant to be reachable without a session. */
const PUBLIC_STAFF_ROUTES = ['/staff/login'];

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  fixtures = seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

/**
 * Every route the application registers, collected through buildApp's onRoute
 * seam. Discovered, not hand-listed, so a route added in a later phase is
 * covered by the sweep below without anyone remembering to add it here.
 */
const allRoutes = [];
{
  const setup = testConfig();
  const probeDb = makeTestDb();
  const probe = await buildApp({
    config: setup.config,
    logger: false,
    db: probeDb,
    onRoute: (route) => {
      for (const method of [].concat(route.method)) {
        allRoutes.push({ method, url: route.url });
      }
    },
  });
  await probe.ready();
  await probe.close();
  probeDb.close();
  cleanupDir(setup.dir);
}

/** Staff routes that should demand a session, with placeholders filled in. */
function protectedStaffRoutes() {
  return allRoutes
    .filter((route) => route.url.startsWith('/staff'))
    .filter((route) => !PUBLIC_STAFF_ROUTES.includes(route.url))
    .filter((route) => route.method !== 'OPTIONS')
    .map((route) => ({
      ...route,
      // Substitute a plausible id for any path parameter.
      url: route.url.replace(/:\w+/g, '1'),
    }));
}

describe('every staff route is behind the guard (acceptance 4)', () => {
  it('discovered the route table', () => {
    assert.ok(allRoutes.length > 0, 'no routes were discovered');
    assert.ok(
      allRoutes.some((r) => r.url === '/staff'),
      'the dashboard route was not discovered',
    );
  });

  it('refuses an anonymous request to each one', async () => {
    const routes = protectedStaffRoutes();
    assert.ok(routes.length > 0, 'no protected staff routes found to check');

    for (const route of routes) {
      if (route.method === 'HEAD') continue;

      const response = await app.inject({
        method: route.method,
        url: route.url,
        headers: { accept: 'application/json' },
        ...(route.method === 'GET' ? {} : { payload: '' }),
      });

      assert.ok(
        [401, 403].includes(response.statusCode),
        `${route.method} ${route.url} returned ${response.statusCode} to an anonymous caller`,
      );
    }
  });

  it('renders no staff content to an anonymous browser on any of them', async () => {
    for (const route of protectedStaffRoutes()) {
      if (route.method !== 'GET') continue;

      const response = await app.inject({
        method: 'GET',
        url: route.url,
        headers: { accept: 'text/html' },
      });

      assert.ok(
        response.statusCode === 302 || response.statusCode === 404,
        `GET ${route.url} returned ${response.statusCode}`,
      );
      if (response.statusCode === 302) {
        assert.match(response.headers.location, /^\/staff\/login/, route.url);
      }
    }
  });
});

describe('unauthenticated access is refused (acceptance 4)', () => {
  it('redirects a browser away from every protected staff page', async () => {
    for (const url of ['/staff', '/staff/']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { accept: 'text/html' },
      });
      assert.equal(response.statusCode, 302, `${url} returned ${response.statusCode}`);
      assert.match(response.headers.location, /^\/staff\/login/, url);
    }
  });

  it('returns 401 to a non-browser client, with no page content', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/staff',
      headers: { accept: 'application/json' },
    });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), { error: 'Authentication required' });
  });

  it('refuses state-changing requests without a session', async () => {
    for (const url of ['/staff/logout']) {
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { accept: 'application/json' },
        payload: '',
      });
      assert.ok(
        response.statusCode === 401 || response.statusCode === 403,
        `${url} returned ${response.statusCode}`,
      );
    }
  });

  it('serves the login page itself without a session', async () => {
    for (const url of PUBLIC_STAFF_ROUTES) {
      const response = await app.inject({ method: 'GET', url });
      assert.equal(response.statusCode, 200, url);
    }
  });

  it('leaks nothing about the catalogue in the refusal', async () => {
    const response = await app.inject({ method: 'GET', url: '/staff', headers: { accept: 'text/html' } });
    assert.ok(!response.body.includes('Οδύσσεια'));
    assert.ok(!response.body.includes('T-0001'));
  });

  it('cannot be bypassed by path tricks', async () => {
    for (const url of [
      '/staff/../staff',
      '/staff%2f',
      '/STAFF',
      '/staff/./',
      '/staff?x=1',
      '/staff/#/',
    ]) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { accept: 'text/html' },
      });
      assert.ok(
        response.statusCode === 302 || response.statusCode === 404 || response.statusCode === 400,
        `${url} returned ${response.statusCode}`,
      );
      if (response.statusCode === 200) {
        assert.ok(!response.body.includes('Επισκόπηση'), `${url} rendered the dashboard`);
      }
    }
  });

  it('is not bypassed by a forged cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/staff',
      headers: {
        accept: 'text/html',
        // A plausible-looking but unsigned session cookie.
        cookie: 'dslib_session=abcdef1234567890abcdef1234567890',
      },
    });
    assert.equal(response.statusCode, 302);
  });

  it('is not bypassed by a session cookie for a deleted session', async () => {
    const session = await login(app);
    assert.equal((await session.get('/staff')).statusCode, 200);

    // Remove the row behind the cookie, as logout or expiry would.
    db.run('DELETE FROM session');

    const after = await session.get('/staff');
    assert.equal(after.statusCode, 302);
  });
});

describe('the session itself', () => {
  it('sets a hardened cookie', async () => {
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const header = [].concat(form.headers['set-cookie'] ?? []).join(';');
    assert.match(header, /HttpOnly/i, 'session cookie is readable by script');
    assert.match(header, /SameSite=Lax/i);
    assert.match(header, /Path=\//);
    // Not Secure in test/development, because there is no TLS to require.
    assert.ok(!/Secure/i.test(header));
  });

  it('marks the cookie Secure when served over HTTPS behind a trusted proxy', async () => {
    // This models the real deployment: Nginx terminates TLS and forwards
    // X-Forwarded-Proto, and TRUST_PROXY=true tells Fastify to believe it.
    const setup = testConfig({
      NODE_ENV: 'production',
      TRUST_PROXY: 'true',
      SESSION_SECRET: 'a-production-secret-that-is-long-enough-yes',
    });
    const prodDb = makeTestDb();
    // An account, so the sign-in form renders: a library with none now sends
    // /staff/login to the browser setup, and a redirect issues no session.
    await makeStaffUser(prodDb);
    const prodApp = await buildApp({ config: setup.config, logger: false, db: prodDb });
    await prodApp.ready();

    const https = await prodApp.inject({
      method: 'GET',
      url: '/staff/login',
      headers: { 'x-forwarded-proto': 'https' },
    });
    const secureHeader = [].concat(https.headers['set-cookie'] ?? []).join(';');
    assert.match(secureHeader, /dslib_session/, 'no session cookie was issued over HTTPS');
    assert.match(secureHeader, /Secure/i, 'the HTTPS session cookie is not marked Secure');
    assert.match(secureHeader, /HttpOnly/i);

    // And over plain HTTP the cookie is still issued rather than silently
    // dropped — otherwise a misconfigured proxy would cause an unexplained
    // login redirect loop instead of a working, if unencrypted, session.
    const plain = await prodApp.inject({ method: 'GET', url: '/staff/login' });
    const plainHeader = [].concat(plain.headers['set-cookie'] ?? []).join(';');
    assert.match(plainHeader, /dslib_session/, 'plain HTTP got no session cookie at all');

    await prodApp.close();
    prodDb.close();
    cleanupDir(setup.dir);
  });

  it('can actually log in through a TLS-terminating proxy', async () => {
    // The regression this guards: with a hard `secure: true`, @fastify/session
    // declines to send the cookie over a connection it sees as plain HTTP, so
    // login succeeded server-side but the browser never received a session
    // and bounced straight back to the login page.
    const setup = testConfig({
      NODE_ENV: 'production',
      TRUST_PROXY: 'true',
      SESSION_SECRET: 'a-production-secret-that-is-long-enough-yes',
    });
    const prodDb = makeTestDb();
    await makeStaffUser(prodDb);
    const prodApp = await buildApp({ config: setup.config, logger: false, db: prodDb });
    await prodApp.ready();

    const proxyHeaders = { 'x-forwarded-proto': 'https' };
    const form = await prodApp.inject({ method: 'GET', url: '/staff/login', headers: proxyHeaders });
    const posted = await prodApp.inject({
      method: 'POST',
      url: '/staff/login',
      headers: {
        ...proxyHeaders,
        cookie: cookieHeader(form),
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: new URLSearchParams({
        _csrf: csrfFrom(form.body),
        username: 'maria',
        password: TEST_PASSWORD,
      }).toString(),
    });
    assert.equal(posted.statusCode, 302);

    const dashboard = await prodApp.inject({
      method: 'GET',
      url: '/staff',
      headers: { ...proxyHeaders, cookie: cookieHeader(posted, cookieHeader(form)) },
    });
    assert.equal(dashboard.statusCode, 200, 'the session did not survive the proxy');

    await prodApp.close();
    prodDb.close();
    cleanupDir(setup.dir);
  });

  it('issues no session cookie to anonymous catalogue visitors', async () => {
    const response = await app.inject({ method: 'GET', url: '/books' });
    const header = [].concat(response.headers['set-cookie'] ?? []).join(';');
    assert.ok(!header.includes('dslib_session'), 'a public page started a session');
  });

  it('regenerates the session id on login, defeating fixation', async () => {
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const token = csrfFrom(form.body);
    const before = cookieHeader(form);

    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: before, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        _csrf: token,
        username: 'maria',
        password: TEST_PASSWORD,
      }).toString(),
    });

    const after = cookieHeader(response);
    const idBefore = before.match(/dslib_session=([^;]+)/)?.[1];
    const idAfter = after.match(/dslib_session=([^;]+)/)?.[1];
    assert.ok(idAfter, 'no session cookie after login');
    assert.notEqual(idAfter, idBefore, 'the session id survived login');
  });

  it('ends the session on logout, server-side', async () => {
    const session = await login(app);
    assert.equal(db.value('SELECT COUNT(*) FROM session WHERE data LIKE ?', '%staffUserId%') > 0, true);

    const response = await session.post('/staff/logout', {}, { tokenFrom: '/staff' });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/staff/login');

    // The old cookie is now worthless even if someone kept it.
    const reuse = await session.get('/staff');
    assert.equal(reuse.statusCode, 302);
  });

  it('refuses a logout without a CSRF token', async () => {
    const session = await login(app);
    const response = await session.postWithoutCsrf('/staff/logout');
    assert.equal(response.statusCode, 403);
    // And the session still works, so the forged request changed nothing.
    assert.equal((await session.get('/staff')).statusCode, 200);
  });

  it('signs out an account that is deactivated mid-session', async () => {
    const extra = await makeStaffUser(db, { username: 'temporary', role: 'librarian' });
    const session = await login(app, { username: 'temporary' });
    assert.equal((await session.get('/staff')).statusCode, 200);

    db.run('UPDATE staff_user SET is_active = 0 WHERE id = ?', extra.id);

    const after = await session.get('/staff');
    assert.equal(after.statusCode, 302, 'a deactivated account kept working');
  });

  it('expires a session past the absolute lifetime', async () => {
    const session = await login(app, { username: 'maria' });
    assert.equal((await session.get('/staff')).statusCode, 200);

    // Backdate the login timestamp beyond the configured absolute cap.
    // Select by content, not LIMIT 1: logging in leaves behind the pre-login
    // row as well as the regenerated one, and only the latter is live.
    const rows = db.all("SELECT sid, data FROM session WHERE data LIKE '%staffUserId%'");
    assert.ok(rows.length > 0, 'no authenticated session row was stored');
    for (const row of rows) {
      const data = JSON.parse(row.data);
      data.loggedInAt = Date.now() - 48 * 60 * 60 * 1000;
      db.run('UPDATE session SET data = ? WHERE sid = ?', JSON.stringify(data), row.sid);
    }

    const after = await session.get('/staff');
    assert.equal(after.statusCode, 302);
    assert.match(after.headers.location, /expired=1/);
  });
});

describe('login behaviour', () => {
  it('gives one message whether the username exists or not', async () => {
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const token = csrfFrom(form.body);
    const cookies = cookieHeader(form);

    const attempt = (username, password) =>
      app.inject({
        method: 'POST',
        url: '/staff/login',
        headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ _csrf: token, username, password }).toString(),
      });

    const unknownUser = await attempt('definitely-not-a-user', 'some-password-here');
    const wrongPassword = await attempt('maria', 'the-wrong-password');

    assert.equal(unknownUser.statusCode, 401);
    assert.equal(wrongPassword.statusCode, 401);

    // Identical wording, so the response cannot be used to enumerate accounts.
    // Read from the dictionary: the test is about the two being the same, not
    // about any particular sentence, and it used to break on a reword.
    const message = translate('el', 'login.error.invalid');
    assert.ok(unknownUser.body.includes(message));
    assert.ok(wrongPassword.body.includes(message));
    assert.ok(!unknownUser.body.includes('δεν βρέθηκε'));
    assert.ok(!wrongPassword.body.toLowerCase().includes('password is'));
  });

  it('never reflects the submitted password back into the page', async () => {
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const token = csrfFrom(form.body);
    const secret = 'my-secret-password-value';

    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: cookieHeader(form), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ _csrf: token, username: 'maria', password: secret }).toString(),
    });

    assert.ok(!response.body.includes(secret), 'the password was echoed into the HTML');
  });

  it('keeps the username so the user need not retype it (first interface)', async () => {
    // The new login form does not pre-fill the username on failure (it uses
    // autofocus instead). This pin keeps the classic behaviour tested while
    // the second interface evolves. The assertion is about template markup, not
    // about whether the server receives the field — that is tested by the
    // route itself.
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const token = csrfFrom(form.body);
    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: `${cookieHeader(form)}; ui=classic`, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ _csrf: token, username: 'maria', password: 'nope' }).toString(),
    });
    assert.match(response.body, /name="username" value="maria"/);
  });

  it('locks an account after repeated failures, then reports a lock', async () => {
    await makeStaffUser(db, { username: 'target', role: 'librarian' });
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const token = csrfFrom(form.body);
    const cookies = cookieHeader(form);

    let lastBody = '';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/staff/login',
        headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ _csrf: token, username: 'target', password: 'wrong' }).toString(),
      });
      lastBody = response.body;
    }
    assert.ok(lastBody.includes('κλειδωθεί'), 'the account was never locked');

    // Even the correct password is refused while the lock holds.
    const correct = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: cookies, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        _csrf: token,
        username: 'target',
        password: TEST_PASSWORD,
      }).toString(),
    });
    assert.equal(correct.statusCode, 401);
  });

  it('refuses a login for a deactivated account', async () => {
    const user = await makeStaffUser(db, { username: 'disabled', role: 'librarian' });
    db.run('UPDATE staff_user SET is_active = 0 WHERE id = ?', user.id);

    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: cookieHeader(form), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        _csrf: csrfFrom(form.body),
        username: 'disabled',
        password: TEST_PASSWORD,
      }).toString(),
    });
    assert.equal(response.statusCode, 401);
  });

  it('sends the user where they were going after login', async () => {
    const blocked = await app.inject({
      method: 'GET',
      url: '/staff',
      headers: { accept: 'text/html' },
    });
    assert.match(blocked.headers.location, /next=%2Fstaff/);

    const form = await app.inject({ method: 'GET', url: '/staff/login?next=%2Fstaff' });
    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: cookieHeader(form), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        _csrf: csrfFrom(form.body),
        username: 'maria',
        password: TEST_PASSWORD,
        redirect: '/staff',
      }).toString(),
    });
    assert.equal(response.headers.location, '/staff');
  });

  it('refuses to redirect anywhere off-site after login', async () => {
    for (const hostile of [
      'https://evil.example.com/',
      '//evil.example.com/',
      '/\\evil.example.com',
      'javascript:alert(1)',
      '/books',
      '/staff/login',
    ]) {
      const form = await app.inject({ method: 'GET', url: '/staff/login' });
      const response = await app.inject({
        method: 'POST',
        url: '/staff/login',
        headers: { cookie: cookieHeader(form), 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({
          _csrf: csrfFrom(form.body),
          username: 'maria',
          password: TEST_PASSWORD,
          redirect: hostile,
        }).toString(),
      });
      assert.equal(response.statusCode, 302);
      assert.equal(
        response.headers.location,
        '/staff',
        `redirect to "${hostile}" was not neutralised`,
      );
    }
  });

  it('sends a fresh installation to the browser setup', async () => {
    // This used to print the create-admin command, which is the right answer
    // for the admin on the server and useless to the teacher they sent the
    // link to. create-admin still exists and is still documented; the sign-in
    // page now points at the setup the visitor came here to do.
    const emptyDb = makeTestDb();
    const setup = testConfig();
    const freshApp = await buildApp({ config: setup.config, logger: false, db: emptyDb });
    await freshApp.ready();

    const response = await freshApp.inject({ method: 'GET', url: '/staff/login' });
    assert.equal(response.statusCode, 302);
    assert.equal(response.headers.location, '/setup');
    // And there is certainly no account to log into.
    assert.equal(emptyDb.value('SELECT COUNT(*) FROM staff_user'), 0);

    await freshApp.close();
    emptyDb.close();
    cleanupDir(setup.dir);
  });

  it('keeps the staff area out of search engines', async () => {
    const response = await app.inject({ method: 'GET', url: '/staff/login' });
    assert.match(response.body, /name="robots" content="noindex/);
  });
});

// `fixtures` exists so the suite runs against a populated catalogue: several
// assertions above check that a refusal leaks none of its contents.
void fixtures;
