# Cover Cropping, Author Suggestions and Breadcrumb Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a librarian choose, frame and save a book cover in the same action that creates the title, suggest author names already in the catalogue, and drop two breadcrumbs that duplicate the top bar.

**Architecture:** The browser uploads the original file and four crop coordinates in source pixels; the server crops to that rectangle before its existing resize-and-re-encode step, so image bytes are still decoded in exactly one place and scripting-off uploads keep working unchanged. The book form becomes multipart and carries the cover field on both the new and edit pages, with one shared helper behind all three cover entry points.

**Tech Stack:** Node 24 ESM, Fastify 5, `@fastify/multipart` (`attachFieldsToBody: 'keyValues'`), EJS, Jimp 1.6, `node:test`, plain CSS and vanilla DOM JS — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-17-cover-cropper-design.md`

## Global Constraints

- No new dependencies, and no native modules. Pure-JS tree.
- CSP sends `style-src 'self'` with no `'unsafe-inline'` and `img-src 'self' data:` with no `blob:`. No `style=` attributes in templates; the cropper loads previews via `FileReader.readAsDataURL`, never `URL.createObjectURL`.
- Every form works with scripting off. The cropper is an enhancement; without it the whole image uploads as it does today.
- Image bytes are decoded and re-encoded only in `src/lib/upload.js`. No canvas export is ever uploaded.
- Every new user-facing string gets both an `el` and an `en` entry in `src/lib/i18n.js`. Greek is primary and is written as a Greek librarian would say it, not translated from the English. Normal case, never all-caps (capitals strip accents).
- Changes are confined to the second interface (`src/views/next/**`) plus shared server code. The classic interface keeps working and gains nothing.
- Run `npm test` before each commit. The suite is 530 tests at the start of this plan.

## Review Focus

Input classes the spec implies that no task's happy path exercises. Each has a test assigned to the task that owns the code.

1. **Crop coordinates that hang off the edge of the image** — a librarian zooms out past the border; the rectangle must be clamped to the image, not rejected and not passed to Jimp out of bounds (Task 1).
2. **Crop coordinates present but no file** — a stale hidden field on a resubmitted form must not make the server try to crop nothing (Task 2).
3. **A title that saves while its cover fails** — a corrupt JPEG must not discard the metadata the librarian just typed (Task 2).
4. **A cover field left empty on the edit form** — saving a title without touching the cover must keep the existing cover, not clear it (Task 2).
5. **An author name containing a comma** ("Παπαδόπουλος, Γιώργος") — the datalist must not split it, since one input is one person (Task 4).

---

### Task 1: Crop the image from coordinates

**Files:**
- Modify: `src/lib/upload.js`
- Test: `test/upload.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `parseCropFields(body: object): { x: number, y: number, width: number, height: number } | null` — reads `crop_x`, `crop_y`, `crop_w`, `crop_h`; returns `null` unless all four parse as finite non-negative numbers with `width > 0` and `height > 0`; values are floored to integers.
  - `storeCoverImage(buffer, { uploadDir, maxBytes, crop })` — `crop` is optional and takes the shape above. Return shape is unchanged: `{ ok: true, coverPath, thumbPath } | { ok: false, reason }`.

- [ ] **Step 1: Write the failing tests**

```js
// test/upload.test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { parseCropFields, storeCoverImage } from '../src/lib/upload.js';

let uploadDir;
before(() => { uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dslib-upload-')); });
after(() => { fs.rmSync(uploadDir, { recursive: true, force: true }); });

const jpeg = async ({ width = 800, height = 1200 } = {}) =>
  new Jimp({ width, height, color: 0x3366ccff }).getBuffer('image/jpeg', { quality: 80 });

const store = (buffer, crop) =>
  storeCoverImage(buffer, { uploadDir, maxBytes: 5_000_000, crop });

const stored = async (result) =>
  Jimp.read(path.join(uploadDir, 'covers', result.coverPath));

describe('parseCropFields', () => {
  it('reads four coordinates', () => {
    assert.deepEqual(
      parseCropFields({ crop_x: '10', crop_y: '20', crop_w: '30', crop_h: '45' }),
      { x: 10, y: 20, width: 30, height: 45 },
    );
  });

  it('floors fractional coordinates', () => {
    assert.deepEqual(
      parseCropFields({ crop_x: '10.9', crop_y: '0.4', crop_w: '30.7', crop_h: '45.2' }),
      { x: 10, y: 0, width: 30, height: 45 },
    );
  });

  it('returns null when any coordinate is missing, negative, zero-sized or not a number', () => {
    for (const body of [
      {},
      { crop_x: '0', crop_y: '0', crop_w: '10' },
      { crop_x: '-5', crop_y: '0', crop_w: '10', crop_h: '10' },
      { crop_x: '0', crop_y: '0', crop_w: '0', crop_h: '10' },
      { crop_x: 'abc', crop_y: '0', crop_w: '10', crop_h: '10' },
      { crop_x: '0', crop_y: '0', crop_w: '10', crop_h: 'Infinity' },
    ]) {
      assert.equal(parseCropFields(body), null, JSON.stringify(body));
    }
  });
});

describe('storeCoverImage with a crop', () => {
  it('stores only the cropped rectangle, keeping its proportions', async () => {
    // 400x600 out of 800x1200 is 2:3, and below DISPLAY_MAX_WIDTH, so the
    // stored image is the crop at its own size rather than a resize of it.
    const result = await store(await jpeg(), { x: 100, y: 200, width: 400, height: 600 });
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 400);
    assert.equal(image.height, 600);
  });

  it('clamps a rectangle that hangs over the edge', async () => {
    const result = await store(await jpeg({ width: 400, height: 600 }), {
      x: 300, y: 500, width: 400, height: 400,
    });
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 100);
    assert.equal(image.height, 100);
  });

  it('ignores a rectangle that lies entirely outside the image', async () => {
    const result = await store(await jpeg({ width: 400, height: 600 }), {
      x: 5000, y: 5000, width: 100, height: 100,
    });
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 400, 'the whole image should have been kept');
  });

  it('stores the whole image when no crop is given', async () => {
    const result = await store(await jpeg({ width: 400, height: 600 }));
    assert.equal(result.ok, true);
    const image = await stored(result);
    assert.equal(image.width, 400);
  });

  it('still refuses a non-image even when a crop is given', async () => {
    const result = await store(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
      x: 0, y: 0, width: 10, height: 10,
    });
    assert.deepEqual(result, { ok: false, reason: 'unsupported_type' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/upload.test.js`
Expected: FAIL — `parseCropFields` is not exported.

- [ ] **Step 3: Implement `parseCropFields` and crop support in `src/lib/upload.js`**

Export `parseCropFields(body)` per the Interfaces block.

In `storeCoverImage`, after the `MAX_PIXELS` check and before the covers
directory is created, apply the crop when one is given: intersect the rectangle
with `0,0,image.width,image.height`, and call `image.crop({ x, y, w, h })` only
if the intersection is at least 1×1. An empty intersection leaves the image
untouched. Jimp 1.6 takes `{ x, y, w, h }` — note `w`/`h`, not `width`/`height`.

Comment why a bad rectangle is ignored rather than refused: the coordinates come
from a hidden field, and a stale one should not stand between a librarian and a
cover.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/upload.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all pass — `storeCoverImage`'s existing callers pass no `crop` and must be unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/lib/upload.js test/upload.test.js
git commit -m "Covers can be stored cropped to a rectangle"
```

---

### Task 2: Save a cover when saving a title

**Files:**
- Modify: `src/app.js` (multipart `limits.fields`: 20 → 60)
- Modify: `src/routes/staff/books.js`
- Modify: `src/views/next/staff/book-form.ejs` (cover field into the main form; fix the remove action)
- Test: `test/book-cover.test.js` (create)

**Interfaces:**
- Consumes: `parseCropFields`, `storeCoverImage({ crop })` from Task 1.
- Produces: `saveCover(request, book): Promise<{ ok: true } | { ok: false, reason: string }>` — a module-level helper in `src/routes/staff/books.js` closing over `app` and `db`. Reads `request.body.cover` and the crop fields, stores the image, calls `setBookCover`, deletes the previous files, and writes the audit entry. Returns `{ ok: false, reason: 'empty' }` when no file was supplied.

- [ ] **Step 1: Write the failing tests**

```js
// test/book-cover.test.js — a cover saved alongside the title that owns it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { Jimp } from 'jimp';
import { buildApp } from '../src/app.js';
import { getBookById, listBooks } from '../src/db/queries/books.js';
import { cleanupDir, makeTestDb, seedTestCatalogue, testConfig } from './helpers.js';
import { csrfFrom, login, makeStaffUser } from './staff-helpers.js';

let app; let db; let dir; let session; let uploadDir;

before(async () => {
  const setup = testConfig();
  dir = setup.dir;
  uploadDir = setup.config.uploadDir;
  db = makeTestDb();
  seedTestCatalogue(db);
  await makeStaffUser(db);
  app = await buildApp({ config: setup.config, logger: false, db });
  await app.ready();
  session = await login(app);
});

after(async () => { await app.close(); db.close(); cleanupDir(dir); });

const get = (url) =>
  app.inject({ method: 'GET', url, headers: { cookie: `${session.cookie}; ui=next` } });

const jpeg = async ({ width = 800, height = 1200 } = {}) =>
  new Jimp({ width, height, color: 0x3366ccff }).getBuffer('image/jpeg', { quality: 80 });

/** POST a multipart form of text fields plus an optional file. */
async function postMultipart(url, { fields = {}, file, tokenFrom }) {
  const token = csrfFrom((await get(tokenFrom)).body);
  const boundary = '----dslibcover';
  const parts = [];
  const text = (name, value) => parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  ));
  text('_csrf', token);
  for (const [name, value] of Object.entries(fields)) {
    for (const one of [].concat(value)) text(name, one);
  }
  if (file) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="cover"; filename="${file.filename}"\r\n`
      + `Content-Type: ${file.contentType}\r\n\r\n`,
    ));
    parts.push(file.buffer, Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return app.inject({
    method: 'POST',
    url,
    headers: {
      cookie: `${session.cookie}; ui=next`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    payload: Buffer.concat(parts),
  });
}

const bookNamed = (q) => listBooks(db, { q }).rows[0];

describe('a cover saved with a new title', () => {
  it('creates the title and its cover in one post', async () => {
    const response = await postMultipart('/staff/books', {
      fields: { title: 'Με Εξώφυλλο Εξαρχής', authors: ['Όμηρος', ''] },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookNamed('εξαρχης').id);
    assert.ok(book.cover_path, 'the title was created without its cover');
    assert.ok(fs.existsSync(path.join(uploadDir, 'covers', book.cover_path)));
  });

  it('applies the crop coordinates sent with it', async () => {
    const response = await postMultipart('/staff/books', {
      fields: {
        title: 'Κομμένο Εξώφυλλο',
        crop_x: '100', crop_y: '200', crop_w: '400', crop_h: '600',
      },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);

    const book = getBookById(db, bookNamed('κομμενο').id);
    const image = await Jimp.read(path.join(uploadDir, 'covers', book.cover_path));
    assert.equal(image.width, 400);
    assert.equal(image.height, 600);
  });

  it('creates the title with no cover when no file is chosen', async () => {
    const response = await postMultipart('/staff/books', {
      fields: { title: 'Χωρίς Εξώφυλλο' },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookNamed('χωρις εξωφυλλο').id).cover_path, null);
  });

  it('keeps the title when the cover is unreadable', async () => {
    // Losing typed metadata to a bad file is the one outcome worth avoiding.
    const response = await postMultipart('/staff/books', {
      fields: { title: 'Χαλασμένο Αρχείο' },
      file: {
        filename: 'c.jpg',
        contentType: 'image/jpeg',
        buffer: Buffer.from('not an image at all'),
      },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);
    const book = bookNamed('χαλασμενο');
    assert.ok(book, 'the title was lost with the cover');
    assert.equal(getBookById(db, book.id).cover_path, null);
  });

  it('ignores crop coordinates that arrive with no file', async () => {
    const response = await postMultipart('/staff/books', {
      fields: {
        title: 'Μόνο Συντεταγμένες',
        crop_x: '10', crop_y: '10', crop_w: '50', crop_h: '75',
      },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookNamed('μονο συντεταγμενες').id).cover_path, null);
  });
});

describe('a cover saved with an edit', () => {
  let bookId;

  before(async () => {
    await postMultipart('/staff/books', {
      fields: { title: 'Προς Επεξεργασία' },
      file: { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
      tokenFrom: '/staff/books/new',
    });
    bookId = bookNamed('επεξεργασια').id;
  });

  it('replaces the cover and deletes the file it replaced', async () => {
    const before = getBookById(db, bookId).cover_path;
    const response = await postMultipart(`/staff/books/${bookId}`, {
      fields: { title: 'Προς Επεξεργασία' },
      file: { filename: 'n.jpg', contentType: 'image/jpeg', buffer: await jpeg({ width: 600, height: 900 }) },
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);

    const after = getBookById(db, bookId).cover_path;
    assert.notEqual(after, before, 'the cover was not replaced');
    assert.ok(!fs.existsSync(path.join(uploadDir, 'covers', before)), 'the old file was left behind');
  });

  it('keeps the existing cover when the field is left empty', async () => {
    const before = getBookById(db, bookId).cover_path;
    const response = await postMultipart(`/staff/books/${bookId}`, {
      fields: { title: 'Προς Επεξεργασία Ξανά' },
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookId).cover_path, before, 'saving the title cleared the cover');
  });
});

describe('removing a cover from the second interface', () => {
  it('posts to a route that exists', async () => {
    const page = await get(`/staff/books/${bookNamed('επεξεργασια').id}`);
    const actions = [...page.body.matchAll(/action="([^"]*cover[^"]*)"/g)].map((m) => m[1]);
    assert.ok(
      actions.every((a) => !a.endsWith('/cover/remove')),
      `the second interface still posts to /cover/remove: ${actions}`,
    );
  });

  it('actually removes it', async () => {
    const bookId = bookNamed('επεξεργασια').id;
    const response = await postMultipart(`/staff/books/${bookId}/cover/delete`, {
      tokenFrom: `/staff/books/${bookId}`,
    });
    assert.equal(response.statusCode, 302);
    assert.equal(getBookById(db, bookId).cover_path, null);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/book-cover.test.js`
