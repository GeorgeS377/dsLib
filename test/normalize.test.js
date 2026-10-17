// Greek-aware search normalization.
//
// These cases are the reason the search_text column exists. SQLite cannot fold
// Greek case or accents itself (verified: lower('ΟΔΥΣΣΕΙΑ') is unchanged on
// SQLite 3.51.2), so if this function is wrong, Greek search silently fails.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BROWSER_FOLD_SOURCE,
  buildSearchText,
  normalize,
  queryTokens,
  slugify,
} from '../src/lib/normalize.js';

describe('normalize', () => {
  it('folds Greek case', () => {
    assert.equal(normalize('ΟΔΥΣΣΕΙΑ'), normalize('οδυσσεια'));
    assert.equal(normalize('Ιλιάδα'), normalize('ΙΛΙΑΔΑ'));
  });

  it('strips Greek accents (tonos)', () => {
    assert.equal(normalize('Οδύσσεια'), 'οδυσσεια');
    assert.equal(normalize('Ιλιάδα'), 'ιλιαδα');
    assert.equal(normalize('Καζαντζάκης'), 'καζαντζακησ');
  });

  it('strips dialytika, including combined with tonos', () => {
    assert.equal(normalize('Μαϊμού'), 'μαιμου');
    assert.equal(normalize('ρωμαϊκός'), 'ρωμαικοσ');
    // ΐ and ΰ decompose into two combining marks.
    assert.equal(normalize('πρωτεΐνη'), 'πρωτεινη');
    assert.equal(normalize('μυΰλος'), 'μυυλοσ');
  });

  it('unifies final sigma with medial sigma', () => {
    assert.equal(normalize('Οδυσσεύς'), normalize('οδυσσευσ'));
    assert.equal(normalize('ΟΔΥΣΣΕΥΣ'), normalize('Οδυσσεύς'));
  });

  it('folds uppercase sigma at the end of a word', () => {
    // 'Σ' lowercases to 'ς' in final position, which must then fold to 'σ'.
    assert.equal(normalize('ΠΑΠΑΔΟΠΟΥΛΟΣ'), 'παπαδοπουλοσ');
    assert.equal(normalize('Παπαδόπουλος'), 'παπαδοπουλοσ');
  });

  it('handles polytonic Greek', () => {
    assert.equal(normalize('Ὀδύσσεια'), 'οδυσσεια');
    assert.equal(normalize('ἄνθρωπος'), 'ανθρωποσ');
  });

  it('folds Latin accents too', () => {
    assert.equal(normalize('Café'), 'cafe');
    assert.equal(normalize('Brontë'), 'bronte');
    assert.equal(normalize('Müller'), 'muller');
  });

  it('replaces punctuation with spaces and collapses whitespace', () => {
    assert.equal(normalize('  Το  Σπίτι—της   Μαρίας! '), 'το σπιτι τησ μαριασ');
    assert.equal(normalize('978-0-13-110362-7'), '978 0 13 110362 7');
    assert.equal(normalize("O'Brien"), 'o brien');
  });

  it('keeps digits', () => {
    assert.equal(normalize('1984'), '1984');
  });

  it('returns an empty string for empty input', () => {
    assert.equal(normalize(null), '');
    assert.equal(normalize(undefined), '');
    assert.equal(normalize(''), '');
    assert.equal(normalize('   '), '');
    assert.equal(normalize('!!!'), '');
  });

  it('accepts non-string input', () => {
    assert.equal(normalize(2024), '2024');
  });
});

describe('buildSearchText', () => {
  it('combines parts into de-duplicated tokens', () => {
    const text = buildSearchText('Οδύσσεια', 'Όμηρος', ['Ποίηση', 'Κλασικά']);
    assert.ok(text.includes('οδυσσεια'));
    assert.ok(text.includes('ομηροσ'));
    assert.ok(text.includes('ποιηση'));
    assert.ok(text.includes('κλασικα'));
  });

  it('de-duplicates repeated words', () => {
    const text = buildSearchText('Ιλιάδα', 'Η Ιλιάδα του Ομήρου');
    assert.equal(text.split(' ').filter((w) => w === 'ιλιαδα').length, 1);
  });

  it('ignores null, undefined and empty parts', () => {
    assert.equal(buildSearchText(null, undefined, '', '  '), '');
    assert.equal(buildSearchText('Ιλιάδα', null, undefined), 'ιλιαδα');
  });

  it('flattens nested arrays', () => {
    const text = buildSearchText([['Όμηρος'], ['Ποίηση']]);
    assert.ok(text.includes('ομηροσ'));
    assert.ok(text.includes('ποιηση'));
  });
});

