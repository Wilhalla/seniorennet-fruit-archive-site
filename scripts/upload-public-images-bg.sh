#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SITE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
LOG_DIR="${LOG_DIR:-$SITE_ROOT/logs}"
LOG_FILE="${LOG_FILE:-$LOG_DIR/upload-images.log}"
PID_FILE="${PID_FILE:-$LOG_DIR/upload-images.pid}"

mkdir -p "$LOG_DIR"

if [[ -s "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Upload already running as PID $(cat "$PID_FILE")"
  echo "Log: $LOG_FILE"
  exit 0
fi

(
  cd "$SITE_ROOT"
  exec env \
    S3_ALIAS="${S3_ALIAS:-rustfs-blog}" \
    S3_BUCKET="${S3_BUCKET:-${PUBLIC_S3_ASSET_BUCKET:-wilhalla-vake-blog}}" \
    S3_PREFIX="${S3_PREFIX:-${PUBLIC_S3_ASSET_PREFIX:-}}" \
    SOURCE_DIR="${SOURCE_DIR:-}" \
    SOURCE_SUBDIRS="${SOURCE_SUBDIRS:-archive-images archive-thumbs archive-thumbs-240}" \
    MAKE_PUBLIC="${MAKE_PUBLIC:-1}" \
    DRY_RUN="${DRY_RUN:-0}" \
    CACHE_CONTROL="${CACHE_CONTROL:-public, max-age=31536000, immutable}" \
    MAX_WORKERS="${MAX_WORKERS:-16}" \
    bash scripts/upload-public-images.sh
) > "$LOG_FILE" 2>&1 &

pid=$!
echo "$pid" > "$PID_FILE"
disown "$pid" 2>/dev/null || true

echo "Started upload PID $pid"
echo "Log: $LOG_FILE"
