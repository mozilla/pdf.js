#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_OUTPUT:?}"
: "${ARTIFACT:?}"
: "${SITE:?}"
: "${PR:?}"
: "${HEAD_SHA:?}"

if [ -n "$(find "$ARTIFACT" ! -type f ! -type d -print -quit)" ]; then
  echo "::error::The artifact contains unexpected file types"
  exit 1
fi

mkdir -p "$SITE"
for target in generic generic-legacy; do
  status="$(jq -r --arg t "$target" '.targets[$t] // empty' "$ARTIFACT/meta.json")"
  if [ "$status" = success ] && [ -f "$ARTIFACT/$target/web/viewer.html" ]; then
    cp -r "$ARTIFACT/$target" "$SITE/$target"
  fi
done

size="$(du -sm "$SITE" | cut -f1)"
if [ "$size" -gt 100 ]; then
  echo "::error::The viewers weigh ${size} MB (at most 100 MB)"
  exit 1
fi
if [ -z "$(ls -A "$SITE")" ]; then
  echo "No viewer was built"
  exit 0
fi

published_at="$(date -u +%FT%TZ)"
jq -n --argjson pr "$PR" --arg sha "$HEAD_SHA" --arg date "$published_at" \
  '{ pr: $pr, sha: $sha, date: $date }' > "$SITE/meta.json"
echo "built=true" >> "$GITHUB_OUTPUT"
echo "date=$published_at" >> "$GITHUB_OUTPUT"
