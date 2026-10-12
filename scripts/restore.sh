#!/usr/bin/env bash
#
# Restore a dsLib backup produced by ./scripts/backup.sh
#
# Usage:
#   ./scripts/restore.sh <backup-directory> [--yes]
#
# This REPLACES the current database and cover images. Because that is
# destructive, the script:
#   1. refuses to run unless the backup passes an integrity check;
#   2. moves the current data aside into a pre-restore snapshot rather than
#      deleting it, so a mistaken restore can itself be undone;
#   3. asks for confirmation unless --yes is given.
#
# Stop the application first. Restoring underneath a running process would
# leave it holding a deleted file and serving stale data.

set -euo pipefail

cd "$(dirname "$0")/.."
PROJECT_ROOT="$(pwd)"

SOURCE="${1:-}"
ASSUME_YES="${2:-}"

if [ -z "$SOURCE" ]; then
  echo "usage: ./scripts/restore.sh <backup-directory> [--yes]" >&2
  echo >&2
  echo "available backups:" >&2
  ls -1 "${BACKUP_DIR:-${PROJECT_ROOT}/backups}" 2>/dev/null | sed 's/^/  /' >&2 || echo "  (none)" >&2
  exit 1
fi

if [ ! -f "${SOURCE}/library.db" ]; then
  echo "error: ${SOURCE}/library.db not found — is that a dsLib backup?" >&2
  exit 1
fi

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

# --- Check the backup before touching anything ---------------------------
check_integrity() {
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$1" 'PRAGMA integrity_check;'
  else
    node "${PROJECT_ROOT}/scripts/db-snapshot.js" --check "$1"
  fi
}

echo "Checking ${SOURCE}/library.db"
INTEGRITY="$(check_integrity "${SOURCE}/library.db")"
if [ "$INTEGRITY" != "ok" ]; then
  echo "error: that backup is damaged (${INTEGRITY}). Nothing was changed." >&2
  exit 1
fi
echo "  integrity ok"

if [ -f "${SOURCE}/MANIFEST.txt" ]; then
  echo
  sed 's/^/  /' "${SOURCE}/MANIFEST.txt"
  echo
fi

# --- Confirm -------------------------------------------------------------
if [ "$ASSUME_YES" != "--yes" ]; then
  echo "This will replace:"
  echo "  ${DATABASE_PATH}"
  echo "  ${UPLOAD_DIR}/covers"
  echo
  echo "The current data will be moved aside first, not deleted."
  printf "Continue? [y/N] "
  read -r REPLY
  case "$REPLY" in
    y | Y | yes | YES) ;;
    *)
      echo "Cancelled. Nothing was changed."
      exit 0
      ;;
  esac
fi

# --- Move the current data aside -----------------------------------------
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ASIDE="${BACKUP_DIR:-${PROJECT_ROOT}/backups}/pre-restore-${STAMP}"

if [ -f "$DATABASE_PATH" ] || [ -d "${UPLOAD_DIR}/covers" ]; then
  mkdir -p "$ASIDE"
  chmod 700 "$ASIDE"
  echo "Moving current data to ${ASIDE}"

  if [ -f "$DATABASE_PATH" ]; then
    mv "$DATABASE_PATH" "${ASIDE}/library.db"
    # The write-ahead log and shared-memory sidecars belong with it.
    [ -f "${DATABASE_PATH}-wal" ] && mv "${DATABASE_PATH}-wal" "${ASIDE}/" || true
    [ -f "${DATABASE_PATH}-shm" ] && mv "${DATABASE_PATH}-shm" "${ASIDE}/" || true
  fi

  if [ -d "${UPLOAD_DIR}/covers" ]; then
    mkdir -p "${ASIDE}/covers"
    mv "${UPLOAD_DIR}/covers" "${ASIDE}/covers-current"
  fi
fi

# --- Restore -------------------------------------------------------------
mkdir -p "$(dirname "$DATABASE_PATH")" "${UPLOAD_DIR}"
cp "${SOURCE}/library.db" "$DATABASE_PATH"
chmod 600 "$DATABASE_PATH"
echo "Restored database"

if [ -d "${SOURCE}/covers" ]; then
  mkdir -p "${UPLOAD_DIR}/covers"
  cp -a "${SOURCE}/covers/." "${UPLOAD_DIR}/covers/"
  COUNT="$(find "${UPLOAD_DIR}/covers" -type f | wc -l | tr -d ' ')"
  echo "Restored ${COUNT} cover file(s)"
else
  mkdir -p "${UPLOAD_DIR}/covers"
  echo "Backup contained no covers"
fi

# --- Apply any migrations the restored database predates -----------------
# A backup from an older release may be behind the current schema.
#
# DATABASE_PATH is exported so the migration runner targets the database we
# just restored, which may not be the one .env names.
echo
echo "Applying any outstanding migrations"
DATABASE_PATH="$DATABASE_PATH" node "${PROJECT_ROOT}/src/db/migrate.js"

echo
echo "Done. Start the application again."
if [ -d "$ASIDE" ]; then
  echo "The previous data is in ${ASIDE} — delete it once you are satisfied."
fi
