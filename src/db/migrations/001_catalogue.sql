-- 001_catalogue: staff accounts, sessions, and the catalogue itself.
--
-- Conventions used throughout:
--   * Timestamps are TEXT in ISO-8601 UTC ('2026-10-12T09:30:00.000Z'), which
--     sorts correctly as text and is unambiguous in backups.
--   * Booleans are INTEGER 0/1 with a CHECK constraint.
--   * Every table that users edit has created_at and updated_at.
--   * Deletions that would orphan rows are prevented or cascaded explicitly;
--     nothing relies on application code to keep referential integrity.

-- ---------------------------------------------------------------- staff users
CREATE TABLE staff_user (
  id              INTEGER PRIMARY KEY,
  -- COLLATE NOCASE so 'Maria' and 'maria' cannot both be registered. This is
  -- ASCII-only folding, which is correct here: usernames are restricted to
  -- ASCII by validation precisely so that login is unambiguous.
  username        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  email           TEXT,
  -- Format: scrypt$N$r$p$salt_b64$hash_b64. Never a plaintext password.
  password_hash   TEXT    NOT NULL,
  display_name    TEXT    NOT NULL,
  role            TEXT    NOT NULL DEFAULT 'librarian'
                          CHECK (role IN ('admin', 'librarian')),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  -- Login throttling state. Cleared on a successful login.
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until    TEXT,
  last_login_at   TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0
                          CHECK (must_change_password IN (0, 1)),
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL
);

-- ------------------------------------------------------------------- sessions
-- Server-side sessions, so that logout and expiry genuinely end a session
-- rather than relying on the client discarding a cookie.
CREATE TABLE session (
  sid        TEXT    PRIMARY KEY,
  data       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL, -- epoch milliseconds, for cheap comparison
  created_at TEXT    NOT NULL
);

CREATE INDEX idx_session_expires ON session (expires_at);

-- ---------------------------------------------------------------------- books
CREATE TABLE book (
  id               INTEGER PRIMARY KEY,
  title            TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  subtitle         TEXT,
  -- Normalized title, used for alphabetical sorting. SQLite's default BINARY
  -- collation cannot order Greek correctly on raw titles (accents and case
  -- sort as separate code points), but it orders this column correctly: after
  -- normalization Greek is contiguous lowercase α(U+03B1)…ω(U+03C9) in
  -- alphabetical order, and Latin a–z likewise. So a plain ORDER BY works.
  title_norm       TEXT    NOT NULL DEFAULT '',
  -- Normalized haystack for search: accent-free, lowercase, final sigma
  -- folded. Built by src/lib/normalize.js from the title, authors,
  -- categories, publisher, ISBNs and description. SQLite cannot do this
  -- folding itself for Greek, which is why the column exists.
  search_text      TEXT    NOT NULL DEFAULT '',
  -- ISBNs are stored digits-only (no hyphens) so lookups are exact.
  isbn13           TEXT,
  isbn10           TEXT,
  publisher        TEXT,
  publication_year INTEGER CHECK (
                     publication_year IS NULL
                     OR (publication_year BETWEEN 1400 AND 2200)
                   ),
  edition          TEXT,
  language         TEXT,
  description      TEXT,
  -- Relative path under UPLOAD_DIR, never an absolute filesystem path.
  cover_path       TEXT,
  cover_thumb_path TEXT,
  -- Archiving is the soft-delete: archived titles vanish from the public
  -- catalogue but keep their copies and loan history.
  archived_at      TEXT,
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL
);

-- A partial unique index: an ISBN identifies an edition, so two active titles
-- must not share one. Archived titles are excluded so that archiving a record
-- frees its ISBN for re-cataloguing.
CREATE UNIQUE INDEX idx_book_isbn13_unique
  ON book (isbn13)
  WHERE isbn13 IS NOT NULL AND archived_at IS NULL;

CREATE INDEX idx_book_title       ON book (title_norm);
CREATE INDEX idx_book_archived    ON book (archived_at);
CREATE INDEX idx_book_year        ON book (publication_year);
CREATE INDEX idx_book_created     ON book (created_at DESC);
CREATE INDEX idx_book_language    ON book (language);

-- -------------------------------------------------------------------- authors
CREATE TABLE author (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  -- Normalized name, unique: this is what prevents 'Καζαντζάκης' and
  -- 'ΚΑΖΑΝΤΖΑΚΗΣ' becoming two separate authors.
  name_norm  TEXT    NOT NULL UNIQUE,
  sort_name  TEXT,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

-- Sorting uses name_norm for the same reason book.title_norm exists.
CREATE INDEX idx_author_name ON author (name_norm);

CREATE TABLE book_author (
  book_id   INTEGER NOT NULL REFERENCES book (id)   ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES author (id) ON DELETE CASCADE,
  -- Author order matters on a title page; preserve what the librarian entered.
  position  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (book_id, author_id)
);

CREATE INDEX idx_book_author_author ON book_author (author_id);

-- ----------------------------------------------------------------- categories
CREATE TABLE category (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  name_norm   TEXT    NOT NULL UNIQUE,
  -- Latin-transliterated slug, so category URLs stay readable.
  slug        TEXT    NOT NULL UNIQUE,
  description TEXT,
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL
);

CREATE TABLE book_category (
  book_id     INTEGER NOT NULL REFERENCES book (id)     ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES category (id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, category_id)
);

CREATE INDEX idx_book_category_category ON book_category (category_id);

-- --------------------------------------------------------------------- copies
-- A book row is a catalogue record (a title); a copy row is one physical item
-- on a shelf. One title may have many copies.
--
-- Note the absence of an 'on_loan' status. Whether a copy is out on loan is
-- derived from the loan table (migration 002), never stored here. Keeping one
-- source of truth means the public availability figure cannot drift out of
-- step with circulation.
CREATE TABLE copy (
  id             INTEGER PRIMARY KEY,
  book_id        INTEGER NOT NULL REFERENCES book (id) ON DELETE RESTRICT,
  -- Inventory number or barcode. Unique across the library when present.
  barcode        TEXT,
  shelf_location TEXT,
  status         TEXT    NOT NULL DEFAULT 'available'
                         CHECK (status IN ('available', 'repair', 'lost', 'withdrawn')),
  notes          TEXT,
  acquired_at    TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE UNIQUE INDEX idx_copy_barcode_unique
  ON copy (barcode)
  WHERE barcode IS NOT NULL;

CREATE INDEX idx_copy_book   ON copy (book_id);
CREATE INDEX idx_copy_status ON copy (status);

-- ------------------------------------------------------------------ audit log
-- A record of who changed what in the staff area. Deliberately stores no
-- passwords, no session identifiers and no borrower names — only the entity
-- touched and the action taken.
CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY,
  staff_user_id INTEGER REFERENCES staff_user (id) ON DELETE SET NULL,
  -- Kept alongside the id so the trail survives account deletion.
  username      TEXT,
  action        TEXT    NOT NULL,
  entity        TEXT,
  entity_id     INTEGER,
  detail        TEXT,
  created_at    TEXT    NOT NULL
);

CREATE INDEX idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX idx_audit_entity  ON audit_log (entity, entity_id);
