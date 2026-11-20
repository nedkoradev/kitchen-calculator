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
export CANDIDATE="$SERVICE-gh-123-1"
previous="$SERVICE-00008-8jh"
cat > "$scratch/gcloud" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$1 $2 $3" in
  'run services describe')
    if [[ "$*" == *'value(status.url)'* ]]; then
      echo https://nediq-pilot-test.run.app
    else
      jq -n --arg revision "$(cat "$MOCK_TRAFFIC")" '{status:{traffic:[{revisionName:$revision, percent:100}]}}'
    fi ;;
  "run deploy $SERVICE")
    [[ "$*" == *"--image $IMAGE_REF --no-traffic --revision-suffix gh-123-1" ]] ;;
  'run revisions describe')
    [[ "$4" == "$CANDIDATE" ]]
    jq -n --arg image "$IMAGE_REF" --arg ready "$MOCK_READY" '{spec:{containers:[{image:$image}]},status:{conditions:[{type:"Ready",status:$ready}]}}' ;;
  'run services update-traffic')
    [[ "$*" == *"--to-revisions $CANDIDATE=100" ]]
    echo "$CANDIDATE" > "$MOCK_TRAFFIC" ;;
  *) exit 99 ;;
esac
MOCK
chmod +x "$scratch/gcloud"

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
bash scripts/deploy-pilot.sh
[[ "$(cat "$MOCK_TRAFFIC")" == "$CANDIDATE" ]]
grep -Fq 'Serving URL: https://nediq-pilot-test.run.app' "$GITHUB_STEP_SUMMARY"
echo 'PASS pilot deployment verifies target, digest, readiness and preserves old traffic until promotion'
