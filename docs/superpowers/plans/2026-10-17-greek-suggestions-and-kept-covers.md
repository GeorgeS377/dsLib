# Greek-Aware Suggestions and Kept Covers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every suggestion field match Greek the way the catalogue search already does, and stop a rejected book form from throwing away the cover the librarian chose and framed.

**Architecture:** The server renders each suggestion with its folded form in a `data-fold` attribute computed by the existing `normalize()`, so the browser never re-implements folding for the data — only for the text being typed. One shared ARIA combobox in `app.js` upgrades all five fields, leaving the native `<datalist>` as the scripting-off fallback. A cover that arrives with a rejected form is stored through the existing pipeline immediately and carried back by filename in hidden fields.

**Tech Stack:** Node 24 ESM, Fastify 5, EJS, `node:sqlite`, Jimp 1.6, `node:test`, plain DOM JavaScript — no new dependencies, no build step.

**Spec:** `docs/superpowers/specs/2026-10-17-greek-suggestions-and-kept-covers-design.md`

## Global Constraints

- No new dependencies and no build step. `src/public/js/app.js` is served as written.
- CSP sends `style-src 'self'` (no `'unsafe-inline'`) and `img-src 'self' data:` (no `blob:`). Classes only; never a `style=` attribute.
- Every field works with scripting off: the native `<datalist>` stays in the markup as the fallback.
- `src/lib/normalize.js` is the only authority on folding. The browser folds *typed text* only; option data carries server-computed `data-fold`.
- Every new string gets both `el` and `en` entries in `src/lib/i18n.js`, Greek written as a librarian would say it, normal case (capitals strip accents).
- Second interface only (`src/views/next/**`). The classic interface is being retired — do not add anything to it, but do not break it.
- Run `npm test` before each commit. The suite is 564 tests at the start of this plan.

## Review Focus

Input classes the spec implies that a happy path will not exercise.

1. **Final sigma at a word end** — `καζαντζακησ` typed against `Νίκος Καζαντζάκης`; folding maps `ς`→`σ` on both sides or the commonest Greek ending stops matching (Task 1).
2. **A name containing a comma or an apostrophe** — `Παπαδόπουλος, Γιώργος`, `Saint-Exupéry` — must survive being carried in an attribute and chosen (Task 3).
3. **Choosing a suggestion with the keyboard only** — Enter on a highlighted row must fill the field and not submit the form (Task 3).
4. **Two rejections in a row** — the second must not orphan the first rejection's cover files (Task 4).
5. **A pending cover plus a newly chosen file** — the new file wins and the pending one is deleted, not left behind (Task 4).

---

### Task 1: Folding that the browser and the server agree on

**Files:**
- Modify: `src/lib/normalize.js`
- Test: `test/normalize.test.js`

**Interfaces:**
- Produces: `BROWSER_FOLD_SOURCE` — a string export holding the body of the browser's folding function, so one test can run it and compare against `normalize()`. `normalize(value: string): string` is unchanged.

- [ ] **Step 1: Write the failing test**

```js
// Add to test/normalize.test.js
describe('the folding the browser does', () => {
  // app.js cannot import this module, so it carries its own four-line copy.
  // Two implementations that drift would make suggestions find things the
  // catalogue search cannot, so they are compared here rather than trusted.
  const browserFold = new Function('value', BROWSER_FOLD_SOURCE);

  it('agrees with the server on Greek', () => {
    for (const sample of [
      'Νίκος Καζαντζάκης', 'ΝΊΚΟΣ ΚΑΖΑΝΤΖΆΚΗΣ', 'νικοσ καζαντζακησ',
      'Το καπλάνι της βιτρίνας', 'ΤΟ ΚΑΠΛΑΝΙ ΤΗΣ ΒΙΤΡΙΝΆΣ',
      'Παπαδόπουλος, Γιώργος', 'Antoine de Saint-Exupéry', 'Charlotte Brontë',
      'Άξιον Εστί', 'Οδυσσέας Ελύτης', '  διπλό   κενό  ', '', 'Α1', 'Β2',
    ]) {
      assert.equal(browserFold(sample), normalize(sample), `disagreed on "${sample}"`);
    }
  });

  it('folds a final sigma, the commonest Greek ending', () => {
    assert.equal(browserFold('Καζαντζάκης'), browserFold('καζαντζακησ'));
  });

  it('is the source app.js actually ships', () => {
    const script = fs.readFileSync(path.join(process.cwd(), 'src/public/js/app.js'), 'utf8');
    assert.ok(
      script.includes(BROWSER_FOLD_SOURCE.trim()),
      'app.js does not contain the folding this module publishes',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/normalize.test.js`
