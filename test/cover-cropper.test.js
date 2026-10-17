// What the server and the policy guarantee about the cropper.
//
// The dragging itself belongs in a browser, not here. What these tests can
// hold onto is the contract between the template and the script, and the two
// ways this feature could look fine in every test and still be dead on the
// page: markup the script cannot find, and an image URL the policy drops.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { buildApp } from '../src/app.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { login, makeStaffUser } from './staff-helpers.js';

let app; let db; let dir; let session; let fixtures;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  db = makeTestDb();
  fixtures = seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);
});

after(async () => { await app.close(); db.close(); cleanupDir(dir); });

const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

const script = () => fs.readFileSync(path.join(process.cwd(), 'src/public/js/app.js'), 'utf8');

describe('the cropper markup', () => {
  for (const [name, url] of [['a new title', '/staff/books/new'], ['an existing title', null]]) {
    it(`is on the form for ${name}`, async () => {
      const page = await get(url ?? `/staff/books/${fixtures.books.odyssey}`);
      assert.equal(page.statusCode, 200);
      for (const hook of [
        'data-cropper', 'data-cropper-file', 'data-cropper-canvas', 'data-cropper-zoom',
        'name="crop_x"', 'name="crop_y"', 'name="crop_w"', 'name="crop_h"',
      ]) {
        assert.ok(page.body.includes(hook), `${hook} is missing`);
      }
    });
  }

  it('sits in a form that can carry a file', async () => {
    const page = await get('/staff/books/new');
    const form = page.body.match(/<form[^>]*action="\/staff\/books"[^>]*>/)?.[0] ?? '';
    assert.match(form, /enctype="multipart\/form-data"/, 'the create form cannot carry a file');
  });

  it('uses no inline styles, which the policy drops', async () => {
    const page = await get('/staff/books/new');
    assert.ok(!/<[^>]+\sstyle="/.test(page.body), 'an inline style attribute would be ignored');
  });
});

describe('the cropper script', () => {
  it('is loaded by the page that needs it', async () => {
    const page = await get('/staff/books/new');
    assert.ok(page.body.includes('/assets/js/app.js'), 'the script is not loaded');
  });

  it('reads the chosen file as a data URL, which the policy permits', () => {
    // img-src is "'self' data:" with no blob:, so createObjectURL would be
    // blocked in the browser while every server-side test still passed.
    // Matched as a call, not as a word: a comment explaining why the object
    // URL is avoided should not read as using one.
    assert.ok(script().includes('readAsDataURL('), 'the preview is not read as a data URL');
    assert.ok(!script().includes('createObjectURL('), 'a blob: URL would be refused by the policy');
  });

  it('is wired up on load', () => {
    assert.match(script(), /enableCoverCropper\(\);/, 'the cropper is never started');
  });
});

describe('the policy the cropper has to live under', () => {
  it('still forbids blob: images', async () => {
    const page = await get('/staff/books/new');
    const policy = page.headers['content-security-policy'];
    assert.ok(policy.includes("img-src 'self' data:"), `img-src changed: ${policy}`);
    assert.ok(!policy.includes('blob:'), 'the policy was relaxed to admit blob:');
  });
});
