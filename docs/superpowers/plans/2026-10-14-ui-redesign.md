# Second dsLib Interface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete second interface — every staff and public page — selectable per-visitor by a cookie, with the existing interface left byte-for-byte unchanged and still the default.

**Architecture:** One request hook reads a `ui` cookie (`classic` | `next`) and hangs the value on the request. Both existing render decorators (`reply.render`, `reply.renderStaff`) pass their template name through a single resolver that prefixes `next/` when the flavour is next **and** that template exists on disk, falling back to the classic template otherwise. No route learns about flavours. New templates live in `src/views/next/`, mirroring the existing tree, with their own stylesheet; nothing under `src/views/` or in `app.css` is edited.

**Tech Stack:** Node 24, Fastify 5, EJS via `@fastify/view`, `node:sqlite`, `node:test`. No new dependency, no build step, no client framework.

**Spec:** `docs/superpowers/specs/2026-10-14-ui-redesign-design.md`

## Global Constraints

- Default flavour is `classic`. Every existing test must pass unchanged, untouched.
- No file under `src/views/public/`, `src/views/staff/`, `src/views/layouts/`, `src/views/partials/`, or `src/public/css/app.css` is modified. Two deliberate exceptions, both additive: `src/views/staff/search.ejs` is a new classic file (Task 3), and Task 8 adds one footer link to two classic templates so the two interfaces can be reached from each other.
- No new runtime dependency, no bundler, no required client-side JavaScript.
- Palette: blue `#0086d4` leads and fills buttons; `#0071b3` for link text in running copy; orange `#fb6222` for the brand mark, the 2px active-nav rule, and `#9a3a06` on `#feeee6` badges. Orange never sits behind white text.
- Corners: `0` on panels, lists and cards; `4px` on buttons and inputs.
- Spacing scale: 4/8/12/16/24/32/48px.
- System font stack. No web font.
- No `text-transform: uppercase` anywhere — Greek capitals lose their accents.
- Light theme default; `data-theme="dark"` written server-side from the existing cookie.
- Every string is a key in both `el` and `en` dictionaries; `test/i18n.test.js` enforces parity.

## Review Focus

1. **A hostile `?ui=` value** (`?ui=../../../etc/passwd`, `?ui=next/../../..`) must never reach a template path. Pinned in Task 1.
2. **A `next/` template that does not exist yet** must render the classic one, not 500 — this is what lets the redesign land screen by screen. Pinned in Task 1.
3. **An empty or whitespace-only staff search** must return nothing, not the whole library. Pinned in Task 3.
4. **A signed-out request to `/staff/search`** must redirect to login and expose no borrower name. Pinned in Task 3.
5. **A search matching books but no readers (and vice versa)** must omit the empty group's heading rather than render an empty box. Pinned in Task 3.

---

## Task 1: UI flavour flag and view resolution

**Files:**
- Create: `src/lib/ui-flavour.js`
- Modify: `src/app.js` (template registration block ~199-211, the `onRequest` theme/lang hook ~241, the `render` decorator ~302)
- Modify: `src/routes/staff/index.js:49-51` (`renderStaff` decorator)
- Test: `test/ui-flavour.test.js`

**Interfaces:**
- Produces:
  - `UI_COOKIE = 'ui'`, `UI_FLAVOURS = ['classic', 'next']`, `DEFAULT_FLAVOUR = 'classic'`
  - `resolveFlavour(request): 'classic' | 'next'` — query `?ui=` wins and is persisted; else cookie; else default. Any value not in `UI_FLAVOURS` yields the default.
  - `resolveTemplate(flavour, template, { viewsRoot }): string` — returns `next/<template>` when flavour is `next` and `<viewsRoot>/next/<template>.ejs` exists, else `template` unchanged.
  - `request.uiFlavour` decorated on every request.

- [ ] **Step 1: Write the failing tests**

