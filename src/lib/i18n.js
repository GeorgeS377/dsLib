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

  // --- Catalogue management ---
  'staff.books.title': 'Κατάλογος',
  'staff.books.new': 'Νέος τίτλος',
  'staff.books.edit': 'Επεξεργασία τίτλου',
  'staff.books.search': 'Αναζήτηση στον κατάλογο',
  'staff.books.showArchived': 'Αρχειοθετημένα',
  'staff.books.showActive': 'Ενεργά',
  'staff.books.empty': 'Δεν βρέθηκαν τίτλοι',
  'staff.books.emptyHint': 'Προσθέστε τον πρώτο τίτλο στον κατάλογο.',
  'staff.books.created': 'Ο τίτλος «{title}» δημιουργήθηκε.',
  'staff.books.saved': 'Ο τίτλος «{title}» αποθηκεύτηκε.',
  'staff.books.archived': 'Ο τίτλος «{title}» αρχειοθετήθηκε και δεν εμφανίζεται πλέον δημόσια.',
  'staff.books.restored': 'Ο τίτλος «{title}» επανήλθε στον δημόσιο κατάλογο.',
  'staff.books.deleted': 'Ο τίτλος «{title}» διαγράφηκε οριστικά.',
  'staff.books.deleteTitle': 'Διαγραφή τίτλου',
  'staff.books.deleteConfirm': 'Οριστική διαγραφή του «{title}»;',
  'staff.books.deleteWarning':
    'Η ενέργεια αυτή δεν αναιρείται. Θα διαγραφούν και τα {count} αντίτυπα.',
  'staff.books.deleteBlocked.has_loans':
    'Ο τίτλος έχει ιστορικό δανεισμών και δεν μπορεί να διαγραφεί. Αρχειοθετήστε τον αντ’ αυτού.',
  'staff.books.archiveAction': 'Αρχειοθέτηση',
  'staff.books.restoreAction': 'Επαναφορά',
  'staff.books.archiveConfirm': 'Αρχειοθέτηση του «{title}»;',
  'staff.books.archiveInstead': 'Αρχειοθέτηση αντί διαγραφής',
  'staff.books.archiveExplain':
    'Η αρχειοθέτηση αποκρύπτει τον τίτλο από το δημόσιο site διατηρώντας τα αντίτυπα και το ιστορικό.',
  'staff.books.isArchived': 'Αυτός ο τίτλος είναι αρχειοθετημένος και δεν εμφανίζεται δημόσια.',
  'staff.books.viewPublic': 'Προβολή στον δημόσιο κατάλογο',
  'staff.books.manageCopies': 'Διαχείριση αντιτύπων',

  // --- Book form fields ---
  'staff.field.title': 'Τίτλος',
  'staff.field.subtitle': 'Υπότιτλος',
  'staff.field.authors': 'Συγγραφείς',
  'staff.field.authorsHint': 'Ένας συγγραφέας σε κάθε πεδίο, με τη σειρά που εμφανίζονται.',
  'staff.field.addAuthor': 'Προσθήκη συγγραφέα',
  'staff.field.isbn': 'ISBN',
  'staff.field.isbnHint': 'ISBN-10 ή ISBN-13, με ή χωρίς παύλες.',
  'staff.field.publisher': 'Εκδότης',
  'staff.field.year': 'Έτος έκδοσης',
  'staff.field.edition': 'Έκδοση',
  'staff.field.language': 'Γλώσσα',
  'staff.field.languageHint': 'Κωδικός δύο γραμμάτων, π.χ. el ή en.',
  'staff.field.description': 'Περιγραφή',
  'staff.field.categories': 'Κατηγορίες',
  'staff.field.categoriesHint': 'Κρατήστε πατημένο το Ctrl για πολλαπλή επιλογή.',
  'staff.field.cover': 'Εξώφυλλο',
  'staff.field.barcode': 'Barcode / αριθμός εισαγωγής',
  'staff.field.shelf': 'Θέση στο ράφι',
  'staff.field.status': 'Κατάσταση',
  'staff.field.notes': 'Σημειώσεις',
  'staff.field.acquired': 'Ημερομηνία απόκτησης',
  'staff.field.count': 'Πλήθος',

  // --- Validation messages ---
  'error.field.required': 'Το πεδίο είναι υποχρεωτικό.',
  'error.field.invalid_isbn': 'Το ISBN δεν είναι έγκυρο. Ελέγξτε τα ψηφία.',
  'error.field.duplicate_isbn': 'Υπάρχει ήδη τίτλος με αυτό το ISBN.',
  'error.field.duplicate_barcode': 'Το barcode χρησιμοποιείται ήδη σε άλλο αντίτυπο.',
  'error.field.duplicate': 'Υπάρχει ήδη εγγραφή με αυτό το όνομα.',
  'error.field.invalid_date': 'Μη έγκυρη ημερομηνία (ΕΕΕΕ-ΜΜ-ΗΗ).',
  'error.field.too_big': 'Η τιμή είναι πολύ μεγάλη.',
  'error.field.too_small': 'Η τιμή είναι πολύ μικρή.',
  'error.field.generic': 'Μη έγκυρη τιμή.',
  'error.summary.title': 'Διορθώστε τα παρακάτω:',

  // --- Cover upload ---
  'staff.cover.upload': 'Ανέβασμα εξωφύλλου',
  'staff.cover.replace': 'Αντικατάσταση εξωφύλλου',
  'staff.cover.remove': 'Αφαίρεση εξωφύλλου',
  'staff.cover.hint': 'JPEG, PNG ή WebP, έως {mb} MB. Η εικόνα επανακωδικοποιείται.',
  'staff.cover.saved': 'Το εξώφυλλο αποθηκεύτηκε.',
  'staff.cover.removed': 'Το εξώφυλλο αφαιρέθηκε.',
  'staff.cover.error.empty': 'Δεν επιλέχθηκε αρχείο.',
  'staff.cover.error.too_large': 'Το αρχείο είναι πολύ μεγάλο.',
  'staff.cover.error.unsupported_type': 'Δεκτά είναι μόνο αρχεία JPEG, PNG ή WebP.',
  'staff.cover.error.unreadable': 'Το αρχείο δεν μπόρεσε να διαβαστεί ως εικόνα.',
  'staff.cover.error.too_many_pixels': 'Οι διαστάσεις της εικόνας είναι υπερβολικά μεγάλες.',
  'staff.cover.error.write_failed': 'Η αποθήκευση της εικόνας απέτυχε.',

  // --- Copies ---
  'staff.copies.title': 'Αντίτυπα: {title}',
  'staff.copies.add': 'Προσθήκη αντιτύπου',
  'staff.copies.addMany': 'Προσθήκη πολλών αντιτύπων',
  'staff.copies.addManyHint':
    'Δημιουργεί αντίτυπα χωρίς barcode. Συμπληρώστε τα barcode ξεχωριστά σε κάθε αντίτυπο.',
  'staff.copies.added': 'Το αντίτυπο προστέθηκε.',
  'staff.copies.addedMany': 'Προστέθηκαν {count} αντίτυπα.',
  'staff.copies.saved': 'Το αντίτυπο αποθηκεύτηκε.',
  'staff.copies.deleted': 'Το αντίτυπο διαγράφηκε.',
  'staff.copies.deleteTitle': 'Διαγραφή αντιτύπου',
  'staff.copies.empty': 'Δεν υπάρχουν αντίτυπα',
  'staff.copies.emptyHint':
    'Ένας τίτλος χωρίς αντίτυπα εμφανίζεται ως μη διαθέσιμος στο δημόσιο site.',
  'staff.copies.availability': 'Διαθεσιμότητα',
  'staff.copies.onLoanTo': 'Σε δανεισμό έως {date}',
  'staff.copies.error.invalid': 'Μη έγκυρα στοιχεία αντιτύπου.',
  'staff.copies.error.duplicate_barcode': 'Το barcode χρησιμοποιείται ήδη.',
  'staff.copies.error.on_loan':
    'Το αντίτυπο είναι σε δανεισμό. Καταχωρίστε πρώτα την επιστροφή.',
  'staff.copies.error.not_found': 'Το αντίτυπο δεν βρέθηκε.',
  'staff.copies.error.badCount': 'Δώστε πλήθος από 1 έως 100.',
  'staff.copies.deleteBlocked.has_loans':
    'Το αντίτυπο έχει ιστορικό δανεισμών. Ορίστε το ως αποσυρμένο αντί να το διαγράψετε.',
  'staff.copies.deleteBlocked.on_loan': 'Το αντίτυπο είναι σε δανεισμό αυτή τη στιγμή.',
  'staff.copies.withdrawInstead': 'Ορισμός ως αποσυρμένο',

  // --- Categories and authors (staff) ---
  'staff.categories.title': 'Κατηγορίες',
  'staff.categories.add': 'Νέα κατηγορία',
  'staff.categories.created': 'Η κατηγορία «{name}» δημιουργήθηκε.',
  'staff.categories.saved': 'Η κατηγορία «{name}» αποθηκεύτηκε.',
  'staff.categories.deleted': 'Η κατηγορία «{name}» διαγράφηκε ({count} τίτλοι αποσυνδέθηκαν).',
  'staff.categories.deleteTitle': 'Διαγραφή κατηγορίας',
  'staff.categories.deleteConfirm': 'Διαγραφή της κατηγορίας «{name}»;',
  'staff.categories.deleteExplain':
    'Οι {count} τίτλοι της κατηγορίας δεν θα διαγραφούν — απλώς δεν θα ανήκουν πλέον σε αυτήν.',
  'staff.categories.empty': 'Δεν έχουν οριστεί κατηγορίες.',
  'staff.categories.slug': 'Διεύθυνση URL',
  'staff.categories.slugHint': 'Παραμένει σταθερή μετά τη μετονομασία, ώστε οι σύνδεσμοι να δουλεύουν.',
  'staff.categories.existing': 'Υπάρχει ήδη ως «{name}».',
  'staff.authors.title': 'Συγγραφείς',
  'staff.authors.saved': 'Ο συγγραφέας «{name}» αποθηκεύτηκε.',
  'staff.authors.deleted': 'Ο συγγραφέας «{name}» διαγράφηκε.',
  'staff.authors.deleteBlocked': 'Ο συγγραφέας έχει {count} τίτλους και δεν μπορεί να διαγραφεί.',
  'staff.authors.empty': 'Δεν έχουν καταχωριστεί συγγραφείς.',
  'staff.authors.merge': 'Συγχώνευση',
  'staff.authors.mergeExplain':
    'Υπάρχει ήδη ο συγγραφέας «{name}». Μπορείτε να συγχωνεύσετε τις δύο εγγραφές σε μία.',
  'staff.authors.mergeConfirm': 'Συγχώνευση στο «{name}»',
  'staff.authors.merged': 'Ο «{from}» συγχωνεύτηκε στον «{to}».',
  'staff.authors.mergeFailed': 'Η συγχώνευση δεν ήταν δυνατή.',
  'staff.authors.bookCount': 'Τίτλοι',
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

  // --- Catalogue management ---
  'staff.books.title': 'Catalogue',
  'staff.books.new': 'New title',
  'staff.books.edit': 'Edit title',
  'staff.books.search': 'Search the catalogue',
  'staff.books.showArchived': 'Archived',
  'staff.books.showActive': 'Active',
  'staff.books.empty': 'No titles found',
  'staff.books.emptyHint': 'Add the first title to the catalogue.',
  'staff.books.created': 'Title “{title}” created.',
  'staff.books.saved': 'Title “{title}” saved.',
  'staff.books.archived': 'Title “{title}” archived and is no longer shown publicly.',
  'staff.books.restored': 'Title “{title}” is back in the public catalogue.',
  'staff.books.deleted': 'Title “{title}” permanently deleted.',
  'staff.books.deleteTitle': 'Delete title',
  'staff.books.deleteConfirm': 'Permanently delete “{title}”?',
  'staff.books.deleteWarning': 'This cannot be undone. Its {count} copies will be deleted too.',
  'staff.books.deleteBlocked.has_loans':
    'This title has loan history and cannot be deleted. Archive it instead.',
  'staff.books.archiveAction': 'Archive',
  'staff.books.restoreAction': 'Restore',
  'staff.books.archiveConfirm': 'Archive “{title}”?',
  'staff.books.archiveInstead': 'Archive instead of deleting',
  'staff.books.archiveExplain':
    'Archiving hides the title from the public site while keeping its copies and history.',
  'staff.books.isArchived': 'This title is archived and is not shown publicly.',
  'staff.books.viewPublic': 'View in the public catalogue',
  'staff.books.manageCopies': 'Manage copies',

  // --- Book form fields ---
  'staff.field.title': 'Title',
  'staff.field.subtitle': 'Subtitle',
  'staff.field.authors': 'Authors',
  'staff.field.authorsHint': 'One author per field, in the order they appear.',
  'staff.field.addAuthor': 'Add author',
  'staff.field.isbn': 'ISBN',
  'staff.field.isbnHint': 'ISBN-10 or ISBN-13, with or without hyphens.',
  'staff.field.publisher': 'Publisher',
  'staff.field.year': 'Publication year',
  'staff.field.edition': 'Edition',
  'staff.field.language': 'Language',
  'staff.field.languageHint': 'Two-letter code, e.g. el or en.',
  'staff.field.description': 'Description',
  'staff.field.categories': 'Categories',
  'staff.field.categoriesHint': 'Hold Ctrl to select more than one.',
  'staff.field.cover': 'Cover image',
  'staff.field.barcode': 'Barcode / inventory number',
  'staff.field.shelf': 'Shelf location',
  'staff.field.status': 'Status',
  'staff.field.notes': 'Notes',
  'staff.field.acquired': 'Date acquired',
  'staff.field.count': 'How many',

  // --- Validation messages ---
  'error.field.required': 'This field is required.',
  'error.field.invalid_isbn': 'That ISBN is not valid. Check the digits.',
  'error.field.duplicate_isbn': 'Another title already has this ISBN.',
  'error.field.duplicate_barcode': 'That barcode is already used by another copy.',
  'error.field.duplicate': 'An entry with this name already exists.',
  'error.field.invalid_date': 'Invalid date (YYYY-MM-DD).',
  'error.field.too_big': 'That value is too large.',
  'error.field.too_small': 'That value is too small.',
  'error.field.generic': 'Invalid value.',
  'error.summary.title': 'Please correct the following:',

  // --- Cover upload ---
  'staff.cover.upload': 'Upload cover',
  'staff.cover.replace': 'Replace cover',
  'staff.cover.remove': 'Remove cover',
  'staff.cover.hint': 'JPEG, PNG or WebP, up to {mb} MB. The image is re-encoded.',
  'staff.cover.saved': 'Cover image saved.',
  'staff.cover.removed': 'Cover image removed.',
  'staff.cover.error.empty': 'No file was selected.',
  'staff.cover.error.too_large': 'That file is too large.',
  'staff.cover.error.unsupported_type': 'Only JPEG, PNG and WebP files are accepted.',
  'staff.cover.error.unreadable': 'That file could not be read as an image.',
  'staff.cover.error.too_many_pixels': 'The image dimensions are too large.',
  'staff.cover.error.write_failed': 'Saving the image failed.',

  // --- Copies ---
  'staff.copies.title': 'Copies: {title}',
  'staff.copies.add': 'Add a copy',
  'staff.copies.addMany': 'Add several copies',
  'staff.copies.addManyHint':
    'Creates copies with no barcode. Fill in each barcode individually afterwards.',
  'staff.copies.added': 'Copy added.',
  'staff.copies.addedMany': '{count} copies added.',
  'staff.copies.saved': 'Copy saved.',
  'staff.copies.deleted': 'Copy deleted.',
  'staff.copies.deleteTitle': 'Delete copy',
  'staff.copies.empty': 'No copies yet',
  'staff.copies.emptyHint': 'A title with no copies shows as unavailable on the public site.',
  'staff.copies.availability': 'Availability',
  'staff.copies.onLoanTo': 'On loan until {date}',
  'staff.copies.error.invalid': 'Invalid copy details.',
  'staff.copies.error.duplicate_barcode': 'That barcode is already in use.',
  'staff.copies.error.on_loan': 'This copy is on loan. Record its return first.',
  'staff.copies.error.not_found': 'Copy not found.',
  'staff.copies.error.badCount': 'Enter a number between 1 and 100.',
  'staff.copies.deleteBlocked.has_loans':
    'This copy has loan history. Mark it withdrawn rather than deleting it.',
  'staff.copies.deleteBlocked.on_loan': 'This copy is currently on loan.',
  'staff.copies.withdrawInstead': 'Mark as withdrawn',

  // --- Categories and authors (staff) ---
  'staff.categories.title': 'Categories',
  'staff.categories.add': 'New category',
  'staff.categories.created': 'Category “{name}” created.',
  'staff.categories.saved': 'Category “{name}” saved.',
  'staff.categories.deleted': 'Category “{name}” deleted ({count} titles detached).',
  'staff.categories.deleteTitle': 'Delete category',
  'staff.categories.deleteConfirm': 'Delete the category “{name}”?',
  'staff.categories.deleteExplain':
    'Its {count} titles will not be deleted — they simply stop belonging to this category.',
  'staff.categories.empty': 'No categories have been set up.',
  'staff.categories.slug': 'URL',
  'staff.categories.slugHint': 'Stays the same after a rename, so existing links keep working.',
  'staff.categories.existing': 'Already exists as “{name}”.',
  'staff.authors.title': 'Authors',
  'staff.authors.saved': 'Author “{name}” saved.',
  'staff.authors.deleted': 'Author “{name}” deleted.',
  'staff.authors.deleteBlocked': 'This author has {count} titles and cannot be deleted.',
  'staff.authors.empty': 'No authors have been recorded.',
  'staff.authors.merge': 'Merge',
  'staff.authors.mergeExplain':
    'The author “{name}” already exists. You can merge the two records into one.',
  'staff.authors.mergeConfirm': 'Merge into “{name}”',
  'staff.authors.merged': '“{from}” was merged into “{to}”.',
  'staff.authors.mergeFailed': 'The merge could not be completed.',
  'staff.authors.bookCount': 'Titles',
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
