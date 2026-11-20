#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash -n scripts/bootstrap-pilot.sh
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gcloud" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  "auth list"*) echo "test@example.com";;
  "projects describe "*"projectId"*) echo kitchen-designer-9d437;;
  "projects describe "*"projectNumber"*) echo 579302190437;;
  "run services describe "*) echo runtime@example.iam.gserviceaccount.com;;
  "artifacts repositories describe "*) echo True;;
  "iam workload-identity-pools providers describe "*)
    case "${MOCK_PROVIDER:-missing}" in
      missing) echo "NOT_FOUND: provider" >&2; exit 1;;
      forbidden) echo "PERMISSION_DENIED: provider" >&2; exit 1;;
      mismatched) echo '{"state":"ACTIVE","oidc":{"issuerUri":"https://evil.example"},"attributeCondition":"true","attributeMapping":{}}';;
    esac;;
  *) echo "Unexpected gcloud call: $*" >&2; exit 99;;
esac
MOCK
cat >"$tmp/bin/gh" <<'MOCK'
#!/usr/bin/env bash
case "$*" in
  "auth status") exit 0;;
  "repo view "*) echo nedkoradev/kitchen-calculator;;
  "api "*) echo 1404199718;;
  *) echo "Unexpected gh call: $*" >&2; exit 99;;
esac
MOCK
chmod +x "$tmp/bin/"*
run_case() {
  local expected="$1" mode="$2" output status
  set +e
  output="$(PATH="$tmp/bin:$PATH" MOCK_PROVIDER="$mode" bash scripts/bootstrap-pilot.sh --check 2>&1)"
  status=$?
  set -e
  if [[ "$expected" == pass ]]; then
    [[ "$status" == 0 ]] || { echo "FAILED $mode: $output"; exit 1; }
  else
    [[ "$status" != 0 ]] || { echo "FAILED $mode: expected refusal"; exit 1; }
  fi
  echo "PASS: --check provider=$mode (exit=$status)"
}
run_case pass missing
run_case fail forbidden
run_case fail mismatched
echo 'Bootstrap mock tests passed (read-only).'
