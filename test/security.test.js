// Security controls that need their own setup: rate limiting (disabled in the
// test configuration, so these build an app with it switched on), the session
// store's expiry behaviour, and CSRF token binding.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { SqliteSessionStore } from '../src/lib/session-store.js';
import { safeRedirect } from '../src/lib/auth.js';
import { cleanupDir, makeTestDb, testConfig } from './helpers.js';
import { TEST_PASSWORD, cookieHeader, csrfFrom, login, makeStaffUser } from './staff-helpers.js';

describe('login rate limiting', () => {
  let app;
  let db;
  let dir;

  before(async () => {
    // Rate limiting is deliberately off under NODE_ENV=test so the rest of
    // the suite is not throttled. Build a development app to exercise it.
    const setup = testConfig({ NODE_ENV: 'development' });
    dir = setup.dir;
    db = makeTestDb();
    await makeStaffUser(db);
    app = await buildApp({ config: setup.config, logger: false, db });
    await app.ready();
  });

  after(async () => {
    await app.close();
    db.close();
    cleanupDir(dir);
  });

  it('throttles repeated login attempts from one address', async () => {
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const token = csrfFrom(form.body);
    const cookies = cookieHeader(form);

    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/staff/login',
        headers: {
          cookie: cookies,
          'content-type': 'application/x-www-form-urlencoded',
          'x-forwarded-for': '203.0.113.9',
        },
        payload: new URLSearchParams({
          _csrf: token,
          username: 'someone-else',
          password: 'guessing-away-here',
        }).toString(),
      });

    let throttled = false;
    for (let i = 0; i < 20 && !throttled; i += 1) {
      const response = await attempt();
      if (response.statusCode === 429) throttled = true;
    }

    assert.ok(throttled, 'login was never rate limited');
  });

  it('still serves the public catalogue while login is throttled', async () => {
    const response = await app.inject({ method: 'GET', url: '/books' });
    assert.equal(response.statusCode, 200);
  });
});

describe('session store', () => {
  it('stores, reads back and destroys a session', async () => {
    const db = makeTestDb();
    const store = new SqliteSessionStore(db);

    const session = { staffUserId: 7, cookie: { maxAge: 60_000 } };
    await new Promise((resolve, reject) =>
      store.set('sid-1', session, (error) => (error ? reject(error) : resolve())),
    );

    const loaded = await new Promise((resolve, reject) =>
      store.get('sid-1', (error, value) => (error ? reject(error) : resolve(value))),
    );
    assert.equal(loaded.staffUserId, 7);

    await new Promise((resolve) => store.destroy('sid-1', resolve));
    const gone = await new Promise((resolve) => store.get('sid-1', (_e, value) => resolve(value)));
    assert.equal(gone, null);

    store.stopCleanup();
    db.close();
  });

  it('treats an expired session as absent and removes it', async () => {
    const db = makeTestDb();
    const store = new SqliteSessionStore(db);

    await new Promise((resolve) =>
      store.set('sid-old', { staffUserId: 1, cookie: { maxAge: 1000 } }, resolve),
    );
    // Push the expiry into the past, as the passage of time would.
    db.run('UPDATE session SET expires_at = ? WHERE sid = ?', Date.now() - 1000, 'sid-old');

    const loaded = await new Promise((resolve) =>
      store.get('sid-old', (_e, value) => resolve(value)),
    );
    assert.equal(loaded, null, 'an expired session was returned');
    assert.equal(db.value('SELECT COUNT(*) FROM session WHERE sid = ?', 'sid-old'), 0);

    store.stopCleanup();
    db.close();
  });

  it('sweeps expired rows so the table cannot grow without bound', async () => {
    const db = makeTestDb();
    const store = new SqliteSessionStore(db);

    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) =>
        store.set(`sid-${i}`, { cookie: { maxAge: 1000 } }, resolve),
      );
    }
    db.run('UPDATE session SET expires_at = ?', Date.now() - 1);
    await new Promise((resolve) => store.set('sid-live', { cookie: { maxAge: 60_000 } }, resolve));

    assert.equal(store.cleanup(), 5);
    assert.equal(db.value('SELECT COUNT(*) FROM session'), 1);

    store.stopCleanup();
    db.close();
  });

  it('logs a corrupt session row out instead of throwing', async () => {
    const db = makeTestDb();
    const store = new SqliteSessionStore(db);

    db.run(
      'INSERT INTO session (sid, data, expires_at, created_at) VALUES (?, ?, ?, ?)',
      'sid-bad',
      'this is not json',
      Date.now() + 60_000,
      new Date().toISOString(),
    );

    const loaded = await new Promise((resolve) =>
      store.get('sid-bad', (_e, value) => resolve(value)),
    );
    assert.equal(loaded, null);
    assert.equal(db.value('SELECT COUNT(*) FROM session WHERE sid = ?', 'sid-bad'), 0);

    store.stopCleanup();
    db.close();
  });

  it('can revoke every session for one account', async () => {
    const db = makeTestDb();
    const store = new SqliteSessionStore(db);

    await new Promise((resolve) => store.set('a', { staffUserId: 1, cookie: { maxAge: 60_000 } }, resolve));
    await new Promise((resolve) => store.set('b', { staffUserId: 1, cookie: { maxAge: 60_000 } }, resolve));
    await new Promise((resolve) => store.set('c', { staffUserId: 2, cookie: { maxAge: 60_000 } }, resolve));

    assert.equal(store.destroyForUser(1), 2);
    assert.equal(db.value('SELECT COUNT(*) FROM session'), 1);

    store.stopCleanup();
    db.close();
  });

  it('never leaves a session without an expiry', async () => {
    const db = makeTestDb();
    const store = new SqliteSessionStore(db);

    // A session with no cookie information at all must still expire.
    await new Promise((resolve) => store.set('sid-x', { staffUserId: 3 }, resolve));
    const expiresAt = db.value('SELECT expires_at FROM session WHERE sid = ?', 'sid-x');
    assert.ok(expiresAt > Date.now(), 'expiry is already past');
    assert.ok(expiresAt < Date.now() + 24 * 3600 * 1000, 'session would outlive a day');

    store.stopCleanup();
    db.close();
  });
});