Expected: FAIL — the create route ignores the file, and the remove action still reads `/cover/remove`.

- [ ] **Step 3: Raise the multipart field limit in `src/app.js`**

Change `fields: 20` to `fields: 60` in the `fastifyMultipart` registration. Extend
the comment above it: the book form's category checkboxes and author rows can
exceed twenty fields, and each field is still capped by `fieldSize`, only one
file is still accepted.

- [ ] **Step 4: Implement `saveCover` and wire it into the three routes in `src/routes/staff/books.js`**

Add `saveCover(request, book)` per the Interfaces block. Then:

- `POST /staff/books` — after `createBook` and its audit entry, call `saveCover`
  when `request.body.cover` is a non-empty Buffer. On failure, add an error
  flash of `staff.cover.error.<reason>` and still redirect; the title stays.
- `POST /staff/books/:id` — same, after `updateBook`. An absent or empty file
  field leaves the cover alone.
- `POST /staff/books/:id/cover` — replace its body with a `saveCover` call,
  keeping its existing flash-and-redirect behaviour so the classic interface is
  unchanged.

- [ ] **Step 5: Move the cover field into the main form in `src/views/next/staff/book-form.ejs`**

Add `enctype="multipart/form-data"` to the main form. Move the cover `<input
type="file">` and its label and hint inside it, rendering for a new title as
well as an existing one, and showing the current cover as a thumbnail when there
is one. Delete the separate upload form. Keep the remove form separate and point
it at `/staff/books/<%= book.id %>/cover/delete`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/book-cover.test.js`
Expected: PASS

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: all pass, including `test/staff-catalogue.test.js`'s existing cover tests against the classic interface.

- [ ] **Step 8: Commit**

```bash
git add src/app.js src/routes/staff/books.js src/views/next/staff/book-form.ejs test/book-cover.test.js
git commit -m "A title and its cover are saved together"
```

---

### Task 3: The cropper

**Files:**
- Modify: `src/public/js/app.js`
- Modify: `src/views/next/staff/book-form.ejs`
- Modify: `src/public/css/next.css`
- Modify: `src/lib/i18n.js`
- Test: `test/cover-cropper.test.js` (create)

**Interfaces:**
- Consumes: the four hidden crop inputs read by Task 2.
- Produces: the markup contract below, and `enableCoverCropper()` called from the `DOMContentLoaded` handler in `app.js`.

```html
<div class="cropper" data-cropper>
  <input type="file" name="cover" accept="image/jpeg,image/png,image/webp" data-cropper-file>
  <div class="cropper__stage" data-cropper-stage hidden>
    <canvas class="cropper__canvas" data-cropper-canvas></canvas>
    <label class="field__label" for="cover-zoom">…</label>
    <input type="range" id="cover-zoom" min="1" max="4" step="0.01" value="1" data-cropper-zoom>
  </div>
  <input type="hidden" name="crop_x" data-cropper-x>
  <input type="hidden" name="crop_y" data-cropper-y>
  <input type="hidden" name="crop_w" data-cropper-w>
  <input type="hidden" name="crop_h" data-cropper-h>
