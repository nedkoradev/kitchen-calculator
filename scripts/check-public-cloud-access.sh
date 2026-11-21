#!/usr/bin/env bash
set -euo pipefail
: "${PROJECT:?}" "${REGION:?}" "${SERVICE:?}" "${RUNTIME_ACCOUNT:?}"
[[ "$PROJECT/$REGION/$SERVICE" == kitchen-designer-9d437/europe-west1/nediq-v3-public ]]
[[ "$RUNTIME_ACCOUNT" == "nediq-v3-public@$PROJECT.iam.gserviceaccount.com" ]]
token=$(gcloud auth print-access-token --quiet)
test_permissions() {
  local url="$1" payload permission granted
  shift
  payload=$(jq -cn --args '$ARGS.positional | {permissions:.}' "$@")
  granted=$(printf 'header = "Authorization: Bearer %s"\n' "$token" |
    curl --config - --fail --silent --show-error --max-time 20 \
      --header 'Content-Type: application/json' --data "$payload" "$url")
  for permission; do
    if ! jq -e --arg permission "$permission" '(.permissions // []) | index($permission) != null' <<< "$granted" >/dev/null; then
      echo "::error::Missing effective permission: $permission" >&2
      return 1
    fi
  done
}

test_permissions "https://iam.googleapis.com/v1/projects/$PROJECT/serviceAccounts/$RUNTIME_ACCOUNT:testIamPermissions" iam.serviceAccounts.actAs
existing=$(gcloud run services list --project "$PROJECT" --region "$REGION" --quiet \
  --filter="metadata.name=$SERVICE" --format='value(metadata.name)')
if [[ -z "$existing" ]]; then
  if [[ ! "${FIREBASE_WEB_API_KEY:-}" =~ ^[A-Za-z0-9_-]{25,100}$ ]]; then
    echo "::error::Set PUBLIC_V3_FIREBASE_WEB_API_KEY in environment public-v3 for first creation." >&2
    exit 1
  fi
  test_permissions "https://cloudresourcemanager.googleapis.com/v1/projects/$PROJECT:testIamPermissions" run.services.create
else
  [[ "$existing" == "$SERVICE" ]]
  test_permissions "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/services/$SERVICE:testIamPermissions" \
    run.services.get run.services.update run.services.getIamPolicy
fi
echo 'PASS runtime actAs and applicable Cloud Run permissions'
