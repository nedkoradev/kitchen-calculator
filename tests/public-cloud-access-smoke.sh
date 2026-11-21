#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export PATH="$scratch:$PATH" PROJECT=kitchen-designer-9d437 REGION=europe-west1 SERVICE=nediq-v3-public
export RUNTIME_ACCOUNT="ned-iq-v3-public@$PROJECT.iam.gserviceaccount.com"
export FIREBASE_WEB_API_KEY=synthetic-config-only-test-key
cat > "$scratch/gcloud" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2 $3" in
  'auth print-access-token --quiet') echo synthetic-token ;;
  'run services list')
    if [[ "${EXISTING:-}" == yes ]]; then echo "$SERVICE"; fi ;;
  *) exit 99 ;;
esac
MOCK
cat > "$scratch/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
read -r header
[[ "$header" == 'header = "Authorization: Bearer synthetic-token"' ]]
url="${!#}"
while [[ "$1" != --data ]]; do shift; done
case "$url" in
  "https://iam.googleapis.com/v1/projects/$PROJECT/serviceAccounts/$RUNTIME_ACCOUNT:testIamPermissions")
    jq -e '.permissions == ["iam.serviceAccounts.actAs"]' <<< "$2" >/dev/null ;;
  "https://cloudresourcemanager.googleapis.com/v1/projects/$PROJECT:testIamPermissions")
    jq -e '.permissions == ["run.services.create"]' <<< "$2" >/dev/null ;;
  "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/services/$SERVICE:testIamPermissions")
    jq -e '.permissions == ["run.services.get","run.services.update","run.services.getIamPolicy"]' <<< "$2" >/dev/null ;;
  *) exit 99 ;;
esac
jq --arg denied "${DENIED:-}" '.permissions |= map(select(. != $denied))' <<< "$2"
MOCK
chmod +x "$scratch/gcloud" "$scratch/curl"
reject() {
  local expected="$1" result
  shift
  if result=$(env "$@" bash scripts/check-public-cloud-access.sh 2>&1); then
    echo 'Unexpected successful permission preflight' >&2
    exit 1
  fi
  [[ "$result" == *"$expected"* ]]
}
reject iam.serviceAccounts.actAs DENIED=iam.serviceAccounts.actAs
reject run.services.create DENIED=run.services.create
reject run.services.update EXISTING=yes DENIED=run.services.update
reject PUBLIC_V3_FIREBASE_WEB_API_KEY FIREBASE_WEB_API_KEY=
bash scripts/check-public-cloud-access.sh
EXISTING=yes FIREBASE_WEB_API_KEY='' bash scripts/check-public-cloud-access.sh
