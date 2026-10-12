#!/usr/bin/env bash
#
# Back up the dsLib database and uploaded cover images.
#
# Usage:
#   ./scripts/backup.sh [destination-directory]
#
# The destination defaults to ./backups. Each run produces one timestamped
# directory containing library.db and covers/.
#
# Safe to run while the application is serving requests: the database is
# copied with SQLite's own backup API (via `sqlite3 .backup`, or Node's
# built-in SQLite as a fallback), which takes a consistent snapshot of a live
# database including anything still in the write-ahead log. Copying the file
# with `cp` would not — it can capture a torn write.
#
# Restore with ./scripts/restore.sh <backup-directory>

set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

# Configuration, in order of precedence:
#   1. an environment variable already set in the caller's shell
#   2. the matching key in .env
#   3. the default the application itself uses
#
# Environment first is both the conventional order and what makes it possible
# to back up an instance other than the one installed beside this script —
# including from a test or a cron job that manages several deployments.
read_setting() {
  local name="$1" default="$2" current from_env_file
  current="$(printenv "$name" || true)"
  if [ -n "$current" ]; then
    printf '%s' "$current"
    return
  fi
  if [ -f "${PROJECT_ROOT}/.env" ]; then
    from_env_file="$(
      grep -E "^[[:space:]]*${name}=" "${PROJECT_ROOT}/.env" 2>/dev/null |
        tail -n 1 |
        sed -E "s/^[[:space:]]*${name}=//; s/[[:space:]]*#.*$//; s/^[\"']//; s/[\"']$//" || true
    )"
    if [ -n "$from_env_file" ]; then
      printf '%s' "$from_env_file"
      return
    fi
  fi
  printf '%s' "$default"
}

DATABASE_PATH="$(read_setting DATABASE_PATH ./data/library.db)"
UPLOAD_DIR="$(read_setting UPLOAD_DIR ./data/uploads)"

DEST_ROOT="${1:-${BACKUP_DIR:-${PROJECT_ROOT}/backups}}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="${DEST_ROOT}/${STAMP}"

if [ ! -f "$DATABASE_PATH" ]; then
  echo "error: no database at ${DATABASE_PATH}" >&2
  echo "       Set DATABASE_PATH in .env, or run 'npm run migrate' first." >&2
  exit 1
fi

mkdir -p "$DEST"
# The backup contains borrower names: keep it readable only by its owner.
chmod 700 "$DEST_ROOT" "$DEST"

echo "Backing up to ${DEST}"

# --- Database -------------------------------------------------------------
# Prefer the sqlite3 CLI; fall back to Node, which always ships with the app.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DATABASE_PATH" ".backup '${DEST}/library.db'"
  echo "  database  (sqlite3 .backup)"
else
  # No sqlite3 CLI, which is the normal case on a minimal server: the app
  # itself needs only Node. db-snapshot.js uses VACUUM INTO and verifies the
  # result.
  node "${PROJECT_ROOT}/scripts/db-snapshot.js" "$DATABASE_PATH" "${DEST}/library.db" >/dev/null
  echo "  database  (VACUUM INTO)"
fi
chmod 600 "${DEST}/library.db"

# Verify the copy actually opens and passes an integrity check, so a silent
# failure is caught now rather than on the day it is needed.
if command -v sqlite3 >/dev/null 2>&1; then
  INTEGRITY="$(sqlite3 "${DEST}/library.db" 'PRAGMA integrity_check;')"
else
  INTEGRITY="$(node "${PROJECT_ROOT}/scripts/db-snapshot.js" --check "${DEST}/library.db")"
fi

if [ "$INTEGRITY" != "ok" ]; then
  echo "error: the backup failed its integrity check: ${INTEGRITY}" >&2
  exit 1
fi
echo "  integrity ok"

# --- Cover images ---------------------------------------------------------
if [ -d "${UPLOAD_DIR}/covers" ]; then
  mkdir -p "${DEST}/covers"
  cp -a "${UPLOAD_DIR}/covers/." "${DEST}/covers/"
  COUNT="$(find "${DEST}/covers" -type f | wc -l | tr -d ' ')"
  echo "  covers    ${COUNT} file(s)"
else
  echo "  covers    none yet"
fi

# --- Record what produced this backup ------------------------------------
# Which migrations the snapshot contains, so a restore can tell whether it
# predates the running code.
SCHEMA_VERSION="$(node "${PROJECT_ROOT}/scripts/db-snapshot.js" --versions "${DEST}/library.db" 2>/dev/null || echo "(unknown)")"

cat > "${DEST}/MANIFEST.txt" <<MANIFEST
dsLib backup
created:        ${STAMP}
host:           $(hostname)
database:       ${DATABASE_PATH}
uploads:        ${UPLOAD_DIR}
schema version: ${SCHEMA_VERSION}

Restore with:
  ./scripts/restore.sh "${DEST}"
MANIFEST

SIZE="$(du -sh "$DEST" | cut -f1)"
echo
echo "Done. ${SIZE} in ${DEST}"
echo
echo "Copy this directory somewhere off this machine — a backup that lives"
echo "only on the server does not survive the server."