</div>
```

- [ ] **Step 1: Write the failing tests**

```js
// test/cover-cropper.test.js — what the server and the policy guarantee about
// the cropper. The dragging itself is checked in a browser, not here.
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
    assert.ok(script().includes('readAsDataURL'), 'the preview is not read as a data URL');
    assert.ok(!script().includes('createObjectURL'), 'a blob: URL would be refused by the policy');
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/cover-cropper.test.js`
Expected: FAIL — no cropper markup and no `enableCoverCropper`.

- [ ] **Step 3: Add the Greek and English strings to `src/lib/i18n.js`**

Add to both dictionaries, keeping the existing voice:
`staff.cover.frame` (the heading over the stage), `staff.cover.zoom` (the slider
label), `staff.cover.dragHint` (one line telling the librarian they can drag the
image to position it).

- [ ] **Step 4: Render the cropper markup in `src/views/next/staff/book-form.ejs`**

Replace the bare file input from Task 2 with the markup contract above. The
stage carries `hidden` so it is absent until a file is chosen and so the
scripting-off page shows only the file input.

- [ ] **Step 5: Implement `enableCoverCropper()` in `src/public/js/app.js`**

Call it from the `DOMContentLoaded` handler alongside the other enhancers.

Behaviour, given the markup contract:
- Frame is 2:3 portrait. Size the canvas backing store by `devicePixelRatio` and
  scale the context, so the preview is not soft on a high-density screen.
- On `change` of the file input, read the file with `FileReader.readAsDataURL`
  and load it into an `Image`. On load, un-hide the stage, reset zoom to 1 and
  centre the image, then draw.
- `base = Math.max(frameW / img.width, frameH / img.height)`; `k = base * zoom`.
  The image is drawn at `img.width * k` by `img.height * k` at offset
  `(ox, oy)`, with `ox` clamped to `[frameW - img.width * k, 0]` and `oy`
  likewise — so the frame is never left showing blank.
- Pointer drag over the canvas moves `(ox, oy)`; the zoom input changes `zoom`
  about the frame's centre. Both redraw and then write the crop rectangle in
  source pixels to the four hidden inputs:
  `x = -ox / k`, `y = -oy / k`, `w = frameW / k`, `h = frameH / k`.
- Arrow keys nudge the image when the canvas has focus, so framing does not
  require a pointer. Give the canvas `tabindex="0"` from the script, not the
  template, so it is only focusable when the cropper is live.
- Clearing the file input clears the four hidden inputs and re-hides the stage.

- [ ] **Step 6: Style the cropper in `src/public/css/next.css`**

`.cropper__stage`, `.cropper__canvas` (2:3 box, `cursor: grab`, a visible focus
ring, `touch-action: none` so dragging does not scroll the page on a tablet),
and the zoom row. Classes only — the policy drops `style=`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/cover-cropper.test.js`
Expected: PASS

