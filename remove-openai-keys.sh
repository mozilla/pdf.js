#!/usr/bin/env bash
#
# remove-openai-keys.sh  — scrub “sk-…” secrets from the *entire* git history
#
# - Requires: Python ≥3.6  (for git-filter-repo)
# - Installs git-filter-repo automatically if it is missing
# - Does **no** other modifications
# - Stops if the working tree is dirty

set -Eeuo pipefail

### 0. Safety checks ----------------------------------------------------------

if [[ -n $(git status --porcelain) ]]; then
  echo "✖  Working tree not clean. Commit or stash before running." >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree &>/dev/null; then
  echo "✖  Run this from the root of a git repository." >&2
  exit 1
fi

### 1. Ensure git-filter-repo -------------------------------------------------

if ! command -v git-filter-repo &>/dev/null; then
  echo "➜  Installing git-filter-repo (needs pip, ≈1 s)…"
  python -m pip install --quiet --upgrade git-filter-repo
fi

### 2. Build a temporary replacement map -------------------------------------

SECRET_REGEX='sk-[A-Za-z0-9_]{48}'       # generic OpenAI key pattern
PLACEHOLDER='REMOVED_OPENAI_KEY'
REPL_FILE=$(mktemp)
echo "${SECRET_REGEX}==>${PLACEHOLDER}" > "${REPL_FILE}"

trap 'rm -f "${REPL_FILE}"' EXIT

### 3. Rewrite every ref in place --------------------------------------------

echo "➜  Rewriting history to remove OpenAI keys… (this may take a minute)"
git filter-repo \
  --replace-text "${REPL_FILE}" \
  --force                        \
  --quiet

### 4. Final housekeeping -----------------------------------------------------

rm -rf .git/refs/original/
git reflog expire --expire=now --all
git gc --prune=now --aggressive --quiet

echo "✔  Done. Local history is clean."
echo "   Push with: git push --force --all && git push --force --tags"
echo "   Teammates must run: git fetch && git reset --hard origin/<branch>"
