# First-run setup in the browser, and a deployment guide

**Date:** 2026-10-18
**Branch:** `ui-redesign`
**Status:** design, awaiting approval

---

## 1. Intent and why

Today a fresh dsLib deployment can only be made usable from a shell. The
library's name lives in `LIBRARY_NAME` in `.env`, the icon is a committed SVG in
the source tree, and the first account exists only after someone runs
`npm run create-admin` over SSH.

That suits one person doing everything. It does not suit the way this will
actually be deployed, which George described plainly:

> An admin deploys, and a teacher goes through the browser setup.

Two people, two different sets of skills. The admin does the parts that need a
terminal — clone, `.env`, systemd, Nginx, certificate — and then sends the
teacher a link. Everything the *library* needs to describe itself, the teacher
does in a browser: its name, its icon, the categories it files books under, how
long a child keeps a book, and the account they will sign in with from then on.

A second consequence: once a teacher can set the name and the icon, they must be
able to change them later too, without going back to the admin. So the same
values get a permanent home in the staff settings area, and the wizard is just
the first time they are filled in.

---

## 2. Goals

- A teacher who has never opened a terminal can take a freshly deployed library
  from "empty" to "I am signed in and can add a book" using only a link.
- Library name and icon are editable afterwards, by the teacher, in Ρυθμίσεις.
- A deployment that exists today keeps working, unchanged, with nothing to
  migrate by hand.
- The deploy and update guide tells the admin exactly where their job ends and
  the teacher's begins.

## 3. Non-goals

- No change to how the admin installs the application. systemd, Nginx and
  certbot stay exactly as documented.
- No multi-school or multi-tenant anything. One deployment, one library.
- No theming beyond the icon: no colour pickers, no CSS in the database.
- Nothing is built for the `classic` interface (see §4.1).
- `create-admin` is not removed, not deprecated, and keeps working.

## 4. Anti-goals — what would make this a failure even if it worked

- **A second way to configure the library that silently disagrees with the
  first.** If `.env` says one name and the database says another and the pages
  show a third, this has made the project worse. §6.2 defines one precedence
  rule, and the README states it in a sentence.
- **A setup page that can be reached after setup.** A `/setup` that still
  answers once the library is in use is a way to create an administrator from
  the open internet.
- **An upgrade that breaks George's live deployment.** It has real accounts, a
  real catalogue and a real `.env`. Deploying this must change nothing visible
  there until he chooses to change it.
- **A wizard that cannot be finished without JavaScript.** Every other form in
  this project works with scripting off; this one is the worst possible place to
  break that, because it is the one form a person meets before they trust the
  software.

### 4.1 One interface only

The wizard is built in `src/views/next` only. `classic` is retiring, and the
standing instruction is not to build it features. `DEFAULT_FLAVOUR` is still
`classic`, so `/setup` renders `next` templates regardless of the `ui` cookie —
it is the one place in the app that ignores the flavour. See the open question
in §11 about what the teacher should land in *after* finishing.

---

## 5. Constraints

Inherited from the project and unchanged:

- Node 24, Fastify 5, EJS, `node:sqlite`. **No new dependencies** — the icon
  work uses `jimp`, which is already a dependency for covers.
- CSP: `style-src 'self'` (no inline styles), `img-src 'self' data:` (no
  `blob:`), `frame-ancestors 'none'`.
- Every form works with scripting off; `src/public/js/app.js` only enhances.
- Greek-first copy, written the way a Greek librarian says it out loud.
- Minimum password length is 8, with the existing blocklist.
- All SQL lives in `src/db/queries/`.
- No destructive changes to existing server services without George's approval.

---

## 6. The parts George decided

### 6.1 Shape of the wizard

Three steps, approved from mockups. The final reference is
`.superpowers/brainstorm/201733-1792323661/content/setup-final.html`.

| Step | Heading | Fields |
|---|---|---|
| 1 | Η βιβλιοθήκη σας | icon (large square tile, centred, on top), then library name |
| 2 | Κατηγορίες και δανεισμός | category list you edit, default loan period |
| 3 | Ο λογαριασμός σας | username, display name, password, confirm password |

Decided details:

- **Icon on top, name below**, "like GNOME or macOS setup" — but in this app's
  style: square panel, square orange mark, 4px only on buttons and inputs, blue
  for what you click, orange as the rule.
- **Progress is `ΒΗΜΑ 1 ΑΠΟ 3` over a three-segment orange rule**, not dots.
- **Labels are left-aligned**, like every other form in the app. Only the icon
  tile is centred.