- [ ] **Step 8: Check it in a browser**

Start the review server, sign in, open `/staff/books/new`, choose an image,
drag and zoom it, and save. Confirm the stored cover matches what the frame
showed, and that the console reports no CSP violation.

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add src/public/js/app.js src/public/css/next.css src/views/next/staff/book-form.ejs src/lib/i18n.js test/cover-cropper.test.js
git commit -m "A cover can be framed before it is saved"
```

---

### Task 4: Suggest author names already in the catalogue

**Files:**
- Modify: `src/db/queries/authors.js`
- Modify: `src/routes/staff/books.js`
- Modify: `src/views/next/staff/book-form.ejs`
- Test: `test/next-staff-flow.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `listAuthorOptions(db, limit = 1000): Array<{ id: number, name: string }>` in `src/db/queries/authors.js`, ordered by `name_norm`; and an `authorOptions` template local on every render of `staff/book-form`.

- [ ] **Step 1: Write the failing tests**

```js
// Add to test/next-staff-flow.test.js
describe('suggesting authors already in the catalogue', () => {
  it('offers them on a new title', async () => {
    const page = await get('/staff/books/new');
    assert.ok(page.body.includes('id="author-options"'), 'no author datalist');
    assert.ok(page.body.includes('Όμηρος'), 'a known author is not suggested');
  });

  it('points every author field at the list', async () => {
    const page = await get('/staff/books/new');
    const inputs = page.body.match(/<input[^>]*name="authors"[^>]*>/g) ?? [];
    assert.ok(inputs.length > 0, 'no author fields');
    for (const input of inputs) {
      assert.match(input, /list="author-options"/, `an author field has no suggestions: ${input}`);
    }
  });

  it('keeps a comma inside one name', async () => {
    // One input is one person, so "Surname, Forename" must stay a single
    // option rather than being split into two.
    createBook(db, { title: 'Με Κόμμα', authorNames: ['Παπαδόπουλος, Γιώργος'] });
    const page = await get('/staff/books/new');
    const options = [...page.body.matchAll(/<option value="([^"]*)"><\/option>/g)].map((m) => m[1]);
    assert.ok(
      options.includes('Παπαδόπουλος, Γιώργος'),
      `the name was split: ${options.filter((o) => o.includes('Παπαδ'))}`,
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/next-staff-flow.test.js`
Expected: FAIL — there is no author datalist.

