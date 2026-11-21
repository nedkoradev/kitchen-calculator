#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT:?}" "${REGION:?}" "${SERVICE:?}" "${RUNTIME_ACCOUNT:?}" "${IMAGE_REF:?}" "${GITHUB_STEP_SUMMARY:?}"
[[ "$PROJECT/$REGION/$SERVICE" == kitchen-designer-9d437/europe-west1/nediq-v3-public ]]
[[ "$RUNTIME_ACCOUNT" == "ned-iq-v3-public@$PROJECT.iam.gserviceaccount.com" ]]
[[ "$IMAGE_REF" =~ ^europe-west1-docker\.pkg\.dev/kitchen-designer-9d437/nediq/nediq-v3-public@sha256:[0-9a-f]{64}$ ]]
suffix="gh-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
[[ "$suffix" =~ ^gh-[0-9]+-[0-9]+$ ]]
revision="$SERVICE-$suffix"
cloud=(--project "$PROJECT" --region "$REGION" --quiet)

describe() {
  gcloud run services describe "$SERVICE" "${cloud[@]}" --format=json
}

verify_private() {
  jq -e --arg runtime "$RUNTIME_ACCOUNT" --arg project "$PROJECT" '
    (.spec.template.spec.containers[0].env | map({key:.name,value:.}) | from_entries) as $env |
    .metadata.annotations["run.googleapis.com/ingress"] == "internal"
    and .metadata.annotations["run.googleapis.com/invoker-iam-disabled"] != "true"
    and .spec.template.spec.serviceAccountName == $runtime
    and $env.GOOGLE_CLOUD_PROJECT.value == $project
    and $env.NEDIQ_PUBLIC_ENABLED.value == "1"
    and $env.NEDIQ_PUBLIC_ORIGIN.value == "https://nediq.eu"
    and $env.NEDIQ_FIREBASE_AUTH_DOMAIN.value == ($project + ".firebaseapp.com")
    and (($env.NEDIQ_FIREBASE_WEB_API_KEY.value // "" | test("^[A-Za-z0-9_-]{25,100}$"))
      or ($env.NEDIQ_FIREBASE_WEB_API_KEY.valueFrom.secretKeyRef != null))
    and ($env.NEDIQ_PILOT_ENABLED.value // "0") != "1"
    and $env.FIRESTORE_EMULATOR_HOST == null and $env.FIREBASE_AUTH_EMULATOR_HOST == null' >/dev/null || {
    echo "::error::Cloud Run service does not match the private public-v3 runtime configuration." >&2
    return 1
  }
  gcloud run services get-iam-policy "$SERVICE" "${cloud[@]}" --format=json |
    jq -e 'all(.bindings[]?.members[]?; . != "allUsers" and . != "allAuthenticatedUsers")' >/dev/null
}

traffic() {
  jq -ec '[.status.traffic[] | select((.percent // 0) > 0) | {revisionName, percent}] | sort_by(.revisionName)'
}

# A successful empty list distinguishes absence from rejected IAM or API calls.
existing=$(gcloud run services list "${cloud[@]}" --filter="metadata.name=$SERVICE" --format='value(metadata.name)')
if [[ -z "$existing" ]]; then
  if [[ ! "${FIREBASE_WEB_API_KEY:-}" =~ ^[A-Za-z0-9_-]{25,100}$ ]]; then
    echo "::error::Set PUBLIC_V3_FIREBASE_WEB_API_KEY in environment public-v3 for first creation." >&2
    exit 1
  fi
  # Create-only API avoids an upsert if someone provisions the service concurrently.
  token=$(gcloud auth print-access-token --quiet)
  run_api=https://run.googleapis.com/v2
  request() {
    printf 'header = "Authorization: Bearer %s"\n' "$token" |
      curl --config - --fail-with-body --silent --show-error --max-time 20 "$@"
  }
  payload=$(jq -cn --arg image "$IMAGE_REF" --arg runtime "$RUNTIME_ACCOUNT" \
    --arg revision "$revision" --arg project "$PROJECT" --arg key "$FIREBASE_WEB_API_KEY" '
    {ingress:"INGRESS_TRAFFIC_INTERNAL_ONLY", invokerIamDisabled:false,
      template:{revision:$revision,serviceAccount:$runtime,containers:[{image:$image,env:[
        {name:"GOOGLE_CLOUD_PROJECT",value:$project},
        {name:"NEDIQ_PUBLIC_ENABLED",value:"1"},
        {name:"NEDIQ_PUBLIC_ORIGIN",value:"https://nediq.eu"},
        {name:"NEDIQ_FIREBASE_AUTH_DOMAIN",value:($project+".firebaseapp.com")},
        {name:"NEDIQ_FIREBASE_WEB_API_KEY",value:$key}
      ]}]}}')
  operation=$(request --header 'Content-Type: application/json' --data "$payload" \
    "$run_api/projects/$PROJECT/locations/$REGION/services?serviceId=$SERVICE") || {
    jq -r '.error.message // "Private Cloud Run creation failed"' <<< "$operation" >&2
    exit 1
  }
  name=$(jq -er '.name' <<< "$operation")
  [[ "$name" =~ ^projects/[a-z0-9-]+/locations/europe-west1/operations/[a-zA-Z0-9_-]+$ ]]
  for ((attempt=0; attempt<60; attempt++)); do
    if jq -e '.done == true' <<< "$operation" >/dev/null; then break; fi
    sleep 3
    operation=$(request "$run_api/$name")
  done
  jq -e '.done == true and (.error | not)' <<< "$operation" >/dev/null || {
    jq -r '.error.message // "Timed out waiting for private service creation"' <<< "$operation" >&2
    exit 1
  }
else
  [[ "$existing" == "$SERVICE" ]]
  before=$(describe)
  verify_private <<< "$before"
  previous_traffic=$(traffic <<< "$before")
  # Deploying with the exact runtime account requires iam.serviceAccounts.actAs.
  gcloud run deploy "$SERVICE" "${cloud[@]}" --image "$IMAGE_REF" --no-traffic \
    --revision-suffix "$suffix" --service-account "$RUNTIME_ACCOUNT"
fi
after=$(describe)
verify_private <<< "$after"
gcloud run revisions describe "$revision" "${cloud[@]}" --format='json(spec.containers,spec.serviceAccountName,status.conditions)' |
  jq -e --arg image "$IMAGE_REF" --arg runtime "$RUNTIME_ACCOUNT" '
    .spec.containers[0].image == $image and .spec.serviceAccountName == $runtime
    and any(.status.conditions[]; .type == "Ready" and .status == "True")' >/dev/null
url=$(jq -er '.status.url' <<< "$after")
[[ "$url" =~ ^https://[a-z0-9.-]+\.run\.app$ ]]
if [[ -n "$existing" ]]; then
  [[ "$(traffic <<< "$after")" == "$previous_traffic" ]]
  jq -e --arg revision "$revision" 'all(.status.traffic[]; .revisionName != $revision or (.percent // 0) == 0)' <<< "$after" >/dev/null
  detail='Candidate has zero traffic. Prior routing is unchanged.'
else
  detail='First revision of a private service. Internal routing is assigned by Cloud Run.'
fi
printf 'Ready revision: %s\n\nInternal service URL: %s\n\n%s\n' "$revision" "$url" "$detail" >> "$GITHUB_STEP_SUMMARY"