- **The name example goes inside the box as a placeholder**, like the other
  fields: `5ο Γυμνάσιο Ηρακλείου Αττικής`. Not a hint line above it.
- **Loan period label is just `Προεπιλεγμένη διάρκεια δανεισμού`.** The
  parenthetical "(μπορεί να αλλάξει ξεχωριστά)" was cut.
- **Display-name placeholder is plain `Μαρία`**, not a full name.
- **No note on step 3 about the page closing permanently.** Cut as unnecessary.
- **Categories are a list you build, not a menu you pick from.** A few are
  there to begin with, each removable with a `×`, and a text field adds your
  own on the spot. Keep it short — not a long checklist.
- Step 3's button is `Έτοιμο`; steps 1 and 2 use `Συνέχεια`, with `Πίσω` on 2
  and 3.

### 6.2 No setup code in the link

Raised as a security concern and settled by George:

> When you freshly deploy the library — there are no data. So even if someone
> claims it first, he won't really do anything and probably an admin will
> sometimes make the first account through the web interface.

So: **the admin sends a plain link.** `/setup` is open whenever the library has
no staff accounts, with no token and nothing to copy from the server. The
builder must not add one.

The compensating measures below are the author's call, not George's, and cost
the teacher nothing (§7.4).

---

## 7. The parts left to the builder, with the author's calls marked

### 7.1 Where the settings live

New migration `005_settings.sql`:

