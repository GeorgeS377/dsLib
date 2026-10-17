// Translation integrity. The key-parity test is the one that matters: it is
// what stops a screen from shipping with English labels missing (or vice
// versa) once more phases add text.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPPORTED_LANGS,
  dictionaries,
  hasTranslation,
  langFromAcceptHeader,
  resolveLang,
  translate,
  translatorFor,
} from '../src/lib/i18n.js';

describe('i18n dictionaries', () => {
  it('declares every supported language', () => {
    for (const lang of SUPPORTED_LANGS) {
      assert.ok(dictionaries[lang], `missing dictionary for ${lang}`);
    }
  });

  it('has identical key sets across languages', () => {
    const [reference, ...others] = SUPPORTED_LANGS;
    const referenceKeys = Object.keys(dictionaries[reference]).sort();

    for (const lang of others) {
      const keys = Object.keys(dictionaries[lang]).sort();
      const missing = referenceKeys.filter((k) => !keys.includes(k));
      const extra = keys.filter((k) => !referenceKeys.includes(k));

      assert.deepEqual(
        missing,
        [],
        `${lang} is missing keys present in ${reference}: ${missing.join(', ')}`,
      );
      assert.deepEqual(
        extra,
        [],
        `${lang} has keys absent from ${reference}: ${extra.join(', ')}`,
      );
    }
  });

  // A counting key holds { one, other }; everything else holds a string.
  // Both checks below look at every form rather than skipping the pluralised
  // keys, which would leave sixteen strings unchecked in each language.
  const formsOf = (value) =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).map(([form, text]) => [`.${form}`, text])
      : [['', value]];

  it('has no empty translations', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        for (const [suffix, text] of formsOf(value)) {
          assert.ok(
            typeof text === 'string' && text.trim().length > 0,
            `${lang}.${key}${suffix} is empty`,
          );
        }
      }
    }
  });

  it('uses the same placeholders in every language', () => {
    const placeholders = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    const [reference, ...others] = SUPPORTED_LANGS;

    for (const key of Object.keys(dictionaries[reference])) {
      for (const [suffix, text] of formsOf(dictionaries[reference][key])) {
        const expected = placeholders(text);
        for (const lang of others) {
          const counterpart = suffix
            ? dictionaries[lang][key]?.[suffix.slice(1)]
            : dictionaries[lang][key];
          assert.deepEqual(
            placeholders(counterpart ?? ''),
            expected,
            `placeholder mismatch for ${key}${suffix} in ${lang}`,
          );
        }
      }
    }
  });
});

describe('translate', () => {
  it('returns the translation for a known key', () => {
    assert.equal(translate('en', 'nav.home'), 'Home');
    assert.equal(translate('el', 'nav.home'), 'Αρχική');
  });

  it('interpolates named placeholders', () => {
    assert.equal(translate('en', 'pagination.page', { current: 2, total: 7 }), 'Page 2 of 7');
  });

  it('leaves unknown placeholders untouched rather than printing undefined', () => {
    assert.equal(translate('en', 'pagination.page', { current: 2 }), 'Page 2 of {total}');
  });

  it('falls back to Greek, then to the key itself', () => {
    assert.equal(translate('de', 'nav.home'), 'Αρχική');
    assert.equal(translate('en', 'no.such.key'), 'no.such.key');
  });

  it('binds a language with translatorFor', () => {
    const t = translatorFor('en');
    assert.equal(t('nav.books'), 'Books');
    assert.equal(t.lang, 'en');
  });
});

describe('language resolution', () => {
  it('prefers an explicit query parameter', () => {
    const result = resolveLang({ query: { lang: 'en' }, cookies: { lang: 'el' } }, 'el');
    assert.deepEqual(result, { lang: 'en', fromQuery: true });
  });

  it('falls back to the saved cookie', () => {
    const result = resolveLang({ query: {}, cookies: { lang: 'en' } }, 'el');
    assert.deepEqual(result, { lang: 'en', fromQuery: false });
  });

  it('ignores an unsupported language and keeps looking', () => {
    const result = resolveLang({ query: { lang: 'fr' }, cookies: { lang: 'en' } }, 'el');
    assert.deepEqual(result, { lang: 'en', fromQuery: false });
  });

  it('uses Accept-Language when nothing else is set', () => {
    const result = resolveLang(
      { query: {}, cookies: {}, headers: { 'accept-language': 'en-GB,en;q=0.9' } },
      'el',
    );
    assert.equal(result.lang, 'en');
  });

  it('respects quality ordering in Accept-Language', () => {
    assert.equal(langFromAcceptHeader('en;q=0.3,el;q=0.9'), 'el');
    assert.equal(langFromAcceptHeader('de,fr'), null);
    assert.equal(langFromAcceptHeader('el;q=0'), null);
    assert.equal(langFromAcceptHeader(undefined), null);
  });

  it('defaults to the configured language', () => {
    assert.equal(resolveLang({ query: {}, cookies: {}, headers: {} }, 'el').lang, 'el');
    assert.equal(resolveLang({ query: {}, cookies: {}, headers: {} }, 'en').lang, 'en');
  });
});