- [ ] **Step 3: Implement `listAuthorOptions` in `src/db/queries/authors.js`**

Per the Interfaces block, mirroring `listBorrowerOptions` in
`src/db/queries/borrowers.js` — including its reason for the cap: the list is
rendered into the page, so it is bounded rather than unbounded.

- [ ] **Step 4: Pass `authorOptions` from `src/routes/staff/books.js`**

Add it to the locals for `GET /staff/books/new`, `GET /staff/books/:id`, and
`rerenderForm` — all three render `staff/book-form`, so missing one leaves a
validation-failure redraw with no suggestions.

- [ ] **Step 5: Render the datalist in `src/views/next/staff/book-form.ejs`**

One `<datalist id="author-options">` in the authors fieldset, and
`list="author-options"` on every author input including the spare row. The "add
author" button clones with `cloneNode(true)`, so new rows inherit it.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/next-staff-flow.test.js`
Expected: PASS

- [ ] **Step 7: Run the whole suite and commit**

```bash
npm test
git add src/db/queries/authors.js src/routes/staff/books.js src/views/next/staff/book-form.ejs test/next-staff-flow.test.js
git commit -m "Author fields suggest names already in the catalogue"
```

---

### Task 5: Drop the breadcrumbs that repeat the top bar

**Files:**
- Modify: `src/views/next/staff/book-form.ejs`
- Modify: `src/views/next/staff/borrower.ejs`
- Test: `test/next-staff-pages.test.js`

