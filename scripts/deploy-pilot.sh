#!/usr/bin/env bash
set -euo pipefail
: "${PROJECT:?}" "${REGION:?}" "${SERVICE:?}" "${IMAGE:?}" "${IMAGE_REF:?}" "${RELEASE_SHA:?}" "${GITHUB_STEP_SUMMARY:?}"
[[ "$PROJECT/$REGION/$SERVICE" == kitchen-designer-9d437/europe-west1/nediq-v3-pilot ]]
[[ "$IMAGE" == europe-west1-docker.pkg.dev/kitchen-designer-9d437/nediq/nediq-v3-pilot ]]
[[ "$IMAGE_REF" == "$IMAGE"@sha256:* && "${IMAGE_REF##*@}" =~ ^sha256:[0-9a-f]{64}$ ]]
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]
require_current_main() {
  local current
  current=$(gh api repos/nedkoradev/kitchen-calculator/commits/main --jq .sha)
  [[ "$current" == "$RELEASE_SHA" ]] || { echo 'Approved SHA is no longer the current main HEAD' >&2; return 1; }
}
require_current_main
cloud=(--project "$PROJECT" --region "$REGION" --quiet)
traffic() {
  gcloud run services describe "$SERVICE" "${cloud[@]}" --format='json(status.traffic)' |
    jq -er '[.status.traffic[] | select(.percent > 0)] | if length == 1 and .[0].percent == 100 then .[0].revisionName else error("Expected a single serving revision") end'
}
previous=$(traffic)
[[ "$previous" == "$SERVICE"-* ]]
suffix="gh-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
[[ "$suffix" =~ ^gh-[0-9]+-[0-9]+$ ]]
revision="$SERVICE-$suffix"
printf '### Pilot deployment\n\n- Commit: %s\n- Image: %s\n- Previous revision: %s\n- Candidate: %s\n' \
  "$RELEASE_SHA" "$IMAGE_REF" "$previous" "$revision" >> "$GITHUB_STEP_SUMMARY"

gcloud run deploy "$SERVICE" "${cloud[@]}" --image "$IMAGE_REF" --no-traffic --tag candidate --revision-suffix "$suffix"
gcloud run revisions describe "$revision" "${cloud[@]}" --format='json(spec.containers,status.conditions)' |
  jq -e --arg image "$IMAGE_REF" '.spec.containers[0].image == $image and any(.status.conditions[]; .type == "Ready" and .status == "True")' >/dev/null
[[ "$(traffic)" == "$previous" ]]
candidate_url=$(gcloud run services describe "$SERVICE" "${cloud[@]}" --format=json |
  jq -er --arg revision "$revision" '.status.traffic[] | select(.revisionName == $revision and .tag == "candidate") | .url')
[[ "$candidate_url" =~ ^https://[a-z0-9.-]+\.run\.app$ ]]
check_http() {
  local target="$1" headers code
  headers=$(mktemp)
  code=$(curl --silent --show-error --max-time 20 --dump-header "$headers" --output /dev/null --write-out '%{http_code}' "$target/fallback") || {
    rm -f "$headers"
    return 1
  }
  if [[ "$code" != 302 ]] || ! tr -d '\r' < "$headers" | grep -Fixqi 'location: https://nedkoradev.github.io/kitchen-calculator/'; then
    echo "Unexpected fallback response from $target (HTTP $code)" >&2
    rm -f "$headers"
    return 1
  fi
  rm -f "$headers"
}
check_http "$candidate_url" || { echo 'Candidate HTTP smoke test failed; previous revision remains serving' >&2; exit 1; }
require_current_main
promoted=false
rollback() {
  if [[ "$promoted" == true ]]; then
    echo 'Post-promotion verification failed; restoring previous revision' >&2
    if gcloud run services update-traffic "$SERVICE" "${cloud[@]}" --to-revisions "$previous=100" &&
       [[ "$(traffic)" == "$previous" ]]; then
      echo "Rollback verified: $previous serves 100% of traffic" >&2
    else
      echo "Rollback could not be verified for $previous" >&2
    fi
  fi
}
trap rollback ERR
promoted=true
gcloud run services update-traffic "$SERVICE" "${cloud[@]}" --to-revisions "$revision=100"
[[ "$(traffic)" == "$revision" ]]
url=$(gcloud run services describe "$SERVICE" "${cloud[@]}" --format='value(status.url)')
[[ "$url" =~ ^https://[a-z0-9.-]+\.run\.app$ ]]
check_http "$url"
# Authenticate only at the configured application origin; the service URL may
# first redirect there. Verify the published HTML and resources independently of fallback.
body=$(mktemp)
trap 'rm -f "$body"' EXIT
work_url=$(curl --fail --silent --show-error --max-time 20 --location --max-redirs 1 \
  --proto-redir '=https' --output "$body" --write-out '%{url_effective}' "$url/")
[[ "$work_url" =~ ^https://[a-z0-9.-]+\.run\.app/$ ]]
grep -Fq 'Pilot v3.0.1' "$body"
curl --fail --silent --show-error --max-time 20 "${work_url}materials/default.json" |
  jq -e '.pdcMaterials | length > 0' >/dev/null
curl --fail --silent --show-error --max-time 20 --output /dev/null "${work_url}rollout-preflight/staging-auth.mjs"
trap - ERR
printf -- '- Verified workspace URL: %s\n' "$work_url" >> "$GITHUB_STEP_SUMMARY"
printf -- '- Serving URL: %s\n- Traffic: 100%% on %s\n' "$url" "$revision" >> "$GITHUB_STEP_SUMMARY"
