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
  'theme.switchToDark': 'Σκούρο θέμα',
  'theme.switchToLight': 'Φωτεινό θέμα',
  'lang.el': 'Ελληνικά',
  'lang.en': 'English',
  'footer.catalogue': 'Κατάλογος σχολικής βιβλιοθήκης',
  'nav.catalogue': 'Κατάλογος',
  'nav.browseBy': 'Περιήγηση ανά',
  'nav.breadcrumb': 'Διαδρομή',

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
  'pagination.label': 'Σελίδες',
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
    'Δοκιμάστε ξανά σε λίγο. Αν συνεχιστεί, πείτε το στη βιβλιοθήκη.',
  'error.500.action': 'Επιστροφή στην αρχική',
  'error.429.title': 'Πολλές προσπάθειες σε λίγη ώρα',
  'error.429.body': 'Περιμένετε λίγο και δοκιμάστε ξανά.',
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
  'home.stats.summary': '{titles} τίτλοι στον κατάλογο, {available} αντίτυπα διαθέσιμα τώρα.',

  // --- Search and browse ---
  'search.title': 'Βιβλία',
  'search.resultsFor': 'Αποτελέσματα για «{query}»',
  'search.showing': 'Εμφάνιση {from}–{to} από {total}',
  'search.empty.title': 'Δεν βρέθηκαν βιβλία',
  'search.empty.withQuery':
    'Κανένα βιβλίο δεν ταιριάζει με «{query}». Δοκιμάστε λιγότερες λέξεις ή διαφορετική ορθογραφία.',
  'search.empty.withFilters': 'Κανένα βιβλίο δεν ταιριάζει με τα φίλτρα που επιλέξατε.',
  'search.empty.catalogue': 'Ο κατάλογος είναι ακόμη άδειος.',
  'search.clearFilters': 'Καθαρισμός φίλτρων',
  'search.clearSearch': 'Καθαρισμός αναζήτησης',
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
  'search.filter.multiHint': 'Μπορείτε να επιλέξετε περισσότερα από ένα σε κάθε λίστα.',
  'search.sort.label': 'Ταξινόμηση',
  'search.sort.title': 'Τίτλος (Α–Ω)',
  'search.sort.title_desc': 'Τίτλος (Ω–Α)',
  'search.sort.author': 'Συγγραφέας',
  'search.sort.newest': 'Πρόσφατες προσθήκες',
  'search.sort.year_desc': 'Έτος (νεότερα πρώτα)',
  'search.sort.year': 'Έτος (παλαιότερα πρώτα)',

  // --- Book details ---
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
  'book.availability': 'Αντίτυπα',
  'book.availableCount': '{available} από {total} διαθέσιμα',
  'book.allAvailable': 'Διαθέσιμο',
  'book.noneAvailable': 'Μη διαθέσιμο',
  'book.noCopies': 'Δεν έχουν καταχωριστεί αντίτυπα.',
  'book.backToResults': 'Επιστροφή στα αποτελέσματα',
  'book.relatedByAuthor': 'Περισσότερα από αυτόν τον συγγραφέα',

  // --- Copy status labels (public wording: can it be borrowed) ---
  'status.available': 'Διαθέσιμο',
  'status.on_loan': 'Σε δανεισμό',
  'status.repair': 'Σε επισκευή',
  'status.lost': 'Χαμένο',
  'status.withdrawn': 'Αποσυρμένο',

  // --- Copy condition, as the librarian sets it on each copy ---
  'condition.available': 'Κανονικό',
  'condition.repair': 'Σε επισκευή',
  'condition.lost': 'Χαμένο',
  'condition.withdrawn': 'Αποσυρμένο',

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
  'authors.leadForAuthor': 'Τίτλοι αυτού του συγγραφέα στον κατάλογο.',
  'authors.booksBy': '{name}',

  // --- Login ---
  'login.title': 'Σύνδεση προσωπικού',
  'login.lead': 'Η περιοχή αυτή προορίζεται για το προσωπικό της βιβλιοθήκης.',
  'login.username': 'Όνομα χρήστη',
  'login.password': 'Κωδικός',
  'login.submit': 'Σύνδεση',
  'login.help': 'Ξεχάσατε τον κωδικό σας; Ζητήστε τον από τον διαχειριστή της βιβλιοθήκης.',
  'login.error.invalid': 'Λάθος όνομα χρήστη ή κωδικός.',
  'login.error.locked':
    'Ο λογαριασμός έχει κλειδωθεί προσωρινά μετά από πολλές αποτυχημένες προσπάθειες. Δοκιμάστε ξανά σε λίγο.',
  'login.expired': 'Η συνεδρία σας έληξε. Συνδεθείτε ξανά.',
  'login.noAccounts':
    'Δεν υπάρχει ακόμη λογαριασμός προσωπικού. Δημιουργήστε τον πρώτο από τον διακομιστή με:',
  'login.mustChangePassword': 'Πρέπει να βάλετε νέο κωδικό.',

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
  'staff.nav.account': 'Λογαριασμός',
  'staff.nav.settings': 'Ρυθμίσεις',
  'staff.settings.title': 'Ρυθμίσεις',
  'staff.settings.lead': 'Κατηγορίες, συγγραφείς και λογαριασμοί προσωπικού.',
  'staff.settings.categories': 'Οργάνωση των βιβλίων σε θέματα.',
  'staff.settings.authors': 'Ενοποίηση διπλοεγγραφών και διόρθωση ονομάτων.',
  'staff.settings.users': 'Λογαριασμοί προσωπικού και δικαιώματα.',
  'staff.settings.account': 'Αλλαγή του δικού σας κωδικού.',
  'staff.settings.adminOnly': 'Μόνο για διαχειριστές',

  // --- Dashboard ---
  'staff.dashboard.title': 'Επισκόπηση',
  'staff.dashboard.recent': 'Πρόσφατες αλλαγές',
  'staff.dashboard.overdue': 'Εκπρόθεσμοι δανεισμοί',
  'staff.dashboard.empty': 'Ο κατάλογος είναι άδειος',
  'staff.dashboard.emptyHint': 'Ξεκινήστε προσθέτοντας το πρώτο βιβλίο.',
  'staff.dashboard.noCopies': 'Τίτλοι χωρίς αντίτυπα',
  'staff.dashboard.noCopiesHint':
    'Οι τίτλοι αυτοί δεν έχουν καταχωρισμένα αντίτυπα, οπότε εμφανίζονται ως μη διαθέσιμοι.',
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
  'staff.loan.due': 'Προθεσμία',

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
    'Ο τίτλος έχει ιστορικό δανεισμών και δεν μπορεί να διαγραφεί. Αρχειοθετήστε τον καλύτερα.',
  'staff.books.archiveAction': 'Αρχειοθέτηση',
  'staff.books.restoreAction': 'Επαναφορά',
  'staff.books.archiveConfirm': 'Αρχειοθέτηση του «{title}»;',
  'staff.books.archiveInstead': 'Αρχειοθέτηση αντί διαγραφής',
  'staff.books.archiveExplain':
    'Η αρχειοθέτηση κρύβει τον τίτλο από τον δημόσιο κατάλογο, κρατώντας τα αντίτυπα και το ιστορικό.',
  'staff.books.isArchived': 'Αυτός ο τίτλος είναι αρχειοθετημένος και δεν εμφανίζεται δημόσια.',
  'staff.books.viewPublic': 'Προβολή στον δημόσιο κατάλογο',
  'staff.books.manageCopies': 'Διαχείριση αντιτύπων',

  // --- Book form fields ---
  'staff.field.title': 'Τίτλος',
  'staff.field.name': 'Όνομα',
  'staff.field.personName': 'Ονοματεπώνυμο',
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
  'staff.field.categoriesHint': 'Επιλέξτε όσες ταιριάζουν.',
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
  'staff.copies.saveAll': 'Αποθήκευση αλλαγών',
  'staff.copies.saveBeforePaging': 'Αποθηκεύστε πριν αλλάξετε σελίδα.',
  'staff.copies.savedMany': 'Αποθηκεύτηκαν {count} αντίτυπα.',
  'staff.copies.rowFailed.duplicate_barcode':
    'Το αντίτυπο «{barcode}» δεν αποθηκεύτηκε: το barcode χρησιμοποιείται ήδη.',
  'staff.copies.rowFailed.on_loan':
    'Το αντίτυπο «{barcode}» δεν αποθηκεύτηκε: είναι σε δανεισμό.',
  'staff.copies.rowFailed.not_found': 'Ένα αντίτυπο δεν βρέθηκε και δεν αποθηκεύτηκε.',
  'staff.copies.deleted': 'Το αντίτυπο διαγράφηκε.',
  'staff.copies.deleteTitle': 'Διαγραφή αντιτύπου',
  'staff.copies.empty': 'Δεν υπάρχουν αντίτυπα',
  'staff.copies.emptyHint':
    'Ένας τίτλος χωρίς αντίτυπα εμφανίζεται ως μη διαθέσιμος στον δημόσιο κατάλογο.',
  'staff.copies.availability': 'Διαθέσιμα',
  'staff.copies.whereIsIt': 'Πού βρίσκεται',
  'staff.copies.onLoanTo': 'Σε δανεισμό έως {date}',
  'staff.copies.error.invalid': 'Μη έγκυρα στοιχεία αντιτύπου.',
  'staff.copies.error.duplicate_barcode': 'Το barcode χρησιμοποιείται ήδη.',
  'staff.copies.error.on_loan':
    'Το αντίτυπο είναι σε δανεισμό. Καταχωρίστε πρώτα την επιστροφή.',
  'staff.copies.error.not_found': 'Το αντίτυπο δεν βρέθηκε.',
  'staff.copies.error.badCount': 'Δώστε πλήθος από 1 έως 100.',
  'staff.copies.deleteBlocked.has_loans':
    'Το αντίτυπο έχει ιστορικό δανεισμών. Αποσύρετέ το αντί να το διαγράψετε.',
  'staff.copies.deleteBlocked.on_loan': 'Το αντίτυπο είναι σε δανεισμό αυτή τη στιγμή.',
  'staff.copies.withdrawInstead': 'Απόσυρση αντιτύπου',

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
  'staff.categories.slug': 'Διεύθυνση σελίδας',
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

  // --- Circulation ---
  'staff.loans.title': 'Δανεισμοί',
  'staff.loans.checkout': 'Δανεισμός βιβλίου',
  'staff.loans.checkin': 'Επιστροφή βιβλίου',
  'staff.loans.status.open': 'Σε δανεισμό',
  'staff.loans.status.overdue': 'Εκπρόθεσμοι',
  'staff.loans.status.returned': 'Επιστραμμένοι',
  'staff.loans.status.all': 'Όλοι',
  'staff.loans.empty': 'Δεν υπάρχουν δανεισμοί',
  'staff.loans.emptyOpen': 'Κανένα βιβλίο δεν είναι σε δανεισμό.',
  'staff.loans.loaned': 'Ημ. δανεισμού',
  'staff.loans.returnedAt': 'Ημ. επιστροφής',
  'staff.loans.renew': 'Παράταση',
  'staff.loans.renewed': 'Νέα προθεσμία: {date}.',
  'staff.loans.checkedOut':
    'Το «{title}» δανείστηκε έως {date}. Αναγνώστης: {borrower}.',
  'staff.loans.returned': 'Το «{title}» επιστράφηκε.',
  'staff.loans.returnedLate': 'Το «{title}» επιστράφηκε εκπρόθεσμα.',
  'staff.loans.findByTitle': 'Αναζήτηση βιβλίου',
  'staff.loans.findByTitleHint': 'Γράψτε τίτλο ή συγγραφέα και προσθέστε όσα βιβλία δανείζονται.',
  'staff.loans.matches': 'Βιβλία που ταιριάζουν',
  'staff.loans.scanBarcode': 'Ή barcode αντιτύπου',
  'staff.loans.scanHint': 'Σαρώστε ή πληκτρολογήστε το barcode και πατήστε Enter.',
  'staff.loans.findCopy': 'Εύρεση αντιτύπου',
  'staff.loans.dueDate': 'Προθεσμία επιστροφής',
  'staff.loans.dueDateHint': 'Προεπιλογή: {days} ημέρες.',
  'staff.loans.borrowerExisting': 'Υπάρχων αναγνώστης',
  'staff.loans.borrowerNew': 'Νέος αναγνώστης',
  'staff.loans.borrowerNewHint':
    'Καταχωρίζονται μόνο όνομα και τμήμα — τίποτα άλλο.',
  'staff.loans.recentReturns': 'Πρόσφατες επιστροφές',
  'staff.loans.selected': 'Επιλεγμένα αντίτυπα ({count})',
  'staff.loans.addCopy': 'Προσθήκη',
  'staff.loans.alreadySelected': 'Επιλεγμένο',
  'staff.loans.allSelected': 'Όλα επιλεγμένα',
  'staff.loans.availableOf': '{available} από {total} διαθέσιμα',
  'staff.loans.removeCopy': 'Αφαίρεση',
  'staff.loans.clearSelection': 'Καθαρισμός επιλογής',
  'staff.loans.lendCount': 'Δανεισμός {count} αντιτύπων',
  'staff.loans.checkedOutMany':
    'Δανείστηκαν {count} αντίτυπα έως {date}. Αναγνώστης: {borrower}.',
  'staff.loans.refused.already_on_loan':
    'Το αντίτυπο «{copy}» δεν δανείστηκε: είναι ήδη σε δανεισμό.',
  'staff.loans.refused.copy_not_available':
    'Το αντίτυπο «{copy}» δεν δανείστηκε: δεν είναι διαθέσιμο.',
  'staff.loans.refused.copy_not_found': 'Ένα αντίτυπο δεν βρέθηκε και δεν δανείστηκε.',
  'staff.loans.refused.due_date_in_past':
    'Το αντίτυπο «{copy}» δεν δανείστηκε: η προθεσμία είναι στο παρελθόν.',
  'staff.loans.refused.borrower_not_found':
    'Το αντίτυπο «{copy}» δεν δανείστηκε: ο αναγνώστης δεν βρέθηκε.',
  'staff.loans.refused.borrower_anonymized':
    'Το αντίτυπο «{copy}» δεν δανείστηκε: η εγγραφή του αναγνώστη έχει ανωνυμοποιηθεί.',
  'staff.loans.error.copy_not_found': 'Δεν βρέθηκε αντίτυπο με αυτό το barcode.',
  'staff.loans.error.copy_not_available': 'Το αντίτυπο δεν είναι διαθέσιμο για δανεισμό.',
  'staff.loans.error.already_on_loan': 'Το αντίτυπο είναι ήδη σε δανεισμό.',
  'staff.loans.error.borrower_not_found': 'Ο αναγνώστης δεν βρέθηκε.',
  'staff.loans.error.borrower_anonymized': 'Η εγγραφή του αναγνώστη έχει ανωνυμοποιηθεί.',
  'staff.loans.error.borrower_required': 'Επιλέξτε ή καταχωρίστε αναγνώστη.',
  'staff.loans.error.due_date_in_past': 'Η προθεσμία έχει ήδη περάσει.',
  'staff.loans.error.barcode_required': 'Δώστε ένα barcode.',
  'staff.loans.error.not_on_loan': 'Το αντίτυπο δεν είναι σε δανεισμό.',
  'staff.loans.error.loan_not_found': 'Ο δανεισμός δεν βρέθηκε.',
  'staff.loans.error.already_returned': 'Ο δανεισμός έχει ήδη κλείσει.',

  // --- Borrowers ---
  'staff.borrowers.title': 'Αναγνώστες',
  'staff.borrowers.add': 'Νέος αναγνώστης',
  'staff.borrowers.search': 'Αναζήτηση αναγνώστη',
  'staff.borrowers.name': 'Όνομα',
  'staff.borrowers.class': 'Τμήμα',
  'staff.borrowers.openLoans': 'Σε δανεισμό',
  'staff.borrowers.totalLoans': 'Σύνολο δανεισμών',
  'staff.borrowers.created': 'Ο αναγνώστης καταχωρίστηκε.',
  'staff.borrowers.saved': 'Τα στοιχεία αποθηκεύτηκαν.',
  'staff.borrowers.deleted': 'Η εγγραφή διαγράφηκε.',
  'staff.borrowers.empty': 'Δεν έχουν καταχωριστεί αναγνώστες.',
  'staff.borrowers.emptyHint': 'Οι αναγνώστες καταχωρίζονται κατά τον δανεισμό.',
  'staff.borrowers.history': 'Ιστορικό δανεισμών',
  'staff.borrowers.noHistory': 'Δεν υπάρχει ιστορικό δανεισμών.',
  'staff.borrowers.privacyNote':
    'Για κάθε αναγνώστη τηρούνται μόνο όνομα και τμήμα. Δεν καταχωρίζονται διευθύνσεις, τηλέφωνα, email ή αριθμοί μητρώου.',
  'staff.borrowers.isAnonymized': 'Η εγγραφή αυτή έχει ανωνυμοποιηθεί.',
  'staff.borrowers.anonymize': 'Ανωνυμοποίηση',
  'staff.borrowers.anonymizeTitle': 'Ανωνυμοποίηση αναγνώστη',
  'staff.borrowers.anonymizeConfirm': 'Ανωνυμοποίηση της εγγραφής «{name}»;',
  'staff.borrowers.anonymizeBlocked':
    'Η ανωνυμοποίηση δεν είναι διαθέσιμη όσο ο αναγνώστης έχει βιβλία σε δανεισμό. '
    + 'Κλείστε πρώτα τους δανεισμούς.',
  'staff.borrowers.anonymizeExplain':
    'Το όνομα και το τμήμα αντικαθίστανται με «{placeholder}». Οι {count} δανεισμοί διατηρούνται ως ανώνυμες εγγραφές, ώστε οι αριθμοί να παραμείνουν σωστοί. Η ενέργεια δεν αναιρείται.',
  'staff.borrowers.anonymized': 'Η εγγραφή ανωνυμοποιήθηκε.',
  'staff.borrowers.deleteTitle': 'Διαγραφή αναγνώστη',
  'staff.borrowers.deleteConfirm': 'Διαγραφή της εγγραφής «{name}»;',
  'staff.borrowers.deleteExplain': 'Η εγγραφή δεν έχει δανεισμούς και διαγράφεται οριστικά.',
  'staff.borrowers.deleteBlocked.has_loans':
    'Ο αναγνώστης έχει ιστορικό δανεισμών. Χρησιμοποιήστε ανωνυμοποίηση.',
  'staff.borrowers.error.open_loans':
    'Ο αναγνώστης έχει βιβλία σε δανεισμό. Καταχωρίστε πρώτα τις επιστροφές.',
  'staff.borrowers.error.anonymized': 'Η εγγραφή έχει ανωνυμοποιηθεί και δεν αλλάζει πλέον.',
  'staff.borrowers.error.not_found': 'Ο αναγνώστης δεν βρέθηκε.',
  'staff.borrowers.error.empty_name': 'Το όνομα είναι υποχρεωτικό.',

  // --- Account and staff users ---
  'staff.account.title': 'Ο λογαριασμός μου',
  'staff.account.changePassword': 'Αλλαγή κωδικού',
  'staff.account.currentPassword': 'Παλιός κωδικός',
  'staff.account.newPassword': 'Νέος κωδικός',
  'staff.account.confirmPassword': 'Νέος κωδικός ξανά',
  'staff.account.passwordHint': 'Τουλάχιστον {min} χαρακτήρες. Μια φράση είναι ασφαλέστερη.',
  'staff.account.changed': 'Ο κωδικός άλλαξε. Συνδεθείτε ξανά.',
  'staff.account.username': 'Όνομα χρήστη',
  'staff.account.role': 'Ρόλος',
  'staff.account.lastLogin': 'Τελευταία σύνδεση',
  'error.field.incorrect': 'Ο παλιός κωδικός δεν είναι σωστός.',
  'error.field.mismatch': 'Οι δύο κωδικοί δεν ταιριάζουν.',
  'error.field.too_short': 'Πολύ σύντομος κωδικός.',
  'error.field.too_common': 'Ο κωδικός μαντεύεται εύκολα. Επιλέξτε άλλον.',
  'error.field.too_long': 'Πολύ μεγάλη τιμή.',
  'error.field.invalid_username':
    'Μόνο λατινικοί χαρακτήρες, ψηφία και . _ - επιτρέπονται στο όνομα χρήστη.',
  'error.field.duplicate_username': 'Το όνομα χρήστη χρησιμοποιείται ήδη.',

  'staff.users.title': 'Χρήστες προσωπικού',
  'staff.users.add': 'Νέος χρήστης',
  'staff.users.created': 'Ο χρήστης «{username}» δημιουργήθηκε.',
  'staff.users.saved': 'Ο χρήστης «{username}» αποθηκεύτηκε.',
  'staff.users.deleted': 'Ο χρήστης «{username}» διαγράφηκε.',
  'staff.users.passwordReset': 'Ο κωδικός του «{username}» άλλαξε.',
  'staff.users.resetPassword': 'Νέος κωδικός',
  'staff.users.active': 'Ενεργός',
  'staff.users.inactive': 'Ανενεργός',
  'staff.users.mustChange': 'Απαιτείται αλλαγή κωδικού',
  'staff.users.newUserNote':
    'Ο νέος χρήστης θα πρέπει να αλλάξει τον κωδικό στην πρώτη σύνδεση.',
  'staff.users.error.last_admin':
    'Πρέπει να παραμείνει τουλάχιστον ένας ενεργός διαχειριστής.',
  'staff.users.error.self': 'Δεν μπορείτε να διαγράψετε τον λογαριασμό σας.',
  'staff.users.error.not_found': 'Ο χρήστης δεν βρέθηκε.',
  'staff.users.error.duplicate_username': 'Το όνομα χρήστη χρησιμοποιείται ήδη.',
  'staff.users.error.password_too_short': 'Ο κωδικός είναι πολύ σύντομος.',
  'staff.users.error.password_too_common': 'Ο κωδικός μαντεύεται εύκολα.',
  'staff.users.error.password_too_long': 'Ο κωδικός είναι πολύ μεγάλος.',
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
  'theme.switchToDark': 'Dark theme',
  'theme.switchToLight': 'Light theme',
  'lang.el': 'Ελληνικά',
  'lang.en': 'English',
  'footer.catalogue': 'School library catalogue',
  'nav.catalogue': 'Catalogue',
  'nav.browseBy': 'Browse by',
  'nav.breadcrumb': 'Breadcrumb',

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
  'home.stats.summary': '{titles} titles in the catalogue, {available} copies on the shelf right now.',

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
  'search.clearSearch': 'Clear search',
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
  'search.filter.multiHint': 'You can pick more than one in each list.',
  'search.sort.label': 'Sort by',
  'search.sort.title': 'Title (A–Z)',
  'search.sort.title_desc': 'Title (Z–A)',
  'search.sort.author': 'Author',
  'search.sort.newest': 'Recently added',
  'search.sort.year_desc': 'Year (newest first)',
  'search.sort.year': 'Year (oldest first)',

  // --- Book details ---
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
  'book.availability': 'Copies',
  'book.availableCount': '{available} of {total} available',
  'book.allAvailable': 'Available',
  'book.noneAvailable': 'Not available',
  'book.noCopies': 'No copies have been recorded.',
  'book.backToResults': 'Back to results',
  'book.relatedByAuthor': 'More by this author',

  // --- Copy status labels (public wording) ---
  'status.available': 'Available',
  'status.on_loan': 'On loan',
  'status.repair': 'Being repaired',
  'status.lost': 'Lost',
  'status.withdrawn': 'Withdrawn',

  // --- Copy condition, as the librarian sets it on each copy ---
  'condition.available': 'Fine',
  'condition.repair': 'In repair',
  'condition.lost': 'Lost',
  'condition.withdrawn': 'Withdrawn',

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
  'authors.leadForAuthor': 'Titles by this author in the catalogue.',
  'authors.booksBy': '{name}',

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
  'staff.nav.account': 'Account',
  'staff.nav.settings': 'Settings',
  'staff.settings.title': 'Settings',
  'staff.settings.lead': 'Catalogue metadata and staff accounts.',
  'staff.settings.categories': 'Organise books by subject.',
  'staff.settings.authors': 'Merge duplicates and correct names.',
  'staff.settings.users': 'Staff accounts and permissions.',
  'staff.settings.account': 'Change your own password.',
  'staff.settings.adminOnly': 'Administrators only',

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
  'staff.field.name': 'Name',
  'staff.field.personName': 'Full name',
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
  'staff.field.categoriesHint': 'Tick as many as apply.',
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
  'staff.copies.saveAll': 'Save changes',
  'staff.copies.saveBeforePaging': 'Save before changing page.',
  'staff.copies.savedMany': '{count} copies saved.',
  'staff.copies.rowFailed.duplicate_barcode':
    'Copy “{barcode}” was not saved: that barcode is already in use.',
  'staff.copies.rowFailed.on_loan': 'Copy “{barcode}” was not saved: it is on loan.',
  'staff.copies.rowFailed.not_found': 'One copy was not found and was not saved.',
  'staff.copies.deleted': 'Copy deleted.',
  'staff.copies.deleteTitle': 'Delete copy',
  'staff.copies.empty': 'No copies yet',
  'staff.copies.emptyHint': 'A title with no copies shows as unavailable on the public site.',
  'staff.copies.availability': 'Available',
  'staff.copies.whereIsIt': 'Where it is',
  'staff.copies.onLoanTo': 'On loan until {date}',
  'staff.copies.error.invalid': 'Invalid copy details.',
  'staff.copies.error.duplicate_barcode': 'That barcode is already in use.',
  'staff.copies.error.on_loan': 'This copy is on loan. Record its return first.',
  'staff.copies.error.not_found': 'Copy not found.',
  'staff.copies.error.badCount': 'Enter a number between 1 and 100.',
  'staff.copies.deleteBlocked.has_loans':
    'This copy has loan history. Mark it withdrawn rather than deleting it.',
  'staff.copies.deleteBlocked.on_loan': 'This copy is currently on loan.',
  'staff.copies.withdrawInstead': 'Withdraw this copy',

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

  // --- Circulation ---
  'staff.loans.title': 'Loans',
  'staff.loans.checkout': 'Check out a book',
  'staff.loans.checkin': 'Check in a book',
  'staff.loans.status.open': 'Out now',
  'staff.loans.status.overdue': 'Overdue',
  'staff.loans.status.returned': 'Returned',
  'staff.loans.status.all': 'All',
  'staff.loans.empty': 'No loans',
  'staff.loans.emptyOpen': 'No books are currently on loan.',
  'staff.loans.loaned': 'Loaned',
  'staff.loans.returnedAt': 'Returned',
  'staff.loans.renew': 'Extend',
  'staff.loans.renewed': 'Due date moved to {date}.',
  'staff.loans.checkedOut': '“{title}” checked out to {borrower} until {date}.',
  'staff.loans.returned': '“{title}” has been returned.',
  'staff.loans.returnedLate': '“{title}” was returned late.',
  'staff.loans.findByTitle': 'Find a book',
  'staff.loans.findByTitleHint': 'Type a title or author, then pick a copy.',
  'staff.loans.matches': 'Matching books',
  'staff.loans.scanBarcode': 'Or copy barcode',
  'staff.loans.scanHint': 'Scan or type the barcode and press Enter.',
  'staff.loans.findCopy': 'Find copy',
  'staff.loans.dueDate': 'Due date',
  'staff.loans.dueDateHint': 'Default: {days} days.',
  'staff.loans.borrowerExisting': 'Existing borrower',
  'staff.loans.borrowerNew': 'New borrower',
  'staff.loans.borrowerNewHint': 'Only a name and a class are recorded — nothing else.',
  'staff.loans.recentReturns': 'Recent returns',
  'staff.loans.selected': 'Selected copies ({count})',
  'staff.loans.addCopy': 'Add',
  'staff.loans.alreadySelected': 'Selected',
  'staff.loans.allSelected': 'All selected',
  'staff.loans.availableOf': '{available} of {total} available',
  'staff.loans.removeCopy': 'Remove',
  'staff.loans.clearSelection': 'Clear selection',
  'staff.loans.lendCount': 'Lend {count} copies',
  'staff.loans.checkedOutMany': '{count} copies lent to {borrower}, due {date}.',
  'staff.loans.refused.already_on_loan':
    'Copy “{copy}” was not lent: it is already on loan.',
  'staff.loans.refused.copy_not_available':
    'Copy “{copy}” was not lent: it is not available.',
  'staff.loans.refused.copy_not_found': 'One copy was not found and was not lent.',
  'staff.loans.refused.due_date_in_past':
    'Copy “{copy}” was not lent: the due date is in the past.',
  'staff.loans.refused.borrower_not_found':
    'Copy “{copy}” was not lent: the borrower was not found.',
  'staff.loans.refused.borrower_anonymized':
    'Copy “{copy}” was not lent: that borrower record has been anonymized.',
  'staff.loans.error.copy_not_found': 'No copy was found with that barcode.',
  'staff.loans.error.copy_not_available': 'That copy is not available to lend.',
  'staff.loans.error.already_on_loan': 'That copy is already on loan.',
  'staff.loans.error.borrower_not_found': 'Borrower not found.',
  'staff.loans.error.borrower_anonymized': 'That borrower record has been anonymized.',
  'staff.loans.error.borrower_required': 'Choose or add a borrower.',
  'staff.loans.error.due_date_in_past': 'That due date is in the past.',
  'staff.loans.error.barcode_required': 'Enter a barcode.',
  'staff.loans.error.not_on_loan': 'That copy is not on loan.',
  'staff.loans.error.loan_not_found': 'Loan not found.',
  'staff.loans.error.already_returned': 'That loan is already closed.',

  // --- Borrowers ---
  'staff.borrowers.title': 'Borrowers',
  'staff.borrowers.add': 'New borrower',
  'staff.borrowers.search': 'Search borrowers',
  'staff.borrowers.name': 'Name',
  'staff.borrowers.class': 'Class',
  'staff.borrowers.openLoans': 'Out now',
  'staff.borrowers.totalLoans': 'Total loans',
  'staff.borrowers.created': 'Borrower added.',
  'staff.borrowers.saved': 'Details saved.',
  'staff.borrowers.deleted': 'Record deleted.',
  'staff.borrowers.empty': 'No borrowers have been recorded.',
  'staff.borrowers.emptyHint': 'Borrowers are added when a book is checked out.',
  'staff.borrowers.history': 'Loan history',
  'staff.borrowers.noHistory': 'No loan history.',
  'staff.borrowers.privacyNote':
    'Only a name and a class are kept for each borrower. No addresses, phone numbers, email addresses or registry numbers are recorded.',
  'staff.borrowers.isAnonymized': 'This record has been anonymized.',
  'staff.borrowers.anonymize': 'Anonymize',
  'staff.borrowers.anonymizeTitle': 'Anonymize borrower',
  'staff.borrowers.anonymizeConfirm': 'Anonymize the record for “{name}”?',
  'staff.borrowers.anonymizeBlocked':
    'Anonymizing is unavailable while this borrower has books on loan. '
    + 'Close the loans first.',
  'staff.borrowers.anonymizeExplain':
    'The name and class are replaced with “{placeholder}”. The {count} loans are kept as anonymous records so the figures stay correct. This cannot be undone.',
  'staff.borrowers.anonymized': 'The record has been anonymized.',
  'staff.borrowers.deleteTitle': 'Delete borrower',
  'staff.borrowers.deleteConfirm': 'Delete the record for “{name}”?',
  'staff.borrowers.deleteExplain': 'This record has no loans and will be deleted outright.',
  'staff.borrowers.deleteBlocked.has_loans':
    'This borrower has loan history. Use anonymization instead.',
  'staff.borrowers.error.open_loans':
    'This borrower still has books out. Record the returns first.',
  'staff.borrowers.error.anonymized': 'This record has been anonymized and cannot be edited.',
  'staff.borrowers.error.not_found': 'Borrower not found.',
  'staff.borrowers.error.empty_name': 'A name is required.',

  // --- Account and staff users ---
  'staff.account.title': 'My account',
  'staff.account.changePassword': 'Change password',
  'staff.account.currentPassword': 'Old password',
  'staff.account.newPassword': 'New password',
  'staff.account.confirmPassword': 'New password again',
  'staff.account.passwordHint': 'At least {min} characters. A phrase is safer than a word.',
  'staff.account.changed': 'Password changed. Please sign in again.',
  'staff.account.username': 'Username',
  'staff.account.role': 'Role',
  'staff.account.lastLogin': 'Last sign-in',
  'error.field.incorrect': 'That is not the current password.',
  'error.field.mismatch': 'The two entries do not match.',
  'error.field.too_short': 'That password is too short.',
  'error.field.too_common': 'That password is too easily guessed. Choose another.',
  'error.field.too_long': 'That value is too long.',
  'error.field.invalid_username':
    'A username may contain only Latin letters, digits and . _ -',
  'error.field.duplicate_username': 'That username is already taken.',

  'staff.users.title': 'Staff users',
  'staff.users.add': 'New user',
  'staff.users.created': 'User “{username}” created.',
  'staff.users.saved': 'User “{username}” saved.',
  'staff.users.deleted': 'User “{username}” deleted.',
  'staff.users.passwordReset': 'Password for “{username}” changed.',
  'staff.users.resetPassword': 'New password',
  'staff.users.active': 'Active',
  'staff.users.inactive': 'Inactive',
  'staff.users.mustChange': 'Must change password',
  'staff.users.newUserNote': 'The new user will have to change this password at first sign-in.',
  'staff.users.error.last_admin': 'At least one active administrator must remain.',
  'staff.users.error.self': 'You cannot delete your own account.',
  'staff.users.error.not_found': 'User not found.',
  'staff.users.error.duplicate_username': 'That username is already taken.',
  'staff.users.error.password_too_short': 'That password is too short.',
  'staff.users.error.password_too_common': 'That password is too easily guessed.',
  'staff.users.error.password_too_long': 'That password is too long.',
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

/**
 * Whether a key exists in any dictionary.
 *
 * Used by the field-error partial to decide whether a validation code has a
 * specific message or should fall back to a generic one. Checking existence
 * beats maintaining a hand-written list of known codes in the template — that
 * list fell behind the moment new codes were added, and the affected fields
 * silently rendered "invalid value" instead of the real reason.
 *
 * @param {string} key
 */
export function hasTranslation(key) {
  return Object.hasOwn(dictionaries.el, key) || Object.hasOwn(dictionaries.en, key);
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
