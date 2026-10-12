// Application skeleton: boot, health check, security headers, error pages and
// language switching. These run without a database.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { cleanupDir, cookieValue, testConfig } from './helpers.js';

describe('application skeleton', () => {
  let app;
  let dir;

  before(async () => {
    const setup = testConfig();
    dir = setup.dir;
    app = await buildApp({ config: setup.config, logger: false });
    await app.ready();
  });

  after(async () => {
    await app.close();
    cleanupDir(dir);
  });

  describe('health check', () => {
    it('reports ok', async () => {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      assert.equal(response.statusCode, 200);
      const body = response.json();
      assert.equal(body.status, 'ok');
      assert.equal(typeof body.uptimeSeconds, 'number');
    });

    it('is not cached', async () => {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      assert.equal(response.headers['cache-control'], 'no-store');
    });

    it('exposes no secrets or configuration', async () => {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      const raw = response.body.toLowerCase();
      for (const forbidden of ['secret', 'password', 'database_path', '/tmp', 'sqlite']) {
        assert.ok(!raw.includes(forbidden), `health output leaked "${forbidden}"`);
      }
    });
  });

  describe('security headers', () => {
    it('sets a content security policy with no inline allowance', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      const csp = response.headers['content-security-policy'];
      assert.ok(csp, 'missing CSP header');
      assert.ok(csp.includes("default-src 'self'"));
      assert.ok(!csp.includes("'unsafe-inline'"), 'CSP allows inline code');
      assert.ok(!csp.includes("'unsafe-eval'"), 'CSP allows eval');
      assert.ok(csp.includes("frame-ancestors 'none'"));
    });

    it('sets the other standard protections', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      assert.equal(response.headers['referrer-policy'], 'same-origin');
      assert.ok(response.headers['x-frame-options']);
    });

    it('does not advertise the server technology', async () => {
      const response = await app.inject({ method: 'GET', url: '/' });
      assert.equal(response.headers['x-powered-by'], undefined);
    });
  });

  describe('error pages', () => {
    it('renders a Greek 404 page by default', async () => {
      const response = await app.inject({ method: 'GET', url: '/no-such-page' });
      assert.equal(response.statusCode, 404);
      assert.match(response.headers['content-type'], /text\/html/);
      assert.ok(response.body.includes('Η σελίδα δεν βρέθηκε'));
    });

    it('renders the 404 page in English when asked', async () => {
      const response = await app.inject({ method: 'GET', url: '/no-such-page?lang=en' });
      assert.equal(response.statusCode, 404);
      assert.ok(response.body.includes('Page not found'));
    });

    it('returns JSON to API-style callers without internal detail', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/no-such-page',
        headers: { accept: 'application/json' },
      });
      assert.equal(response.statusCode, 404);
      assert.deepEqual(response.json(), { error: 'Not found' });
    });

    it('leaks no stack trace or file path on an unexpected failure', async () => {
      // A route that throws, registered on a throwaway instance so the main
      // app under test keeps no debug endpoints.
      const setup = testConfig();
      const crashing = await buildApp({ config: setup.config, logger: false });
      crashing.get('/boom', async () => {
        throw new Error('Secret internal detail: connection string xyz');
      });
      await crashing.ready();

      const response = await crashing.inject({ method: 'GET', url: '/boom' });
      assert.equal(response.statusCode, 500);
      assert.ok(!response.body.includes('Secret internal detail'));
      assert.ok(!response.body.includes('connection string'));
      assert.ok(!response.body.includes('/home/'));
      assert.ok(!response.body.toLowerCase().includes('at object'));
      assert.ok(response.body.includes('Κάτι πήγε λάθος'));

      await crashing.close();
      cleanupDir(setup.dir);
    });
  });

  describe('language handling', () => {
    it('defaults to Greek', async () => {
      const response = await app.inject({ method: 'GET', url: '/no-such-page' });
      assert.ok(response.body.includes('<html lang="el">'));
    });

    it('remembers an explicit choice in an httpOnly cookie', async () => {
      const response = await app.inject({ method: 'GET', url: '/no-such-page?lang=en' });
      assert.equal(cookieValue(response, 'lang'), 'en');
      const header = [].concat(response.headers['set-cookie']).join(';');
      assert.match(header, /HttpOnly/i);
      assert.match(header, /SameSite=Lax/i);
    });

    it('honours the saved cookie on later requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/no-such-page',
        cookies: { lang: 'en' },
      });
      assert.ok(response.body.includes('<html lang="en">'));
    });

    it('sets no cookie when the language was not chosen explicitly', async () => {
      const response = await app.inject({ method: 'GET', url: '/no-such-page' });
      assert.equal(cookieValue(response, 'lang'), undefined);
    });

    it('ignores an unsupported language value', async () => {
      const response = await app.inject({ method: 'GET', url: '/no-such-page?lang=fr' });
      assert.ok(response.body.includes('<html lang="el">'));
      assert.equal(cookieValue(response, 'lang'), undefined);
    });
  });

  describe('static assets', () => {
    it('serves the stylesheet', async () => {
      const response = await app.inject({ method: 'GET', url: '/assets/css/app.css' });
      assert.equal(response.statusCode, 200);
      assert.match(response.headers['content-type'], /text\/css/);
    });

    it('refuses to traverse out of the asset directory', async () => {
      for (const attempt of [
        '/assets/../config.js',
        '/assets/%2e%2e/config.js',
        '/assets/..%2fconfig.js',
        '/assets/....//config.js',
      ]) {
        const response = await app.inject({ method: 'GET', url: attempt });
        assert.ok(
          response.statusCode >= 400,
          `traversal attempt ${attempt} returned ${response.statusCode}`,
        );
        assert.ok(!response.body.includes('SESSION_SECRET'));
      }
    });

    it('does not list directories', async () => {
      const response = await app.inject({ method: 'GET', url: '/assets/' });
      assert.ok(response.statusCode >= 400);
    });
  });
});

describe('configuration', () => {
  it('refuses to start in production without a session secret', async () => {
    const { loadConfig } = await import('../src/config.js');
    assert.throws(
      () => loadConfig({ NODE_ENV: 'production' }),
      /SESSION_SECRET must be set/,
    );
  });

  it('rejects the placeholder secret in production', async () => {
    const { loadConfig } = await import('../src/config.js');
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: 'production',
          SESSION_SECRET: 'replace-me-with-at-least-32-random-characters',
        }),
      /SESSION_SECRET must be set/,
    );
  });

  it('allows development to run without a configured secret', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig({ NODE_ENV: 'development' });
    assert.equal(config.sessionUsingEphemeralSecret, true);
    assert.ok(config.sessionSecret.length >= 32);
  });

  it('rejects an absolute session cap below the idle timeout', async () => {
    const { loadConfig } = await import('../src/config.js');
    assert.throws(
      () =>
        loadConfig({
          NODE_ENV: 'test',
          SESSION_IDLE_MINUTES: '600',
          SESSION_ABSOLUTE_MINUTES: '60',
        }),
      /SESSION_ABSOLUTE_MINUTES/,
    );
  });

  it('rejects an out-of-range port', async () => {
    const { loadConfig } = await import('../src/config.js');
    assert.throws(() => loadConfig({ PORT: '99999' }), /Invalid configuration/);
  });
});
