#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?}"
: "${GITHUB_REPOSITORY:?}"
: "${PR:?}"
: "${BODY:?}"

marker="<!-- viewer-preview -->"
comment_id="$(gh api --paginate "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" \
  --jq ".[] | select(.user.login == \"github-actions[bot]\" and (.body | startswith(\"${marker}\"))) | .id" |
  tail -n1)"

if [ -n "$comment_id" ]; then
  gh api "repos/${GITHUB_REPOSITORY}/issues/comments/${comment_id}" \
    --method PATCH -F "body=@${BODY}" --silent
elif [ "${CREATE:-true}" = true ]; then
  gh api "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" \
    --method POST -F "body=@${BODY}" --silent
fi
