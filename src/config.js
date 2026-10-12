// Environment configuration, validated once at startup.
//
// The app refuses to boot on invalid configuration rather than failing later in
// a confusing way. In particular it will not start in production without a real
// SESSION_SECRET, so there is no way to accidentally ship the example value.
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(here, '..');

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

// The placeholder shipped in .env.example. Treated as "unset" so that copying
// the example file without editing it cannot pass for a configured secret.
const PLACEHOLDER_SECRET = 'replace-me-with-at-least-32-random-characters';

const booleanish = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUST_PROXY: booleanish.default('false'),

  SESSION_SECRET: z.string().default(''),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(10080).default(480),
  SESSION_ABSOLUTE_MINUTES: z.coerce.number().int().min(1).max(10080).default(720),

  DATABASE_PATH: z.string().min(1).default('./data/library.db'),

  UPLOAD_DIR: z.string().min(1).default('./data/uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(20 * 1024 * 1024).default(2 * 1024 * 1024),

  DEFAULT_LOAN_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  DEFAULT_LANG: z.enum(['el', 'en']).default('el'),
  LIBRARY_NAME: z.string().min(1).default('Σχολική Βιβλιοθήκη'),
});

function load(env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${details}\n\nSee .env.example.`);
  }
  const c = parsed.data;
  const isProduction = c.NODE_ENV === 'production';
  const isTest = c.NODE_ENV === 'test';

  const secretMissing = c.SESSION_SECRET.length < 32 || c.SESSION_SECRET === PLACEHOLDER_SECRET;
  if (secretMissing && isProduction) {
    throw new Error(
      'SESSION_SECRET must be set to at least 32 random characters in production.\n' +
        'Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }

  // Outside production an ephemeral secret keeps development frictionless. It
  // changes on every restart, which invalidates existing sessions — acceptable
  // locally, and never reachable in production because of the check above.
  const sessionSecret = secretMissing
    ? 'dev-only-ephemeral-secret-' + Math.random().toString(36).slice(2).padEnd(32, 'x')
    : c.SESSION_SECRET;

  if (c.SESSION_ABSOLUTE_MINUTES < c.SESSION_IDLE_MINUTES) {
    throw new Error(
      'SESSION_ABSOLUTE_MINUTES must be greater than or equal to SESSION_IDLE_MINUTES.',
    );
  }

  const resolve = (p) => (path.isAbsolute(p) ? p : path.resolve(projectRoot, p));

  return {
    env: c.NODE_ENV,
    isProduction,
    isTest,
    isDevelopment: c.NODE_ENV === 'development',
    host: c.HOST,
    port: c.PORT,
    trustProxy: c.TRUST_PROXY,

    sessionSecret,
    sessionUsingEphemeralSecret: secretMissing,
    sessionIdleMs: c.SESSION_IDLE_MINUTES * 60_000,
    sessionAbsoluteMs: c.SESSION_ABSOLUTE_MINUTES * 60_000,

    databasePath: resolve(c.DATABASE_PATH),
    uploadDir: resolve(c.UPLOAD_DIR),
    maxUploadBytes: c.MAX_UPLOAD_BYTES,

    defaultLoanDays: c.DEFAULT_LOAN_DAYS,
    defaultLang: c.DEFAULT_LANG,
    libraryName: c.LIBRARY_NAME,
    projectRoot,
  };
}

export { load as loadConfig };
export const config = load(process.env);
export default config;
