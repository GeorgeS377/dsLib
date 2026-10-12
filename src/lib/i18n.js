// Interface translations. Greek is the primary language; English is a toggle.
//
// Dictionaries are flat maps of dotted keys so that a test can assert the two
// languages have exactly the same key set (test/i18n.test.js). That check is
// what stops a screen from shipping half-translated.
//
// Only interface text lives here. Catalogue data (titles, author names,
// descriptions) is stored in whatever language the librarian typed it in and is
// never translated.

export const SUPPORTED_LANGS = ['el', 'en'];
export const LANG_COOKIE = 'lang';

const el = {
  // --- Layout and navigation ---
  'nav.skip': 'Μετάβαση στο περιεχόμενο',
  'nav.home': 'Αρχική',
  'nav.books': 'Βιβλία',
  'nav.categories': 'Κατηγορίες',
  'nav.authors': 'Συγγραφείς',
  'nav.staff': 'Προσωπικό',
  'nav.menu': 'Μενού',
  'lang.label': 'Γλώσσα',
  'lang.el': 'Ελληνικά',
  'lang.en': 'English',
  'footer.catalogue': 'Κατάλογος σχολικής βιβλιοθήκης',

  // --- Shared controls ---
  'common.search': 'Αναζήτηση',
  'common.searchPlaceholder': 'Τίτλος, συγγραφέας, ISBN ή λέξη-κλειδί',
  'common.searchLabel': 'Αναζήτηση στον κατάλογο',
  'common.filters': 'Φίλτρα',
  'common.apply': 'Εφαρμογή',
  'common.clear': 'Καθαρισμός',
  'common.cancel': 'Άκυρο',
  'common.save': 'Αποθήκευση',
  'common.delete': 'Διαγραφή',
  'common.edit': 'Επεξεργασία',
  'common.back': 'Επιστροφή',
  'common.all': 'Όλα',
  'common.yes': 'Ναι',
  'common.no': 'Όχι',
  'common.loading': 'Φόρτωση…',
  'common.required': 'Υποχρεωτικό',
  'common.optional': 'Προαιρετικό',

  // --- Pagination ---
  'pagination.label': 'Σελιδοποίηση',
  'pagination.previous': 'Προηγούμενη',
  'pagination.next': 'Επόμενη',
  'pagination.page': 'Σελίδα {current} από {total}',
  'pagination.results': '{count} αποτελέσματα',
  'pagination.resultsOne': '1 αποτέλεσμα',

  // --- Error pages ---
  'error.404.title': 'Η σελίδα δεν βρέθηκε',
  'error.404.body': 'Η σελίδα που ζητήσατε δεν υπάρχει ή έχει μετακινηθεί.',
  'error.404.action': 'Επιστροφή στην αρχική',
  'error.500.title': 'Κάτι πήγε λάθος',
  'error.500.body':
    'Παρουσιάστηκε ένα απρόσμενο σφάλμα. Δοκιμάστε ξανά σε λίγο ή επικοινωνήστε με τη βιβλιοθήκη.',
  'error.500.action': 'Επιστροφή στην αρχική',
  'error.429.title': 'Πάρα πολλές αιτήσεις',
  'error.429.body': 'Δοκιμάστε ξανά σε λίγο.',
  'error.403.title': 'Δεν επιτρέπεται',
  'error.403.body': 'Δεν έχετε δικαίωμα πρόσβασης σε αυτήν τη σελίδα.',
};

const en = {
  // --- Layout and navigation ---
  'nav.skip': 'Skip to content',
  'nav.home': 'Home',
  'nav.books': 'Books',
  'nav.categories': 'Categories',
  'nav.authors': 'Authors',
  'nav.staff': 'Staff',
  'nav.menu': 'Menu',
  'lang.label': 'Language',
  'lang.el': 'Ελληνικά',
  'lang.en': 'English',
  'footer.catalogue': 'School library catalogue',

  // --- Shared controls ---
  'common.search': 'Search',
  'common.searchPlaceholder': 'Title, author, ISBN or keyword',
  'common.searchLabel': 'Search the catalogue',
  'common.filters': 'Filters',
  'common.apply': 'Apply',
  'common.clear': 'Clear',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.back': 'Back',
  'common.all': 'All',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.loading': 'Loading…',
  'common.required': 'Required',
  'common.optional': 'Optional',

  // --- Pagination ---
  'pagination.label': 'Pagination',
  'pagination.previous': 'Previous',
  'pagination.next': 'Next',
  'pagination.page': 'Page {current} of {total}',
  'pagination.results': '{count} results',
  'pagination.resultsOne': '1 result',

  // --- Error pages ---
  'error.404.title': 'Page not found',
  'error.404.body': 'The page you asked for does not exist or has moved.',
  'error.404.action': 'Back to home',
  'error.500.title': 'Something went wrong',
  'error.500.body':
    'An unexpected error occurred. Please try again shortly or contact the library.',
  'error.500.action': 'Back to home',
  'error.429.title': 'Too many requests',
  'error.429.body': 'Please try again shortly.',
  'error.403.title': 'Not allowed',
  'error.403.body': 'You do not have permission to view this page.',
};

export const dictionaries = { el, en };

/**
 * Translate a key. Unknown keys return the key itself rather than throwing, so
 * a missing translation degrades to visible-but-harmless text instead of a 500.
 * The i18n test asserts key parity, which is what actually prevents that.
 *
 * Interpolation uses {name} placeholders. Values are inserted as plain text;
 * escaping happens in the template via EJS `<%= %>`.
 *
 * @param {string} lang
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function translate(lang, key, vars) {
  const dict = dictionaries[lang] ?? dictionaries.el;
  const raw = dict[key] ?? dictionaries.el[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) =>
    Object.hasOwn(vars, name) ? String(vars[name]) : match,
  );
}

/**
 * Bind a translator to one language, for use as a template local.
 * @param {string} lang
 */
export function translatorFor(lang) {
  const t = (key, vars) => translate(lang, key, vars);
  t.lang = lang;
  return t;
}

export function isSupportedLang(value) {
  return typeof value === 'string' && SUPPORTED_LANGS.includes(value);
}

/**
 * Pick a language from an Accept-Language header, ignoring quality weights
 * beyond ordering. Returns null when nothing matches.
 * @param {string|undefined} header
 */
export function langFromAcceptHeader(header) {
  if (!header) return null;
  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith('q='));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality };
    })
    .filter((c) => c.tag && c.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of candidates) {
    const base = tag.split('-')[0];
    if (isSupportedLang(base)) return base;
  }
  return null;
}

/**
 * Resolve the language for a request: explicit ?lang= wins, then the saved
 * cookie, then Accept-Language, then the configured default.
 *
 * @param {{ query?: Record<string, unknown>, cookies?: Record<string, string>, headers?: Record<string, string> }} request
 * @param {string} fallback
 * @returns {{ lang: string, fromQuery: boolean }}
 */
export function resolveLang(request, fallback = 'el') {
  const fromQuery = request?.query?.lang;
  if (isSupportedLang(fromQuery)) return { lang: fromQuery, fromQuery: true };

  const fromCookie = request?.cookies?.[LANG_COOKIE];
  if (isSupportedLang(fromCookie)) return { lang: fromCookie, fromQuery: false };

  const fromHeader = langFromAcceptHeader(request?.headers?.['accept-language']);
  if (fromHeader) return { lang: fromHeader, fromQuery: false };

  return { lang: isSupportedLang(fallback) ? fallback : 'el', fromQuery: false };
}

export default translate;
