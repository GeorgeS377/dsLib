-- Settings a person can change from the browser: the library's name, its
-- icon, how long a loan runs by default, and when setup was completed.
--
-- These used to live only in `.env`, which the teacher running the library
-- cannot reach — editing it needs shell access on the server, which is the
-- admin's job and not theirs. Moving them here is what makes the first-run
-- setup page and the Ρυθμίσεις page possible.
--
-- Key/value rather than one column each, because these are unrelated single
-- values with no relations to anything: nothing joins to a setting, nothing
-- is derived from one, and the set of them grows by the odd row rather than
-- by a schema. A row per setting also means the absence of a row is a
-- meaningful state — "nobody has chosen, keep reading the environment" —
-- which a table of nullable columns would blur.
--
-- Values are stored as text and validated on the way out, in
-- src/lib/settings.js, not on the way in. A hand-edited database is a thing
-- that happens, and a bad value there must leave the pages rendering on the
-- old default rather than take the site down.

CREATE TABLE setting (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(key) > 0)
);
