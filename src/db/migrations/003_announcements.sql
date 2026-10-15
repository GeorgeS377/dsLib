-- Announcements shown on the front page: opening hours, the library's rules,
-- a notice that it is closed on Friday.
--
-- Content rather than catalogue data, which is why it lives in its own table
-- and its own migration. A librarian writes these; nothing here is derived
-- from anything else, and nothing else depends on it.

CREATE TABLE announcement (
  id            INTEGER PRIMARY KEY,
  title         TEXT    NOT NULL,
  -- Optional: a heading on its own is a perfectly good notice.
  body          TEXT,
  -- Draft or shown. A notice is often written before the day it applies.
  is_published  INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  -- Hand-ordered: the library decides what matters most this week, and that
  -- is not the same as what was written last. Lower sorts first.
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  CHECK (length(trim(title)) > 0)
);

-- The public page reads only what is published, in order.
CREATE INDEX idx_announcement_published
  ON announcement (position, id)
  WHERE is_published = 1;
