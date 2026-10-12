-- 002_circulation: borrowers and loans.
--
-- PRIVACY NOTE — read before extending this file.
--
-- The library confirmed the minimum borrower information it is allowed and
-- needs to keep: a display name and a class/grade, nothing else. There is
-- deliberately no date of birth, address, telephone number, email address or
-- school registry number, and no student-facing account system. These records
-- describe minors; do not add columns here without asking the library first.
--
-- Borrower data is visible only inside the authenticated staff area. No public
-- route reads from these tables — test/privacy.test.js asserts that borrower
-- names never appear in a public response.

CREATE TABLE borrower (
  id             INTEGER PRIMARY KEY,
  display_name   TEXT    NOT NULL CHECK (length(trim(display_name)) > 0),
  -- Normalized for staff-side search; same folding as the catalogue, so a
  -- librarian can find 'Παπαδόπουλος' by typing 'παπαδοπουλος'.
  name_norm      TEXT    NOT NULL DEFAULT '',
  -- Free text such as 'Β2' or 'Γ Λυκείου'. Not validated against a class list,
  -- because the library keeps no such list here.
  school_class   TEXT,
  notes          TEXT,
  -- Set when a borrower has been anonymized: the name is replaced with a
  -- placeholder and the row is kept so loan history stays countable.
  is_anonymized  INTEGER NOT NULL DEFAULT 0 CHECK (is_anonymized IN (0, 1)),
  anonymized_at  TEXT,
  created_at     TEXT    NOT NULL,
  updated_at     TEXT    NOT NULL
);

CREATE INDEX idx_borrower_name_norm ON borrower (name_norm);
CREATE INDEX idx_borrower_class     ON borrower (school_class);

CREATE TABLE loan (
  id            INTEGER PRIMARY KEY,
  -- RESTRICT: a copy with loan history cannot be deleted, only withdrawn.
  copy_id       INTEGER NOT NULL REFERENCES copy (id) ON DELETE RESTRICT,
  -- RESTRICT likewise: deleting a borrower with history is blocked, and the
  -- staff UI offers anonymization instead.
  borrower_id   INTEGER NOT NULL REFERENCES borrower (id) ON DELETE RESTRICT,
  -- Which librarian issued and which took the return, for the audit trail.
  issued_by     INTEGER REFERENCES staff_user (id) ON DELETE SET NULL,
  returned_by   INTEGER REFERENCES staff_user (id) ON DELETE SET NULL,
  loaned_at     TEXT    NOT NULL,
  due_at        TEXT    NOT NULL,
  -- NULL means the loan is still open. This column drives availability.
  returned_at   TEXT,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL,
  CHECK (due_at >= loaned_at),
  CHECK (returned_at IS NULL OR returned_at >= loaned_at)
);

-- The constraint that makes double-lending impossible: at most one open loan
-- per copy, enforced by the database rather than by application checks that
-- could race. A second concurrent checkout fails with a constraint error.
CREATE UNIQUE INDEX idx_loan_one_open_per_copy
  ON loan (copy_id)
  WHERE returned_at IS NULL;

-- Overdue lookups scan only open loans.
CREATE INDEX idx_loan_open_due
  ON loan (due_at)
  WHERE returned_at IS NULL;

CREATE INDEX idx_loan_borrower ON loan (borrower_id);
CREATE INDEX idx_loan_copy     ON loan (copy_id);
