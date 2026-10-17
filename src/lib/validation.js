// Input validation.
//
// Every value that arrives from a request passes through a schema here before
// it reaches the database. Validation runs on the server regardless of what
// the browser already checked, because HTML attributes are a convenience for
// the user, not a security control.
import { z } from 'zod';
import { SORT_OPTIONS } from '../db/queries/books.js';
import { COPY_STATUSES } from '../db/queries/copies.js';

// --------------------------------------------------------------------- ISBN

/**
 * Strip formatting from an ISBN. Hyphens and spaces are how people write
 * them; digits are how we store them.
 */
export function cleanIsbn(value) {
  return String(value ?? '').replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Validate an ISBN-10 including its check digit. The last character may be
 * 'X', standing for 10.
 */
export function isValidIsbn10(value) {
  const isbn = cleanIsbn(value);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += (10 - i) * Number(isbn[i]);
  sum += isbn[9] === 'X' ? 10 : Number(isbn[9]);
  return sum % 11 === 0;
}

/** Validate an ISBN-13 including its check digit. */
export function isValidIsbn13(value) {
  const isbn = cleanIsbn(value);
  if (!/^\d{13}$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isbn[12]);
}

/** Convert a valid ISBN-10 to its ISBN-13 equivalent. */
export function isbn10To13(value) {
  const isbn = cleanIsbn(value);
  if (!isValidIsbn10(isbn)) return null;

  const core = `978${isbn.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

/**
 * Accept either ISBN form and return both, normalized.
 * @returns {{ ok: true, isbn13: string|null, isbn10: string|null } | { ok: false }}
 */
export function parseIsbn(value) {
  const isbn = cleanIsbn(value);
  if (!isbn) return { ok: true, isbn13: null, isbn10: null };

  if (isValidIsbn13(isbn)) return { ok: true, isbn13: isbn, isbn10: null };
  if (isValidIsbn10(isbn)) return { ok: true, isbn13: isbn10To13(isbn), isbn10: isbn };
  return { ok: false };
}

// ------------------------------------------------------------------ helpers

/** Trim a string and turn an empty result into undefined. */
const trimmed = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

/** Parse a positive integer from a form or query value. */
const positiveInt = (max = Number.MAX_SAFE_INTEGER) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(max)
    .optional()
    .catch(undefined);

/** Checkboxes arrive as 'on', '1' or 'true' when ticked, and are absent otherwise. */
const checkbox = z
  .union([z.literal('on'), z.literal('1'), z.literal('true'), z.literal('yes'), z.boolean()])
  .optional()
  .transform((v) => v === true || v === 'on' || v === '1' || v === 'true' || v === 'yes');

/** A form field that may hold one value or several (multi-select, repeated input). */
const manyIds = z
  .union([z.string(), z.array(z.string()), z.number(), z.array(z.number())])
  .optional()
  .transform((value) => {
    if (value === undefined) return [];
    const list = Array.isArray(value) ? value : [value];
    return list
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  });

// ------------------------------------------------------- public search query

/**
 * Catalogue search and browse parameters.
 *
 * Every field is lenient: a visitor editing the URL by hand, or a stale
 * bookmark, should get a sensible page rather than an error. Unparseable
 * values fall back to the default instead of rejecting the request.
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  // Lists, because a reader may want two subjects or two authors at once.
  // A single value still arrives as a one-element array.
  category: manyIds,
  author: manyIds,
  year: manyIds,
  language: z.string().trim().max(20).optional().catch(undefined),
  available: checkbox,
  sort: z
    .string()
    .optional()
    .transform((value) => (value && Object.hasOwn(SORT_OPTIONS, value) ? value : undefined))
    .catch(undefined),
  page: positiveInt(100_000),
  lang: z.enum(['el', 'en']).optional().catch(undefined),
});

/** Turn validated query parameters into listBooks() filters. */
export function searchFilters(query, { perPage = 24 } = {}) {
  return {
    q: query.q,
    categoryId: query.category,
    authorId: query.author,
    year: query.year,
    language: query.language,
    availableOnly: query.available,
    sort: query.sort,
    page: query.page ?? 1,
    perPage,
  };
}

/** The subset of query parameters that must survive pagination and sorting. */
export function preservedParams(query) {
  return {
    q: query.q,
    // buildUrl appends one entry per array element, so a multi-value filter
    // survives pagination and sorting intact.
    category: query.category,
    author: query.author,
    year: query.year,
    language: query.language,
    available: query.available ? '1' : undefined,
    sort: query.sort,
  };
}

/** Whether any filter beyond the free-text query is active. */
export function hasActiveFilters(query) {
  return Boolean(
    (query.category && query.category.length) ||
      (query.author && query.author.length) ||
      (query.year && query.year.length) ||
      query.language ||
      query.available,
  );
}

// ------------------------------------------------------------- staff: login

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(1024),
  redirect: z.string().max(500).optional(),
});

// -------------------------------------------------------------- staff: book

export const bookFormSchema = z
  .object({
    title: z.string().trim().min(1, 'required').max(500),
    subtitle: trimmed(500),
    isbn: trimmed(32),
    publisher: trimmed(200),
    publication_year: z
      .union([z.literal(''), z.coerce.number().int().min(1400).max(2200)])
      .optional()
      .transform((v) => (v === '' || v === undefined ? undefined : v)),
    edition: trimmed(100),
    language: trimmed(40),
    description: trimmed(10_000),
    authors: z.union([z.string(), z.array(z.string())]).optional(),
    categories: manyIds,
  })
  .transform((data) => ({
    ...data,
    // Authors arrive as one textarea/field per author, or as a single
    // comma-or-newline separated string. Both are normalized to a list here.
    authorNames: splitAuthorNames(data.authors),
    categoryIds: data.categories,
  }));

/**
 * Split an author entry into names. Accepts newlines, semicolons and commas.
 *
 * Note: commas are a real risk here, because 'Παπαδόπουλος, Γιώργος' is one
 * person written surname-first. The staff form therefore uses one input per
 * author and this splitter only sees multi-name input from newlines and
 * semicolons; commas are treated as separators only when no newline or
 * semicolon is present *and* there are more than two parts, which a
 * surname-first single name never is.
 */
export function splitAuthorNames(value) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  const names = [];

  for (const entry of list) {
    const text = String(entry ?? '').trim();
    if (!text) continue;

    if (text.includes('\n') || text.includes(';')) {
      names.push(...text.split(/[\n;]+/));
      continue;
    }
    const commaParts = text.split(',');
    if (commaParts.length > 2) {
      names.push(...commaParts);
      continue;
    }
    names.push(text);
  }

  return names.map((name) => name.trim()).filter(Boolean).slice(0, 20);
}

// -------------------------------------------------------------- staff: copy

export const copyFormSchema = z.object({
  barcode: trimmed(64),
  shelf_location: trimmed(100),
  status: z.enum(COPY_STATUSES).optional(),
  notes: trimmed(1000),
  acquired_at: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export const bulkCopySchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
  shelf_location: trimmed(100),
});

// ---------------------------------------------------------- staff: borrower

/**
 * Borrower form. Only a name and a class — see the privacy note in
 * migrations/002_circulation.sql. Any other field in the request body is
 * ignored rather than stored, because this schema is strict about its shape.
 */
export const borrowerFormSchema = z.object({
  display_name: z.string().trim().min(1, 'required').max(200),
  school_class: trimmed(60),
  notes: trimmed(1000),
});

// -------------------------------------------------------------- staff: loan

export const checkoutSchema = z.object({
  // A list, because a student handing over three books should be one
  // transaction at the desk rather than three.
  copy_id: manyIds,
  barcode: trimmed(64),
  borrower_id: z.coerce.number().int().min(1).optional(),
  new_borrower_name: trimmed(200),
  new_borrower_class: trimmed(60),
  due_date: z
    .union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invalid_date')])
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export const checkinSchema = z.object({
  barcode: trimmed(64),
  loan_id: z.coerce.number().int().min(1).optional(),
  // Where to go afterwards, so returning a book from a borrower's page lands
  // back on that page. Confined to staff paths in the route, so it cannot be
  // turned into an open redirect.
  redirect_to: trimmed(200),
});

// ------------------------------------------------ staff: announcements

export const announcementFormSchema = z.object({
  title: z.string().trim().min(1, 'required').max(200),
  body: trimmed(2000),
  is_published: checkbox,
  // The scheme is checked in the query layer, which is the last thing before
  // it is stored; this only bounds the length.
  link_url: trimmed(500),
  link_new_tab: checkbox,
});

// -------------------------------------------------- staff: accounts, misc.

export const staffUserFormSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(60)
    // ASCII only, so that a username is never ambiguous at the login prompt.
    // Display names carry the Greek spelling.
    .regex(/^[a-zA-Z0-9._-]+$/, 'invalid_username'),
  display_name: z.string().trim().min(1).max(200),
  email: z.union([z.literal(''), z.string().trim().email().max(200)]).optional(),
  role: z.enum(['admin', 'librarian']),
  password: z.string().min(1).max(1024).optional(),
  // Asked for twice when a password is being set, because the person typing
  // it cannot see it and will not be the one using it.
  password_confirm: z.string().max(1024).optional(),
  is_active: checkbox,
});

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1).max(1024),
  password: z.string().min(1).max(1024),
  password_confirm: z.string().min(1).max(1024),
});

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, 'required').max(200),
  description: trimmed(1000),
});

export const authorFormSchema = z.object({
  name: z.string().trim().min(1, 'required').max(200),
});

/**
 * Turn a zod error into a map of field name to error code, for rendering
 * field-level messages. Codes are translated in the templates, so no message
 * text is built here.
 *
 * @returns {Record<string, string>}
 */
export function fieldErrors(error) {
  const errors = {};
  for (const issue of error.issues ?? []) {
    const field = issue.path.join('.') || '_';
    if (!errors[field]) errors[field] = issue.message || issue.code;
  }
  return errors;
}

/**
 * Parse a request body, returning either the data or field errors — never
 * throwing, so a route can re-render the form with the user's input intact.
 */
export function parseForm(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, errors: fieldErrors(result.error) };
}
