#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?}"
: "${PREVIEW_REPO:?}"
: "${PR:?}"
[[ "$PR" =~ ^[1-9][0-9]*$ ]] || { echo "::error::Invalid PR number: $PR"; exit 1; }
RETENTION_DAYS="${RETENTION_DAYS:-30}"
OPEN_PRS_TIME="${OPEN_PRS_TIME:-0}"

if [ -n "${SITE:-}" ]; then
  SITE="$(realpath "$SITE")"
  message="Viewer preview for mozilla/pdf.js#${PR}"
else
  message="Remove the viewer preview of mozilla/pdf.js#${PR}"
fi
if [ -n "${OPEN_PRS:-}" ] && [ -s "$OPEN_PRS" ]; then
  OPEN_PRS="$(realpath "$OPEN_PRS")"
else
  OPEN_PRS=""
fi

repo_url="${PREVIEW_REPO_URL:-https://github.com/${PREVIEW_REPO}.git}"
auth_header="Authorization: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
git_refs() { git -c http.extraheader="$auth_header" "$@"; }

drop() {
  rm -rf "$1"
  git rm -r -q --cached --sparse --ignore-unmatch -- "$1"
}

prune() {
  local cutoff dir date ts reason
  cutoff=$(($(date +%s) - RETENTION_DAYS * 86400))
  git ls-tree -d --name-only HEAD -- viewers/ | while read -r dir; do
    [ "$dir" = "viewers/$PR" ] && continue
    date="$(jq -r '.date // empty' "$dir/meta.json" 2>/dev/null || true)"
    ts=0
    if [ -n "$date" ]; then
      ts="$(date -d "$date" +%s 2>/dev/null || echo 0)"
    fi
    if [ "$ts" -lt "$cutoff" ]; then
      reason="older than ${RETENTION_DAYS} days or invalid"
    elif [ -n "$OPEN_PRS" ] && [ "$ts" -lt "$OPEN_PRS_TIME" ] &&
      ! grep -qx "${dir#viewers/}" "$OPEN_PRS"; then
      reason="closed PR"
    else
      continue
    fi
    echo "Pruning $dir ($reason)"
    drop "$dir"
  done
}

for attempt in {1..5}; do
  work="$(mktemp -d)"
  ls_status=0
  git_refs ls-remote --exit-code --heads "$repo_url" gh-pages >/dev/null || ls_status=$?
  case "$ls_status" in
    0)
      git_refs clone -q --depth=1 --branch gh-pages --filter=blob:none --no-checkout \
        "$repo_url" "$work"
      cd "$work"
      git sparse-checkout set --no-cone '/viewers/*/meta.json'
      git_refs checkout -q gh-pages
      base="$(git rev-parse HEAD)"
      ;;
    2)
      git init -q "$work"
      cd "$work"
      base=""
      ;;
    *)
      echo "::error::Could not query gh-pages on ${PREVIEW_REPO} (git ls-remote exit ${ls_status})"
      exit 1
      ;;
  esac

  drop "viewers/$PR"
  if [ -n "${SITE:-}" ]; then
    mkdir -p viewers
    cp -r "$SITE" "viewers/$PR"
  fi
  if [ -n "$base" ]; then
    prune
  fi

  git add -A --sparse
  tree="$(git write-tree)"
  if [ -n "$base" ] && [ "$tree" = "$(git rev-parse "HEAD^{tree}")" ]; then
    echo "Nothing to publish"
    exit 0
  fi
  commit="$(git -c user.name="github-actions[bot]" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    commit-tree "$tree" -m "$message")"

  lease="--force-with-lease=refs/heads/gh-pages:${base}"
  if git_refs push -q "$lease" "$repo_url" "${commit}:refs/heads/gh-pages"; then
    echo "$message: done"
    exit 0
  fi
  echo "gh-pages advanced during the run; retrying (attempt ${attempt})"
  cd - >/dev/null
  rm -rf "$work"
  sleep $((attempt * 5 + RANDOM % 10))
done

echo "::error::Failed to publish after 5 attempts"
exit 1
