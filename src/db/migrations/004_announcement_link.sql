-- A notice often points somewhere: the library's rules as a PDF, a form, the
-- school's own page. Added separately from 003 because that one has already
-- been applied — a migration is a fact about what was run, not a file to edit.

ALTER TABLE announcement ADD COLUMN link_url TEXT;

-- Whether the link replaces this page or opens beside it. Stored rather than
-- assumed: a rules PDF wants a new tab, an internal page does not, and only
-- the person writing the notice knows which this is.
ALTER TABLE announcement ADD COLUMN link_new_tab INTEGER NOT NULL DEFAULT 0
  CHECK (link_new_tab IN (0, 1));
