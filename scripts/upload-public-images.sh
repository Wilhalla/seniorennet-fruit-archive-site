#!/usr/bin/env bash
set -euo pipefail

# Upload the Astro public archive image assets and generated thumbnails to an S3-compatible bucket.
# No credentials are read here; configure mcli separately, e.g.:
#   mcli alias set rustfs-blog https://objects.janpeterdhalle.com ACCESS_KEY SECRET_KEY --api S3v4 --path auto

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SITE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

S3_ALIAS="${S3_ALIAS:-rustfs-blog}"
S3_BUCKET="${S3_BUCKET:-${PUBLIC_S3_ASSET_BUCKET:-wilhalla-vake-blog}}"
S3_PREFIX="${S3_PREFIX:-${PUBLIC_S3_ASSET_PREFIX:-}}"
SOURCE_DIR="${SOURCE_DIR:-}"
SOURCE_SUBDIRS="${SOURCE_SUBDIRS:-archive-images archive-thumbs archive-thumbs-240 archive-thumbs-96}"
MAKE_PUBLIC="${MAKE_PUBLIC:-1}"
DRY_RUN="${DRY_RUN:-0}"
CACHE_CONTROL="${CACHE_CONTROL:-public, max-age=31536000, immutable}"
MAX_WORKERS="${MAX_WORKERS:-}"

trim_slashes() {
  local value="$1"
  value="${value#/}"
  value="${value%/}"
  printf '%s' "$value"
}

if ! command -v mcli >/dev/null 2>&1; then
  echo "mcli is required. Install it on Arch with: sudo pacman -S minio-client" >&2
  exit 1
fi

prefix="$(trim_slashes "$S3_PREFIX")"

mcli ls "$S3_ALIAS/$S3_BUCKET" >/dev/null

if [[ "$MAKE_PUBLIC" == "1" ]]; then
  mcli anonymous set download "$S3_ALIAS/$S3_BUCKET" >/dev/null
  echo "Ensured public download policy on $S3_ALIAS/$S3_BUCKET"
fi

mirror_args=(--overwrite --retry --summary --attr "Cache-Control=$CACHE_CONTROL")
if [[ "$DRY_RUN" == "1" ]]; then
  mirror_args+=(--dry-run)
fi
if [[ -n "$MAX_WORKERS" ]]; then
  mirror_args+=(--max-workers "$MAX_WORKERS")
fi

upload_dir() {
  local source_dir="$1"
  local target_subdir="$2"

  if [[ ! -d "$source_dir" ]]; then
    echo "Skipping missing source dir: $source_dir"
    return
  fi

  local target
  if [[ -n "$prefix" ]]; then
    target="$S3_ALIAS/$S3_BUCKET/$prefix/$target_subdir"
  else
    target="$S3_ALIAS/$S3_BUCKET/$target_subdir"
  fi

  local file_count
  file_count="$(find "$source_dir" -type f | wc -l | tr -d ' ')"
  echo "Uploading $file_count files from $source_dir to $target"
  mcli mirror "${mirror_args[@]}" "$source_dir" "$target"
}

if [[ -n "$SOURCE_DIR" ]]; then
  upload_dir "$SOURCE_DIR" "$(basename "$SOURCE_DIR")"
else
  for subdir in $SOURCE_SUBDIRS; do
    upload_dir "$SITE_ROOT/public/$subdir" "$subdir"
  done
fi
