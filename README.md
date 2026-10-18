# dsLib — Σχολική Βιβλιοθήκη

A small library-management website for a school: a public catalogue anyone can
search without an account, and a password-protected staff area where
librarians manage titles, physical copies and lending.

The interface is Greek by default with an English toggle. Catalogue data is
stored in whatever language it was catalogued in.

- **Public** — `/` home and search, `/books` browse, `/books/:id` details,
  `/categories`, `/authors`
- **Staff** — `/staff` (sign-in required)

---

## Contents

- [What it does](#what-it-does)
- [Requirements](#requirements)
- [Development setup](#development-setup)
- [Running the tests](#running-the-tests)
- [Configuration](#configuration)
- [Deploying it](#deploying-it) — the full guide is [docs/deploy.md](docs/deploy.md)
- [Privacy: what is stored about borrowers](#privacy-what-is-stored-about-borrowers)
- [Security notes](#security-notes)
- [How it is put together](#how-it-is-put-together)
- [Troubleshooting](#troubleshooting)

---

## What it does

**Public catalogue** — search by title, author, ISBN, publisher, subject or
keyword; filter by category, author, year, language and availability; sort and
paginate. Greek search is case- and accent-insensitive, matches partial words,
and treats final sigma (`ς`) and medial sigma (`σ`) as the same letter, so
`ΟΔΥΣΣΕΙΑ`, `οδύσσεια` and `οδυσσεια` all find the same book.

Browsing happens on one page: the search box lives in the header and the
filters sit under the heading, always visible. Category, author and year take
several values at once — picking two subjects means "either", so a reader
after history *or* science gets both. Categories and authors also have their
own pages, linked from the footer, for deep links and bookmarks.

The interface is light by default. A toggle in the header switches to dark and
remembers the choice; the operating system's preference is deliberately not
consulted, because a school library is used in daylight on shared machines.

Availability is always derived from the physical copies and the open loans. It
is never a typed-in field, so what a student sees matches what is on the shelf.

**Staff area** — a dashboard with catalogue and circulation figures; create,
edit, archive and delete titles; manage copies with barcodes and shelf
locations; upload cover images; manage categories and authors (including
merging duplicates); check books out and in; track overdues; manage borrowers;
and, for administrators, manage staff accounts.

Lending works by searching for the book by title or author and picking a copy.
A barcode field sits beside it for a scanner, but barcodes are optional on a
copy, so search is the path that always works.

**Not built** (spec §12): student accounts or logins, public reservations,
fines or payments, barcode-scanner hardware integration, email or SMS
notifications, multiple branches, external identity providers.

---

## Requirements

- **Node.js 24 or newer** — nothing else. No database server, no Redis, no
  Docker, no build step.
- Roughly 100 MB of disk for the application, plus whatever the catalogue and
  cover images come to.

Every dependency is pure JavaScript. There is no native module, so the server
needs no C compiler and no `npm rebuild` after a Node upgrade.

The database is SQLite, through Node's built-in `node:sqlite`. For a school
library — thousands of titles, a handful of librarians — this is the right
tool: it is fully relational with foreign keys, constraints and indexes, it
backs up by copying one file, and there is no second service to keep running.
All SQL lives in `src/db/queries/`, so moving to PostgreSQL later would be a
contained change rather than a rewrite.

### On NixOS

A `shell.nix` is included:

```bash
nix-shell          # node 24, sqlite CLI, and a toolchain if ever needed
```

---

## Development setup

```bash
git clone <this repository> dslib
cd dslib
npm install

cp .env.example .env         # works unedited for local development
npm run migrate              # create data/library.db
npm run seed:demo            # optional: 15 demo titles, Greek and English
npm run create-admin         # create your sign-in — prompts for a password

npm run dev                  # http://localhost:3000, restarts on change
```

To see the **first-run setup** instead — the three browser steps a teacher
goes through on a fresh deployment — skip `create-admin` and point the app at
a throwaway database:

```bash
DATABASE_PATH=./data/demo.db npm run migrate
DATABASE_PATH=./data/demo.db npm run dev
```

A library with no staff accounts sends `/staff` to `/setup`. Your own
`data/library.db` is untouched.

`npm run seed:demo` creates **no** staff account and **no** borrowers. There
is no default password anywhere in this project: `create-admin` is the only
way an account comes into existence, and it always prompts.

### Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server with auto-reload |
| `npm start` | Production server |
| `npm test` | Full test suite |
| `npm run migrate` | Apply pending migrations and show status |
| `npm run seed:demo` | Add demo catalogue data (safe to re-run) |
| `npm run create-admin` | Create a staff account |
| `npm run reindex` | Rebuild the search index for every title |

---

## Running the tests

```bash
npm test
```

This runs the whole suite — the public catalogue, access control, validation,
circulation, privacy, and a real backup/restore round trip — in a few seconds
against throwaway databases. It never touches `data/library.db`.

```bash
node --test "test/public.test.js"            # one file
node --test --watch "test/**/*.test.js"      # watch mode
```

---

## Configuration

Configuration comes from `.env`, which is validated at startup — the
application refuses to boot on bad configuration rather than failing
confusingly later. See `.env.example` for the full annotated list.

The settings that matter in production:

| Variable | Notes |
|---|---|
| `NODE_ENV` | Set to `production`. Enables HSTS and strict secret checking. |
| `SESSION_SECRET` | **Required in production.** At least 32 random characters. Generate with the command below. |
| `HOST` | `127.0.0.1`, so the port is not reachable from outside the machine. |
| `PORT` | Default `3000`. |
| `TRUST_PROXY` | **`true` when behind Nginx.** See the warning below. |
| `DATABASE_PATH` | Default `./data/library.db`. |
| `UPLOAD_DIR` | Default `./data/uploads`. |
| `DEFAULT_LOAN_DAYS` | Loan period offered at checkout, **only until one is saved in the browser**. Default 14. |
| `LIBRARY_NAME` | The library's name, **only until one is saved in the browser**. See [docs/deploy.md](docs/deploy.md#settings-that-move-into-the-database). |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

> **`TRUST_PROXY` matters more than it looks.** Behind Nginx, the application
> sees plain HTTP unless it is told to trust `X-Forwarded-Proto`. Without
> `TRUST_PROXY=true` the staff session cookie is not marked `Secure`, and rate
> limiting sees Nginx's address instead of the visitor's — so one blocked
> address would block everyone. The application logs a warning at startup if
> it is running in production without it.

Secrets live only in `.env`. Nothing is committed: `.env` and `data/` are both
in `.gitignore`.

---

## Deploying it

Putting dsLib on a real server, keeping it updated, backups, rollbacks,
migrations and troubleshooting all live in one place:

**→ [docs/deploy.md](docs/deploy.md)**

The short version: an admin installs it, configures `.env`, runs
`npm run migrate`, puts it behind Nginx with a certificate — and then sends
the teacher who runs the library a link. That teacher names the library, gives
it an icon, picks its categories and creates the first account in a browser,
without needing a terminal or an account from anyone.

`npm run create-admin` still exists for the cases where the browser is not an
option; the guide says which those are.

---

## Privacy: what is stored about borrowers

The library confirmed the minimum it is allowed and needs to keep, and the
schema holds exactly that:

- a **display name**
- a **class or grade** (free text, e.g. `Β2`)
- an internal id, and timestamps

There is **no** date of birth, address, telephone number, email address or
school registry number, and **no student-facing account system**. The borrower
form's validation schema is strict about its shape, so a field added to the
HTML without being added to the schema is ignored rather than stored — there
is a test asserting exactly that.

Borrower data is visible only inside the authenticated staff area. No public
page or API reads the borrower or loan tables; `test/circulation.test.js`
checks every public route for borrower names and classes.

### Removing a borrower's data

Two actions, in the staff area under a borrower's record:

- **Anonymize** — replaces the name and class with a placeholder and keeps the
  loan history as anonymous rows, so the library's figures stay correct. This
  is the answer when a parent asks for their child's data to be removed.
  Irreversible, and refused while the borrower still has a book out.
- **Delete** — removes the record outright. Offered only when there is no loan
  history at all; otherwise the system directs you to anonymization.

### The audit log

Staff actions are logged to an `audit_log` table: who did what to which
record. It deliberately stores **no** passwords, session identifiers or
borrower names — a loan's borrower id is enough to trace an action, and the
application log redacts cookies and password fields.

If the school's retention policy calls for periodic purging of old loan
history, say so and it can be added as a documented command.

---

## Security notes

What is in place, and why:

**Authentication.** Passwords are hashed with scrypt from `node:crypto` at
OWASP parameters (N=32768, r=8, p=1), with a random salt per password and
constant-time comparison. Sessions are server-side rows in SQLite, so signing
out and session expiry genuinely revoke access rather than relying on the
browser to discard a cookie. The session cookie is `HttpOnly`, `SameSite=Lax`
and `Secure` over HTTPS. The session id is regenerated at sign-in, defeating
session fixation.

**Login.** Rate-limited by address, with a per-account lockout after repeated
failures, so neither one address nor one account can be hammered. Every
failure gives the same message, and an unknown username still runs a hash
computation — so neither the wording nor the timing reveals which usernames
exist.

**Authorization.** Staff routes are registered inside a single Fastify plugin
scope carrying the authentication hook, so a route is protected by virtue of
where it is registered — there is no per-route checklist to forget.
`test/access-control.test.js` walks the live route table and asserts that
every `/staff` route refuses an anonymous caller, so a route added later is
covered automatically. The guard re-reads the account on every request, so
deactivating an account takes effect at once.

**CSRF.** Every state-changing request requires a session-bound token. A token
from one session is rejected in another.

**Injection.** Every query is parameterized; no SQL is built from request
data. Sort orders come from a fixed whitelist. Templates escape by default and
no user data is rendered as raw HTML.

**Uploads.** Cover images are identified by magic bytes rather than by the
claimed extension or content type, so an SVG or a script named `.png` is
refused. Accepted images are re-encoded, which both strips metadata (a cover
photographed on a phone would otherwise carry its GPS coordinates) and
guarantees the bytes served are ours. Stored filenames are UUIDs, so an
uploaded filename cannot influence the write path.

**Headers.** A strict Content-Security-Policy with no `unsafe-inline` — the
application ships no inline script or style, and a test asserts the templates
never emit any — plus `nosniff`, `frame-ancestors 'none'`, a same-origin
referrer policy, and HSTS in production.

**Error handling.** Visitors see a generic page; stack traces, SQL and file
paths go to the log only. `/healthz` reports status without revealing
configuration.

### Reviewing what happened

```bash
journalctl -u dslib -f                  # application log
journalctl -u dslib --since "1 hour ago" | grep -i 'failed staff login'
```

```bash
sqlite3 data/library.db \
  "SELECT created_at, username, action, entity, entity_id FROM audit_log
   ORDER BY created_at DESC LIMIT 50;"
```

---

## How it is put together

```
src/
  server.js            entrypoint: migrate, then listen
  app.js               plugin registration, hooks, error handling
  config.js            environment validation
  db/
    index.js           connection, pragmas, transactions
    migrate.js         migration runner
    migrations/        numbered .sql files
    queries/           all SQL, one module per concern
  lib/
    normalize.js       Greek-aware search normalization
    password.js        scrypt hashing
    auth.js            the staff guard
    i18n.js            el/en interface text
    validation.js      zod schemas
    session-store.js   SQLite-backed sessions
    upload.js          cover image validation and processing
  routes/
    public/            the catalogue — no authentication
    staff/             the staff area — index.js holds the guard
  views/               EJS templates
  public/              CSS, one progressive-enhancement script, favicon
scripts/               create-admin, seed, reindex, backup, restore
test/                  the suite
deploy/                systemd and Nginx examples (documentation only)
data/                  the database and uploads (gitignored, never committed)
```

Two design decisions worth knowing before changing anything:

**Greek search needs a normalized column.** SQLite's `LIKE` and `lower()`
only fold ASCII — `lower('ΟΔΥΣΣΕΙΑ')` returns it unchanged. So every
searchable string is normalized in JavaScript (accents stripped, lowercased,
final sigma unified) into `book.search_text`, and the user's query goes
through the same function. Both sides agree because there is one function.
`book.title_norm` exists for the same reason: it sorts in correct Greek
alphabetical order under SQLite's default collation, which raw titles do not.
If you change how a book is written, call `rebuildSearchText`, or run
`npm run reindex`.

**Availability is derived, never stored.** A copy's `status` records its
physical condition (`available`, `repair`, `lost`, `withdrawn`). Whether it is
out on loan comes from the `loan` table. There is deliberately no `on_loan`
status, because two places recording the same fact is how they come to
disagree. The rule lives in one SQL fragment, `AVAILABLE_COPY` in
`src/db/queries/books.js`; use it rather than writing the condition again.

The database enforces its own rules rather than trusting application code: a
unique partial index makes it impossible to lend one copy to two people, and
`ON DELETE RESTRICT` makes it impossible to delete a copy, title or borrower
that has loan history.

### Progressive enhancement

Every page works with JavaScript disabled. Forms are plain GET or POST,
filters are server-rendered, and destructive actions use a confirmation page
rather than a dialog. `src/public/js/app.js` only makes things quicker —
auto-submitting filters, adding author rows, confirming before a delete. It is
loaded as an external file because the CSP allows no inline script.

---

## Troubleshooting

See [docs/deploy.md](docs/deploy.md#troubleshooting).

---

## Licence and credits

Built for a school library, to the specification in
`simple-school-library-spec.md`.
