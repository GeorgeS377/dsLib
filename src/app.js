// Application assembly: builds a configured Fastify instance without starting
// it. Tests call buildApp() and use app.inject(); src/server.js calls it and
// listens. Keeping the two apart means tests never bind a port.
import fs from 'node:fs';
import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import fastifyFormbody from '@fastify/formbody';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySession from '@fastify/session';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import ejs from 'ejs';
import Fastify from 'fastify';
import { config as defaultConfig } from './config.js';
import { getDatabase } from './db/index.js';
import { normalize } from './lib/normalize.js';
import {
  LANG_COOKIE,
  SUPPORTED_LANGS,
  hasTranslation,
  resolveLang,
  translatorFor,
} from './lib/i18n.js';
import { SqliteSessionStore } from './lib/session-store.js';
import { libraryIcon, libraryName } from './lib/settings.js';
import { brandIconFile, isSafeIconName } from './lib/upload.js';
import {
  UI_COOKIE,
  VIEW_COOKIE,
  resolveFlavour,
  resolveTemplate,
  resolveViewMode,
  stylesheetFor,
} from './lib/ui-flavour.js';
import healthRoutes from './routes/health.js';
import publicRoutes from './routes/public/index.js';
import setupRoutes from './routes/setup.js';
import staffRoutes from './routes/staff/index.js';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * How far above MAX_UPLOAD_BYTES the transport will still accept a file.
 *
 * Headroom, not a second limit: anything over MAX_UPLOAD_BYTES is still
 * refused, but by the handler, which can say so on the page and keep the rest
 * of the form. Four times covers the phone photos this exists for; past that
 * the request really is abnormal and the transport cutting it off is right.
 */
const UPLOAD_CEILING_MULTIPLIER = 4;
const THEME_COOKIE = 'theme';
const THEMES = ['light', 'dark'];

/**
 * @param {object} [options]
 * @param {typeof defaultConfig} [options.config] Override configuration (tests).
 * @param {object} [options.logger] Fastify logger options, or false to silence.
 * @param {object} [options.db] An open database, so tests can supply their own.
 * @param {(route: object) => void} [options.onRoute] Called for every route as
 *   it is registered. Exists so test/access-control.test.js can enumerate the
 *   real route table and prove no staff route is reachable unauthenticated,
 *   rather than relying on a hand-maintained list that could fall behind.
 */