Expected: FAIL — `BROWSER_FOLD_SOURCE` is not exported.

- [ ] **Step 3: Export `BROWSER_FOLD_SOURCE` from `src/lib/normalize.js`**

A template literal holding a function body that takes `value` and returns the
folded string, performing the same four steps `normalize()` does in the same
order: NFD, strip combining marks, lowercase, `ς`→`σ`, then collapse anything
that is not a letter or digit to single spaces and trim. It must be valid
standalone browser JavaScript — no imports, no reference to anything in this
module. Comment that Task 3 pastes it into `app.js` verbatim and that the third
test is what keeps the copy honest.

- [ ] **Step 4: Run the test to verify the first two pass and the third fails**

Run: `node --test test/normalize.test.js`
Expected: the agreement tests PASS; "is the source app.js actually ships" FAILS until Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/normalize.js test/normalize.test.js
git commit -m "Publish the folding the browser has to copy"
```

---

### Task 2: Render suggestions with their folded form

**Files:**
- Modify: `src/db/queries/authors.js`, `src/db/queries/borrowers.js`, `src/db/queries/books.js`
- Modify: `src/routes/staff/books.js`, `src/routes/staff/loans.js`, `src/routes/staff/borrowers.js`
- Create: `src/views/next/partials/suggest.ejs`
- Modify: `src/views/next/staff/book-form.ejs`, `checkout.ejs`, `borrower.ejs`, `borrowers.ejs`
- Test: `test/suggestions.test.js` (create)

**Interfaces:**
- Consumes: `normalize` from `src/lib/normalize.js`.
- Produces: a partial rendered as
  `include('../partials/suggest', { id, name, value, options, t, label, hint, fills })`
  where `options` is `Array<{ value: string, fold: string, extra?: string }>`.
  It emits:
  - the text input, carrying `list="<id>"`, `data-suggest`, and
    `data-suggest-fills="<fills>"` when `fills` names another field's id —
    Task 3 keys entirely off these three attributes;
  - the native `<datalist id="<id>">` fallback;
  - one `<option value data-fold [data-extra]>` per entry. `extra` carries the
    reader's class, as the existing `data-class` does today.
- Produces: `listAuthorOptions`, `listBorrowerOptions`, `distinctLanguages` and
  the class list each gain a `fold` field on every row, computed with
  `normalize()`.

- [ ] **Step 1: Write the failing tests**

```js
// test/suggestions.test.js — what the server must hand the browser.
// (standard app/db setup as in test/next-staff-pages.test.js, plus a borrower
//  named 'Νίκος Καζαντζάκης' in class 'Α1' and a book by 'Όμηρος')

const pages = () => [
  ['/staff/books/new', 'author-options'],
  ['/staff/loans/checkout?copy=' + firstCopyId, 'reader-options'],
  ['/staff/borrowers', 'class-options'],
];

