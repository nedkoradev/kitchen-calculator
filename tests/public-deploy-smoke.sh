#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export PATH="$scratch:$PATH" STATE="$scratch/state" GITHUB_STEP_SUMMARY="$scratch/summary"
export PROJECT=kitchen-designer-9d437 REGION=europe-west1 SERVICE=nediq-v3-public
export RUNTIME_ACCOUNT="ned-iq-v3-public@$PROJECT.iam.gserviceaccount.com"
export IMAGE_REF="europe-west1-docker.pkg.dev/$PROJECT/nediq/ned-iq-v3-public@sha256:$(printf '%064d' 1)"
export GITHUB_RUN_ID=123 GITHUB_RUN_ATTEMPT=1 FIREBASE_WEB_API_KEY=synthetic-config-only-test-key
export REVISION="$SERVICE-gh-123-1"
cat > "$scratch/gcloud" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2 $3" in
  'run services list')
    [[ "${SCENARIO:-}" != denied ]] || exit 13
    if [[ -f "$STATE" ]]; then echo "$SERVICE"; fi ;;
  'auth print-access-token --quiet') echo synthetic-token ;;
  'run services describe')
    ingress=internal
    if [[ "${SCENARIO:-}" == insecure ]]; then ingress=all; fi
    enabled=1
    if [[ "${SCENARIO:-}" == disabled ]]; then enabled=0; fi
    jq -n --arg project "$PROJECT" --arg enabled "$enabled" --arg runtime "$RUNTIME_ACCOUNT" --arg ingress "$ingress" --arg revision "$(cat "$STATE")" '
      {metadata:{annotations:{"run.googleapis.com/ingress":$ingress}},
       spec:{template:{spec:{serviceAccountName:$runtime,containers:[{env:[
         {name:"GOOGLE_CLOUD_PROJECT",value:$project},
         {name:"NEDIQ_PUBLIC_ENABLED",value:$enabled},
         {name:"NEDIQ_PUBLIC_ORIGIN",value:"https://nediq.eu"},
         {name:"NEDIQ_FIREBASE_AUTH_DOMAIN",value:($project+".firebaseapp.com")},
         {name:"NEDIQ_FIREBASE_WEB_API_KEY",value:"synthetic-config-only-test-key"}
       ]}]}}},
       status:{url:"https://private-test.run.app",traffic:[{revisionName:$revision,percent:100}]}}' ;;
  'run services get-iam-policy')
    if [[ "${SCENARIO:-}" == public ]]; then echo '{"bindings":[{"members":["allUsers"]}]}'; else echo '{}'; fi ;;
  "run deploy $SERVICE")
    [[ "$*" == *"--no-traffic --revision-suffix gh-123-1 --service-account $RUNTIME_ACCOUNT" ]]
    [[ "$*" != *--ingress* && "$*" != *--set-env-vars* ]]
    touch "$STATE.updated" ;;
  'run revisions describe')
    [[ "$4" == "$REVISION" ]]
    jq -n --arg image "$IMAGE_REF" --arg runtime "$RUNTIME_ACCOUNT"       '{spec:{containers:[{image:$image}],serviceAccountName:$runtime},status:{conditions:[{type:"Ready",status:"True"}]}}' ;;
  *) exit 99 ;;
esac
MOCK
cat > "$scratch/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
read -r header
[[ "$header" == 'header = "Authorization: Bearer synthetic-token"' ]]
[[ "${!#}" == "https://run.googleapis.com/v2/projects/$PROJECT/locations/$REGION/services?serviceId=$SERVICE" ]]
while [[ "$1" != --data ]]; do shift; done
jq -e --arg runtime "$RUNTIME_ACCOUNT" --arg revision "$REVISION" --arg image "$IMAGE_REF" '
  .ingress == "INGRESS_TRAFFIC_INTERNAL_ONLY" and .invokerIamDisabled == false
  and .template.serviceAccount == $runtime and .template.revision == $revision
  and .template.containers[0].image == $image
  and any(.template.containers[0].env[]; .name == "NEDIQ_PUBLIC_ENABLED" and .value == "1")
  and (has("traffic") | not)' <<< "$2" >/dev/null
printf '%s\n' "$REVISION" > "$STATE"
echo '{"name":"projects/123/locations/europe-west1/operations/operation-123","done":true}'
MOCK
chmod +x "$scratch/gcloud" "$scratch/curl"
if SCENARIO=denied bash scripts/deploy-public-candidate.sh; then exit 1; fi
if FIREBASE_WEB_API_KEY='' bash scripts/deploy-public-candidate.sh; then exit 1; fi
[[ ! -e "$STATE" ]]
bash scripts/deploy-public-candidate.sh
[[ "$(cat "$STATE")" == "$REVISION" && ! -e "$STATE.updated" ]]
grep -Fq 'First revision of a private service' "$GITHUB_STEP_SUMMARY"
echo "$SERVICE-previous" > "$STATE"
for scenario in insecure public disabled; do
  if SCENARIO="$scenario" bash scripts/deploy-public-candidate.sh; then exit 1; fi
done
[[ ! -e "$STATE.updated" ]]
bash scripts/deploy-public-candidate.sh
[[ -e "$STATE.updated" && "$(cat "$STATE")" == "$SERVICE-previous" ]]
grep -Fq 'Candidate has zero traffic' "$GITHUB_STEP_SUMMARY"
echo 'PASS private bootstrap, permission failure and zero-traffic update'