```sql
CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Keys used: `library_name`, `library_icon`, `default_loan_days`,
`setup_completed_at`. A key/value table rather than columns because these are
unrelated single values with no relations to anything; follow the house style
in `src/db/queries/` and add `src/db/queries/settings.js`.

### 7.2 Precedence — the one rule

For each setting, in order:

1. the row in `setting`, if present;
2. the environment variable (`LIBRARY_NAME`, `DEFAULT_LOAN_DAYS`);
3. the existing schema default in `src/config.js`.

This is what keeps George's deployment untouched: it has no `setting` rows, so
it keeps reading `.env` exactly as today. The first time someone saves the name
in the browser, a row appears and the environment variable stops mattering.

**The README must say that in plain words**, as its own short paragraph: once
the name or the loan period is set in the browser, the matching `.env` variable
no longer has any effect. A configuration that is read in two places and
explained in none is the anti-goal in §4.

Implementation note: `config.libraryName` is read in one place
(`src/app.js:361`, the shared template locals) and `defaultLoanDays` in the
loan routes. Resolve both through the new settings module so there is one
place to forget rather than several. Cache the resolved values in process and
invalidate on write — one process, one SQLite file, so a plain memo is enough.

### 7.3 The icon

- Accept PNG or JPEG through the existing `@fastify/multipart` setup, subject
  to `MAX_UPLOAD_BYTES`.
- Square-crop and resize with `jimp`, reusing `src/lib/upload.js` rather than
  writing a second image pipeline. Write PNGs at 32, 180 and 512 px.
- Store under `config.uploadDir` in an `icons/` directory, served read-only by
  a third `@fastify/static` instance at prefix `/brand/` — mirroring how
  `covers/` is already served in `src/app.js:255-265`.
- Reuse the crop-and-move control built for book covers
  (`enableCoverCropper` in `src/public/js/app.js`). With scripting off, the
  upload still works and is centre-cropped to a square on the server.
- All six layouts currently hard-code
  `<link rel="icon" href="/assets/icon.svg">`. Replace with one partial so a
  new layout cannot miss it. Also answer `/favicon.ico` with the 32 px file,
  because browsers ask for it whether or not the markup mentions it.
- No custom icon means the committed `src/public/icon.svg` and the current
  orange book mark, exactly as now.
- **The uploaded icon replaces the orange mark in the top bar as well as the
  browser tab.** Shown in the mockups and not objected to.

### 7.4 Gating `/setup`

- Open **iff the library has no staff accounts** (`listStaff(db).length === 0`).
  Accounts, not the `setup_completed_at` row, are the gate — the condition that
  matters is "can anybody sign in", and it cannot drift from the truth.
- When open: `/staff/login` redirects to `/setup`, so a teacher who was sent
  the wrong link still arrives somewhere useful.
- When closed: `/setup` redirects to `/staff/login`. No 404, no explanation —
  there is nothing private to protect and nothing useful to say.
- `/setup` sits outside the staff authentication scope but inside the existing
  CSRF and rate-limit protection.

**Author's calls, for visibility rather than security** (George's reasoning in
§6.2 is accepted; none of these add a step for the teacher):

- The account created by `/setup` is written to the audit log with its request
  address, action `staff.create`, `detail.via = 'setup'`.
- `setting.setup_completed_at` is stamped when step 3 succeeds.
- On boot, the server logs one line saying whether setup is still unclaimed, so
  an admin can tell at a glance whether the teacher got there first.

### 7.5 Steps persist as they go

Each step POSTs, writes, and redirects to the next. There is no wizard state in
the session and no draft table.

- Step 1 writes `library_name` and, if given, the icon.
- Step 2 creates the categories through the existing
  `createCategory` in `src/db/queries/categories.js` — including its
  normalized-duplicate refusal, so `ιστορια` cannot be added beside `Ιστορία` —
  and writes `default_loan_days`.
- Step 3 creates the admin account through the existing `createStaffUser`,
  signs the teacher in, and redirects to the staff dashboard.

Consequences the builder should keep:

- An interrupted setup resumes. Setup is still open (no account yet), and each
  step prefills from what was saved, so `/setup` can simply redirect to step 1.
- The irreversible act is last and on its own. A rejected password cannot lose
  the name, the icon or the categories.
- `Πίσω` is a plain link to the previous step, not history manipulation.

**Adding a category must work with scripting off.** The `Προσθήκη` button
submits the step, which re-renders with the new category present. With
scripting on it appears immediately, following the pattern already built for
creating a category from the book form.

### 7.6 Afterwards: Ρυθμίσεις → Η βιβλιοθήκη

A new card on the existing settings hub (`src/views/next/staff/settings.ejs`,
which already lists Categories, Authors, Account and Users) leading to
`/staff/settings/library`: library name, icon (change or remove), default loan
period. Same fields as the wizard, no steps.

**Author's call:** admin-only, like the Users card. Changing what the school's
library is called is not a per-librarian preference.

### 7.7 The guide

**George's call: the guide is its own document, not the README** — "τα readme
είναι μόνο για github". So `docs/deploy.md` becomes the real deploy and update
guide, written for the admin who is doing it.

- Move the existing README sections "Production deployment", "Updating",
  "Backup and restore", "Rolling back" and "Troubleshooting" into
  `docs/deploy.md`, as a numbered walkthrough an admin follows top to bottom.
- The walkthrough ends with **send the teacher the link**, and says plainly
  that creating the first account is no longer a step they do.
- Add a "Setting it up in the browser" section describing the three steps from
  the teacher's side, so the admin knows what they are handing over.
- Keep `create-admin` documented as the way in when there is no browser, when
  the teacher never arrives, or when every account is locked out.
- Add the §7.2 precedence paragraph.
- "Updating" stays as it is — `git pull`, `npm ci`, restart, migrations run on
  boot — checked against a database that now has a `setting` table.
- The README keeps its overview and its development setup, and **links** to
  `docs/deploy.md` where those sections used to be. One guide, one place, so
  the two cannot drift.

### 7.8 Tests

Written first, in the house style (`node:test`, throwaway databases). At
minimum:

- precedence: row beats env beats default, for both settings;
- `/setup` open with no accounts, redirecting once one exists;
- `/staff/login` redirects to `/setup` while open;
- each step persists, and an interrupted run resumes with values prefilled;
- step 3 creates exactly one admin, signs in, writes the audit row, and closes
  setup;
- a rejected password on step 3 keeps the name, icon and categories;
- adding a category with no JavaScript; a normalized duplicate refused;
- icon upload produces all three sizes; `/favicon.ico` serves the 32 px file;
  no custom icon falls back to the committed SVG;
- every layout links an icon (the same shape of test that caught
  `staff-plain.ejs` not loading `app.js`);
- the library settings page refuses a librarian and admits an admin.

---

## 8. Greek copy

Settled with George, to be used verbatim:

| Where | Text |
|---|---|
| Top bar, during setup | `Εγκατάσταση` |
| Step 1 heading | `Η βιβλιοθήκη σας` |
| Step 1 lead | `Το όνομα και το εικονίδιο φαίνονται στην μπάρα πάνω και στην καρτέλα του browser.` |
| Name label / placeholder | `Όνομα βιβλιοθήκης` / `5ο Γυμνάσιο Ηρακλείου Αττικής` |
| Icon button / hint | `Επιλογή εικόνας…` / `PNG ή JPG. Θα κοπεί σε τετράγωνο.` |
| Step 2 heading | `Κατηγορίες και δανεισμός` |
| Step 2 lead | `Βάλτε τις κατηγορίες που χρησιμοποιείτε. Προσθέτετε κι άλλες όποτε θέλετε.` |
| Category add | `Προσθήκη κατηγορίας…` / `Προσθήκη` |
| Loan period label | `Προεπιλεγμένη διάρκεια δανεισμού` + `ημέρες` |
| Step 3 heading / lead | `Ο λογαριασμός σας` / `Με αυτόν μπαίνετε στο προσωπικό.` |
| Step 3 fields | `Όνομα χρήστη` (`maria`), `Ονοματεπώνυμο` (`Μαρία`), `Κωδικός` (`Τουλάχιστον 8 χαρακτήρες.`), `Επιβεβαίωση κωδικού` |
| Buttons | `Συνέχεια`, `Πίσω`, `Έτοιμο` |

Starter categories: `Λογοτεχνία`, `Ιστορία`, `Επιστήμες`, `Παιδικά`.

English equivalents go in `src/lib/i18n.js` alongside, as every string does.

---

## 9. What this does not change

Stated explicitly because of the standing instruction about existing services:

- No existing route changes behaviour, except `/staff/login`, which gains a
  redirect that can only fire when the library has no accounts at all.
- No existing table is altered. One new table.
- `.env` keeps working. No variable is removed or renamed.
- `create-admin` is untouched.
- The `classic` interface is untouched.

## 10. Trying it out

George's own database has accounts, so the wizard will never appear there — he
will see the new Ρυθμίσεις page instead. To see the wizard, run against a
throwaway database:

```bash
DATABASE_PATH=./data/demo.db npm run dev
```

The builder should leave that line in the README's development section.

---

## 11. Settled while reviewing this document

Questions a builder would hit that do not change what gets built. Listed so
they can be checked rather than rediscovered.

- **The library name is required** — non-empty after trimming, at most 120
  characters. An unnamed library would show an empty bar and a blank browser
  tab, so there is no sensible silent fallback.
- **The loan period reuses the existing bounds** from `src/config.js`: an
  integer from 1 to 365.
- **No email field in the wizard.** `create-admin` asks for one and treats it
  as optional; the teacher can add it later on their account page. One less box
  on the step that already has four.
- **PNG and JPEG only for the icon**, matching what `sniffImageType` already
  recognises. No SVG: it is a document that can carry script, and it would be
  served from our own origin.
- **`setting.library_icon` stores a base filename**, validated on read with
  the existing `isSafeStoredName` — the same guard the cover work needed after
  a stored name turned out to be attacker-controllable.
- **Removing the icon** deletes the three generated files and restores the
  committed `src/public/icon.svg`. It does not leave a blank mark.
- **The icon appears wherever the mark appears** — the public bar and the staff
  bar, not just the browser tab.
- **`/setup` uses the plain layout** (`next/layouts/staff-plain.ejs`) with a
  flag that swaps the "view public site" link for `Εγκατάσταση`, rather than a
  fourth layout to keep in sync.
- **The theme and language links stay in the footer during setup.** A teacher
  who wants the wizard in English should be able to have it.
- **The audit row's actor is the new account itself**, as `create-admin`
  already does — there is no earlier actor to attribute it to.

## 12. Answered: `next` becomes the default interface

Asked, because it changes existing behaviour on a live deployment. George's
answer: **make `next` the default.** `DEFAULT_FLAVOUR` in
`src/lib/ui-flavour.js` changes from `classic` to `next`. `classic` stays
reachable with `ui=classic` and is not deleted.

**Measured cost, not estimated.** The one-line change was applied and the suite
run: **25 tests fail across 7 files**, out of 633.

| File | Failing | What they assert |
|---|---|---|
| `appearance.test.js` | 9 | header/footer order, sign-out styling, staff bar structure |
| `ui-flavour.test.js` | 4 | that the default is `classic` — these *should* change |
| `public.test.js` | 4 | home page search box, header category links |
| `staff-catalogue.test.js` | 3 | prefilled values after a rejected form, author merge |
| `circulation.test.js` | 3 | overdues on the dashboard, the borrower privacy note |
| `ui-holes.test.js` | 1 | error summaries naming the reason |
| `access-control.test.js` | 1 | — |

None of these look like defects in `next`. They are assertions written against
classic markup whose *intent* mostly still applies, so each needs a judgement
call: re-point it at the new interface, or pin it to `ui=classic` because it is
genuinely about the old one. That is real work and it is not setup work.

**Therefore it is the last phase of the plan, not the first.** Setup is built
and landed against the current default, where the whole suite is green; the
flip and its test surgery happen afterwards in their own commit, so a problem
in one cannot be confused for a problem in the other. Until the flip lands,
step 3 of the wizard sets the `ui=next` cookie, which means the teacher lands
in the new interface either way and the flip changes nothing about the wizard.
