#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT:?}" "${REGION:?}" "${SERVICE:?}" "${RUNTIME_ACCOUNT:?}" "${GITHUB_SHA:?}" "${GITHUB_STEP_SUMMARY:?}"
[[ "$PROJECT/$REGION/$SERVICE" == kitchen-designer-9d437/europe-west1/nediq-v3-public ]]
[[ "$RUNTIME_ACCOUNT" == "ned-iq-v3-public@$PROJECT.iam.gserviceaccount.com" ]]
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]]
cloud=(--project "$PROJECT" --region "$REGION" --quiet)
site=https://nediq.eu
probe=https://release-check---nediq-v3-public-inu5wh5ola-ew.a.run.app
http=(curl --proto '=https' --silent --show-error --fail --max-time 15)
describe() { gcloud run services describe "$SERVICE" "${cloud[@]}" --format=json; }
traffic() {
  jq -er '[.status.traffic[] | select((.percent // 0) > 0)] |
    select(length == 1 and .[0].percent == 100) | .[0].revisionName'
}
ready() {
  gcloud run revisions describe "$1" "${cloud[@]}" --format=json |
    jq -e --arg image "${2:-}" --arg account "$RUNTIME_ACCOUNT" '
      .spec.serviceAccountName == $account and ($image == "" or .spec.containers[0].image == $image)
      and any(.status.conditions[]; .type == "Ready" and .status == "True")' >/dev/null
}
live_smoke() {
  local url="$1" html
  html=$("${http[@]}" "$url/") || return
  [[ "$html" == *'<title>NED-IQ v3.'* ]] || return 1
  "${http[@]}" -o /dev/null "$url/app-shell.css" || return
  "${http[@]}" -o /dev/null "$url/staging-sdk/auth.js" || return
  [[ "$(curl --proto '=https' --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}' \
    --header "Origin: $url" --request POST "$url/staging-api")" == 401 ]]
}
route() {
  gcloud run services update-traffic "$SERVICE" "${cloud[@]}" --to-revisions "$1=100"
}
before=$(describe)
jq -e --arg account "$RUNTIME_ACCOUNT" --arg project "$PROJECT" '
  .metadata.annotations["run.googleapis.com/ingress"] == "all"
  and .spec.template.spec.serviceAccountName == $account
  and (.spec.template.spec.containers | length == 1)
  and ((.spec.template.spec.containers[0].env | map({key:.name,value:.value}) | from_entries) as $e |
    $e.GOOGLE_CLOUD_PROJECT == $project and $e.NEDIQ_PUBLIC_ENABLED == "1"
    and $e.NEDIQ_PUBLIC_ORIGIN == "https://nediq.eu" and ($e.NEDIQ_PILOT_ENABLED // "0") != "1"
    and $e.FIRESTORE_EMULATOR_HOST == null and $e.FIREBASE_AUTH_EMULATOR_HOST == null)' <<< "$before" >/dev/null
previous=$(traffic <<< "$before")
[[ "$previous" =~ ^nediq-v3-public-[a-z0-9-]+$ ]]

if [[ "${MODE:-}" == rollback ]]; then
  [[ "${ROLLBACK_REVISION:-}" =~ ^nediq-v3-public-[a-z0-9-]+$ ]]
  ready "$ROLLBACK_REVISION"
  route "$ROLLBACK_REVISION"
  [[ "$(describe | traffic)" == "$ROLLBACK_REVISION" ]]
  live_smoke "$site"
  printf 'Rollback revision: %s\n' "$ROLLBACK_REVISION" >> "$GITHUB_STEP_SUMMARY"
  exit
fi

[[ "$MODE" == production || "$MODE" == production-probe ]]
ready "$previous"
[[ "${IMAGE_REF:-}" =~ ^europe-west1-docker\.pkg\.dev/kitchen-designer-9d437/nediq/nediq-v3-public@sha256:[0-9a-f]{64}$ ]]
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]]
suffix="gh-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
revision="$SERVICE-$suffix"
digest=${IMAGE_REF##*@}
version=$(node --input-type=module -e "import {version} from './release-candidate/release.mjs'; console.log(version)")
[[ "$version" =~ ^3\.[0-9]+\.[0-9]+$ ]]
live_smoke "$site"
metadata=$(mktemp)
trap 'rm -f "$metadata"' EXIT
status=$(curl --proto '=https' --silent --show-error --max-time 15 --output "$metadata" --write-out '%{http_code}' "$site/release.json")
if [[ "$status" == 200 ]]; then
  previous_version=$(jq -er '.version | select(test("^3\\.[0-9]+\\.[0-9]+$"))' "$metadata")
  [[ "$(jq -er '.revision' "$metadata")" == "$previous" ]]
  if [[ "$MODE" == production ]]; then
    if [[ "$(jq -er '.sha' "$metadata")" == "$GITHUB_SHA" ]]; then
      printf 'Commit already serves production on %s.\n' "$previous" >> "$GITHUB_STEP_SUMMARY"
      exit
    fi
    [[ "$version" != "$previous_version" && "$(printf '%s\n' "$version" "$previous_version" | sort -V | tail -1)" == "$version" ]]
  fi
else
  [[ "$status" == 404 ]]
fi
rm -f "$metadata"
trap - EXIT

gcloud run deploy "$SERVICE" "${cloud[@]}" --image "$IMAGE_REF" --no-traffic --tag release-check \
  --revision-suffix "$suffix" --service-account "$RUNTIME_ACCOUNT" \
  --update-env-vars "NEDIQ_RELEASE_SHA=$GITHUB_SHA,NEDIQ_RELEASE_DIGEST=$digest,NEDIQ_RELEASE_TIME=$(date -u +%FT%TZ),NEDIQ_RELEASE_RUN=$GITHUB_RUN_ID"
ready "$revision" "$IMAGE_REF"
after=$(describe)
[[ "$(traffic <<< "$after")" == "$previous" ]]
jq -e --arg revision "$revision" --arg url "$probe" '
  any(.status.traffic[]; .tag == "release-check" and .revisionName == $revision and
    .url == $url and (.percent // 0) == 0)' <<< "$after" >/dev/null

matches_release() {
  "${http[@]}" "$1/release.json" | jq -e --arg rev "$revision" --arg sha "$GITHUB_SHA" \
    --arg digest "$digest" --arg version "$version" '
    .revision == $rev and .sha == $sha and .digest == $digest and .version == $version and
    .tests.result == "success"' >/dev/null
}
matches_release "$probe"
for asset in app-shell.css rollout-preflight/staging-auth.mjs staging-sdk/auth.js; do
  "${http[@]}" -o /dev/null "$probe/$asset"
done
if [[ "$MODE" == production-probe ]]; then
  printf 'Verified with zero production traffic: %s\n' "$revision" >> "$GITHUB_STEP_SUMMARY"
  exit
fi

[[ "$(git ls-remote origin refs/heads/main | cut -f1)" == "$GITHUB_SHA" ]]
[[ "$(describe | traffic)" == "$previous" ]]
restore() {
  trap - EXIT
  if route "$previous" && [[ "$(describe | traffic)" == "$previous" ]] && live_smoke "$site"; then
    printf 'Public verification failed. Restored %s.\n' "$previous" >> "$GITHUB_STEP_SUMMARY"
  else
    printf 'Rollback failed or could not be verified. Restore %s manually.\n' "$previous" >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 1
}
trap restore EXIT
trap 'exit 1' INT TERM
route "$revision"
verified=false
for ((attempt=0; attempt<12; attempt++)); do
  if [[ "$(describe | traffic)" == "$revision" ]] && matches_release "$site" && live_smoke "$site" &&
    "${http[@]}" "$site/" | grep -F "id=\"appVersion\">v$version<" >/dev/null; then
    verified=true
    break
  fi
  sleep 5
done
[[ "$verified" == true ]]
trap - EXIT INT TERM
printf 'Published v%s: %s (%s)\n\nPrevious revision: %s\n' "$version" "$revision" "$digest" "$previous" >> "$GITHUB_STEP_SUMMARY"
