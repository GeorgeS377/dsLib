#!/usr/bin/env node
// Seed a demo catalogue so the site can be reviewed with realistic content.
//
// What this does NOT create, deliberately:
//   * no staff account and no password — run `npm run create-admin` for that,
//     so no deployment ever starts with a known login;
//   * no borrowers and no loans — those describe real children.
//
// Everything below is public-domain or long out of copyright, mixing Greek and
// English titles to exercise the Greek search path. Safe to run more than
// once: existing titles are matched by ISBN or title and skipped.
import process from 'node:process';
import { closeDatabase, getDatabase } from '../src/db/index.js';
import { migrate } from '../src/db/migrate.js';
import { createBook, findBookByIsbn13, listBooks } from '../src/db/queries/books.js';
import { createCategory, listAllCategories } from '../src/db/queries/categories.js';
import { createCopy } from '../src/db/queries/copies.js';

const CATEGORIES = [
  { name: 'Ελληνική Λογοτεχνία', description: 'Ποίηση και πεζογραφία από Έλληνες συγγραφείς.' },
  { name: 'Ξένη Λογοτεχνία', description: 'Μεταφρασμένη και ξενόγλωσση λογοτεχνία.' },
  { name: 'Αρχαία Γραμματεία', description: 'Κείμενα της αρχαίας ελληνικής γραμματείας.' },
  { name: 'Ιστορία', description: 'Ελληνική και παγκόσμια ιστορία.' },
  { name: 'Επιστήμες', description: 'Φυσικές επιστήμες και μαθηματικά.' },
  { name: 'Παιδική Λογοτεχνία', description: 'Βιβλία για μικρότερες ηλικίες.' },
];