**Interfaces:**
- Consumes: nothing. Produces: nothing other tasks use.

- [ ] **Step 1: Write the failing test**

```js
// Add to test/next-staff-pages.test.js
it('carries no breadcrumb that only repeats the top bar', async () => {
  // A single link back to the list goes where the highlighted tab already
  // goes. The copies page keeps its trail: "Κατάλογος · <title>" is two
  // levels, and the top bar cannot express the second one.
  for (const url of ['/staff/books/new', `/staff/books/${fixtures.books.odyssey}`,
    `/staff/borrowers/${db.get('SELECT id FROM borrower LIMIT 1')?.id ?? 0}`]) {
    const response = await get(url);
    if (response.statusCode !== 200) continue;
    const crumbs = response.body.match(/<nav[^>]*aria-label="[^"]*"[^>]*class="small muted"[^>]*>/g) ?? [];
    assert.deepEqual(crumbs, [], `${url} still has a redundant breadcrumb`);
  }
});

it('keeps the breadcrumb that says something the top bar cannot', async () => {
  // "Κατάλογος · <title>" is two levels deep; the top bar can only express
  // the first. Removing this one would cost a real way back.
  const response = await get(`/staff/books/${fixtures.books.odyssey}/copies`);
  const crumb = response.body.match(/<nav[^>]*class="small muted"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(crumb, 'the copies trail went with the redundant ones');
  assert.ok(crumb.includes('href="/staff/books"'), 'the trail lost its first level');
  assert.ok(
    crumb.includes(`href="/staff/books/${fixtures.books.odyssey}"`),
    'the trail lost the title it belongs to',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/next-staff-pages.test.js`
