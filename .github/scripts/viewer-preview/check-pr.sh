#!/usr/bin/env bash
set -euo pipefail

: "${GH_TOKEN:?}"
: "${GITHUB_REPOSITORY:?}"
: "${GITHUB_OUTPUT:?}"
: "${ARTIFACT:?}"
: "${HEAD_SHA:?}"
: "${HEAD_REPO:?}"
: "${LABEL:?}"
: "${APPROVAL_CONTEXT:?}"

output() {
  echo "$1=$2" >> "$GITHUB_OUTPUT"
}

has_label() {
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr}" \
    --jq "any(.labels[]; .name == \"${LABEL}\")"
}

get_approver() {
  gh api "repos/${GITHUB_REPOSITORY}/commits/${HEAD_SHA}/statuses?per_page=100" \
    --jq "[.[] | select(.context == \"${APPROVAL_CONTEXT}\" and .state == \"success\" and .creator.login == \"github-actions[bot]\")] | first | .description // empty"
}

pr="$(jq -r '.pr' "$ARTIFACT/meta.json")"
if ! [[ "$pr" =~ ^[1-9][0-9]{0,6}$ ]]; then
  echo "::error::Invalid PR number in the artifact"
  exit 1
fi

IFS=$'\t' read -r state head_sha head_repo author < <(
  gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr}" \
    --jq '[.state, .head.sha, (.head.repo.full_name // "-"), .user.login] | @tsv'
)
if [ "$state" != open ]; then
  echo "Removing: #${pr} is ${state}"
  output pr "$pr"
  output action remove
  exit 0
fi
if [ "$head_sha" != "$HEAD_SHA" ] || [ "$head_repo" != "$HEAD_REPO" ]; then
  echo "::notice::#${pr} is now at ${head_repo}@${head_sha}: ignoring the build of ${HEAD_REPO}@${HEAD_SHA}"
  exit 0
fi
output pr "$pr"

permission="$(gh api "repos/${GITHUB_REPOSITORY}/collaborators/${author}/permission" \
  --jq .permission 2>/dev/null || echo none)"
case "$permission" in
  admin|write)
    output action publish
    echo "Publishing: ${author} has ${permission} access"
    exit 0
    ;;
esac

for _ in {1..60}; do
  pending="$(has_label)"
  approver="$(get_approver)"
  if [ -n "$approver" ] || [ "$pending" != true ]; then
    break
  fi
  echo "Waiting for the \`${LABEL}\` label to be processed"
  sleep 10
done
if [ -n "$approver" ]; then
  output action publish
  echo "Publishing: ${approver}"
elif [ "$pending" = true ]; then
  output action report
  output approval timeout
  echo "::warning::The \`${LABEL}\` label was not processed in time: ${HEAD_SHA} is not published"
else
  output action report
  echo "Not publishing: ${author} has ${permission} access and ${HEAD_SHA} is not approved"
fi
