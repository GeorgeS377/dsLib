// The library's own icon: in the browser tab, and as the mark in the bar.
//
// A school that deploys this gets a teal book until somebody uploads
// something. The upload goes through the same pipeline as a book cover —
// sniffed, re-encoded, stored under a UUID — because an icon is an uploaded
// image and every reason that pipeline exists applies here too.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { buildApp } from '../src/app.js';
import { SETTING_KEYS, invalidateSettings, saveSetting } from '../src/lib/settings.js';
import {
  BRAND_ICON_SIZES,
  isSafeIconName,
  removeBrandIcon,
  storeBrandIcon,
} from '../src/lib/upload.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { login, makeStaffUser } from './staff-helpers.js';

let app;
let db;
let dir;
let config;
let uploadDir;
let session;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  config = setup.config;
  uploadDir = config.uploadDir;
  db = makeTestDb();
  seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config, logger: false, db });
  await app.ready();
  session = await login(app);
});

after(async () => {
  await app.close();
  db.close();
  cleanupDir(dir);
});

/** A solid-colour JPEG of the given size. */
const jpeg = (width, height) =>
  new Jimp({ width, height, color: 0x3366ccff }).getBuffer('image/jpeg', { quality: 80 });

/** A solid-colour PNG of the given size. */
const png = (width, height) =>
  new Jimp({ width, height, color: 0xcc3366ff }).getBuffer('image/png');

const iconsDir = () => path.join(uploadDir, 'icons');

const fileFor = (iconName, size) =>
  path.join(iconsDir(), iconName.replace(/\.png$/, `-${size}.png`));

function clearIcon() {
  db.exec('DELETE FROM setting');
  invalidateSettings(db);
}

describe('storeBrandIcon', () => {
  it('writes one square PNG per advertised size', async () => {
    const result = await storeBrandIcon(await png(600, 600), { uploadDir, maxBytes: 2_000_000 });
    assert.ok(result.ok, result.reason);
    assert.match(result.iconName, /^[0-9a-f-]{36}\.png$/);

    for (const size of BRAND_ICON_SIZES) {
      const image = await Jimp.read(fileFor(result.iconName, size));
      assert.equal(image.width, size, `width at ${size}`);
      assert.equal(image.height, size, `height at ${size}`);
    }
  });

  it('never upscales past what was uploaded', async () => {
    // A 64px logo stretched to 512 looks worse than a 64px one. The file is
    // still written at every size so the markup can link all three.
    const result = await storeBrandIcon(await png(64, 64), { uploadDir, maxBytes: 2_000_000 });
    assert.ok(result.ok, result.reason);
    const large = await Jimp.read(fileFor(result.iconName, 512));
    assert.equal(large.width, 64);
    const small = await Jimp.read(fileFor(result.iconName, 32));
    assert.equal(small.width, 32);
  });

  it('crops a wide image to a square from the centre', async () => {
    // No rectangle means no JavaScript was involved, which must still give a
    // square rather than a squashed one.
    const result = await storeBrandIcon(await jpeg(400, 200), { uploadDir, maxBytes: 2_000_000 });
    assert.ok(result.ok, result.reason);
    const image = await Jimp.read(fileFor(result.iconName, 180));
    assert.equal(image.width, image.height);
  });

  it('crops a tall image to a square from the centre', async () => {
    const result = await storeBrandIcon(await jpeg(200, 500), { uploadDir, maxBytes: 2_000_000 });
    assert.ok(result.ok, result.reason);
    const image = await Jimp.read(fileFor(result.iconName, 180));
    assert.equal(image.width, image.height);
  });

  it('honours an explicit crop rectangle', async () => {
    // A 600x600 source cropped to its top-left 100x100: the output is still
    // square, and small enough that the 512 variant is not upscaled past it.
    const result = await storeBrandIcon(await png(600, 600), {
      uploadDir,
      maxBytes: 2_000_000,
      crop: { x: 0, y: 0, width: 100, height: 100 },
    });
    assert.ok(result.ok, result.reason);
    const image = await Jimp.read(fileFor(result.iconName, 32));
    assert.equal(image.width, 32);
  });

  it('refuses an SVG', async () => {
    // A document format that can carry script, served from our own origin.
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>',
    );
    assert.deepEqual(await storeBrandIcon(svg, { uploadDir, maxBytes: 2_000_000 }), {
      ok: false,
      reason: 'unsupported_type',
    });
  });

  it('refuses a buffer over maxBytes', async () => {
    const result = await storeBrandIcon(await png(400, 400), { uploadDir, maxBytes: 10 });
    assert.deepEqual(result, { ok: false, reason: 'too_large' });
  });

  it('refuses an empty buffer', async () => {
    assert.deepEqual(await storeBrandIcon(Buffer.alloc(0), { uploadDir, maxBytes: 2_000_000 }), {
      ok: false,
      reason: 'empty',
    });
  });

  it('refuses a well-formed header with a corrupt body', async () => {
    const corrupt = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64, 0x7f),
    ]);
    const result = await storeBrandIcon(corrupt, { uploadDir, maxBytes: 2_000_000 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unreadable');
  });

  it('re-encodes, so no uploaded metadata survives', async () => {
    const result = await storeBrandIcon(await jpeg(300, 300), { uploadDir, maxBytes: 2_000_000 });
    assert.ok(result.ok, result.reason);
    // Stored as PNG whatever came in: the bytes served are ours.
    const bytes = fs.readFileSync(fileFor(result.iconName, 32));
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('leaves nothing behind when it refuses', async () => {
    const before = fs.existsSync(iconsDir()) ? fs.readdirSync(iconsDir()).length : 0;
    await storeBrandIcon(Buffer.from('not an image at all, really'), {
      uploadDir,
      maxBytes: 2_000_000,
    });
    const after = fs.existsSync(iconsDir()) ? fs.readdirSync(iconsDir()).length : 0;
    assert.equal(after, before);
  });
});