describe('suggestions carry their folded form', () => {
  it('puts a data-fold on every option', async () => {
    for (const [url, listId] of pages()) {
      const body = (await get(url)).body;
      const list = body.match(new RegExp(`<datalist id="${listId}">([\\s\\S]*?)</datalist>`))?.[1];
      assert.ok(list, `${url} has no ${listId}`);
      const options = [...list.matchAll(/<option\b[^>]*>/g)].map((m) => m[0]);
      assert.ok(options.length > 0, `${url}: ${listId} is empty`);
      for (const option of options) {
        assert.match(option, /data-fold="/, `${url}: an option with no folded form: ${option}`);
      }
    }
  });

  it('folds exactly as the catalogue search does', async () => {
    const body = (await get('/staff/books/new')).body;
    const list = body.match(/<datalist id="author-options">([\s\S]*?)<\/datalist>/)[1];
    for (const [, value, fold] of list.matchAll(/<option value="([^"]*)"[^>]*data-fold="([^"]*)"/g)) {
      assert.equal(fold, normalize(decodeEntities(value)), `wrong fold for ${value}`);
    }
  });

  it('keeps a comma and an apostrophe intact in the value', async () => {
    createBook(db, { title: 'Με Κόμμα', authorNames: ['Παπαδόπουλος, Γιώργος'] });
    const body = (await get('/staff/books/new')).body;
    assert.ok(body.includes('Παπαδόπουλος, Γιώργος'), 'the name was mangled or split');
  });

  it('still ships a native datalist, which is the no-scripting fallback', async () => {
    for (const [url, listId] of pages()) {
      const body = (await get(url)).body;
      assert.ok(body.includes(`<datalist id="${listId}">`), `${url} lost its fallback list`);
      assert.match(body, new RegExp(`list="${listId}"`), `${url}: no field points at it`);
    }
  });

  it('carries the reader class, so choosing a name still fills it', async () => {
    const body = (await get('/staff/loans/checkout?copy=' + firstCopyId)).body;
    assert.match(body, /data-extra="Α1"/, 'the class no longer rides with the reader');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/suggestions.test.js`
Expected: FAIL — no `data-fold` anywhere.

- [ ] **Step 3: Add `fold` to the option queries**

In `listAuthorOptions` and `listBorrowerOptions`, and wherever the class and
language lists are built, map each row through `normalize()` to add `fold`.
Compute it in JS rather than SQL: SQLite cannot fold Greek, which is the
reason `normalize()` exists.

- [ ] **Step 4: Create `src/views/next/partials/suggest.ejs`**

Per the Interfaces block. Comment that the native `<datalist>` is deliberate —
it is what a librarian gets with scripting off — and that `data-fold` exists so
the browser never folds the option text itself.

- [ ] **Step 5: Use the partial in all four templates**

Replace the hand-written input-plus-datalist in `book-form.ejs` (authors and
language), `checkout.ejs` (reader name), `borrower.ejs` and `borrowers.ejs`
(class). The author field repeats, so the partial must be safe to include once
per row with the list rendered once.

- [ ] **Step 6: Pass the folded options from the three route files**

`books.js` already passes `authorOptions` at three render points; `loans.js`
passes `readers` at two; `borrowers.js` passes the class list. Every render of
a template that includes the partial must supply them, or the page throws at
render time.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/suggestions.test.js`
Expected: PASS

- [ ] **Step 8: Run the whole suite and commit**

```bash
npm test
git add -A
git commit -m "Suggestions carry the folded form the browser needs"
```

---

### Task 3: The combobox

**Files:**
- Modify: `src/public/js/app.js`, `src/public/css/next.css`, `src/lib/i18n.js`
- Test: `test/suggestions.test.js`, `test/normalize.test.js`

**Interfaces:**
- Consumes: the markup from Task 2 and `BROWSER_FOLD_SOURCE` from Task 1.
- Produces: `enableSuggestions()`, called from the `DOMContentLoaded` handler.
  It upgrades each `[data-suggest]` input into an ARIA combobox over the
  options of its `list`, replacing `enableReaderAutofill`, whose class-filling
  job moves to `data-extra`.

- [ ] **Step 1: Write the failing tests**

```js
// Add to test/suggestions.test.js
describe('the combobox', () => {
  const script = () => fs.readFileSync(path.join(process.cwd(), 'src/public/js/app.js'), 'utf8');

  it('is wired up on load', () => {
    assert.match(script(), /enableSuggestions\(\);/, 'the combobox never starts');
  });

  it('replaced the reader-only autofill', () => {
    // One behaviour, one implementation: the old helper filled the class from
    // data-class and knew nothing about folding.
    assert.ok(!script().includes('enableReaderAutofill'), 'the old autofill is still there');
  });

  it('marks up every suggesting field as a combobox', async () => {
    for (const [url] of pages()) {
      const body = (await get(url)).body;
      for (const input of body.match(/<input[^>]*\blist="[^"]*"[^>]*>/g) ?? []) {
        assert.match(input, /data-suggest/, `a suggesting field the script will not see: ${input}`);
      }
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/suggestions.test.js`
Expected: FAIL — no `enableSuggestions`.

- [ ] **Step 3: Add the Greek and English strings to `src/lib/i18n.js`**

`suggest.none` (shown when nothing matches) and `suggest.count` (how many
matches, for the screen-reader live region; takes `{ n }`).

- [ ] **Step 4: Implement `enableSuggestions()` in `src/public/js/app.js`**

Paste `BROWSER_FOLD_SOURCE`'s body verbatim as the body of a `foldGreek(value)`
function, with a comment naming `src/lib/normalize.js` as its origin and the
test that compares them. Then, for each `[data-suggest]` input:

- Read `{ value, fold, extra }` from the linked datalist's options once.
- `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, and an
  `aria-controls` pointing at a `role="listbox"` the script creates; each row
  `role="option"` with an id, tracked by `aria-activedescendant`.
- On input: fold the typed text and show options whose `fold` contains it;
  substring, not prefix, so a surname finds a full name. Empty input shows
  nothing rather than everything.
- `ArrowDown`/`ArrowUp` move the active row (wrapping), `Enter` chooses it and
  must call `preventDefault()` so the form does not submit, `Escape` closes
  without choosing, `Tab` and blur close. Clicking a row chooses it.
- Choosing fills the input and, when the chosen option has `data-extra` and the
  input has `data-suggest-fills`, fills that field too — never overwriting
  something typed by hand, which is what `dataset.filled` tracked before.
- Announce the match count in a `aria-live="polite"` region.

Delete `enableReaderAutofill` and its call.

- [ ] **Step 5: Style the listbox in `src/public/css/next.css`**

`.suggest` (a positioned wrapper), `.suggest__list` (absolutely positioned,
scrolls past about eight rows, above the page), `.suggest__option` and its
active state, and the visually-hidden live region. Classes only.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/suggestions.test.js test/normalize.test.js`
Expected: PASS, including Task 1's "is the source app.js actually ships".

- [ ] **Step 7: Check it in a browser**

On the review server, open `/staff/books/new?ui=next` and type `καζαντζακη`,
`ΚΑΖΑΝΤΖΑΚΗ` and `Καζαντζάκη` into an author field; each must offer
*Νίκος Καζαντζάκης*. Choose one with the keyboard only and confirm the form
does not submit. On the lending page, choose a reader and confirm the class
still fills. Confirm no CSP violation in the console.

- [ ] **Step 8: Run the whole suite and commit**

```bash
npm test
git add -A
git commit -m "Suggestions match Greek the way the catalogue search does"
```

---

### Task 4: A cover that survives a rejected form

**Files:**
- Modify: `src/routes/staff/books.js`, `src/views/next/staff/book-form.ejs`, `src/lib/upload.js`, `src/lib/i18n.js`
- Test: `test/book-cover.test.js`

**Interfaces:**
- Consumes: `storeCoverImage`, `parseCropFields`, `isSafeStoredName`, `removeCoverFiles` from `src/lib/upload.js`; `saveCover`, already in `src/routes/staff/books.js` from the previous plan (`docs/superpowers/plans/2026-10-17-cover-cropper.md`).
- Produces: `pendingCoverFrom(body): { coverPath: string, thumbPath: string } | null` in `src/lib/upload.js` — reads `pending_cover` and `pending_thumb`, returning them only when both pass `isSafeStoredName`. Hostile or malformed values read as no pending cover.

- [ ] **Step 1: Write the failing tests**

```js
// Add to test/book-cover.test.js
describe('a cover kept across a rejected form', () => {
  const rejected = (fields, file) => postMultipart('/staff/books', {
    // An ISBN already in the catalogue is refused, so the form comes back.
    fields: { isbn: seededIsbn, ...fields },
    file,
    tokenFrom: '/staff/books/new',
  });

  it('comes back with the form instead of vanishing', async () => {
    const response = await rejected(
      { title: 'Απορρίφθηκε' },
      { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    assert.equal(response.statusCode, 422);
    const pending = response.body.match(/name="pending_cover" value="([^"]+)"/)?.[1];
    assert.ok(pending, 'the cover was not kept');
    assert.ok(fs.existsSync(path.join(uploadDir, 'covers', pending)), 'kept but not stored');
    assert.ok(response.body.includes(`/covers/`), 'the librarian cannot see it survived');
  });

  it('is saved when the form finally goes through', async () => {
    const first = await rejected(
      { title: 'Δεύτερη Προσπάθεια' },
      { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    const pending = first.body.match(/name="pending_cover" value="([^"]+)"/)[1];
    const thumb = first.body.match(/name="pending_thumb" value="([^"]+)"/)[1];

    const second = await postMultipart('/staff/books', {
      fields: { title: 'Δεύτερη Προσπάθεια', pending_cover: pending, pending_thumb: thumb },
      tokenFrom: '/staff/books/new',
    });
    assert.equal(second.statusCode, 302);
    assert.equal(getBookById(db, bookNamed('δευτερη προσπαθεια').id).cover_path, pending);
  });

  it('keeps the framing, because the crop is already applied', async () => {
    const first = await rejected(
      { title: 'Κομμένο Απορριφθέν', crop_x: '100', crop_y: '200', crop_w: '400', crop_h: '600' },
      { filename: 'c.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    const pending = first.body.match(/name="pending_cover" value="([^"]+)"/)[1];
    const image = await Jimp.read(path.join(uploadDir, 'covers', pending));
    assert.equal(image.width, 400);
    assert.equal(image.height, 600);
  });

  it('leaves nothing behind when a second rejection replaces it', async () => {
    const first = await rejected(
      { title: 'Δύο Απορρίψεις' },
      { filename: 'a.jpg', contentType: 'image/jpeg', buffer: await jpeg() },
    );
    const firstPath = first.body.match(/name="pending_cover" value="([^"]+)"/)[1];

    const second = await postMultipart('/staff/books', {
      fields: {
        isbn: seededIsbn, title: 'Δύο Απορρίψεις',
        pending_cover: firstPath,
        pending_thumb: first.body.match(/name="pending_thumb" value="([^"]+)"/)[1],
      },
      file: { filename: 'b.jpg', contentType: 'image/jpeg', buffer: await jpeg({ width: 600, height: 900 }) },
      tokenFrom: '/staff/books/new',
    });
    const secondPath = second.body.match(/name="pending_cover" value="([^"]+)"/)[1];
    assert.notEqual(secondPath, firstPath, 'the new file did not replace the kept one');
    assert.ok(!fs.existsSync(path.join(uploadDir, 'covers', firstPath)), 'the replaced file was orphaned');
  });

  it('ignores a pending name that was tampered with', async () => {
    // The filename comes back off a form, so it is untrusted like anything else.
    for (const name of ['../../etc/passwd', 'not-a-uuid.jpg', '/etc/passwd']) {
      const response = await postMultipart('/staff/books', {
        fields: { title: `Πειραγμένο ${name}`, pending_cover: name, pending_thumb: name },
        tokenFrom: '/staff/books/new',
      });
      assert.equal(response.statusCode, 302);
      assert.equal(getBookById(db, bookNamed('πειραγμενο').id).cover_path, null);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/book-cover.test.js`
Expected: FAIL — no `pending_cover` in the rejected form.

- [ ] **Step 3: Implement `pendingCoverFrom` in `src/lib/upload.js`**

Per the Interfaces block, reusing `isSafeStoredName`. Comment that these names
arrive from a form and are therefore untrusted, and that `isSafeStoredName`'s
UUID shape is what stops one naming a file outside `covers/`.

- [ ] **Step 4: Store the cover before re-rendering, in `src/routes/staff/books.js`**

`rerenderForm` gains the pending pair. Before it re-renders: if a new file
arrived, store it through `storeCoverImage` (with its crop) and delete whatever
pending pair came in; otherwise carry the incoming pending pair through
unchanged. Update the comment that claims nothing is lost, which is what this
task makes true again.

Then teach `saveCover` to adopt a pending pair when no new file arrived:
`setBookCover` with those names, deleting the book's previous files as it
already does. A pending pair that is adopted must not then be deleted.

- [ ] **Step 5: Render the kept cover in `src/views/next/staff/book-form.ejs`**

Two hidden inputs, the thumbnail, and a line saying the cover was kept. Add
`staff.cover.kept` to both dictionaries.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/book-cover.test.js`
Expected: PASS

- [ ] **Step 7: Run the whole suite and commit**

```bash
npm test
git add -A
git commit -m "A rejected form no longer throws the cover away"
```

---

### Task 5: Sweep up covers no book refers to

**Files:**
- Create: `scripts/prune-covers.js`
- Modify: `package.json`, `README.md`
- Test: `test/prune-covers.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `pruneCovers(db, { uploadDir, olderThanHours = 24, dryRun = false }): { removed: string[], kept: number }` exported from `scripts/prune-covers.js`, deleting files in `covers/` that no `book.cover_path` or `book.cover_thumb_path` names and whose mtime is older than the threshold.

- [ ] **Step 1: Write the failing tests**

```js
// test/prune-covers.test.js
describe('pruning covers no book refers to', () => {
  it('removes an orphan older than the threshold', async () => { /* mtime backdated, file gone, returned in removed */ });
  it('keeps a cover a book still refers to, however old', async () => { /* both cover_path and cover_thumb_path */ });
  it('keeps a recent orphan, which may be a form still being filled in', async () => { /* the reason the threshold exists */ });
  it('removes nothing when asked for a dry run', async () => { /* reports the same list, deletes none */ });
  it('ignores a file that is not a stored cover name', async () => { /* a stray README in covers/ stays */ });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/prune-covers.test.js`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement `scripts/prune-covers.js`**

Exporting `pruneCovers` per the Interfaces block and runnable directly, with
`--dry-run` and `--hours N`. Only files matching `isSafeStoredName` are ever
candidates, so nothing else in the directory can be deleted. Head the file with
why orphans exist at all: a librarian who abandons a rejected form leaves the
cover behind, which is the price of not losing their work.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/prune-covers.test.js`
Expected: PASS

- [ ] **Step 5: Add the npm script and document it**

`"prune-covers": "node scripts/prune-covers.js"` in `package.json`, and a
README line next to the backup instructions saying what it does and that it is
safe to run while the site is up.

- [ ] **Step 6: Run the whole suite and commit**

```bash
npm test
git add -A
git commit -m "Sweep up cover files no book refers to"
```

---

### Task 6: Walk it in a browser

**Files:** none — verification only.

- [ ] **Step 1: Start the review server**

Run: `node scripts/review-server.js` (port 3100, throwaway DB, `admin`/`admin`).
Kill any previous one **by port** (`ss -ltnp | grep :3100`), never with a
`pkill -f` pattern that also matches the kill command's own arguments.

- [ ] **Step 2: Type Greek badly at every suggesting field**

On `/staff/books/new?ui=next`, type `καζαντζακη`, `ΚΑΖΑΝΤΖΑΚΗ`, `Καζαντζάκη`
and `καζαντζάκησ` into an author field; each must offer *Νίκος Καζαντζάκης*.
Repeat on the lending page's reader field and a class field. Choose one using
only the keyboard and confirm the form does not submit on Enter.

- [ ] **Step 3: Get a book form rejected on purpose, with a framed cover**

Choose a cover, frame it, and submit with an ISBN that already exists. The
cover must still be shown, the thumbnail must load, and saving after fixing the
ISBN must store exactly the framed image.

- [ ] **Step 4: Check the console, the policy and the spacing**

No CSP violations. Run the spacing probe over the book form, the lending page
and the readers page at 1100px and 375px; expect no overlaps and no gaps under
12px, including with a suggestion list open.

- [ ] **Step 5: Commit anything the walk fixed**

If the walk changed nothing, say so rather than inventing a commit.