```js
// test/ui-flavour.test.js
describe('choosing an interface', () => {
  it('defaults to classic with no cookie and no query');          // GET / → body includes 'app.css', not 'next.css'
  it('switches to next and remembers it');                        // GET /?ui=next sets cookie ui=next; a second plain GET stays next
  it('switches back to classic');                                 // GET /?ui=classic
  it('ignores a flavour that is not on the list');                // '?ui=banana' → classic
  it('refuses to build a template path out of the query');        // '?ui=../../etc/passwd' → 200, classic, no traversal
  it('falls back to the classic template when next has no copy');  // flavour next + a route whose next/ view is absent → 200
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/ui-flavour.test.js`
Expected: FAIL — module `src/lib/ui-flavour.js` not found.

- [ ] **Step 3: Implement `src/lib/ui-flavour.js`**

`resolveFlavour` validates against the `UI_FLAVOURS` allow-list before use — the traversal test passes because an unknown string never reaches a path, not because a path is sanitised. `resolveTemplate` uses `fs.existsSync` on the composed path; the existence check is what makes the fallback work.

- [ ] **Step 4: Wire it into `src/app.js` and `src/routes/staff/index.js`**

Extend the existing `onRequest` hook (which already handles theme and lang) to set `request.uiFlavour` and the cookie, matching the cookie options already used there (`httpOnly`, `sameSite: 'lax'`, `secure: config.isProduction`, one year). Both `render` and `renderStaff` call `resolveTemplate` on their template argument and on their layout argument. Add `uiFlavour` and a `stylesheet` local (`/assets/css/app.css` or `/assets/css/next.css`) to the shared locals block at `src/app.js:277`.

- [ ] **Step 5: Run the new tests and the whole suite**