describe('removeBrandIcon', () => {
  it('deletes every size', async () => {
    const result = await storeBrandIcon(await png(300, 300), { uploadDir, maxBytes: 2_000_000 });
    assert.ok(result.ok, result.reason);
    await removeBrandIcon(uploadDir, result.iconName);
    for (const size of BRAND_ICON_SIZES) {
      assert.equal(fs.existsSync(fileFor(result.iconName, size)), false, `size ${size}`);
    }
  });

  it('is quiet about files that are already gone', async () => {
    await removeBrandIcon(uploadDir, '00000000-0000-4000-8000-000000000000.png');
  });

  it('refuses to act on a name that is not one of ours', async () => {
    await removeBrandIcon(uploadDir, '../../etc/passwd');
  });
});

describe('isSafeIconName', () => {
  it('accepts the UUID png shape this module writes', () => {
    assert.equal(isSafeIconName('0e2a4b6c-1111-4222-8333-444455556666.png'), true);
  });

  it('refuses traversal, separators and other extensions', () => {
    for (const bad of [
      '../../etc/passwd',
      '/etc/passwd',
      'icons/x.png',
      '0e2a4b6c-1111-4222-8333-444455556666.jpg',
      '0e2a4b6c-1111-4222-8333-444455556666-32.png',
      'x.png',
      '',
      null,
      undefined,
    ]) {
      assert.equal(isSafeIconName(bad), false, String(bad));
    }
  });
});