const BOOKS = [
  {
    title: 'Οδύσσεια',
    authorNames: ['Όμηρος'],
    categories: ['Αρχαία Γραμματεία', 'Ελληνική Λογοτεχνία'],
    publisher: 'Εκδόσεις Κλασικά',
    publication_year: 1998,
    language: 'el',
    edition: '3η έκδοση',
    description:
      'Το έπος της επιστροφής του Οδυσσέα στην Ιθάκη, σε έμμετρη νεοελληνική απόδοση. '
      + 'Περιλαμβάνει εισαγωγή και σχόλια.',
    copies: [{ barcode: 'SL-0001', shelf: 'Α1-01' }, { barcode: 'SL-0002', shelf: 'Α1-01' }],
  },
  {
    title: 'Ιλιάδα',
    authorNames: ['Όμηρος'],
    categories: ['Αρχαία Γραμματεία'],
    publisher: 'Εκδόσεις Κλασικά',
    publication_year: 1996,
    language: 'el',
    description: 'Η μήνις του Αχιλλέα και ο πόλεμος της Τροίας.',
    copies: [{ barcode: 'SL-0003', shelf: 'Α1-02' }],
  },
  {
    title: 'Βίος και Πολιτεία του Αλέξη Ζορμπά',
    authorNames: ['Νίκος Καζαντζάκης'],
    categories: ['Ελληνική Λογοτεχνία'],
    publisher: 'Εκδόσεις Αθηνά',
    publication_year: 1946,
    language: 'el',
    description:
      'Η γνωριμία ενός διανοούμενου με τον αυθόρμητο Ζορμπά στην Κρήτη, '
      + 'και η σύγκρουση βιβλίου και ζωής.',
    copies: [{ barcode: 'SL-0004', shelf: 'Β2-05' }, { barcode: 'SL-0005', shelf: 'Β2-05' }],
  },
  {
    title: 'Το Τρίτο Στεφάνι',
    authorNames: ['Κώστας Ταχτσής'],
    categories: ['Ελληνική Λογοτεχνία'],
    publication_year: 1962,
    language: 'el',
    description: 'Δύο γυναικείες φωνές διηγούνται την Ελλάδα του 20ού αιώνα.',
    copies: [{ barcode: 'SL-0006', shelf: 'Β2-07' }],
  },
  {
    title: 'Άξιον Εστί',
    authorNames: ['Οδυσσέας Ελύτης'],
    categories: ['Ελληνική Λογοτεχνία'],
    publication_year: 1959,
    language: 'el',
    description: 'Ποιητική σύνθεση για το Αιγαίο, τον πόλεμο και τη μνήμη.',
    copies: [{ barcode: 'SL-0007', shelf: 'Β3-01' }],
  },
  {
    title: 'Ποιήματα',
    subtitle: 'Συγκεντρωτική έκδοση',
    authorNames: ['Κωνσταντίνος Καβάφης'],
    categories: ['Ελληνική Λογοτεχνία'],
    publication_year: 1991,
    language: 'el',
    description: 'Περιλαμβάνει την «Ιθάκη» και τα «Τείχη».',
    copies: [{ barcode: 'SL-0008', shelf: 'Β3-02' }, { barcode: 'SL-0009', shelf: 'Β3-02' }],
  },
  {
    title: 'Ιστορίαι',
    authorNames: ['Ηρόδοτος'],
    categories: ['Αρχαία Γραμματεία', 'Ιστορία'],
    publication_year: 2003,
    language: 'el',
    description: 'Η εξιστόρηση των Περσικών Πολέμων από τον «πατέρα της ιστορίας».',
    copies: [{ barcode: 'SL-0010', shelf: 'Γ1-04' }],
  },
  {
    title: 'Pride and Prejudice',
    authorNames: ['Jane Austen'],
    categories: ['Ξένη Λογοτεχνία'],
    isbn13: '9780141439518',
    publisher: 'Penguin Classics',
    publication_year: 2003,
    language: 'en',
    description: 'Elizabeth Bennet, Mr Darcy, and the social machinery of marriage.',
    copies: [{ barcode: 'SL-0011', shelf: 'E1-01' }, { barcode: 'SL-0012', shelf: 'E1-01' }],
  },
  {
    title: 'Jane Eyre',
    authorNames: ['Charlotte Brontë'],
    categories: ['Ξένη Λογοτεχνία'],
    isbn13: '9780141441146',
    publisher: 'Penguin Classics',
    publication_year: 2006,
    language: 'en',
    description: 'An orphan governess, a locked attic, and a hard-won independence.',
    copies: [{ barcode: 'SL-0013', shelf: 'E1-04' }],
  },
  {
    title: 'Frankenstein',
    subtitle: 'or, The Modern Prometheus',
    authorNames: ['Mary Shelley'],
    categories: ['Ξένη Λογοτεχνία', 'Επιστήμες'],
    isbn13: '9780143131847',
    publisher: 'Penguin Classics',
    publication_year: 2018,
    language: 'en',
    description: 'A student of natural philosophy animates a creature and abandons it.',
    copies: [{ barcode: 'SL-0014', shelf: 'E2-02' }],
  },
  {
    title: 'Τα Παιδιά της Νιόβης',
    authorNames: ['Άλκη Ζέη'],
    categories: ['Παιδική Λογοτεχνία', 'Ελληνική Λογοτεχνία'],
    publication_year: 1987,
    language: 'el',
    description: 'Μυθιστόρημα για νέους αναγνώστες.',
    copies: [{ barcode: 'SL-0015', shelf: 'Π1-03' }, { barcode: 'SL-0016', shelf: 'Π1-03' }],
  },
  {
    title: 'Ο Μικρός Πρίγκιπας',
    authorNames: ['Antoine de Saint-Exupéry'],
    categories: ['Παιδική Λογοτεχνία', 'Ξένη Λογοτεχνία'],
    publication_year: 2010,
    language: 'el',
    description: 'Ένας αεροπόρος συναντά έναν μικρό πρίγκιπα στην έρημο.',
    copies: [{ barcode: 'SL-0017', shelf: 'Π1-05' }],
  },
  {
    title: 'Μαθηματικά για το Λύκειο',
    subtitle: 'Άλγεβρα και Γεωμετρία',
    authorNames: ['Μαρία Δημητρίου', 'Ανδρέας Παπαδόπουλος'],
    categories: ['Επιστήμες'],
    publisher: 'Εκδόσεις Σχολική',
    publication_year: 2019,
    language: 'el',
    edition: '2η έκδοση',
    description: 'Θεωρία, λυμένες ασκήσεις και επαναληπτικά θέματα.',
    copies: [
      { barcode: 'SL-0018', shelf: 'Ε1-01' },
      { barcode: 'SL-0019', shelf: 'Ε1-01' },
      { barcode: 'SL-0020', shelf: 'Ε1-01' },
    ],
  },
  {
    title: 'A Brief History of Time',
    authorNames: ['Stephen Hawking'],
    categories: ['Επιστήμες'],
    isbn13: '9780553380163',
    publisher: 'Bantam',
    publication_year: 1998,
    language: 'en',
    description: 'Cosmology for the general reader: black holes, entropy and time.',
    copies: [{ barcode: 'SL-0021', shelf: 'Ε2-07', status: 'repair' }],
  },
  {
    title: 'Ιστορία του Ελληνικού Έθνους',
    subtitle: 'Τόμος Α',
    authorNames: ['Κωνσταντίνος Παπαρρηγόπουλος'],
    categories: ['Ιστορία'],
    publication_year: 1992,
    language: 'el',
    description: 'Συνοπτική παρουσίαση της ελληνικής ιστορίας.',
    copies: [{ barcode: 'SL-0022', shelf: 'Γ2-01' }],
  },
];

