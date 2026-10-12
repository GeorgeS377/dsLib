// Password hashing.
//
// Uses scrypt from node:crypto — a memory-hard algorithm accepted by OWASP,
// provided by the platform. No custom cryptography is implemented here: this
// file only formats, parses and compares what crypto.scrypt produces.
//
// Why not argon2 or bcrypt: both are native modules, which would require a C
// toolchain on the deployment server and a rebuild after every Node upgrade.
// scrypt is built in, so the dependency tree stays pure JavaScript.
import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// OWASP's scrypt guidance: minimum N=2^15 with r=8, p=1 (ask for more memory
// if you can afford it). N=2^15, r=8 needs 128 * N * r = 32 MiB per hash,
// which is comfortable for the handful of logins this app sees.
const PARAMS = { N: 32768, r: 8, p: 1 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
// crypto.scrypt refuses to allocate past maxmem; the default is exactly 32 MiB,
// which our parameters sit on the boundary of. Raise it so the call succeeds.
const MAX_MEM = 96 * 1024 * 1024;

const PREFIX = 'scrypt';

/**
 * Hash a password into a self-describing string:
 *   scrypt$N$r$p$salt_base64$hash_base64
 * Storing the parameters alongside the hash means they can be raised later
 * without invalidating existing passwords.
 *
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('A password is required');
  }
  // Guard against a huge input being used to burn CPU.
  if (password.length > 1024) {
    throw new Error('Password is too long');
  }

  const salt = crypto.randomBytes(SALT_LENGTH);
  const derived = await scrypt(normalizePassword(password), salt, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });

  return [
    PREFIX,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/**
 * Verify a password against a stored hash. Returns false — never throws — on
 * a malformed or unrecognised hash, so a corrupt row cannot turn a failed
 * login into a 500.
 *
 * @param {string} password
 * @param {string} stored
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;

  const parsed = parseHash(stored);
  if (!parsed) return false;

  try {
    const derived = await scrypt(normalizePassword(password), parsed.salt, parsed.hash.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
      maxmem: MAX_MEM,
    });
    // Constant-time comparison: a plain === would leak how much of the hash
    // matched through timing.
    return crypto.timingSafeEqual(derived, parsed.hash);
  } catch {
    return false;
  }
}

/**
 * Spend the same work as a real verification without having a user to check.
 *
 * Called on the login path when the username does not exist, so that a
 * response for an unknown account takes as long as one for a known account.
 * Without this, response timing reveals which usernames are registered.
 */
export async function verifyPasswordDummy(password) {
  await scrypt(normalizePassword(typeof password === 'string' ? password : ''), DUMMY_SALT, KEY_LENGTH, {
    ...PARAMS,
    maxmem: MAX_MEM,
  });
  return false;
}

const DUMMY_SALT = crypto.randomBytes(SALT_LENGTH);

/** Whether a stored hash uses parameters weaker than the current policy. */
export function needsRehash(stored) {
  const parsed = parseHash(stored);
  if (!parsed) return true;
  return parsed.N < PARAMS.N || parsed.r < PARAMS.r || parsed.p < PARAMS.p;
}

function parseHash(stored) {
  const parts = stored.split('$');
  if (parts.length !== 6) return null;
  const [prefix, n, r, p, saltB64, hashB64] = parts;
  if (prefix !== PREFIX) return null;

  const N = Number(n);
  const rValue = Number(r);
  const pValue = Number(p);
  // Reject implausible parameters rather than attempting a huge allocation
  // that a corrupted or hostile row could request.
  if (!Number.isInteger(N) || N < 1024 || N > 1_048_576) return null;
  if (!Number.isInteger(rValue) || rValue < 1 || rValue > 32) return null;
  if (!Number.isInteger(pValue) || pValue < 1 || pValue > 16) return null;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const hash = Buffer.from(hashB64, 'base64');
    if (salt.length < 8 || hash.length < 16) return null;
    return { N, r: rValue, p: pValue, salt, hash };
  } catch {
    return null;
  }
}

/**
 * Unicode-normalize before hashing so that a Greek password typed on two
 * keyboards that produce different byte sequences for the same characters
 * (composed vs decomposed accents) still verifies.
 */
function normalizePassword(password) {
  return password.normalize('NFKC');
}

/**
 * Minimum password policy, applied when an account is created or changed.
 * Length is the control that matters; composition rules mostly push people
 * toward predictable substitutions, so there are none here.
 *
 * @returns {{ ok: true } | { ok: false, reason: 'too_short' | 'too_long' | 'too_common' }}
 */
export function checkPasswordStrength(password) {
  if (typeof password !== 'string' || password.normalize('NFC').length < 12) {
    return { ok: false, reason: 'too_short', minLength: 12 };
  }
  if (password.length > 1024) return { ok: false, reason: 'too_long' };

  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.some((candidate) => lowered === candidate)) {
    return { ok: false, reason: 'too_common' };
  }
  return { ok: true };
}

export const MIN_PASSWORD_LENGTH = 12;

// A deliberately short list: enough to stop the laziest choices at account
// creation without pretending to be a breach corpus.
//
// Every entry is at least MIN_PASSWORD_LENGTH characters. Anything shorter
// would be unreachable here, because the length check above rejects it first.
const COMMON_PASSWORDS = [
  'password1234',
  'passwordpassword',
  '123456789012',
  'qwertyuiop12',
  'librarian123',
  'administrator',
  'letmein12345',
  'bibliothiki1',
  'vivliothiki1',
  'schoollibrary',
  'βιβλιοθηκη12',
];