export async function buildApp({ config = defaultConfig, logger, db, onRoute } = {}) {
  const app = Fastify({
    logger: logger ?? loggerOptions(config),
    trustProxy: config.trustProxy,
    // Do not echo a client-supplied request id back into logs unvalidated.
    requestIdHeader: config.trustProxy ? 'x-request-id' : false,
    bodyLimit: 256 * 1024,
    routerOptions: {
      // /staff/ and /staff should be the same page: a librarian typing a
      // trailing slash should not get a 404.
      ignoreTrailingSlash: true,
    },
    // Reject requests whose URL carries unescaped characters rather than
    // guessing at intent.
    onProtoPoisoning: 'remove',
    onConstructorPoisoning: 'remove',
  });

  app.decorate('config', config);
  app.decorate('db', db ?? getDatabase());

  // Registered before any route, so it sees all of them.
  if (onRoute) app.addHook('onRoute', onRoute);

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

  // --- File uploads -------------------------------------------------------
  // Only cover images, only from the staff area.
  //
  // attachFieldsToBody is required, not a convenience: it populates
  // request.body during preValidation, which runs *before* preHandler. The
  // CSRF check is a preHandler that reads the token from request.body, so
  // without this a multipart upload would arrive with no body for it to
  // inspect and every cover upload would be refused with a 403.
  //
  // 'keyValues' also means the file reaches the handler as a Buffer.
  //
  // limits.fileSize is deliberately *above* MAX_UPLOAD_BYTES rather than equal
  // to it. When the two matched, the transport refused an oversized file
  // during preValidation and the handler never ran — so a librarian who
  // attached a 3 MB phone photo to a title they had just typed in lost the
  // whole form to a bare 413. Now the request is accepted, the handler's own
  // check in storeCoverImage reports 'too_large', and the title is saved with
  // the cover error shown beside it. The cost is buffering one file of up to
  // this ceiling; the alternative was discarding the librarian's work.
  //
  // The field and part counts are sized for the book form, which carries its
  // cover now: a title, nine other fields, a row per author and a checkbox per
  // category can pass twenty parts in a library with a full category list.
  // They stay bounded — one file, each field capped by fieldSize — so this is
  // a limit that fits the form rather than a limit removed.
  await app.register(fastifyMultipart, {
    attachFieldsToBody: 'keyValues',
    limits: {
      fileSize: config.maxUploadBytes * UPLOAD_CEILING_MULTIPLIER,
      files: 1,
      fields: 60,
      fieldSize: 100_000,
      parts: 80,
    },
  });

  // --- Sessions -----------------------------------------------------------
  // Server-side sessions in SQLite. This is what makes logout and expiry
  // real: the row is deleted, so a copied cookie stops working immediately.
  const sessionStore = new SqliteSessionStore(app.db);
  app.decorate('sessionStore', sessionStore);
  app.addHook('onClose', async () => sessionStore.stopCleanup());

  await app.register(fastifySession, {
    secret: config.sessionSecret,
    store: sessionStore,
    // A name that does not advertise the framework.
    cookieName: 'dslib_session',
    // Only issue a session cookie once there is something to remember, so
    // anonymous catalogue visitors are not tracked at all.
    saveUninitialized: false,
    // Refresh the expiry on activity: the idle timeout is what signs an
    // unattended desk out, and config caps the absolute lifetime separately.
    rolling: true,
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      // 'auto' rather than a hard true, deliberately.
      //
      // @fastify/session refuses to send the cookie at all when secure is
      // true and request.protocol is not https. Behind an Nginx proxy that
      // terminates TLS, Fastify sees plain HTTP unless TRUST_PROXY=true — so
      // a hard true would make login silently bounce in a redirect loop that
      // is very hard to diagnose. With 'auto' the cookie gains the Secure
      // flag exactly when the connection really is HTTPS (which, with
      // trustProxy, means X-Forwarded-Proto: https), and keeps working
      // otherwise. HSTS and the deployment docs enforce HTTPS itself.
      secure: 'auto',
      maxAge: config.sessionIdleMs,
    },
  });

  if (config.isProduction && !config.trustProxy) {
    app.log.warn(
      'Running in production without TRUST_PROXY=true. If a reverse proxy ' +
        'terminates HTTPS in front of this app, set TRUST_PROXY=true so that ' +
        'session cookies are marked Secure and rate limiting sees real client IPs.',
    );
  }

  // --- CSRF ---------------------------------------------------------------
  // Tokens are bound to the session, so a token cannot be lifted from one
  // user's page and replayed by another. app.csrfProtection is applied as a
  // preHandler on every state-changing staff route.
  await app.register(fastifyCsrf, {
    sessionPlugin: '@fastify/session',
    cookieOpts: { signed: true },
    getToken: (request) => request.body?._csrf ?? request.headers['x-csrf-token'],
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
  const viewsRoot = path.join(config.projectRoot, 'src', 'views');
  await app.register(fastifyView, {
    engine: { ejs },
    root: viewsRoot,
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

  // The library's own icon, written by the setup page and the library
  // settings page. Same arrangement as covers below, for the same reasons.
  fs.mkdirSync(path.join(config.uploadDir, 'icons'), { recursive: true, mode: 0o750 });
  await app.register(fastifyStatic, {
    root: path.join(config.uploadDir, 'icons'),
    prefix: '/brand/',
    index: false,
    list: false,
    decorateReply: false,
    maxAge: config.isProduction ? '30d' : 0,
    serveDotFiles: false,
  });

  // Browsers ask for this whether or not any markup mentions it, so answering
  // with the school's icon is what stops a stock book turning up in a
  // bookmark bar. A PNG is served from the .ico path deliberately: every
  // browser in use reads the bytes rather than the extension, and generating
  // a real ICO would mean a second encoder for no gain.
  app.get('/favicon.ico', async (_request, reply) => {
    const icon = usableBrandIcon(app.db, config);
    if (!icon) {
      // The bytes, not a redirect to them: a favicon is fetched on a cold
      // visit to every page, and two round trips for an icon that has not
      // changed since the application was written is one too many.
      return reply
        .type('image/svg+xml')
        .send(fs.createReadStream(path.join(config.projectRoot, 'src', 'public', 'icon.svg')));
    }
    return reply
      .type('image/png')
      .send(fs.createReadStream(path.join(config.uploadDir, 'icons', brandIconFile(icon, 32))));
  });

  // Uploaded cover images, served read-only from outside the source tree.
  // Files here are written by the upload handler, which re-encodes every
  // image, so nothing user-supplied is served back verbatim.
  fs.mkdirSync(path.join(config.uploadDir, 'covers'), { recursive: true, mode: 0o750 });
  await app.register(fastifyStatic, {
    root: path.join(config.uploadDir, 'covers'),
    prefix: '/covers/',
    index: false,
    list: false,
    // A second @fastify/static instance must not re-decorate reply.sendFile.
    decorateReply: false,
    maxAge: config.isProduction ? '30d' : 0,
    // Never let a dotfile or an unexpected extension be served from here.
    serveDotFiles: false,
  });

  // --- Language resolution ------------------------------------------------
  // One hook sets the language for every request, so no route can forget it.
  app.decorateRequest('lang', null);
  app.decorateRequest('theme', 'light');
  app.decorateRequest('uiFlavour', 'classic');
  app.decorateRequest('viewMode', 'list');
  app.addHook('onRequest', async (request, reply) => {
    // Which of the two interfaces this visitor sees. Settled here rather than
    // in each route, so no route can forget it or disagree with another.
    const ui = resolveFlavour(request);
    request.uiFlavour = ui.flavour;
    if (ui.fromQuery) {
      reply.setCookie(UI_COOKIE, ui.flavour, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: ONE_YEAR_SECONDS,
      });
    }

    // Whether the catalogue is drawn as a list or a grid, remembered the same
    // way and validated against the same kind of allow-list.
    const view = resolveViewMode(request);
    request.viewMode = view.mode;
    if (view.fromQuery) {
      reply.setCookie(VIEW_COOKIE, view.mode, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: ONE_YEAR_SECONDS,
      });
    }

    // Theme: light unless the visitor chose otherwise. The OS preference is
    // deliberately not consulted — a school library is used in daylight on
    // shared machines, and inheriting a laptop's dark setting surprised the
    // librarian who opened it.
    const requestedTheme = request.query?.theme;
    if (THEMES.includes(requestedTheme)) {
      request.theme = requestedTheme;
      reply.setCookie(THEME_COOKIE, requestedTheme, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProduction,
        maxAge: ONE_YEAR_SECONDS,
      });
    } else {
      const saved = request.cookies?.[THEME_COOKIE];
      request.theme = THEMES.includes(saved) ? saved : 'light';
    }

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
      // Lets a template ask whether a specific message exists before falling
      // back to a generic one — see views/partials/field-error.ejs.
      hasT: hasTranslation,
      // The same folding the catalogue search uses, so a suggestion list can
      // stamp each option with the form the browser should match against —
      // see views/next/partials/suggest.ejs. Exposed here rather than
      // computed in each query so there is one place it can be forgotten.
      fold: normalize,
      lang: request.lang,
      theme: request.theme,
      uiFlavour: request.uiFlavour,
      viewMode: request.viewMode,
      viewUrl: (target) => withQueryParam(request.url, 'view', target),
      uiUrl: (target) => withQueryParam(request.url, 'ui', target),
      stylesheet: stylesheetFor(request.uiFlavour),
      supportedLangs: SUPPORTED_LANGS,
      // The database's name when one has been saved in the browser, the
      // environment's otherwise — see src/lib/settings.js for the rule.
      libraryName: libraryName(app.db, config),
      // The school's own icon, or null for the one that ships with the
      // application. Null is also the answer for a name that is not the shape
      // we write and for a file that is not on disk: a database restored
      // without its uploads must render pages, not break them.
      brandIcon: usableBrandIcon(app.db, config),
      currentPath: request.url,
      langUrl: (target) => withQueryParam(request.url, 'lang', target),
      themeUrl: (target) => withQueryParam(request.url, 'theme', target),
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
    const flavour = this.request.uiFlavour;
    return this.view(
      resolveTemplate(flavour, template, { viewsRoot }),
      { ...this.locals, ...data },
      { layout: resolveTemplate(flavour, layout, { viewsRoot }) },
    );
  });

  /**
   * Render a page in the bare staff shell — the sign-in page and anything
   * else reached without an account.
   *
   * It exists so that no route has to compose a `reply.view` call of its own.
   * The sign-in page did, and was the single page the interface flavour never
   * reached: the first page a teacher sees, still in the old look.
   */
  app.decorateReply('renderPlain', function renderPlain(template, data = {}) {
    const flavour = this.request.uiFlavour;
    const resolve = (name) => resolveTemplate(flavour, name, { viewsRoot });
    return this.view(
      resolve(template),
      { ...this.locals, ...data },
      { layout: resolve('layouts/staff-plain.ejs') },
    );
  });

  /**
   * Render a first-run setup step.
   *
   * The one place in the application that ignores the interface flavour. The
   * first interface is retiring and was never given a setup page, and the
   * default flavour is still the old one — so a teacher following the admin's
   * link on a fresh deployment would otherwise meet a 500 or a half-rendered
   * page. `setupStep` tells the plain layout to put "Εγκατάσταση" where the
   * sign-out would be: nobody has an account to sign out of yet.
   */
  app.decorateReply('renderSetup', function renderSetup(template, data = {}) {
    const resolve = (name) => resolveTemplate('next', name, { viewsRoot });
    return this.view(
      resolve(template),
      { ...this.locals, setupStep: data.step ?? 1, ...data },
      { layout: resolve('layouts/staff-plain.ejs') },
    );
  });

  // Routes resolve their own template names through the same rule, so a page
  // rendered outside the decorators still lands in the right interface.
  app.decorate('viewsRoot', viewsRoot);

  // --- Routes -------------------------------------------------------------
  await app.register(healthRoutes);
  await app.register(setupRoutes);
  await app.register(staffRoutes);
  await app.register(publicRoutes);

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

/**
 * The library's uploaded icon, if there is really one to serve.
 *
 * Three ways there is not, and all three are ordinary rather than exceptional:
 * nobody has uploaded one; the stored value is not a name this application
 * writes, which is what a hand-edited row or an older format looks like; or
 * the name is right but the file is not there, which is what restoring a
 * database backup without its uploads looks like. Each answers null, and the
 * templates fall back to the icon that ships in the repository — so the worst
 * case is a stock book rather than a broken page.
 *
 * @returns {string | null}
 */
function usableBrandIcon(db, config) {
  const name = libraryIcon(db);
  if (!name || !isSafeIconName(name)) return null;
  return fs.existsSync(path.join(config.uploadDir, 'icons', brandIconFile(name, 32)))
    ? name
    : null;
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