function seed() {
  const db = getDatabase();
  migrate(db);

  // Categories first, so titles can attach to them.
  const existingCategories = new Map(listAllCategories(db).map((c) => [c.name, c.id]));
  let categoriesCreated = 0;
  for (const category of CATEGORIES) {
    if (existingCategories.has(category.name)) continue;
    const result = createCategory(db, category);
    if (result.ok) {
      existingCategories.set(category.name, result.id);
      categoriesCreated += 1;
    }
  }

  const existingTitles = new Set(
    listBooks(db, { includeArchived: true, perPage: 100 }).rows.map((b) => b.title),
  );

  let booksCreated = 0;
  let copiesCreated = 0;

  for (const entry of BOOKS) {
    const duplicate =
      existingTitles.has(entry.title) ||
      (entry.isbn13 && findBookByIsbn13(db, entry.isbn13));
    if (duplicate) continue;

    const bookId = createBook(db, {
      title: entry.title,
      subtitle: entry.subtitle,
      isbn13: entry.isbn13,
      publisher: entry.publisher,
      publication_year: entry.publication_year,
      edition: entry.edition,
      language: entry.language,
      description: entry.description,
      authorNames: entry.authorNames,
      categoryIds: (entry.categories ?? [])
        .map((name) => existingCategories.get(name))
        .filter(Boolean),
    });
    booksCreated += 1;

    for (const copy of entry.copies ?? []) {
      const result = createCopy(db, bookId, {
        barcode: copy.barcode,
        shelfLocation: copy.shelf,
        status: copy.status,
      });
      if (result.ok) copiesCreated += 1;
    }
  }

  return { categoriesCreated, booksCreated, copiesCreated };
}

try {
  const result = seed();
  console.log(
    `Seeded demo catalogue: ${result.booksCreated} title(s), ` +
      `${result.copiesCreated} cop(ies), ${result.categoriesCreated} categor(ies).`,
  );
  if (result.booksCreated === 0) {
    console.log('(Nothing new — the demo titles were already present.)');
  }
  console.log('\nNo staff account was created. Run `npm run create-admin` to make one.');
  console.log('No borrowers or loans were created.');
} catch (error) {
  console.error(`Seeding failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
