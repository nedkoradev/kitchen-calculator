#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
export PROJECT=kitchen-designer-9d437 REGION=europe-west1 SERVICE=nediq-v3-public
export RUNTIME_ACCOUNT="ned-iq-v3-public@$PROJECT.iam.gserviceaccount.com"
export GITHUB_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa GITHUB_RUN_ID=19 GITHUB_RUN_ATTEMPT=1
export IMAGE_REF="europe-west1-docker.pkg.dev/$PROJECT/nediq/$SERVICE@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
export GITHUB_STEP_SUMMARY="$scratch/summary" STATE="$scratch/state"
export OLD="$SERVICE-prev" NEW="$SERVICE-gh-19-1"
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
      printf '404'
      exit
    fi
    [[ "$FAILURE" != site && "$(cat "$STATE")" == "$NEW" ]] || exit 22
    ;;
  https://release-check---*/release.json)
    [[ "$FAILURE" != probe ]] || exit 22
    ;;
  https://nediq.eu/staging-api) printf 401; exit;;
  https://nediq.eu/)
    printf '<title>NED-IQ v3.0</title><span id="appVersion">v%s</span>\n' "$RELEASE_VERSION"
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
  export MODE="$1" FAILURE="$2"
  printf '%s' "$OLD" >"$STATE"
  rm -f "$STATE.tag" "$STATE.transitions"
  local actual=0
  bash scripts/deploy-public-production.sh || actual=$?
  [[ "$actual" == "$3" && "$(cat "$STATE")" == "$4" ]]
}
scenario production-probe none 0 "$OLD"
[[ ! -e "$STATE.transitions" ]]
scenario production probe 4 "$OLD"
[[ ! -e "$STATE.transitions" ]]
scenario production none 0 "$NEW"
[[ "$(cat "$STATE.transitions")" == "$NEW" ]]
scenario production site 1 "$OLD"
[[ "$(cat "$STATE.transitions")" == "$NEW"$'\n'"$OLD" ]]
grep -q "Restored $OLD" "$GITHUB_STEP_SUMMARY"
echo 'PASS production probe, fail-before-promotion, promotion and rollback'

export ROLLBACK_REVISION="$OLD" MODE=rollback FAILURE=none
printf '%s' "$NEW" >"$STATE"
bash scripts/deploy-public-production.sh
[[ "$(cat "$STATE")" == "$OLD" ]]
grep -q "Rollback revision: $OLD" "$GITHUB_STEP_SUMMARY"
echo 'PASS manual rollback to explicit ready revision'
