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

  // --- Home page ---
  'home.title': 'Καλώς ορίσατε στη βιβλιοθήκη',
  'home.lead': 'Αναζητήστε βιβλία, συγγραφείς και θέματα στον κατάλογο του σχολείου.',
  'home.browseAll': 'Δείτε όλα τα βιβλία',
  'home.browseCategories': 'Περιηγηθείτε στις κατηγορίες',
  'home.recent': 'Πρόσφατες προσθήκες',
  'home.recentEmpty': 'Δεν υπάρχουν ακόμη βιβλία στον κατάλογο.',
  'home.recentEmptyHint':
    'Μόλις το προσωπικό της βιβλιοθήκης καταχωρίσει τα πρώτα βιβλία, θα εμφανιστούν εδώ.',
  'home.categories': 'Κατηγορίες',
  'home.stats.titles': '{count} τίτλοι στον κατάλογο',
  'home.stats.available': '{count} διαθέσιμα αντίτυπα',

  // --- Search and browse ---
  'search.title': 'Βιβλία',
  'search.resultsFor': 'Αποτελέσματα για «{query}»',
  'search.showing': 'Εμφάνιση {from}–{to} από {total}',
  'search.empty.title': 'Δεν βρέθηκαν βιβλία',
  'search.empty.withQuery':
    'Καμία εγγραφή δεν ταιριάζει με «{query}». Δοκιμάστε λιγότερες λέξεις ή διαφορετική ορθογραφία.',
  'search.empty.withFilters': 'Κανένα βιβλίο δεν ταιριάζει με τα φίλτρα που επιλέξατε.',
  'search.empty.catalogue': 'Ο κατάλογος είναι ακόμη άδειος.',
  'search.clearFilters': 'Καθαρισμός φίλτρων',
  'search.filter.category': 'Κατηγορία',
  'search.filter.author': 'Συγγραφέας',
  'search.filter.year': 'Έτος έκδοσης',
  'search.filter.language': 'Γλώσσα',
  'search.filter.availableOnly': 'Μόνο διαθέσιμα',
  'search.filter.allCategories': 'Όλες οι κατηγορίες',
  'search.filter.allAuthors': 'Όλοι οι συγγραφείς',
  'search.filter.allYears': 'Όλα τα έτη',
  'search.filter.allLanguages': 'Όλες οι γλώσσες',
  'search.filter.activeLabel': 'Ενεργά φίλτρα',
  'search.sort.label': 'Ταξινόμηση',
  'search.sort.title': 'Τίτλος (Α–Ω)',
  'search.sort.title_desc': 'Τίτλος (Ω–Α)',
  'search.sort.author': 'Συγγραφέας',
  'search.sort.newest': 'Πρόσφατες προσθήκες',
  'search.sort.year_desc': 'Έτος (νεότερα πρώτα)',
  'search.sort.year': 'Έτος (παλαιότερα πρώτα)',

  // --- Book details ---
  'book.by': 'του/της',
  'book.authors': 'Συγγραφείς',
  'book.isbn': 'ISBN',
  'book.publisher': 'Εκδότης',
  'book.year': 'Έτος έκδοσης',
  'book.edition': 'Έκδοση',
  'book.category': 'Κατηγορία',
  'book.language': 'Γλώσσα',
  'book.description': 'Περιγραφή',
  'book.copies': 'Αντίτυπα',
  'book.shelf': 'Θέση στο ράφι',
  'book.coverAlt': 'Εξώφυλλο: {title}',
  'book.noCover': 'Χωρίς εξώφυλλο',
  'book.availability': 'Διαθεσιμότητα',
  'book.availableCount': '{available} από {total} διαθέσιμα',
  'book.allAvailable': 'Διαθέσιμο',
  'book.noneAvailable': 'Μη διαθέσιμο',
  'book.noCopies': 'Δεν έχουν καταχωριστεί αντίτυπα.',
  'book.copiesTable': 'Κατάσταση αντιτύπων',
  'book.copyNumber': 'Αντίτυπο',
  'book.status': 'Κατάσταση',
  'book.backToResults': 'Επιστροφή στα αποτελέσματα',
  'book.relatedByAuthor': 'Περισσότερα από αυτόν τον συγγραφέα',
  'book.relatedByCategory': 'Σχετικά βιβλία',

  // --- Copy status labels (public wording) ---
  'status.available': 'Διαθέσιμο',
  'status.on_loan': 'Σε δανεισμό',
  'status.repair': 'Σε επιδιόρθωση',
  'status.lost': 'Απολεσθέν',
  'status.withdrawn': 'Αποσυρμένο',

  // --- Categories and authors ---
  'categories.title': 'Κατηγορίες',
  'categories.lead': 'Περιηγηθείτε στον κατάλογο ανά θέμα.',
  'categories.empty': 'Δεν έχουν οριστεί κατηγορίες ακόμη.',
  'categories.bookCount': '{count} βιβλία',
  'categories.bookCountOne': '1 βιβλίο',
  'authors.title': 'Συγγραφείς',
  'authors.lead': 'Περιηγηθείτε στον κατάλογο ανά συγγραφέα.',
  'authors.empty': 'Δεν έχουν καταχωριστεί συγγραφείς ακόμη.',
  'authors.findByName': 'Αναζήτηση συγγραφέα',
  'authors.booksBy': 'Βιβλία του/της {name}',

  // --- Login ---
  'login.title': 'Σύνδεση προσωπικού',
  'login.lead': 'Η περιοχή αυτή προορίζεται για το προσωπικό της βιβλιοθήκης.',
  'login.username': 'Όνομα χρήστη',
  'login.password': 'Κωδικός πρόσβασης',
  'login.submit': 'Σύνδεση',
  'login.help': 'Αν ξεχάσατε τον κωδικό σας, απευθυνθείτε στον διαχειριστή της βιβλιοθήκης.',
  'login.error.invalid': 'Λανθασμένο όνομα χρήστη ή κωδικός πρόσβασης.',
  'login.error.locked':
    'Ο λογαριασμός έχει κλειδωθεί προσωρινά μετά από πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε λίγο.',
  'login.expired': 'Η συνεδρία σας έληξε. Συνδεθείτε ξανά.',
  'login.noAccounts':
    'Δεν υπάρχει ακόμη λογαριασμός προσωπικού. Δημιουργήστε τον πρώτο από τον διακομιστή με:',
  'login.mustChangePassword': 'Πρέπει να ορίσετε νέο κωδικό πρόσβασης.',

  // --- Staff shell ---
  'staff.area': 'Διαχείριση βιβλιοθήκης',
  'staff.logout': 'Αποσύνδεση',
  'staff.viewPublicSite': 'Δημόσιος κατάλογος',
  'staff.role.admin': 'Διαχειριστής',
  'staff.role.librarian': 'Βιβλιοθηκονόμος',
  'staff.forbidden.body': 'Η ενέργεια αυτή επιτρέπεται μόνο σε διαχειριστές.',
  'staff.nav.dashboard': 'Επισκόπηση',
  'staff.nav.books': 'Κατάλογος',
  'staff.nav.loans': 'Δανεισμοί',
  'staff.nav.borrowers': 'Αναγνώστες',
  'staff.nav.categories': 'Κατηγορίες',
  'staff.nav.authors': 'Συγγραφείς',
  'staff.nav.users': 'Χρήστες',
  'staff.nav.account': 'Ο λογαριασμός μου',

  // --- Dashboard ---
  'staff.dashboard.title': 'Επισκόπηση',
  'staff.dashboard.recent': 'Πρόσφατες αλλαγές',
  'staff.dashboard.overdue': 'Εκπρόθεσμοι δανεισμοί',
  'staff.dashboard.empty': 'Ο κατάλογος είναι άδειος',
  'staff.dashboard.emptyHint': 'Ξεκινήστε προσθέτοντας το πρώτο βιβλίο.',
  'staff.dashboard.noCopies': 'Τίτλοι χωρίς αντίτυπα',
  'staff.dashboard.noCopiesHint':
    'Οι τίτλοι αυτοί δεν έχουν φυσικά αντίτυπα, οπότε εμφανίζονται ως μη διαθέσιμοι.',
  'staff.stat.titles': 'Τίτλοι',
  'staff.stat.copies': 'Αντίτυπα',
  'staff.stat.available': 'Διαθέσιμα',
  'staff.stat.onLoan': 'Σε δανεισμό',
  'staff.stat.overdue': 'Εκπρόθεσμα',
  'staff.stat.archived': 'Αρχειοθετημένοι τίτλοι',

  // --- Shared staff labels ---
  'staff.action.addBook': 'Νέο βιβλίο',
  'staff.action.checkout': 'Δανεισμός',
  'staff.action.checkin': 'Επιστροφή',
  'staff.book.title': 'Τίτλος',
  'staff.book.copies': 'Αντίτυπα',
  'staff.book.updated': 'Ενημερώθηκε',
  'staff.book.archived': 'Αρχειοθετημένο',
  'staff.loan.book': 'Βιβλίο',
  'staff.loan.borrower': 'Αναγνώστης',
  'staff.loan.due': 'Λήξη',
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

  // --- Home page ---
  'home.title': 'Welcome to the library',
  'home.lead': 'Search the school catalogue for books, authors and subjects.',
  'home.browseAll': 'Browse all books',
  'home.browseCategories': 'Browse categories',
  'home.recent': 'Recently added',
  'home.recentEmpty': 'There are no books in the catalogue yet.',
  'home.recentEmptyHint': 'Once library staff add the first books, they will appear here.',
  'home.categories': 'Categories',
  'home.stats.titles': '{count} titles in the catalogue',
  'home.stats.available': '{count} copies available',

  // --- Search and browse ---
  'search.title': 'Books',
  'search.resultsFor': 'Results for “{query}”',
  'search.showing': 'Showing {from}–{to} of {total}',
  'search.empty.title': 'No books found',
  'search.empty.withQuery':
    'Nothing matches “{query}”. Try fewer words or a different spelling.',
  'search.empty.withFilters': 'No books match the filters you selected.',
  'search.empty.catalogue': 'The catalogue is still empty.',
  'search.clearFilters': 'Clear filters',
  'search.filter.category': 'Category',
  'search.filter.author': 'Author',
  'search.filter.year': 'Publication year',
  'search.filter.language': 'Language',
  'search.filter.availableOnly': 'Available only',
  'search.filter.allCategories': 'All categories',
  'search.filter.allAuthors': 'All authors',
  'search.filter.allYears': 'All years',
  'search.filter.allLanguages': 'All languages',
  'search.filter.activeLabel': 'Active filters',
  'search.sort.label': 'Sort by',
  'search.sort.title': 'Title (A–Z)',
  'search.sort.title_desc': 'Title (Z–A)',
  'search.sort.author': 'Author',
  'search.sort.newest': 'Recently added',
  'search.sort.year_desc': 'Year (newest first)',
  'search.sort.year': 'Year (oldest first)',

  // --- Book details ---
  'book.by': 'by',
  'book.authors': 'Authors',
  'book.isbn': 'ISBN',
  'book.publisher': 'Publisher',
  'book.year': 'Publication year',
  'book.edition': 'Edition',
  'book.category': 'Category',
  'book.language': 'Language',
  'book.description': 'Description',
  'book.copies': 'Copies',
  'book.shelf': 'Shelf location',
  'book.coverAlt': 'Cover: {title}',
  'book.noCover': 'No cover image',
  'book.availability': 'Availability',
  'book.availableCount': '{available} of {total} available',
  'book.allAvailable': 'Available',
  'book.noneAvailable': 'Not available',
  'book.noCopies': 'No copies have been recorded.',
  'book.copiesTable': 'Copy status',
  'book.copyNumber': 'Copy',
  'book.status': 'Status',
  'book.backToResults': 'Back to results',
  'book.relatedByAuthor': 'More by this author',
  'book.relatedByCategory': 'Related books',

  // --- Copy status labels (public wording) ---
  'status.available': 'Available',
  'status.on_loan': 'On loan',
  'status.repair': 'Being repaired',
  'status.lost': 'Lost',
  'status.withdrawn': 'Withdrawn',

  // --- Categories and authors ---
  'categories.title': 'Categories',
  'categories.lead': 'Browse the catalogue by subject.',
  'categories.empty': 'No categories have been set up yet.',
  'categories.bookCount': '{count} books',
  'categories.bookCountOne': '1 book',
  'authors.title': 'Authors',
  'authors.lead': 'Browse the catalogue by author.',
  'authors.empty': 'No authors have been recorded yet.',
  'authors.findByName': 'Find an author',
  'authors.booksBy': 'Books by {name}',

  // --- Login ---
  'login.title': 'Staff sign in',
  'login.lead': 'This area is for library staff.',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.help': 'If you have forgotten your password, ask the library administrator.',
  'login.error.invalid': 'Incorrect username or password.',
  'login.error.locked':
    'This account is temporarily locked after several failed attempts. Please try again shortly.',
  'login.expired': 'Your session has expired. Please sign in again.',
  'login.noAccounts': 'No staff account exists yet. Create the first one on the server with:',
  'login.mustChangePassword': 'You need to set a new password.',

  // --- Staff shell ---
  'staff.area': 'Library administration',
  'staff.logout': 'Sign out',
  'staff.viewPublicSite': 'Public catalogue',
  'staff.role.admin': 'Administrator',
  'staff.role.librarian': 'Librarian',
  'staff.forbidden.body': 'This action is restricted to administrators.',
  'staff.nav.dashboard': 'Overview',
  'staff.nav.books': 'Catalogue',
  'staff.nav.loans': 'Loans',
  'staff.nav.borrowers': 'Borrowers',
  'staff.nav.categories': 'Categories',
  'staff.nav.authors': 'Authors',
  'staff.nav.users': 'Users',
  'staff.nav.account': 'My account',

  // --- Dashboard ---
  'staff.dashboard.title': 'Overview',
  'staff.dashboard.recent': 'Recent changes',
  'staff.dashboard.overdue': 'Overdue loans',
  'staff.dashboard.empty': 'The catalogue is empty',
  'staff.dashboard.emptyHint': 'Start by adding the first book.',
  'staff.dashboard.noCopies': 'Titles without copies',
  'staff.dashboard.noCopiesHint':
    'These titles have no physical copies, so they show as unavailable.',
  'staff.stat.titles': 'Titles',
  'staff.stat.copies': 'Copies',
  'staff.stat.available': 'Available',
  'staff.stat.onLoan': 'On loan',
  'staff.stat.overdue': 'Overdue',
  'staff.stat.archived': 'Archived titles',

  // --- Shared staff labels ---
  'staff.action.addBook': 'New book',
  'staff.action.checkout': 'Check out',
  'staff.action.checkin': 'Check in',
  'staff.book.title': 'Title',
  'staff.book.copies': 'Copies',
  'staff.book.updated': 'Updated',
  'staff.book.archived': 'Archived',
  'staff.loan.book': 'Book',
  'staff.loan.borrower': 'Borrower',
  'staff.loan.due': 'Due',
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