Run: `node --test test/ui-flavour.test.js` then `npm test`
Expected: new tests PASS; all 441 existing tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui-flavour.js src/app.js src/routes/staff/index.js test/ui-flavour.test.js
git commit -m "Add a per-visitor interface flavour, defaulting to the current one"
```

---

## Task 2: The next shell — layouts, chrome, stylesheet foundation

**Files:**
- Create: `src/public/css/next.css`
- Create: `src/views/next/layouts/public.ejs`, `src/views/next/layouts/staff.ejs`, `src/views/next/layouts/staff-plain.ejs`
- Create: `src/views/next/partials/topbar.ejs`, `src/views/next/partials/bottom-nav.ejs`, `src/views/next/partials/flash.ejs`, `src/views/next/partials/pagination.ejs`, `src/views/next/partials/field-error.ejs`
- Test: `test/next-shell.test.js`

**Interfaces:**
- Consumes: `request.uiFlavour`, the `stylesheet` local (Task 1).
- Produces: the layouts every later task renders into; CSS custom properties `--blue`, `--blue-text`, `--orange`, `--r-control: 4px`, the 4–48px spacing scale, and the component classes later tasks use: `.bar`, `.bar__brand`, `.bar__links`, `.bar__who`, `.tabbar`, `.panel`, `.list`, `.list__item`, `.field`, `.btn`, `.btn--ghost`, `.pill`, `.pill--warn`.
- Partials in `next/` include the **shared** icon set as `include('../../partials/icon', …)`; the icon partial is not duplicated.

- [ ] **Step 1: Write the failing tests**

```js
// test/next-shell.test.js
describe('the next shell', () => {
  it('serves its own stylesheet and not the old one');            // GET /?ui=next → 'next.css', no 'app.css'
  it('puts the brand left and the account right on staff pages');  // index of bar__brand < index of bar__who
  it('gives staff pages a bottom nav with the four main pages');   // tabbar present, 4 items, labelled
  it('marks the current page in the nav');                         // aria-current="page" on one item only
  it('keeps the language and theme controls off the staff bar');   // not inside .bar; present in footer
  it('sets no uppercase transform');                               // next.css has no text-transform:uppercase|capitalize
  it('still renders light by default and dark on request');        // data-theme absent; ?theme=dark → present
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/next-shell.test.js`
Expected: FAIL — `next.css` 404s, `.bar` absent.

- [ ] **Step 3: Write `src/public/css/next.css`**

Tokens, reset, and the component classes named above. The reset keeps `* { margin: 0 }` **and** pairs it with flow rules (`.panel > * + *`, `form > *:not([type="hidden"]) + .btn`) so spacing is not re-remembered pair by pair — this is the defect found on 2026-10-13. Bottom nav is `display: none` above 48rem; the desktop `.bar__links` are `display: none` below it.

- [ ] **Step 4: Write the three layouts and five partials**

Same contract as the classic layouts: `title`, `flash`, `staffUser`, `csrfToken` locals. The staff layout renders `topbar` and `bottom-nav`; the public layout renders `topbar` with the language and theme controls, and a footer carrying them on narrow screens.

- [ ] **Step 5: Run the tests**

Run: `node --test test/next-shell.test.js` then `npm test`
Expected: PASS; existing suite unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/public/css/next.css src/views/next test/next-shell.test.js
git commit -m "Next interface: shell, chrome and visual language"
```

---

## Task 3: Combined staff search

**Files:**
- Create: `src/db/queries/search.js`
- Create: `src/routes/staff/search.js`
- Create: `src/views/next/staff/search.ejs`, `src/views/staff/search.ejs`
- Modify: `src/routes/staff/index.js` (register the new route inside the protected scope)
- Test: `test/staff-search.test.js`

**Interfaces:**
- Consumes: `findLendableTitles(db, { q, limit })` from `src/db/queries/copies.js` (returns `{ book_id, book_title, authors, available_ids, barcodes, shelves, copy_count, available_count }`); `listBorrowers(db, { q, perPage })` from `src/db/queries/borrowers.js` (rows carry `open_loans`, `total_loans`, `overdue_loans`).
- Produces: `searchEverything(db, { q, limit = 20 }): { books: [...], borrowers: [...] }` — both empty arrays for a blank query. Route `GET /staff/search?q=` inside the authenticated scope.

- [ ] **Step 1: Write the failing tests**

```js
// test/staff-search.test.js
describe('one box for books and readers', () => {
  it('finds a title by name');                                   // q=οδυσ → books[0].book_title === 'Οδύσσεια'
  it('finds a reader by name');                                  // q=μαρια → borrowers[0].display_name
  it('finds both at once and keeps them apart');                 // q matching both → both arrays non-empty
  it('returns nothing for a blank query');                       // q='', q='   ' → { books: [], borrowers: [] }
  it('matches Greek regardless of case and accents');            // ΟΔΥΣΣΕΙΑ / οδύσσεια / οδυσσεια all match
});

describe('the staff search page', () => {
  it('omits a group that has no results');                       // books-only query → no ΑΝΑΓΝΩΣΤΕΣ heading
  it('offers Δανεισμός only when a copy is free');                // available_count 0 → 'Δείτε', not 'Δανεισμός'
  it('links a reader holding books to their return page');
  it('is refused to a signed-out visitor');                       // 302 to /staff/login, body carries no borrower name
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/staff-search.test.js`
Expected: FAIL — `searchEverything` not exported; `/staff/search` 404.

- [ ] **Step 3: Implement `searchEverything` in `src/db/queries/search.js`**

Composes the two existing query functions; returns early with empty arrays when `queryTokens(q)` is empty, which is what makes the blank-query test pass. No new SQL.

- [ ] **Step 4: Implement the route and both templates**

The route renders `staff/search` (the resolver picks `next/staff/search` for next). The classic template is plain and unlinked-to — it exists so the fallback rule has no hole, and it gives the classic interface the search-based return it currently lacks. The next template renders the two groups per the spec: book rows carry cover, title, author · shelf · barcode, availability pill and the primary action; reader rows carry initials, name, class, count held, and Επιστροφή.

- [ ] **Step 5: Run the tests**

Run: `node --test test/staff-search.test.js` then `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/queries/search.js src/routes/staff/search.js src/views/next/staff/search.ejs src/views/staff/search.ejs src/routes/staff/index.js test/staff-search.test.js
git commit -m "Search books and readers from one box"
```

---

## Task 4: Next staff home and the lending flow

**Files:**
- Create: `src/views/next/staff/dashboard.ejs`, `checkout.ejs`, `checkin.ejs`, `loans.ejs`, `borrowers.ejs`, `borrower.ejs`
- Test: `test/next-staff-flow.test.js`

**Interfaces:**
- Consumes: the locals each existing route already passes (`src/routes/staff/dashboard.js`, `loans.js`, `borrowers.js`) — **no route is modified**. `next/staff/dashboard.ejs` ignores the dashboard statistics it is handed and renders the search field instead; that is what makes the home a search without touching the route.

- [ ] **Step 1: Write the failing tests**

```js
describe('a teacher working a shift in the next interface', () => {
  it('lands on a search field, not a dashboard');       // GET /staff?ui=next → form action="/staff/search", no .stat-grid
  it('lends a copy found by searching');                // search → Δανεισμός → borrower → 302, loan exists
  it('returns a book found by the reader’s name');      // search → reader → Επιστροφή → loan closed
  it('keeps the multi-copy basket working');            // two copies selected → one borrower → 2 loans
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `node --test test/next-staff-flow.test.js`

- [ ] **Step 3: Write the six templates**

Reuse the behaviour already proven by `test/circulation.test.js` and `test/ui-holes.test.js`: same field names, same URLs, same basket-in-the-query-string mechanism. Only the markup is new.

- [ ] **Step 4: Run the tests**

Run: `node --test test/next-staff-flow.test.js` then `npm test`

- [ ] **Step 5: Commit**

```bash
git add src/views/next/staff test/next-staff-flow.test.js
git commit -m "Next interface: the staff home is the search, and the shift runs from it"
```

---

## Task 5: Next staff lists, forms and confirmations

**Files:**
- Create: `src/views/next/staff/book-list.ejs`, `book-form.ejs`, `book-delete.ejs`, `copies.ejs`, `copy-delete.ejs`, `categories.ejs`, `category-delete.ejs`, `authors.ejs`, `users.ejs`, `account.ejs`, `settings.ejs`, `borrower-delete.ejs`, `borrower-anonymize.ejs`, `login.ejs`, `forbidden.ejs`
- Test: `test/next-staff-pages.test.js`

**Interfaces:**
- Consumes: the locals each existing staff route passes. No route changes.

- [ ] **Step 1: Write the failing test**

```js
describe('every staff page in the next interface', () => {
  it('renders each one', async () => { /* table-driven over the staff routes, each 200 */ });
  it('caps the width of every search field');            // the full-bleed borrower search was the complaint
  it('keeps every form one column with its submit set apart');
  it('shows the copies table as one form with one save');
  it('offers checkboxes, never a multiple-select');      // no <select multiple> anywhere in next/
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Write the fifteen templates**

- [ ] **Step 4: Run the tests, then the whole suite**

- [ ] **Step 5: Commit**

```bash
git add src/views/next/staff test/next-staff-pages.test.js
git commit -m "Next interface: the rest of the staff pages"
```

---

## Task 6: Next public pages, with the grid/list switch

**Files:**
- Create: `src/views/next/public/home.ejs`, `search.ejs`, `book.ejs`, `categories.ejs`, `authors.ejs`, `collection.ejs`, `error.ejs`
- Create: `src/views/next/partials/book-row.ejs`, `book-tile.ejs`, `filters.ejs`
- Modify: `src/lib/ui-flavour.js` (add the view-mode cookie alongside the flavour cookie)
- Test: `test/next-public.test.js`

**Interfaces:**
- Produces: `VIEW_COOKIE = 'view'`, `VIEW_MODES = ['list', 'grid']`, `DEFAULT_VIEW = 'list'`, `resolveViewMode(request)` — same allow-list shape as `resolveFlavour`, set by `?view=`, read from the cookie, defaulting to `list`.

- [ ] **Step 1: Write the failing tests**

```js
describe('the public catalogue in the next interface', () => {
  it('shows a list by default');                         // .list present, .grid absent
  it('switches to a grid and remembers it');             // ?view=grid sets cookie; next plain request stays grid
  it('ignores a view mode that is not on the list');     // ?view=banana → list
  it('keeps the search term and filters across the switch');
  it('shows a count of available copies, not a row per copy');
  it('shows no borrower name, due date or barcode');     // the privacy guarantee, restated against the new markup
});
```

- [ ] **Step 2: Run them and watch them fail**

- [ ] **Step 3: Implement `resolveViewMode` and the ten templates**

The switch is two links carrying the current query string, not a control that needs script.

- [ ] **Step 4: Run the tests, then the whole suite**

- [ ] **Step 5: Commit**

```bash
git add src/views/next/public src/views/next/partials src/lib/ui-flavour.js test/next-public.test.js
git commit -m "Next interface: public catalogue, list or grid"
```

---

## Task 7: Responsive and accessibility pass over the new interface

**Files:**
- Modify: `src/public/css/next.css`
- Modify: `test/accessibility.test.js` (extend the existing table of pages to cover each page twice, once per flavour)
- Modify: `scripts/spacing-probe.js` (append `?ui=next` to each probed URL)

- [ ] **Step 1: Extend the accessibility table to the next flavour and run it**

Run: `node --test test/accessibility.test.js`
Expected: FAIL on whatever the new markup gets wrong — labels, heading order, scoped headers.

- [ ] **Step 2: Fix what it reports, in the templates**

- [ ] **Step 3: Run the spacing probe at 1100px and 375px against `?ui=next`**

Paste `scripts/spacing-probe.js` into the browser console on the running site.
Expected: "all clear" at both widths. Fix in `next.css` and repeat — this cannot be checked by `npm test`.

- [ ] **Step 4: Check the four screens by eye at both widths**

Staff search, lending, public catalogue in both modes, public book page.

- [ ] **Step 5: Run the whole suite and commit**

```bash
git add src/public/css/next.css src/views/next test/accessibility.test.js scripts/spacing-probe.js
git commit -m "Next interface: responsive and accessibility pass"
```

---

## Task 8: Make it switchable without typing a URL

**Files:**
- Modify: `src/views/layouts/public.ejs`, `src/views/partials/staff-topbar.ejs` — **the only edits to classic templates in this plan**
- Modify: `src/views/next/partials/topbar.ejs`
- Test: `test/ui-flavour.test.js` (extend)

- [ ] **Step 1: Write the failing test**

```js
it('offers a way back and forth between the two interfaces');  // each flavour's footer links to the other
```

- [ ] **Step 2: Add a single footer link in each flavour**

"Δοκιμάστε τη νέα εμφάνιση" / "Επιστροφή στην παλιά εμφάνιση", with the `el` and `en` keys to match. A footer link, not a header control: this is a temporary experiment, not a feature.

- [ ] **Step 3: Run the whole suite and commit**

```bash
git commit -am "A way between the two interfaces"
```

---

## Notes for whoever executes this

- Tasks 4, 5 and 6 are each a pile of templates with one test file. If a task feels too big to hold at once, split it by file — the tests are table-driven and will tell you what is still missing.
- Nothing in this plan changes a query, a route's behaviour, or a URL, except the one new route in Task 3.
- When the experiment is judged: if next wins, classic is deleted and `next/` is promoted in one commit; if it loses, `src/views/next/`, `next.css` and `ui-flavour.js` come out and nothing else is touched. Keeping both indefinitely is the failure mode the spec names.