Expected: FAIL — both pages still render the breadcrumb nav.

- [ ] **Step 3: Remove the breadcrumb from the two templates**

Delete the `<nav aria-label="<%= t('nav.breadcrumb') %>">` block from
`book-form.ejs` and `borrower.ejs`. The `<h1>` beneath each loses its `mt-2`,
which existed only to separate it from the crumb.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/next-staff-pages.test.js`
Expected: PASS

- [ ] **Step 5: Run the whole suite and commit**

```bash
npm test
git add src/views/next/staff/book-form.ejs src/views/next/staff/borrower.ejs test/next-staff-pages.test.js
git commit -m "Drop two breadcrumbs that repeated the top bar"
```

---

### Task 6: Walk it in a browser

**Files:** none — verification only.

- [ ] **Step 1: Start the review server**

Run: `node scripts/review-server.js` (port 3100, throwaway DB, `admin`/`admin`).

- [ ] **Step 2: Create a title with a cover, end to end**

Open `/staff/books/new?ui=next`. Type a title, start typing a known author and
confirm the suggestion appears. Choose a landscape photo, drag it so a specific
part is in the frame, zoom in, and save. Open the public page for the new title
and confirm the stored cover shows the part that was framed.

- [ ] **Step 3: Check it with scripting off**

Reload with JavaScript disabled, choose a file, and save. The whole image should
be stored, no stage should appear, and nothing should look broken.

- [ ] **Step 4: Check the console and the spacing probe**

Confirm no CSP violations in the console. Run `scripts/spacing-probe.js` against
the book form at 1100px and 375px; expect no overlaps and no gaps under 12px.

- [ ] **Step 5: Commit anything the walk fixed**

If the walk changed nothing, say so rather than inventing a commit.
