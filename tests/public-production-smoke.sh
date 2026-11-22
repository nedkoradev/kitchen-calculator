#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export PROJECT=kitchen-designer-9d437 REGION=europe-west1 SERVICE=nediq-v3-public
export RUNTIME_ACCOUNT="ned-iq-v3-public@$PROJECT.iam.gserviceaccount.com"
export GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa GITHUB_RUN_ID=19 GITHUB_RUN_ATTEMPT=1
export IMAGE_REF="europe-west1-docker.pkg.dev/$PROJECT/nediq/$SERVICE@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
export GITHUB_STEP_SUMMARY="$scratch/summary" STATE="$scratch/state"
export OLD="$SERVICE-00004-fixture" NEW="$SERVICE-gh-19-1"
export RELEASE_VERSION
RELEASE_VERSION=$(node --input-type=module -e "import {version} from './release-candidate/release.mjs'; console.log(version)")
cat >"$scratch/gcloud" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$2 $3" in
  'services describe')
    target=$(cat "$STATE")
    tag=null
    if [[ -f "$STATE.tag" ]]; then
      tag=$(jq -cn --arg rev "$NEW" '{tag:"release-check",revisionName:$rev,url:"https://release-check---nediq-v3-public-inu5wh5ola-ew.a.run.app",percent:0}')
    fi
    jq -cn --arg target "$target" --arg account "$RUNTIME_ACCOUNT" --arg project "$PROJECT" --argjson tag "$tag" '
      {metadata:{annotations:{"run.googleapis.com/ingress":"all"}},
        spec:{template:{spec:{serviceAccountName:$account,containers:[{env:[
        {name:"GOOGLE_CLOUD_PROJECT",value:$project},{name:"NEDIQ_PUBLIC_ENABLED",value:"1"},
        {name:"NEDIQ_PUBLIC_ORIGIN",value:"https://nediq.eu"}]}]}}},
        status:{traffic:([{percent:100,revisionName:$target}] + (if $tag == null then [] else [$tag] end))}}'
    ;;
  'revisions describe')
    [[ "$FAILURE" != revision ]] || exit 1
    jq -cn --arg image "$IMAGE_REF" --arg account "$RUNTIME_ACCOUNT" '{spec:{serviceAccountName:$account,
      containers:[{image:$image}]},status:{conditions:[{type:"Ready",status:"True"}]}}'
    ;;
  "deploy $SERVICE")
    [[ " $* " == *' --no-traffic '* && " $* " == *' --tag release-check '* ]]
    touch "$STATE.tag"
    ;;
  'services update-traffic')
    target=${@: -1}
    printf '%s' "${target%=100}" >"$STATE"
    printf '%s\n' "${target%=100}" >>"$STATE.transitions"
    ;;
  *) exit 9;;
