#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
export PATH="$scratch:$PATH"
export PROJECT=kitchen-designer-9d437 REGION=europe-west1 SERVICE=nediq-v3-pilot
export IMAGE=europe-west1-docker.pkg.dev/kitchen-designer-9d437/nediq/nediq-v3-pilot
printf -v RELEASE_SHA '%040d' 1
printf -v digest '%064d' 2
export RELEASE_SHA IMAGE_REF="$IMAGE@sha256:$digest" GITHUB_RUN_ID=123 GITHUB_RUN_ATTEMPT=1
export GITHUB_STEP_SUMMARY="$scratch/summary" MOCK_TRAFFIC="$scratch/traffic" MOCK_READY=True
export CANDIDATE="$SERVICE-gh-123-1" MOCK_HTTP_STATUS=302
previous="$SERVICE-00008-8jh"
cat > "$scratch/gcloud" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2 $3" in
  'run services describe')
    if [[ "$*" == *'value(status.url)'* ]]; then
      echo https://nediq-pilot-test.run.app
    elif [[ "$*" == *'--format=json'* ]]; then
      jq -n --arg revision "$CANDIDATE" '{status:{traffic:[{revisionName:$revision,tag:"candidate",url:"https://candidate---nediq-pilot-test.run.app",percent:0}]}}'
    else
      jq -n --arg revision "$(cat "$MOCK_TRAFFIC")" '{status:{traffic:[{revisionName:$revision, percent:100}]}}'
    fi ;;
  "run deploy $SERVICE")
    [[ "$*" == *"--image $IMAGE_REF --no-traffic --tag candidate --revision-suffix gh-123-1" ]] ;;
  'run revisions describe')
    [[ "$4" == "$CANDIDATE" ]]
    jq -n --arg image "$IMAGE_REF" --arg ready "$MOCK_READY" '{spec:{containers:[{image:$image}]},status:{conditions:[{type:"Ready",status:$ready}]}}' ;;
  'run services update-traffic')
    [[ "$*" == *"--to-revisions $CANDIDATE=100" || "$*" == *"--to-revisions $SERVICE-00008-8jh=100" ]]
    if [[ "$*" == *"--to-revisions $CANDIDATE=100" ]]; then echo "$CANDIDATE" > "$MOCK_TRAFFIC"; else echo "$SERVICE-00008-8jh" > "$MOCK_TRAFFIC"; fi ;;
  *) exit 99 ;;
esac
MOCK
chmod +x "$scratch/gcloud"
cat > "$scratch/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
set -euo pipefail
headers=''
while (($#)); do
  if [[ "$1" == --dump-header ]]; then headers="$2"; shift 2; else shift; fi
done
if [[ "${MOCK_FAIL_AFTER_PROMOTE:-}" == 1 && "$(cat "$MOCK_TRAFFIC")" == "$CANDIDATE" ]]; then MOCK_HTTP_STATUS=503; fi
printf 'HTTP/2 %s\r\nlocation: https://nedkoradev.github.io/kitchen-calculator/\r\n' "$MOCK_HTTP_STATUS" > "$headers"
printf '%s' "$MOCK_HTTP_STATUS"
MOCK_CURL
chmod +x "$scratch/curl"

echo "$previous" > "$MOCK_TRAFFIC"
if MOCK_READY=False bash scripts/deploy-pilot.sh; then
  echo 'Unready revision was accepted' >&2
  exit 1
fi
[[ "$(cat "$MOCK_TRAFFIC")" == "$previous" ]]
if SERVICE=another-service bash scripts/deploy-pilot.sh; then
  echo 'Another service was accepted' >&2
  exit 1
fi
if IMAGE_REF="$IMAGE:latest" bash scripts/deploy-pilot.sh; then
  echo 'Mutable image tag was accepted' >&2
  exit 1
fi
if MOCK_HTTP_STATUS=503 bash scripts/deploy-pilot.sh; then
  echo 'Failed candidate HTTP probe was accepted' >&2
  exit 1
fi
[[ "$(cat "$MOCK_TRAFFIC")" == "$previous" ]]
if MOCK_FAIL_AFTER_PROMOTE=1 bash scripts/deploy-pilot.sh; then
  echo 'Post-promotion HTTP failure was accepted' >&2
  exit 1
fi
[[ "$(cat "$MOCK_TRAFFIC")" == "$previous" ]]
bash scripts/deploy-pilot.sh
[[ "$(cat "$MOCK_TRAFFIC")" == "$CANDIDATE" ]]
grep -Fq 'Serving URL: https://nediq-pilot-test.run.app' "$GITHUB_STEP_SUMMARY"
echo 'PASS pilot deployment verifies target, digest, readiness and preserves old traffic until promotion'