describe('serving the icon', () => {
  const get = (url, cookie = 'ui=next') =>
    app.inject({ method: 'GET', url, headers: { cookie } });

  it('serves an uploaded icon under /brand/', async () => {
    clearIcon();
    const stored = await storeBrandIcon(await png(300, 300), { uploadDir, maxBytes: 2_000_000 });
    assert.ok(stored.ok, stored.reason);
    saveSetting(db, SETTING_KEYS.libraryIcon, stored.iconName);

    const file = await get(`/brand/${stored.iconName.replace(/\.png$/, '-32.png')}`);
    assert.equal(file.statusCode, 200);
    assert.match(file.headers['content-type'], /image\/png/);
  });

  it('links the uploaded icon from every layout', async () => {
    // The shape of test that caught staff-plain.ejs shipping without a
    // script tag: walk every layout rather than the one being worked on.
    clearIcon();
    const stored = await storeBrandIcon(await png(300, 300), { uploadDir, maxBytes: 2_000_000 });
    saveSetting(db, SETTING_KEYS.libraryIcon, stored.iconName);
    const base = stored.iconName.replace(/\.png$/, '');

    const layouts = [
      ['public', '/', 'ui=next'],
      ['public (classic)', '/', 'ui=classic'],
      ['staff-plain', '/staff/login', 'ui=next'],
      ['staff-plain (classic)', '/staff/login', 'ui=classic'],
      ['staff', '/staff', `${session.cookie}; ui=next`],
      ['staff (classic)', '/staff', `${session.cookie}; ui=classic`],
    ];

    for (const [name, url, cookie] of layouts) {
      const page = await get(url, cookie);
      assert.equal(page.statusCode, 200, `${name} did not render`);
      assert.match(page.body, new RegExp(`rel="icon"[^>]*/brand/${base}-32\\.png`), name);
      assert.ok(!page.body.includes('/assets/icon.svg'), `${name} still links the shipped icon`);
    }
  });

  it('answers /favicon.ico with the 32 px file', async () => {
    // Browsers ask for this whether or not the markup mentions it.
    clearIcon();
    const stored = await storeBrandIcon(await png(300, 300), { uploadDir, maxBytes: 2_000_000 });
    saveSetting(db, SETTING_KEYS.libraryIcon, stored.iconName);

    const file = await get('/favicon.ico');
    assert.equal(file.statusCode, 200);
    assert.match(file.headers['content-type'], /image\/png/);
  });

  it('falls back to the shipped SVG when no icon is set', async () => {
    clearIcon();
    const page = await get('/');
    assert.match(page.body, /rel="icon"[^>]*\/assets\/icon\.svg/);

    const file = await get('/favicon.ico');
    assert.equal(file.statusCode, 200);
    assert.match(file.headers['content-type'], /image\/svg\+xml/);
  });

  it('falls back when the row points at a file that is not there', async () => {
    // Review Focus 5: a database restored without its uploads. Every page
    // must still render and /favicon.ico must not fail.
    clearIcon();
    saveSetting(db, SETTING_KEYS.libraryIcon, 'deadbeef-0000-4000-8000-000000000000.png');

    const page = await get('/');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /rel="icon"[^>]*\/assets\/icon\.svg/);

    const file = await get('/favicon.ico');
    assert.equal(file.statusCode, 200);
    assert.match(file.headers['content-type'], /image\/svg\+xml/);
  });

  it('ignores a row whose value is not a name this module writes', async () => {
    clearIcon();
    saveSetting(db, SETTING_KEYS.libraryIcon, '../../etc/passwd');

    const page = await get('/');
    assert.equal(page.statusCode, 200);
    assert.match(page.body, /rel="icon"[^>]*\/assets\/icon\.svg/);
    assert.ok(!page.body.includes('etc/passwd'));
  });

  it('shows the icon as the mark in the bar, not only in the tab', async () => {
    clearIcon();
    const stored = await storeBrandIcon(await png(300, 300), { uploadDir, maxBytes: 2_000_000 });
    saveSetting(db, SETTING_KEYS.libraryIcon, stored.iconName);
    const base = stored.iconName.replace(/\.png$/, '');

    const page = await get('/');
    assert.match(page.body, new RegExp(`<img[^>]*/brand/${base}-32\\.png`));
  });

  it('keeps the shipped book mark when no icon is set', async () => {
    clearIcon();
    const page = await get('/');
    assert.match(page.body, /class="bar__mark"/);
    assert.ok(!page.body.includes('/brand/'));
  });

  it('serves no directory listing from /brand/', async () => {
    const listing = await get('/brand/');
    assert.notEqual(listing.statusCode, 200);
  });
});
