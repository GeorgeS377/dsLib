// Application assembly: builds a configured Fastify instance without starting
// it. Tests call buildApp() and use app.inject(); src/server.js calls it and
// listens. Keeping the two apart means tests never bind a port.
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyFormbody from '@fastify/formbody';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import Fastify from 'fastify';
import { config as defaultConfig } from './config.js';
import { LANG_COOKIE, SUPPORTED_LANGS, resolveLang, translatorFor } from './lib/i18n.js';
import healthRoutes from './routes/health.js';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * @param {object} [options]
 * @param {typeof defaultConfig} [options.config] Override configuration (tests).
 * @param {object} [options.logger] Fastify logger options, or false to silence.
 */
export async function buildApp({ config = defaultConfig, logger } = {}) {
  const app = Fastify({
    logger: logger ?? loggerOptions(config),
    trustProxy: config.trustProxy,
    // Do not echo a client-supplied request id back into logs unvalidated.
    requestIdHeader: config.trustProxy ? 'x-request-id' : false,
    bodyLimit: 256 * 1024,
    // Reject requests whose URL carries unescaped characters rather than
    // guessing at intent.
    onProtoPoisoning: 'remove',
    onConstructorPoisoning: 'remove',
  });

  app.decorate('config', config);

  // --- Security headers ---------------------------------------------------
  // No inline scripts or styles anywhere in this app, so the CSP can stay
  // strict without nonces. Cover images are served from our own origin;
  // data: is allowed for the inlined SVG icons in CSS.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'same-origin' },
    // HSTS only makes sense once HTTPS terminates in front of us.
    strictTransportSecurity: config.isProduction
      ? { maxAge: 15552000, includeSubDomains: true }
      : false,
  });

  // --- Request parsing ----------------------------------------------------
  await app.register(fastifyFormbody);
  await app.register(fastifyCookie, {
    secret: config.sessionSecret,
    parseOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
    },
  });

  // --- Rate limiting ------------------------------------------------------
  // A generous global ceiling; the login route tightens this considerably.
  await app.register(fastifyRateLimit, {
    global: true,
    max: config.isTest ? 100_000 : 300,
    timeWindow: '1 minute',
    // Never rate-limit by a header we do not trust.
    keyGenerator: (request) => request.ip,
    allowList: () => config.isTest,
  });

  // --- Templates ----------------------------------------------------------
  await app.register(fastifyView, {
    engine: { ejs },
    root: path.join(config.projectRoot, 'src', 'views'),
    viewExt: 'ejs',
    // EJS caches compiled templates; disable in development so edits show up.
    production: config.isProduction,
    defaultContext: {},
    options: {
      // Keep EJS from leaking filesystem details into rendered output.
      rmWhitespace: false,
    },
  });

  // --- Static assets ------------------------------------------------------
  await app.register(fastifyStatic, {
    root: path.join(config.projectRoot, 'src', 'public'),
    prefix: '/assets/',
    index: false,
    // No directory listing: it would expose the asset tree for no benefit.
    list: false,
    maxAge: config.isProduction ? '7d' : 0,
  });

  // --- Language resolution ------------------------------------------------
  // One hook sets the language for every request, so no route can forget it.
  app.decorateRequest('lang', null);
  app.addHook('onRequest', async (request, reply) => {
    const { lang, fromQuery } = resolveLang(request, config.defaultLang);
    request.lang = lang;
    if (fromQuery) {
      // Remember an explicit choice. Readable by client script is unnecessary,
      // so keep it httpOnly like every other cookie we set.
      reply.setCookie(LANG_COOKIE, lang, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: ONE_YEAR_SECONDS,
      });
    }
  });

  // Template locals shared by every page. @fastify/view already decorates
  // reply.locals and merges it into the render context, so we only assign it.
  app.addHook('preHandler', async (request, reply) => {
    reply.locals = {
      t: translatorFor(request.lang),
      lang: request.lang,
      supportedLangs: SUPPORTED_LANGS,
      libraryName: config.libraryName,
      currentPath: request.url,
      langUrl: (target) => withQueryParam(request.url, 'lang', target),
      staffUser: null,
      csrfToken: null,
      flash: [],
    };
  });

  /**
   * Render a page inside a layout, merging the shared locals. Views should use
   * this rather than reply.view so that a new page cannot miss `t` or `lang`.
   */
  app.decorateReply('render', function render(template, data = {}, layout = 'layouts/public.ejs') {
    return this.view(template, { ...this.locals, ...data }, { layout });
  });

  // --- Routes -------------------------------------------------------------
  await app.register(healthRoutes);

  // --- Error handling -----------------------------------------------------
  // Visitors see a generic page; the detail goes to the log only. This is what
  // keeps stack traces and SQL off the public site.
  app.setNotFoundHandler(
    {
      preHandler: app.rateLimit
        ? app.rateLimit({ max: config.isTest ? 100_000 : 60, timeWindow: '1 minute' })
        : undefined,
    },
    async (request, reply) => {
      reply.code(404);
      if (wantsJson(request)) return { error: genericMessage(404) };
      return renderError(reply, 404);
    },
  );

  app.setErrorHandler(async (error, request, reply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    if (status >= 500) {
      request.log.error({ err: error, url: request.url }, 'request failed');
    } else {
      request.log.warn({ err: error.message, statusCode: status, url: request.url }, 'request rejected');
    }

    // API-ish callers get JSON without any internal detail.
    if (wantsJson(request)) {
      reply.code(status);
      return { error: genericMessage(status) };
    }

    reply.code(status);
    return renderError(reply, status);
  });

  return app;
}

/** Render one of the error templates, falling back to plain text. */
async function renderError(reply, status) {
  const known = [403, 404, 429, 500].includes(status) ? status : 500;
  try {
    return await reply.render('public/error', { status: known });
  } catch {
    // If template rendering is itself broken, still say nothing revealing.
    reply.type('text/plain; charset=utf-8');
    return genericMessage(known);
  }
}

function genericMessage(status) {
  if (status === 404) return 'Not found';
  if (status === 403) return 'Forbidden';
  if (status === 429) return 'Too many requests';
  if (status < 500) return 'Bad request';
  return 'Internal server error';
}

function wantsJson(request) {
  if (request.url.startsWith('/healthz')) return true;
  const accept = request.headers?.accept ?? '';
  return accept.includes('application/json') && !accept.includes('text/html');
}

/** Replace or add one query parameter, preserving the rest. */
function withQueryParam(url, key, value) {
  const parsed = new URL(url, 'http://placeholder');
  parsed.searchParams.set(key, value);
  // Drop the page number: switching language should not land on a stale page.
  parsed.searchParams.delete('page');
  return parsed.pathname + (parsed.search || '');
}

function loggerOptions(config) {
  if (config.isTest) return false;
  return {
    level: config.isProduction ? 'info' : 'debug',
    // Never let credentials or session material reach the log files.
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'password',
        'passwordConfirm',
        'req.body.password',
        'req.body.passwordConfirm',
      ],
      censor: '[redacted]',
    },
    serializers: {
      req: (request) => ({
        method: request.method,
        url: request.url,
        remoteAddress: request.ip,
      }),
    },
  };
}

export default buildApp;