esac
MOCK
cat >"$scratch/curl" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
url=${@: -1}
case "$url" in
  https://nediq.eu/release.json)
    if [[ "$*" == *"--write-out"* ]]; then
      if [[ "$PREVIOUS_STATUS" == 200 ]]; then
        args=("$@")
        for ((i=0; i<${#args[@]}; i++)); do
          if [[ "${args[i]}" == --output ]]; then
            jq -cn --arg version "${METADATA_VERSION:-$PREVIOUS_VERSION}" --arg rev "$OLD" \
              '{version:$version,revision:$rev,sha:"old"}' >"${args[i+1]}"
            break
          fi
        done
      fi
      printf '%s' "$PREVIOUS_STATUS"
      exit
    fi
    [[ "$FAILURE" != site && "$(cat "$STATE")" == "$NEW" ]] || exit 22
    ;;
  https://release-check---*/release.json)
    [[ "$FAILURE" != probe ]] || exit 22
    ;;
  https://nediq.eu/staging-api) printf 401; exit;;
  https://nediq.eu/)
    version="$PREVIOUS_VERSION"
    if [[ "$(cat "$STATE")" == "$NEW" ]]; then version="$RELEASE_VERSION"; fi
    header="$version"
    if [[ "$FAILURE" == ui && "$(cat "$STATE")" == "$NEW" ]]; then header=3.0.0; fi
    printf '<title>NED-IQ v%s</title><span id="appVersion">v%s</span>\n' "$version" "$header"
    exit
    ;;
  */app-shell.css|*/staging-sdk/auth.js|*/rollout-preflight/staging-auth.mjs) exit;;
  *) exit 9;;
esac
jq -cn --arg rev "$NEW" --arg sha "$GITHUB_SHA" --arg digest "${IMAGE_REF##*@}" --arg version "$RELEASE_VERSION"   '{revision:$rev,sha:$sha,digest:$digest,version:$version,tests:{result:"success"}}'
MOCK
printf '#!/bin/bash\nprintf "%%s\\trefs/heads/main\\n" "$GITHUB_SHA"\n' >"$scratch/git"
printf '#!/bin/bash\nexit 0\n' >"$scratch/sleep"
chmod +x "$scratch"/{gcloud,curl,git,sleep}
export PATH="$scratch:$PATH"
scenario() {
  export MODE="$1" FAILURE="$2" PREVIOUS_VERSION="${5:-3.0.0}" PREVIOUS_STATUS="${6:-404}"
  printf '%s' "$OLD" >"$STATE"
  rm -f "$STATE.tag" "$STATE.transitions"
  local actual=0
  bash scripts/deploy-public-production.sh || actual=$?
  [[ "$actual" == "$3" && "$(cat "$STATE")" == "$4" ]]
}
scenario production-probe none 0 "$OLD"
[[ ! -e "$STATE.transitions" ]]
unset ROLLBACK_REVISION
scenario production-probe none 0 "$OLD"
[[ ! -e "$STATE.transitions" ]]
scenario production probe 4 "$OLD"
[[ ! -e "$STATE.transitions" ]]
scenario production none 0 "$NEW"
[[ "$(cat "$STATE.transitions")" == "$NEW" ]]
scenario production site 1 "$OLD"
[[ "$(cat "$STATE.transitions")" == "$NEW"$'\n'"$OLD" ]]
scenario production ui 1 "$OLD"
[[ "$(cat "$STATE.transitions")" == "$NEW"$'\n'"$OLD" ]]
for status in 200 404; do
  scenario production none 1 "$OLD" "$RELEASE_VERSION" "$status"
  [[ ! -e "$STATE.tag" ]]
  scenario production none 1 "$OLD" 3.999.0 "$status"
  [[ ! -e "$STATE.tag" ]]
  scenario production none 0 "$NEW" 3.0.0 "$status"
done
export METADATA_VERSION=3.9.0
scenario production none 1 "$OLD" 3.0.0 200
[[ ! -e "$STATE.tag" ]]
unset METADATA_VERSION
scenario production none 1 "$OLD" 3.0.0 503
[[ ! -e "$STATE.tag" ]]
grep -q "Restored $OLD" "$GITHUB_STEP_SUMMARY"
echo 'PASS production probe, fail-before-promotion, promotion and rollback'

export ROLLBACK_REVISION="$OLD" MODE=rollback FAILURE=none
printf '%s' "$NEW" >"$STATE"
bash scripts/deploy-public-production.sh
[[ "$(cat "$STATE")" == "$OLD" ]]
grep -q "Rollback revision: $OLD" "$GITHUB_STEP_SUMMARY"
for invalid in '' 'nediq-v3-public-' 'nediq-v3-public-foo--bar' 'other-service-00001'; do
  export ROLLBACK_REVISION="$invalid"
  output=''
  if output=$(bash scripts/deploy-public-production.sh 2>&1); then
    echo "Expected invalid rollback revision to fail: $invalid" >&2
    exit 1
  fi
  if [[ -z "$invalid" ]]; then
    grep -q 'requires rollback_revision' <<<"$output"
  else
    grep -q 'Invalid rollback_revision' <<<"$output"
  fi
done
export ROLLBACK_REVISION="$OLD" FAILURE=revision
printf '%s' "$NEW" >"$STATE"
rm -f "$STATE.transitions"
output=''
if output=$(bash scripts/deploy-public-production.sh 2>&1); then
  echo 'Expected unavailable rollback revision to fail' >&2
  exit 1
fi
grep -q 'does not exist, is not Ready' <<<"$output"
[[ "$(cat "$STATE")" == "$NEW" && ! -e "$STATE.transitions" ]]
echo 'PASS manual rollback to explicit ready revision'
