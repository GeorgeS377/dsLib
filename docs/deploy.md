# Deploying and updating dsLib

This is the guide for whoever puts dsLib on a server and keeps it running. It
assumes a shell, `sudo`, and Ubuntu Server with Nginx in front.

**It is not the guide for the person who runs the library.** That person needs
no terminal and no account from you: when you reach step 7 you send them a
link, and they name the library, give it an icon and create their own account
in a browser. Their side of it is described in
[Setting it up in the browser](#setting-it-up-in-the-browser) so you know what
you are handing over.

For what the application is and how to work on it, see the
[README](../README.md).

---

## Contents

- [Production deployment](#production-deployment)
- [Setting it up in the browser](#setting-it-up-in-the-browser)
- [Settings that move into the database](#settings-that-move-into-the-database)
- [When you still need `create-admin`](#when-you-still-need-create-admin)
- [Updating](#updating)
- [Backup and restore](#backup-and-restore)
- [Rolling back](#rolling-back)
- [Database migrations](#database-migrations)
- [Troubleshooting](#troubleshooting)

---

## Production deployment

> Nothing in this repository modifies a server. The files in `deploy/` are
> annotated examples to read and adapt, not scripts to run.

These instructions assume Ubuntu Server with Nginx in front. **If Nginx
already serves another site on that machine, back up `/etc/nginx` first and
add dsLib as a new site file — do not edit an existing one.**

### 1. Install the application

```bash
sudo useradd --system --home /opt/dslib --shell /usr/sbin/nologin dslib
sudo mkdir -p /opt/dslib
sudo chown dslib:dslib /opt/dslib

sudo -u dslib git clone <this repository> /opt/dslib
cd /opt/dslib
sudo -u dslib npm ci --omit=dev
```

### 2. Configure it

```bash
sudo -u dslib cp .env.example .env
sudo -u dslib nano .env          # see the table above
sudo chmod 600 .env              # the session secret lives here
```

Set at minimum: `NODE_ENV=production`, a real `SESSION_SECRET`,
`HOST=127.0.0.1`, `TRUST_PROXY=true`, and `LIBRARY_NAME`.

### 3. Create the database

```bash
sudo -u dslib npm run migrate
```

That is all. **Do not create an account here** — the person who will run the
library does that themselves in a browser, in step 7.

### 4. Run it as a service

```bash
sudo cp deploy/dslib.service.example /etc/systemd/system/dslib.service
sudo nano /etc/systemd/system/dslib.service      # check every path
sudo systemctl daemon-reload
sudo systemctl enable --now dslib
systemctl status dslib
curl -s localhost:3000/healthz
```

The example unit runs as an unprivileged account with `ProtectSystem=strict`,
a single writable directory (`data/`), a system-call filter, and
`IPAddressAllow=localhost` — so the port cannot be reached from off the
machine even if a firewall rule is wrong.

### 5. Put Nginx in front

```bash
sudo tar czf ~/nginx-backup-$(date +%F).tar.gz /etc/nginx    # first!
sudo cp deploy/nginx-dslib.conf.example /etc/nginx/sites-available/dslib
sudo nano /etc/nginx/sites-available/dslib                   # set server_name
sudo ln -s /etc/nginx/sites-available/dslib /etc/nginx/sites-enabled/dslib
sudo nginx -t                                                # before reloading
sudo systemctl reload nginx
```

### 6. Get a certificate

```bash
sudo certbot --nginx -d library.example.gr
```

### 7. Schedule backups

```bash
sudo crontab -u dslib -e
```

```cron
# Nightly at 02:30, keeping the last 30 days.
30 2 * * * cd /opt/dslib && ./scripts/backup.sh >> /opt/dslib/data/backup.log 2>&1
45 2 * * * find /opt/dslib/backups -maxdepth 1 -type d -name '20*' -mtime +30 -exec rm -rf {} +
# Weekly: delete cover images no title refers to.
15 3 * * 0 cd /opt/dslib && npm run prune-covers >> /opt/dslib/data/prune.log 2>&1
```

`npm run prune-covers` is safe to run while the site is up. Orphaned covers
come from book forms that were refused and then abandoned: the cover is stored
at the moment of refusal so the framing is not lost, and nothing points at it
if the form is never completed. The sweep only ever considers files matching
the name shape the application itself writes, and leaves anything newer than
24 hours alone in case a form is still open. `--dry-run` lists what it would
remove; `--hours N` changes the threshold.

Then **copy the backups off the machine**. A backup that lives only on the
server does not survive the server. `rsync`, `restic` or `rclone` to another
host or to object storage all work; the backup directory is self-contained.

### 8. Hand it to the teacher

Send them the address of the site — nothing else, no account, no password:

```
https://library.example.gr/
```

They will find a **Προσωπικό** link in the corner, which takes them to setup
because the library has no accounts yet.

**Until they finish, that page is open to anyone who can reach the site.** That
is deliberate: a library with no catalogue, no readers and no names is worth
nothing to a stranger, and the alternative — a code the teacher has to be sent
separately — is friction on the one day everything else is already new. The
server says so at every start until someone claims it:

```
WARN: This library has no staff accounts yet, so browser setup at /setup is
open to anyone who can reach it.
```

If you want to know who used it, the audit log records the claim with its
address:

```bash
sqlite3 /opt/dslib/data/library.db \
  "SELECT created_at, username, detail FROM audit_log WHERE action = 'staff.create';"
```

If someone other than your teacher got there first, the fix is
[`create-admin`](#when-you-still-need-create-admin) plus deactivating the
account they made.

### Do not do these

- Do not expose the database port — there isn't one. SQLite is a file.
- Do not expose `/staff` without authentication, even on a VPN or behind an
  Nginx `allow` rule. Authentication is the control; the rest is depth.
- Do not make `data/` web-readable. Nginx never serves it directly; the
  application serves cover images with explicit content types.
- Do not run as root.

---

---

## Setting it up in the browser

What the teacher sees, so you can talk them through it over the phone. Three
steps, each saved as they go — if they close the tab halfway, the link picks
up where they left off.

**1 — Η βιβλιοθήκη σας.** The library's name and its icon. The name appears in
the bar at the top of every page and in the browser tab; the icon becomes the
mark beside it and the tab icon. A school crest can be dragged and zoomed into
a square frame before it is uploaded. Both can be changed later in
**Ρυθμίσεις → Η βιβλιοθήκη**.

**2 — Κατηγορίες και δανεισμός.** The subjects books are filed under. Four are
there to start with and each can be removed; anything else the school shelves
is typed in. Also how many days a loan runs by default, which a librarian can
still override on any single loan.

**3 — Ο λογαριασμός σας.** Their username, name and password. This is the
administrator account, and creating it is what closes setup: the page stops
answering from that moment, and they are signed in without having to log in
again.

---

## Settings that move into the database

Two values in `.env` are only defaults for a library that has never been set
up:

| Variable | Replaced by |
|---|---|
| `LIBRARY_NAME` | **Ρυθμίσεις → Η βιβλιοθήκη**, "Όνομα βιβλιοθήκης" |
| `DEFAULT_LOAN_DAYS` | **Ρυθμίσεις → Η βιβλιοθήκη**, "Προεπιλεγμένη διάρκεια δανεισμού" |

**Once either has been saved in the browser, the matching `.env` variable no
longer has any effect.** Editing `.env` afterwards changes nothing, and that
is the intended behaviour rather than a bug — but it is worth knowing before
you spend an afternoon on it. A deployment that existed before this feature
has no stored values and keeps reading `.env` exactly as it always did, until
somebody saves something.

The library's icon has no `.env` equivalent at all; it is uploaded or it is
the one that ships with the application.

---

## When you still need `create-admin`

The script that creates an account from the shell is still here, still works,
and is the way in when the browser is not:

```bash
cd /opt/dslib
sudo -u dslib npm run create-admin
```

Use it when:

- **the teacher never arrives** and you would rather not leave setup open;
- **somebody else claimed setup** — make yourself an admin, then deactivate
  theirs from Ρυθμίσεις → Χρήστες;
- **every account is locked out or deactivated**, which closes the setup page
  (it only opens when there are *no* accounts) and leaves no other way in;
- **you are provisioning without a browser**, from a script.

It always prompts for the password and never takes one as an argument, because
command-line arguments are visible to other users through `ps` and end up in
shell history.

---

## Updating

```bash
cd /opt/dslib
sudo -u dslib ./scripts/backup.sh          # always first
sudo -u dslib git pull
sudo -u dslib npm ci --omit=dev
sudo systemctl restart dslib               # migrations run on boot
systemctl status dslib
curl -s localhost:3000/healthz
```

Migrations are applied automatically at startup, so the application can never
run against an out-of-date schema. If a migration fails the process exits with
the reason rather than starting in a broken state — see
[Rolling back](#rolling-back).

---

---

## Backup and restore

Two things need backing up: the database (`data/library.db`) and the uploaded
cover images (`data/uploads/covers/`). `scripts/backup.sh` does both.

### Taking a backup

```bash
./scripts/backup.sh                    # writes ./backups/<timestamp>/
./scripts/backup.sh /mnt/usb/dslib     # or somewhere else
```

Safe to run while the site is serving: the database is copied with SQLite's
own snapshot mechanism, which captures a consistent state including anything
still in the write-ahead log. A plain `cp` would not — it can capture a torn
write and produce a backup that only fails on the day you need it. Every
backup is integrity-checked immediately, and written mode `0600` because it
contains borrower names.

Each backup directory holds `library.db`, `covers/`, and a `MANIFEST.txt`
recording when it was taken and which migrations it contains.

### Restoring

```bash
sudo systemctl stop dslib              # restoring under a running app is unsafe
./scripts/restore.sh backups/20261012T143000Z
sudo systemctl start dslib
```

The restore script refuses a backup that fails its integrity check, moves the
current data aside into `backups/pre-restore-<timestamp>/` rather than
deleting it — so a mistaken restore is itself reversible — and applies any
migrations the restored database predates.

Add `--yes` to skip the confirmation prompt (for use in a script).

### Verifying a backup

```bash
node scripts/db-snapshot.js --check    backups/20261012T143000Z/library.db
node scripts/db-snapshot.js --versions backups/20261012T143000Z/library.db
```

Restore into a scratch directory once a term and confirm the catalogue looks
right. An untested backup is a guess.

---

## Rolling back

### A bad release, schema unchanged

```bash
cd /opt/dslib
sudo -u dslib git log --oneline -5
sudo -u dslib git checkout <previous-commit>
sudo -u dslib npm ci --omit=dev
sudo systemctl restart dslib
```

### A bad release that added a migration

There are deliberately no "down" migrations: on a database holding real
catalogue and loan records, reversing a schema change is more dangerous than
restoring a known-good snapshot. So restore the backup taken before the
update, then check out the matching code:

```bash
sudo systemctl stop dslib
./scripts/restore.sh backups/<the-one-from-before-the-update>
sudo -u dslib git checkout <the-commit-that-was-running>
sudo -u dslib npm ci --omit=dev
sudo systemctl start dslib
```

This is why the update procedure takes a backup first.

### A bad Nginx change

```bash
sudo nginx -t                                  # catches most mistakes
sudo tar xzf ~/nginx-backup-<date>.tar.gz -C /
sudo systemctl reload nginx
```

---

---

## Database migrations

Migrations are plain `.sql` files in `src/db/migrations/`, named
`NNN_description.sql` and applied in filename order. Each runs inside a
transaction and is recorded in a `schema_migrations` table, so running them
twice is a no-op.

```bash
npm run migrate        # apply anything outstanding, then print status
```

Two rules:

1. **Never edit an applied migration.** The runner records a checksum and
   refuses to start if a file has changed since it ran, because the schema in
   the database would no longer match the file. Add a new migration instead.
2. **Take a backup before applying a migration to real data.** The update
   procedure above does this for you.

Adding one: create `src/db/migrations/003_whatever.sql`, write forward-only
SQL, run `npm test`, then `npm run migrate`.

---

---

## Troubleshooting

**Signing in bounces straight back to the login page.**
Almost always `TRUST_PROXY`. Behind Nginx without `TRUST_PROXY=true`, the
session cookie is dropped and no session is established. Set it in `.env` and
restart. Check that Nginx sends `X-Forwarded-Proto $scheme`.

**`SESSION_SECRET must be set` at startup.**
Expected in production. Generate one with the command in
[Configuration](../README.md#configuration) and put it in `.env`.

**A librarian cannot sign in and says it worked yesterday.**
The account may be locked after repeated failures — it clears itself after 15
minutes. Or it may have been deactivated. Check:

```bash
sqlite3 data/library.db \
  "SELECT username, is_active, failed_login_count, locked_until FROM staff_user;"
```

**Greek search finds nothing it should find.**
The search index may be stale — it is rebuilt on every write, but a direct
database edit bypasses that. Run `npm run reindex`.

**The site arrives in dark mode.**
Someone used the toggle on that browser; it is stored in a `theme` cookie.
Switch it back with the toggle, or clear the cookie. The operating system's
dark setting has no effect — the stylesheet carries no `prefers-color-scheme`
rule at all.

**A copy cannot be found at the lending desk.**
Search by title or author rather than barcode: a copy added in bulk has no
barcode until someone types one in. The search box on `/staff/loans/checkout`
matches the same way the public catalogue does.

**A book shows as unavailable but is on the shelf.**
Either its copy's status is not `available` (check the copies page), or a loan
was never closed. The dashboard's on-loan count and
`/staff/loans?status=open` will show which.

**`database is locked`.**
Two processes are writing at once — usually a stray `npm run dev` alongside
the service. The application uses write-ahead logging and waits up to five
seconds, so this should be rare. `systemctl status dslib` and check for a
second process.

**`SQLITE_CANTOPEN` or permission errors on startup.**
The service account cannot write `data/`. Fix with
`sudo chown -R dslib:dslib /opt/dslib/data`.

**Cover uploads are rejected.**
Only JPEG, PNG and WebP are accepted, verified by file content rather than by
extension — an SVG or a renamed file is refused by design. The limit is
`MAX_UPLOAD_BYTES` (2 MB by default); Nginx's `client_max_body_size` must be
at least that.

**The site is fine but shows no books.**
The catalogue is empty, or every title is archived. `/staff/books` with the
*Archived* filter will show the latter.

---