describe('plural forms', () => {
  // Greek and English both split one from everything else, so a key that
  // counts things holds two strings rather than one. Without this the
  // overdue banner read "1 βιβλία" — a plural noun after the number one,
  // which no Greek speaker would say.
  it('picks the singular when exactly one thing is counted', () => {
    assert.equal(
      translate('el', 'staff.dashboard.overdueCount', { count: 1 }),
      '1 βιβλίο θα έπρεπε να έχει γυρίσει.',
    );
    assert.equal(
      translate('en', 'staff.dashboard.overdueCount', { count: 1 }),
      '1 book is overdue.',
    );
  });

  it('picks the plural for none, two, and many', () => {
    for (const count of [0, 2, 11, 100]) {
      assert.match(
        translate('el', 'staff.dashboard.overdueCount', { count }),
        /βιβλία/,
        `count ${count} did not read as plural`,
      );
    }
  });

  it('gives both languages both forms, for every counting key', () => {
    // A key with one form in Greek and two in English would read correctly
    // in one language and wrongly in the other.
    for (const [lang, dict] of Object.entries(dictionaries)) {
      for (const [key, value] of Object.entries(dict)) {
        if (typeof value !== 'object' || value === null) continue;
        assert.deepEqual(
          Object.keys(value).sort(), ['one', 'other'],
          `${lang}.${key} does not have exactly a singular and a plural`,
        );
        for (const form of ['one', 'other']) {
          assert.equal(typeof value[form], 'string', `${lang}.${key}.${form} is not a string`);
        }
      }
    }
  });

  it('keeps a counting key plural in both languages or neither', () => {
    for (const key of Object.keys(dictionaries.el)) {
      assert.equal(
        typeof dictionaries.el[key] === 'object',
        typeof dictionaries.en[key] === 'object',
        `${key} is pluralised in one language but not the other`,
      );
    }
  });

  it('still substitutes the count itself', () => {
    assert.match(translate('el', 'staff.dashboard.overdueCount', { count: 7 }), /\b7\b/);
  });

  it('falls back to the plural when nothing says how many', () => {
    // A caller that forgets `count` should get readable text, not "[object
    // Object]" and not a crash.
    const text = translate('el', 'staff.dashboard.overdueCount', {});
    assert.equal(typeof text, 'string');
    assert.ok(!text.includes('object'), `got "${text}"`);
  });

  it('agrees with the sentence it follows', () => {
    // The link is the back half of "1 βιβλίο έπρεπε να έχει γυρίσει. Δείτε
    // ποιο." — a plural link after a singular sentence is the same fault as
    // the one the count forms fixed, moved one word along.
    assert.equal(translate('el', 'staff.dashboard.overdueSee', { count: 1 }), 'Δείτε ποιο');
    assert.equal(translate('el', 'staff.dashboard.overdueSee', { count: 4 }), 'Δείτε ποια');
    assert.equal(translate('en', 'staff.dashboard.overdueSee', { count: 1 }), 'See which one');
    assert.equal(translate('en', 'staff.dashboard.overdueSee', { count: 4 }), 'See which ones');
  });

  it('agrees on strings that count without saying "count"', () => {
    // These were missed by the first sweep, which searched for {count}: they
    // count things under other names — {total}, {days}, {n} — and read just
    // as wrongly at one.
    assert.equal(
      translate('el', 'book.availableCount', { available: 1, total: 1, count: 1 }),
      '1 από 1 διαθέσιμο',
    );
    assert.equal(
      translate('el', 'book.availableCount', { available: 1, total: 3, count: 3 }),
      '1 από 3 διαθέσιμα',
    );
    assert.equal(
      translate('el', 'staff.loans.dueDateHint', { days: 1, count: 1 }),
      'Προεπιλογή: 1 ημέρα.',
    );
    assert.equal(
      translate('el', 'staff.loans.dueDateHint', { days: 14, count: 14 }),
      'Προεπιλογή: 14 ημέρες.',
    );
    assert.equal(translate('el', 'suggest.count', { n: 1, count: 1 }), '1 αντιστοιχία');
    assert.equal(translate('el', 'suggest.count', { n: 5, count: 5 }), '5 αντιστοιχίες');
  });

  it('builds the front-page summary from two counted parts', () => {
    // One sentence, two independent numbers — a single singular/plural pair
    // cannot express it, so it is composed from the two keys that can.
    const one = translate('el', 'home.stats.summary', {
      titles: translate('el', 'home.stats.titles', { count: 1 }),
      available: translate('el', 'home.stats.available', { count: 1 }),
    });
    assert.ok(one.includes('1 τίτλος'), one);
    assert.ok(one.includes('1 διαθέσιμο αντίτυπο'), one);
  });

  it('says a book should have come back, not that it did', () => {
    // "έπρεπε να έχει γυρίσει" states that it was due; "θα έπρεπε" is what a
    // librarian actually says about a book still out.
    for (const count of [1, 5]) {
      assert.match(
        translate('el', 'staff.dashboard.overdueCount', { count }),
        /θα έπρεπε/,
        `count ${count}`,
      );
    }
  });

  it('reports a plural key as existing', () => {
    assert.equal(hasTranslation('staff.dashboard.overdueCount'), true);
  });
});
