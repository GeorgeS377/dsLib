# First-Run Browser Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher who has never opened a terminal takes a freshly deployed library from empty to signed-in using only a link the admin sent, naming the library, giving it an icon, choosing its categories and loan period, and creating the first account.

**Architecture:** A new `setting` key/value table holds the values a teacher can edit. One resolution module reads row → environment variable → schema default, so an existing `.env` deployment is untouched until someone saves in the browser. `/setup` is open only while the library has no staff accounts; its three steps each POST, write, and redirect, so the irreversible one (creating the account) is last and alone. The icon reuses the existing `jimp` cover pipeline and is served by a third `@fastify/static` instance.

**Tech Stack:** Node 24, Fastify 5, EJS, `node:sqlite`, `jimp` (already a dependency), `node:test`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-first-run-setup-design.md`

## Global Constraints

- **No new dependencies.** `jimp` and `zod` are already present; nothing else may be added.
- **Node 24, Fastify 5, EJS, `node:sqlite`.** No build step, no native modules.
- **CSP:** `style-src 'self'` (no inline `style=` attributes, no inline `<style>`), `img-src 'self' data:` (no `blob:`), `frame-ancestors 'none'`.
- **Every form works with scripting off.** `src/public/js/app.js` only enhances.
- **All SQL lives in `src/db/queries/`.** Route and lib files call query functions.
- **Greek is primary**, English is a toggle. Every new string goes in both dictionaries in `src/lib/i18n.js`; `test/i18n.test.js` asserts the key sets match exactly.
- **`MIN_PASSWORD_LENGTH` is 8**, with the existing blocklist in `src/lib/password.js`.
- **No destructive change to existing services.** One new table; no existing table altered; `.env` keeps working; `create-admin` untouched; `classic` untouched until Task 8.
- **Greek copy is fixed by §8 of the spec** and must be used verbatim.
- **Interface:** everything new is built in `src/views/next` only.

## Review Focus

Five failure modes the spec implies that no task's happy path exercises. Each has a test added to the task that owns the code.

1. **Two browsers race step 3.** Both POST with zero accounts; the second must not create a second administrator. Pinned in Task 5.
2. **A hand-edited `setting` row holds garbage** (`default_loan_days = 'abc'`). Every page must keep rendering on the fallback, not 500. Pinned in Task 1.
3. **An oversize or corrupt icon must not lose the name already typed.** Exactly the bug the cover work hit with a bare 413. Pinned in Task 3.
4. **A library name containing `<`, `"` or 400 characters** must escape in both the `<title>` and the bar, and be refused above the length limit. Pinned in Task 1 and Task 3.
5. **The icon row survives but the file does not** (restored database, unrestored uploads). Pages must still render and `/favicon.ico` must fall back to the committed SVG. Pinned in Task 2.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/db/migrations/005_settings.sql` | the `setting` table |
| `src/db/queries/settings.js` | all SQL for `setting` |
| `src/lib/settings.js` | resolution (row → env → default) and the process cache |
| `src/routes/setup.js` | the three wizard steps and the gate |
| `src/routes/staff/library-settings.js` | `/staff/settings/library` |
| `src/views/next/setup/step-library.ejs` | step 1 |
| `src/views/next/setup/step-catalogue.ejs` | step 2 |
| `src/views/next/setup/step-account.ejs` | step 3 |
| `src/views/next/staff/library-settings.ejs` | the settings page |
| `src/views/partials/brand-head.ejs` | the `<link rel="icon">` tags, for every layout |
| `src/views/next/partials/brand-mark.ejs` | the square mark in the bar |
| `docs/deploy.md` | the deploy and update guide |
| `test/settings.test.js`, `test/setup.test.js`, `test/brand-icon.test.js`, `test/library-settings.test.js` | |

**Modify**

| File | Change |
|---|---|
| `src/lib/upload.js` | add `storeBrandIcon`, `removeBrandIcon` |
| `src/app.js` | settings-backed locals; `/brand/` static; `/favicon.ico`; register `setupRoutes`; boot log line |
| `src/routes/staff/index.js` | register `libraryRoutes`; `defaultLoanDays` from settings |
| `src/routes/staff/loans.js` | `defaultLoanDays` from settings (4 call sites) |
| `src/routes/staff/auth.js` | redirect `/staff/login` → `/setup` while no accounts exist |
| `src/views/next/staff/settings.ejs` | the new card |
| six layouts (`src/views/{layouts,next/layouts}/*.ejs`) | include `brand-head.ejs` |
| `src/views/next/layouts/public.ejs`, `next/layouts/staff-plain.ejs`, `next/partials/topbar.ejs` | include `brand-mark.ejs` |
| `src/lib/i18n.js` | new keys, both languages |
| `src/public/css/next.css` | setup panel, chips |
| `src/public/js/app.js` | chip removal and inline category add |
| `src/lib/ui-flavour.js` | `DEFAULT_FLAVOUR` (Task 8 only) |
| `README.md` | link to `docs/deploy.md` |

---

## Task 1: The `setting` table and one resolution rule

**Files:**
- Create: `src/db/migrations/005_settings.sql`, `src/db/queries/settings.js`, `src/lib/settings.js`
- Test: `test/settings.test.js`
- Modify: `src/app.js:361` (template locals), `src/routes/staff/index.js:47`, `src/routes/staff/loans.js:113,164,292,340`

**Interfaces:**
- Consumes: `now()` from `src/db/index.js`; `config` from `src/config.js`.
- Produces:
  - `src/db/queries/settings.js`: `getSetting(db, key) -> string | null`, `setSetting(db, key, value) -> void`, `deleteSetting(db, key) -> void`, `allSettings(db) -> Record<string,string>`
  - `src/lib/settings.js`: `libraryName(db, config) -> string`, `defaultLoanDays(db, config) -> number`, `libraryIcon(db) -> string | null`, `setupCompletedAt(db) -> string | null`, `saveSetting(db, key, value) -> void` (writes *and* invalidates — the only writer later tasks may call), `invalidateSettings() -> void`
  - Keys as a frozen export: `SETTING_KEYS = { libraryName: 'library_name', libraryIcon: 'library_icon', defaultLoanDays: 'default_loan_days', setupCompletedAt: 'setup_completed_at' }`
  - `LIBRARY_NAME_MAX_LENGTH = 120`

- [ ] **Step 1: Write the failing tests** in `test/settings.test.js`

```js
describe('settings resolution', () => {
  it('falls back to the environment variable when no row exists', () => {
    // setup.config has LIBRARY_NAME 'Σχολική Βιβλιοθήκη'
    assert.equal(libraryName(db, config), 'Σχολική Βιβλιοθήκη');
    assert.equal(defaultLoanDays(db, config), config.defaultLoanDays);
  });

  it('prefers the row over the environment variable', () => {
    setSetting(db, SETTING_KEYS.libraryName, '5ο Γυμνάσιο Ηρακλείου Αττικής');
    invalidateSettings();
    assert.equal(libraryName(db, config), '5ο Γυμνάσιο Ηρακλείου Αττικής');
  });

  it('ignores a row that is not a usable loan period', () => {
    // Review Focus 2: a hand-edited database must not take every page down.
    for (const bad of ['abc', '', '0', '-5', '400', '7.5']) {
      setSetting(db, SETTING_KEYS.defaultLoanDays, bad);
      invalidateSettings();
      assert.equal(defaultLoanDays(db, config), config.defaultLoanDays, bad);
    }
  });

  it('ignores a blank or over-long library name row', () => {
    // Review Focus 4.
    setSetting(db, SETTING_KEYS.libraryName, '   ');
    invalidateSettings();
    assert.equal(libraryName(db, config), 'Σχολική Βιβλιοθήκη');
    setSetting(db, SETTING_KEYS.libraryName, 'α'.repeat(121));
    invalidateSettings();
    assert.equal(libraryName(db, config), 'Σχολική Βιβλιοθήκη');
  });

  it('serves a written value without an explicit invalidate in a new request', async () => {
    // The cache must not outlive a write made through setSetting.
  });
});

describe('the library name on a page', () => {
  it('escapes a name containing markup in the title and the bar', async () => {
    // Review Focus 4: GET / with a name of '<script>x</script>&"' present.
    assert.ok(!body.includes('<script>x</script>'));
  });

  it('shows the row value, not the environment value, once set', async () => {
    // GET / with ui=next
  });
});

describe('the loan period on the checkout form', () => {
  it('offers the row value as the default due date', async () => {
    // setSetting default_loan_days = '21', then GET /staff/checkout
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/settings.test.js`
Expected: FAIL — `Cannot find module '../src/lib/settings.js'`

- [ ] **Step 3: Write `005_settings.sql`**

```sql
CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Head it with a comment in the house style of `003_announcements.sql`: what this table is for, and why key/value rather than columns (unrelated single values, no relations to anything).

- [ ] **Step 4: Implement `src/db/queries/settings.js`**

Four functions as in Interfaces. `setSetting` is an upsert (`ON CONFLICT(key) DO UPDATE`) stamping `updated_at` with `now()`.

- [ ] **Step 5: Implement `src/lib/settings.js`**

A module-level `Map` cache keyed by setting key, filled on read and cleared by `invalidateSettings()`. **`setSetting` must not be callable without the cache noticing** — re-export a wrapper from this module (`saveSetting(db, key, value)`) that writes and invalidates, and have every caller in later tasks use it. One process, one SQLite file, so a plain memo is correct.

Each reader validates before trusting: `libraryName` requires non-empty-after-trim and at most `LIBRARY_NAME_MAX_LENGTH`; `defaultLoanDays` requires an integer 1–365, matching the bounds already in `src/config.js:41`. A row failing validation is treated as absent, which is what keeps Review Focus 2 from being a 500 on every page.

- [ ] **Step 6: Replace the four `config.defaultLoanDays` reads and the one `config.libraryName` read**

`src/app.js:361` becomes `libraryName: libraryName(app.db, config)`. `src/routes/staff/index.js:47` and the four sites in `src/routes/staff/loans.js` call `defaultLoanDays(db, app.config)`.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS, including the 633 already green. Any failure here means an existing caller was missed.

- [ ] **Step 8: Commit**

```bash
git add src/db/migrations/005_settings.sql src/db/queries/settings.js src/lib/settings.js src/app.js src/routes/staff/index.js src/routes/staff/loans.js test/settings.test.js
git commit -m "Let the library's name and loan period live in the database"
```

---

## Task 2: The library icon

**Files:**
- Modify: `src/lib/upload.js`, `src/app.js:255-265` (static) and its route section, all six layouts, `src/views/next/layouts/public.ejs`, `src/views/next/layouts/staff-plain.ejs`, `src/views/next/partials/topbar.ejs`
- Create: `src/views/partials/brand-head.ejs`, `src/views/next/partials/brand-mark.ejs`
- Test: `test/brand-icon.test.js`

**Interfaces:**
- Consumes: `sniffImageType`, `isSafeStoredName` from `src/lib/upload.js`; `libraryIcon`, `saveSetting`, `SETTING_KEYS` from Task 1.
- Produces:
  - `storeBrandIcon(buffer, { uploadDir, maxBytes, crop }) -> Promise<{ ok: true, iconName: string } | { ok: false, reason: string }>` in `src/lib/upload.js`. `reason` values match `storeCoverImage`: `empty`, `too_large`, `unsupported_type`, `unreadable`, `too_many_pixels`, `write_failed`.
  - `removeBrandIcon(uploadDir, iconName) -> Promise<void>` in `src/lib/upload.js`
  - `BRAND_ICON_SIZES = [32, 180, 512]`
  - `iconName` is `<uuid>.png`; the three files written are `<uuid>-32.png`, `<uuid>-180.png`, `<uuid>-512.png` in `<uploadDir>/icons/`, served at `/brand/<name>`.

- [ ] **Step 1: Write the failing tests** in `test/brand-icon.test.js`

```js
describe('storeBrandIcon', () => {
  it('writes a 32, a 180 and a 512 px PNG', async () => {});
  it('crops to a square from the centre when no crop is given', async () => {
    // a 400x200 source yields a 1:1 output
  });
  it('honours an explicit crop rectangle', async () => {});
  it('refuses an SVG', async () => {
    // Spec §11: SVG can carry script and would be served from our origin.
    assert.deepEqual(await storeBrandIcon(svgBuffer, opts), { ok: false, reason: 'unsupported_type' });
  });
  it('refuses a buffer over maxBytes', async () => {});
  it('strips EXIF by re-encoding', async () => {});
});

describe('serving the icon', () => {
  it('serves the uploaded icon at /brand/<name>-32.png', async () => {});
  it('links the uploaded icon from every layout', async () => {
    // The shape of test that caught staff-plain.ejs not loading app.js:
    // walk every layout, assert each links rel="icon".
  });
  it('answers /favicon.ico with the 32 px file', async () => {});
  it('falls back to the committed SVG when no icon is set', async () => {
    assert.match(body, /\/assets\/icon\.svg/);
  });
  it('falls back to the committed SVG when the row points at a missing file', async () => {
    // Review Focus 5: a restored database with unrestored uploads must not
    // break every page, and /favicon.ico must not 500.
    saveSetting(db, SETTING_KEYS.libraryIcon, 'deadbeef-0000-4000-8000-000000000000.png');
    // GET / renders; GET /favicon.ico is 200 and is the SVG
  });
  it('ignores a row whose value is not a safe stored name', async () => {
    saveSetting(db, SETTING_KEYS.libraryIcon, '../../etc/passwd');
  });
  it('shows the icon as the mark in the bar, not only in the tab', async () => {});
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/brand-icon.test.js`
Expected: FAIL — `storeBrandIcon is not a function`

- [ ] **Step 3: Implement `storeBrandIcon` and `removeBrandIcon` in `src/lib/upload.js`**

Follow `storeCoverImage` (`src/lib/upload.js:101`) closely — same sniff, same `MAX_PIXELS` guard, same `randomUUID` naming, same `0o640` mode, same "do not leave half an upload behind" cleanup. Two differences: the output is PNG at three fixed square sizes, and with no `crop` the image is centre-cropped to a square before resizing (take the smaller dimension, offset by half the difference).

- [ ] **Step 4: Create `src/views/partials/brand-head.ejs` and `src/views/next/partials/brand-mark.ejs`**

`brand-head.ejs` renders the `rel="icon"` and `rel="apple-touch-icon"` links from a `brandIcon` local: the three `/brand/` PNGs when set, otherwise the single `/assets/icon.svg` line that is in all six layouts today. `brand-mark.ejs` renders either `<img src="/brand/<name>-32.png" alt="">` or the existing inline book SVG, inside the existing `.bar__mark` span.

A `.bar__mark img` rule in `next.css` sizing to 100% with `object-fit: cover` — an inline `style=` attribute would be refused by the CSP.

- [ ] **Step 5: Add `brandIcon` to the shared locals and swap the six layouts and three mark sites to the partials**

`brandIcon: libraryIcon(app.db)` in `src/app.js:361`, returning `null` unless the row is present, passes `isSafeStoredName`, **and** the 32 px file exists on disk — that last check is Review Focus 5.

- [ ] **Step 6: Register the static route and `/favicon.ico` in `src/app.js`**

A third `@fastify/static` at `prefix: '/brand/'`, rooted at `path.join(config.uploadDir, 'icons')`, copying the options of the `covers/` instance at `src/app.js:258-266` exactly — including `decorateReply: false`, `list: false`, `serveDotFiles: false`, and the `mkdirSync` with mode `0o750`. A `GET /favicon.ico` handler serves the 32 px file when one is set and redirects to `/assets/icon.svg` otherwise.

- [ ] **Step 7: Run the tests**

Run: `node --test test/brand-icon.test.js && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/upload.js src/app.js src/views src/public/css/next.css test/brand-icon.test.js
git commit -m "Give the library its own icon, in the tab and in the bar"
```

---

## Task 3: `/setup` opens, and step 1 names the library

**Files:**
- Create: `src/routes/setup.js`, `src/views/next/setup/step-library.ejs`
- Modify: `src/app.js` (register), `src/routes/staff/auth.js:20-43`, `src/lib/i18n.js`, `src/public/css/next.css`
- Test: `test/setup.test.js`

**Interfaces:**
- Consumes: `countStaff` from `src/db/queries/staff.js` (already imported in `auth.js`); `storeBrandIcon` from Task 2; `saveSetting`, `libraryName`, `LIBRARY_NAME_MAX_LENGTH` from Task 1; `reply.renderPlain` (`src/app.js:392`); `parseCropFields` from `src/lib/upload.js:75`.
- Produces:
  - `setupRoutes(app)` default export, registering `GET /setup`, `GET /setup/library`, `POST /setup/library`, and in later tasks the catalogue and account steps.
  - `isSetupOpen(db) -> boolean` exported from `src/routes/setup.js` — `countStaff(db) === 0`.
  - `librarySetupSchema` in `src/lib/validation.js`: `{ library_name: string, trimmed, 1..LIBRARY_NAME_MAX_LENGTH }`

- [ ] **Step 1: Write the failing tests** in `test/setup.test.js`

```js
describe('the setup gate', () => {
  it('serves /setup when the library has no staff accounts', async () => {
    // 302 to /setup/library
  });
  it('redirects /setup to the login page once an account exists', async () => {});
  it('redirects /staff/login to /setup while setup is open', async () => {});
  it('leaves /staff/login alone once an account exists', async () => {});
  it('renders the new interface even with ui=classic', async () => {
    // Spec §4.1: /setup ignores the flavour cookie.
    assert.match(body, /ΒΗΜΑ 1 ΑΠΟ 3/);
  });
  it('keeps the public catalogue working while setup is open', async () => {});
});

describe('step 1', () => {
  it('shows the example as a placeholder, not a filled-in value', async () => {
    assert.match(body, /placeholder="5ο Γυμνάσιο Ηρακλείου Αττικής"/);
    assert.ok(!body.includes('value="Σχολική Βιβλιοθήκη"'));
  });
  it('saves the name and moves to step 2', async () => {});
  it('refuses a blank name and says so', async () => {});
  it('refuses a name over 120 characters', async () => {});
  it('saves an uploaded icon with the name', async () => {});
  it('keeps the typed name when the icon is rejected', async () => {
    // Review Focus 3: the lesson of the bare 413 on the book form. An
    // oversize icon re-renders step 1 with the name still in the box and the
    // icon error beside it — it does not discard the form.
    assert.match(body, /value="5ο Γυμνάσιο Ηρακλείου Αττικής"/);
  });
  it('prefills the saved name when step 1 is re-entered', async () => {
    // An interrupted setup resumes; spec §7.5.
  });
  it('requires a CSRF token', async () => {});
  it('escapes a name containing markup when it echoes it back', async () => {});
  it('keeps the theme and language links in the footer', async () => {
    // Spec §11: a teacher who wants the wizard in English should be able to.
  });
  it('loads app.js so the cropper can enhance the icon field', async () => {
    // The staff-plain layout shipped once without this tag and the password
    // reveal rendered and did nothing.
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/setup.test.js`
Expected: FAIL — 404 on `/setup`

- [ ] **Step 3: Implement the gate and step 1 in `src/routes/setup.js`**

Registered in `src/app.js` outside the staff authentication scope but inside CSRF and rate limiting. `GET /setup` redirects to `/setup/library`. Every handler in the file begins by checking `isSetupOpen(db)` and redirecting to `/staff/login` if not — a single guard helper in this file, not a check per route, because a forgotten one is an open administrator factory.

Rate limit the POSTs the way `src/routes/staff/auth.js:50-57` does, `false` under `config.isTest`.

- [ ] **Step 4: Change `/staff/login` to redirect while setup is open**

In `src/routes/staff/auth.js`, the `noAccounts` local already computes `countStaff(db) === 0` for the hint that tells the operator to run `create-admin`. Replace that branch with a redirect to `/setup`. Keep the `login.noAccounts` string and its use in the `classic` template — Task 8 territory, and classic is not being changed here.

- [ ] **Step 5: Write `src/views/next/setup/step-library.ejs` and its layout treatment**

Rendered through `reply.renderPlain` with a local that swaps the bar's "view public site" link for `Εγκατάσταση` (spec §11). Markup and copy from the mockup at `.superpowers/brainstorm/201733-1792323661/content/setup-final.html` and spec §8: progress label over a three-segment rule, square icon tile centred above, left-aligned `Όνομα βιβλιοθήκης` with the placeholder below it.

New CSS in `next.css` for the setup panel, the progress rule and the icon tile — no inline styles.

- [ ] **Step 6: Reuse the cover cropper on the icon field**

Spec §7.3: the crop-and-move control is `enableCoverCropper` in `src/public/js/app.js`, already built for book covers and already CSP-clean (canvas, no `blob:`). Point it at the icon input, locked to a 1:1 frame, and submit its rectangle through the hidden fields `parseCropFields` already reads (`src/lib/upload.js:75`). With scripting off there is no rectangle and the server centre-crops, which Task 2 Step 3 covers.

- [ ] **Step 7: Add the Greek and English strings to `src/lib/i18n.js`**

Greek verbatim from spec §8. Run `node --test test/i18n.test.js` to confirm the key sets still match.

- [ ] **Step 8: Run the tests**

Run: `node --test test/setup.test.js && npm test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/routes/setup.js src/views/next/setup src/app.js src/routes/staff/auth.js src/lib/i18n.js src/lib/validation.js src/public/css/next.css test/setup.test.js
git commit -m "Open a setup page on a library with no accounts"
```

---

## Task 4: Step 2 — categories you build, and the loan period

**Files:**
- Create: `src/views/next/setup/step-catalogue.ejs`
- Modify: `src/routes/setup.js`, `src/public/js/app.js`, `src/public/css/next.css`, `src/lib/i18n.js`
- Test: `test/setup.test.js` (new describe block)

**Interfaces:**
- Consumes: `createCategory`, `listAllCategories`, `deleteCategory` from `src/db/queries/categories.js`; `saveSetting`, `defaultLoanDays` from Task 1.
- Produces: `GET /setup/catalogue`, `POST /setup/catalogue` with three submit intents distinguished by a submit button's `name`: `add` (add the typed category and re-render), `remove` (remove by id and re-render), `next` (save the loan period and move on).
- `STARTER_CATEGORIES = ['Λογοτεχνία', 'Ιστορία', 'Επιστήμες', 'Παιδικά']` exported from `src/routes/setup.js`.

- [ ] **Step 1: Write the failing tests**

```js
describe('step 2', () => {
  it('starts with the four starter categories already created', async () => {});
  it('creates the starter categories only once, not again on reload', async () => {});
  it('adds a typed category with no JavaScript and shows it', async () => {
    // POST with add=1 and name='Μυθολογία' re-renders step 2 containing it.
  });
  it('refuses a category that already exists under folding', async () => {
    // 'ιστορια' beside 'Ιστορία' — createCategory already refuses this.
    assert.match(body, /υπάρχει/);
  });
  it('removes a category when its × is submitted', async () => {});
  it('refuses to remove a category that is not one of ours', async () => {});
  it('saves the loan period and moves to step 3', async () => {});
  it('refuses a loan period outside 1..365', async () => {});
  it('keeps the categories when the loan period is refused', async () => {});
  it('prefills the saved loan period when re-entered', async () => {});
  it('offers a link back to step 1', async () => {});
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/setup.test.js`
Expected: FAIL — 404 on `/setup/catalogue`

- [ ] **Step 3: Implement the three intents in `src/routes/setup.js`**

The starter categories are created on the first `GET /setup/catalogue` and only when the category table is empty, so a reload does not resurrect one the teacher has just removed.

`remove` must only delete a category with no books — `deleteCategory`'s existing behaviour — and only one that exists; anything else re-renders unchanged rather than erroring.

- [ ] **Step 4: Write `src/views/next/setup/step-catalogue.ejs`**

Chips with a `×` submit button each, the add field and its `Προσθήκη` button, and the loan-period field. Copy verbatim from spec §8. The whole step is one `<form>`, which is what makes all three intents work with scripting off.

- [ ] **Step 5: Enhance it in `src/public/js/app.js`**

`enableSetupCategories()`: `×` removes the chip from the DOM and leaves a hidden input recording the removal; `Προσθήκη` appends a chip and a hidden input without a round trip. Follow the pattern of the existing category-creation enhancement on the book form. With scripting off the buttons submit, which Step 1's tests already cover.

- [ ] **Step 6: Run the tests**

Run: `node --test test/setup.test.js && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/routes/setup.js src/views/next/setup/step-catalogue.ejs src/public/js/app.js src/public/css/next.css src/lib/i18n.js test/setup.test.js
git commit -m "Let the teacher build the category list during setup"
```

---

## Task 5: Step 3 — the first account, and setup closes

**Files:**
- Create: `src/views/next/setup/step-account.ejs`
- Modify: `src/routes/setup.js`, `src/app.js` (boot log), `src/lib/i18n.js`
- Test: `test/setup.test.js` (new describe block)

**Interfaces:**
- Consumes: `createStaffUser`, `countStaff` from `src/db/queries/staff.js`; `logAction` from `src/db/queries/audit.js`; `checkPasswordStrength`, `MIN_PASSWORD_LENGTH` from `src/lib/password.js`; `staffUserFormSchema` from `src/lib/validation.js:318`; `SESSION_KEYS` from `src/lib/auth.js`; `UI_COOKIE` from `src/lib/ui-flavour.js`.
- Produces: `GET /setup/account`, `POST /setup/account`.

- [ ] **Step 1: Write the failing tests**

```js
describe('step 3', () => {
  it('creates an admin, signs them in and lands on the dashboard', async () => {
    // 302 to /staff, and the session cookie reaches /staff without a login
  });
  it('sets ui=next so the teacher continues in the new interface', async () => {});
  it('writes an audit row naming setup as the route in', async () => {
    assert.equal(row.action, 'staff.create');
    assert.equal(JSON.parse(row.detail).via, 'setup');
  });
  it('stamps setup_completed_at', async () => {});
  it('closes /setup for good', async () => {
    // every /setup/* now redirects to /staff/login
  });
  it('refuses a password under 8 characters', async () => {});
  it('refuses a password on the blocklist', async () => {});
  it('refuses two entries that do not match', async () => {});
  it('keeps the username and display name when the password is refused', async () => {});
  it('keeps the name, icon and categories when the password is refused', async () => {
    // Spec §7.5: the irreversible step cannot lose the reversible work.
  });
  it('creates no second administrator when two requests race', async () => {
    // Review Focus 1: fire two POSTs with distinct usernames concurrently;
    // exactly one account exists afterwards and the loser gets a redirect,
    // not a 500.
    assert.equal(countStaff(db), 1);
  });
  it('has no email field', async () => {});
  it('offers a link back to step 2', async () => {});
});

describe('the boot log', () => {
  it('says setup is unclaimed on a library with no accounts', async () => {});
  it('says nothing about setup once an account exists', async () => {});
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/setup.test.js`
Expected: FAIL — 404 on `/setup/account`

- [ ] **Step 3: Implement `POST /setup/account`**

Validate with `staffUserFormSchema` (role forced to `admin`, `is_active` true, email omitted), then `checkPasswordStrength`, then the confirmation match. On success: `createStaffUser`, `request.session.regenerate()` then set `SESSION_KEYS.staffUserId` and `loggedInAt` exactly as `src/routes/staff/auth.js:117-119` does, set the `ui` cookie to `next` with the options used at `src/app.js:283-289`, `saveSetting(setupCompletedAt, now())`, `logAction` with `detail: { role: 'admin', via: 'setup' }` and the request address, redirect to `/staff`.

The race in Review Focus 1 closes by doing the account creation inside one SQLite transaction that re-checks `countStaff(db) === 0`, so the second writer sees an account and redirects. `createStaffUser` hashes the password outside the transaction — hash first, then open it.

- [ ] **Step 4: Write `src/views/next/setup/step-account.ejs`**

Four fields, the reveal control from `enablePasswordReveal`, copy from spec §8, `Έτοιμο` as the submit. No note about the page closing — spec §6.1.

- [ ] **Step 5: Add the boot log line in `src/app.js`**

One `app.log.info` after the database is ready: whether setup is still unclaimed, or the `setup_completed_at` stamp. Spec §7.4.

- [ ] **Step 6: Run the tests**

Run: `node --test test/setup.test.js && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/routes/setup.js src/views/next/setup/step-account.ejs src/app.js src/lib/i18n.js test/setup.test.js
git commit -m "Finish setup by making the first librarian's account"
```

---

## Task 6: Ρυθμίσεις → Η βιβλιοθήκη

**Files:**
- Create: `src/routes/staff/library-settings.js`, `src/views/next/staff/library-settings.ejs`
- Modify: `src/routes/staff/index.js`, `src/views/next/staff/settings.ejs`, `src/lib/i18n.js`
- Test: `test/library-settings.test.js`

**Interfaces:**
- Consumes: everything from Tasks 1 and 2; `requireAdmin` as used by the existing staff user routes in `src/routes/staff/users.js`.
- Produces: `GET /staff/settings/library`, `POST /staff/settings/library`, `POST /staff/settings/library/icon/remove`.

- [ ] **Step 1: Write the failing tests** in `test/library-settings.test.js`

```js
describe('the library settings page', () => {
  it('refuses a librarian', async () => {});          // spec §7.6, admin-only
  it('admits an admin', async () => {});
  it('shows the current name, icon and loan period', async () => {});
  it('saves a new name and shows it in the bar on the next page', async () => {});
  it('replaces the icon and deletes the old files', async () => {});
  it('removes the icon and falls back to the committed SVG', async () => {});
  it('refuses a blank name and keeps the old one', async () => {});
  it('refuses a loan period outside 1..365', async () => {});
  it('requires a CSRF token', async () => {});
  it('is reachable from the settings hub', async () => {
    // GET /staff/settings links to /staff/settings/library
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/library-settings.test.js`
Expected: FAIL — 404

- [ ] **Step 3: Implement the routes**

Same three fields as the wizard, no steps. Replacing the icon removes the previous files with `removeBrandIcon` after the new one is written, never before.

- [ ] **Step 4: Write the page and add the hub card**

A card in `src/views/next/staff/settings.ejs` beside Categories, Authors, Account and Users, following the existing card markup exactly.

- [ ] **Step 5: Run the tests**

Run: `node --test test/library-settings.test.js && npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/staff/library-settings.js src/views/next/staff/library-settings.ejs src/routes/staff/index.js src/views/next/staff/settings.ejs src/lib/i18n.js test/library-settings.test.js
git commit -m "Let an administrator rename the library and change its icon"
```

---

## Task 7: `docs/deploy.md`

**Files:**
- Create: `docs/deploy.md`
- Modify: `README.md`

**Interfaces:** none — documentation.

- [ ] **Step 1: Write `docs/deploy.md`**

Move the README's "Production deployment", "Updating", "Backup and restore", "Rolling back" and "Troubleshooting" sections into it, as a numbered walkthrough for the admin. Changes required by this work:

- Step 3 of the install no longer runs `create-admin`: it runs `npm run migrate` and stops.
- A final step: **send the teacher the link.** Say what they will see and that they create the account themselves.
- A "Setting it up in the browser" section describing the three steps from the teacher's side.
- `create-admin` kept, under a heading saying when it is still the way in: no browser, the teacher never arrives, every account locked out.
- The precedence paragraph from spec §7.2, in plain words: once the name or the loan period is set in the browser, the matching `.env` variable no longer has any effect.
- The development note from spec §10: `DATABASE_PATH=./data/demo.db npm run dev` to see the wizard on a database that already has accounts.

- [ ] **Step 2: Replace those README sections with a link**

The README keeps its overview, requirements and development setup, and links to `docs/deploy.md` where the moved sections were. One guide, one place.

- [ ] **Step 3: Check every command in the guide runs**

Run the ones that are safe locally: `npm run migrate`, `npm test`, `./scripts/backup.sh` into a temp directory, `npm run prune-covers -- --dry-run`.
Expected: each succeeds.

- [ ] **Step 4: Commit**

```bash
git add docs/deploy.md README.md
git commit -m "Write the deploy and update guide as its own document"
```

---

## Task 8: `next` becomes the default interface

The last task on purpose: the setup work lands with the suite green, so a failure here cannot be mistaken for a failure there. Spec §12.

**Files:**
- Modify: `src/lib/ui-flavour.js:17`, `test/ui-flavour.test.js`, `test/appearance.test.js`, `test/public.test.js`, `test/staff-catalogue.test.js`, `test/circulation.test.js`, `test/ui-holes.test.js`, `test/access-control.test.js`

**Interfaces:**
- Produces: `DEFAULT_FLAVOUR = 'next'`.

- [ ] **Step 1: Change the default and run the suite to see the damage**

Run: `npm test`
Expected: FAIL — 25 tests across 7 files, matching the table in spec §12. A different count means something changed since the measurement; investigate before touching any test.

- [ ] **Step 2: Fix `test/ui-flavour.test.js`**

Its four failures are assertions that the default is `classic`. They become assertions that it is `next`, plus one that `ui=classic` still resolves and still renders the old templates.

- [ ] **Step 3: Sort the remaining 21, one at a time**

For each: does the rule it asserts still apply to the new interface?

- **Yes** — re-point the assertion at the new markup. Most of `appearance.test.js` is here: header order, sign-out styling, one bar not two.
- **No, it is about the old interface** — add `ui=classic` to its request so it keeps testing what it was written for.

Commit after each file, so a bad judgement call is one `git revert` rather than an archaeology exercise.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, all 633 plus everything added by Tasks 1-6.

- [ ] **Step 5: Walk the site in a browser at `ui` unset**

Public home, `/books`, a book page, `/staff/login`, the dashboard, checkout. The suite cannot see a CSP refusal or a missing script tag; both have happened on this branch.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui-flavour.js test
git commit -m "Make the new interface the one a visitor gets by default"
```

---

## Verification

After Task 8, with a throwaway database, walk the whole thing as the two people it is for:

```bash
rm -f data/demo.db && DATABASE_PATH=./data/demo.db npm run migrate
DATABASE_PATH=./data/demo.db npm run dev
```

- As the admin: confirm the boot log says setup is unclaimed.
- As the teacher: open `/`, follow the link to `/staff`, land in setup, name the library, upload and crop an icon, remove one starter category and add one of your own, set the loan period, create the account, and arrive signed in on the dashboard.
- Confirm the name is in the browser tab and the bar, and the icon is the tab icon.
- Reload `/setup` — it must send you to the login page.
- Rename the library from Ρυθμίσεις → Η βιβλιοθήκη and confirm the bar follows.
- Do the whole wizard again with JavaScript disabled.