describe('CSRF token binding', () => {
  let app;
  let db;
  let dir;

  before(async () => {
    const setup = testConfig();
    dir = setup.dir;
    db = makeTestDb();
    await makeStaffUser(db);
    await makeStaffUser(db, { username: 'second', role: 'librarian' });
    app = await buildApp({ config: setup.config, logger: false, db });
    await app.ready();
  });

  after(async () => {
    await app.close();
    db.close();
    cleanupDir(dir);
  });

  it('rejects a token issued to a different session', async () => {
    const victim = await login(app, { username: 'maria' });
    const attacker = await login(app, { username: 'second' });

    // Take a valid token from the attacker's own page...
    const attackerPage = await attacker.get('/staff');
    const attackerToken = csrfFrom(attackerPage.body);

    // ...and try to use it against the victim's session.
    const response = await app.inject({
      method: 'POST',
      url: '/staff/logout',
      headers: { cookie: victim.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ _csrf: attackerToken }).toString(),
    });

    assert.equal(response.statusCode, 403, 'a cross-session CSRF token was accepted');
    // The victim's session is untouched.
    assert.equal((await victim.get('/staff')).statusCode, 200);
  });

  it('rejects a tampered token', async () => {
    const session = await login(app);
    const page = await session.get('/staff');
    const token = csrfFrom(page.body);

    const response = await app.inject({
      method: 'POST',
      url: '/staff/logout',
      headers: { cookie: session.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ _csrf: `${token.slice(0, -2)}xy` }).toString(),
    });
    assert.equal(response.statusCode, 403);
  });

  it('rejects a missing token', async () => {
    const session = await login(app);
    assert.equal((await session.postWithoutCsrf('/staff/logout')).statusCode, 403);
  });

  it('puts a token in every staff form', async () => {
    const session = await login(app);
    const page = await session.get('/staff');

    const forms = page.body.match(/<form[^>]*method="post"[\s\S]*?<\/form>/gi) ?? [];
    assert.ok(forms.length > 0, 'no POST forms on the dashboard to check');
    for (const form of forms) {
      assert.match(form, /name="_csrf"/, `a POST form has no CSRF token: ${form.slice(0, 120)}`);
    }
  });
});

describe('redirect safety', () => {
  it('accepts only local staff paths', () => {
    assert.equal(safeRedirect('/staff'), '/staff');
    assert.equal(safeRedirect('/staff/books/5/copies'), '/staff/books/5/copies');
    assert.equal(safeRedirect('/staff?q=x'), '/staff?q=x');
  });

  it('rejects anything that could leave the site or loop', () => {
    for (const hostile of [
      'https://evil.example.com',
      'http://evil.example.com',
      '//evil.example.com',
      '/\\evil.example.com',
      'javascript:alert(1)',
      'data:text/html,<script>',
      '/staff\\..\\..',
      '/books',
      '/',
      '/staff/login',
      '/staff/login?next=/staff',
      '',
      null,
      undefined,
      42,
      `/staff${'x'.repeat(600)}`,
      '/staff\nLocation: https://evil.example.com',
      '/staff\r\nSet-Cookie: a=b',
    ]) {
      assert.equal(safeRedirect(hostile), null, `accepted hostile redirect: ${String(hostile)}`);
    }
  });
});

describe('password handling at the HTTP boundary', () => {
  let app;
  let db;
  let dir;

  before(async () => {
    const setup = testConfig();
    dir = setup.dir;
    db = makeTestDb();
    await makeStaffUser(db);
    app = await buildApp({ config: setup.config, logger: false, db });
    await app.ready();
  });

  after(async () => {
    await app.close();
    db.close();
    cleanupDir(dir);
  });

  it('accepts a very long password without error', async () => {
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: cookieHeader(form), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        _csrf: csrfFrom(form.body),
        username: 'maria',
        password: 'x'.repeat(1024),
      }).toString(),
    });
    assert.equal(response.statusCode, 401);
  });

  it('rejects an over-long password field rather than hashing it', async () => {
    const form = await app.inject({ method: 'GET', url: '/staff/login' });
    const response = await app.inject({
      method: 'POST',
      url: '/staff/login',
      headers: { cookie: cookieHeader(form), 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({
        _csrf: csrfFrom(form.body),
        username: 'maria',
        password: 'x'.repeat(5000),
      }).toString(),
    });
    assert.equal(response.statusCode, 401);
  });

  it('logs in with a Greek password', async () => {
    await makeStaffUser(db, { username: 'greekpass', password: 'κωδικός-πρόσβασης-2026' });
    const session = await login(app, { username: 'greekpass', password: 'κωδικός-πρόσβασης-2026' });
    assert.equal((await session.get('/staff')).statusCode, 200);
  });

  it('writes no password or session id into the audit log', async () => {
    await login(app, { username: 'maria', password: TEST_PASSWORD });
    const entries = db.all('SELECT * FROM audit_log');
    const serialized = JSON.stringify(entries);
    assert.ok(!serialized.includes(TEST_PASSWORD));
    assert.ok(!serialized.includes('scrypt$'));

    const sessionIds = db.all('SELECT sid FROM session').map((r) => r.sid);
    for (const sid of sessionIds) {
      assert.ok(!serialized.includes(sid), 'a session id reached the audit log');
    }
  });
});