describe('queryTokens', () => {
  it('splits a query into normalized tokens', () => {
    assert.deepEqual(queryTokens('Οδύσσεια Ομήρου'), ['οδυσσεια', 'ομηρου']);
  });

  it('de-duplicates tokens', () => {
    assert.deepEqual(queryTokens('ιλιαδα Ιλιάδα'), ['ιλιαδα']);
  });

  it('returns an empty array for a blank query', () => {
    assert.deepEqual(queryTokens(''), []);
    assert.deepEqual(queryTokens('   '), []);
    assert.deepEqual(queryTokens(null), []);
    assert.deepEqual(queryTokens('!!!'), []);
  });

  it('caps the token count so a huge query cannot build a huge statement', () => {
    const many = Array.from({ length: 50 }, (_, i) => `word${i}`).join(' ');
    assert.equal(queryTokens(many).length, 10);
    assert.equal(queryTokens(many, { maxTokens: 3 }).length, 3);
  });
});

describe('slugify', () => {
  it('transliterates Greek to Latin', () => {
    assert.equal(slugify('Ελληνική Λογοτεχνία'), 'elliniki-logotechnia');
    assert.equal(slugify('Ιστορία'), 'istoria');
    assert.equal(slugify('Μαθηματικά'), 'mathimatika');
  });

  it('handles English input unchanged apart from casing', () => {
    assert.equal(slugify('Science Fiction'), 'science-fiction');
  });

  it('produces no leading, trailing or repeated separators', () => {
    assert.equal(slugify('  —Ποίηση!!  '), 'poiisi');
    assert.equal(slugify('a / b'), 'a-b');
  });

  it('returns an empty string when there is nothing to slug', () => {
    assert.equal(slugify(''), '');
    assert.equal(slugify('!!!'), '');
    assert.equal(slugify(null), '');
  });

  it('caps length so a slug cannot grow unbounded', () => {
    assert.ok(slugify('α'.repeat(200)).length <= 80);
  });
});

describe('the folding the browser does', () => {
  // app.js cannot import this module — it is served to the browser as written,
  // with no build step — so it carries its own copy of the folding. Two
  // implementations that drifted would make the suggestion lists find things
  // the catalogue search cannot, which is worse than no suggestions. So the
  // copy is published from here and both are run against the same samples.
  const browserFold = new Function('value', BROWSER_FOLD_SOURCE);

  it('agrees with the server on Greek', () => {
    for (const sample of [
      'Νίκος Καζαντζάκης', 'ΝΊΚΟΣ ΚΑΖΑΝΤΖΆΚΗΣ', 'νικοσ καζαντζακησ',
      'Το καπλάνι της βιτρίνας', 'ΤΟ ΚΑΠΛΑΝΙ ΤΗΣ ΒΙΤΡΙΝΆΣ',
      'Παπαδόπουλος, Γιώργος', 'Antoine de Saint-Exupéry', 'Charlotte Brontë',
      'Άξιον Εστί', 'Οδυσσέας Ελύτης', '  διπλό   κενό  ', '', 'Α1', 'Β2',
      'Ὀδύσσεια', 'ΐδιο', 'ΰ', 'Μαρία-Ελένη', "O'Brien",
    ]) {
      assert.equal(browserFold(sample), normalize(sample), `disagreed on "${sample}"`);
    }
  });

  it('folds a final sigma, the commonest Greek ending', () => {
    assert.equal(browserFold('Καζαντζάκης'), browserFold('καζαντζακησ'));
  });
});
