// Translation integrity. The key-parity test is the one that matters: it is
// what stops a screen from shipping with English labels missing (or vice
// versa) once more phases add text.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SUPPORTED_LANGS,
  dictionaries,
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

  it('has no empty translations', () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        assert.ok(
          typeof value === 'string' && value.trim().length > 0,
          `${lang}.${key} is empty`,
        );
      }
    }
  });

  it('uses the same placeholders in every language', () => {
    const placeholders = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    const [reference, ...others] = SUPPORTED_LANGS;

    for (const key of Object.keys(dictionaries[reference])) {
      const expected = placeholders(dictionaries[reference][key]);
      for (const lang of others) {
        assert.deepEqual(
          placeholders(dictionaries[lang][key] ?? ''),
          expected,
          `placeholder mismatch for ${key} in ${lang}`,
        );
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
