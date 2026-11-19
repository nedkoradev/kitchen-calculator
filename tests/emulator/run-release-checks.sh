#!/usr/bin/env bash
set -euo pipefail
export NEDIQ_EMULATOR_E2E=1
export METADATA_SERVER_DETECTION=none
export KITCHEN_TEST_URL=http://127.0.0.1:8051/
python3 -m http.server 8051 --bind 127.0.0.1 >/tmp/nediq-v3-http.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
curl --fail --silent --show-error --retry 5 --retry-connrefused "$KITCHEN_TEST_URL" -o /dev/null
node --test tests/workspace-release-firestore.test.mjs
node tests/workspace-real-editor-browser.cjs
node tests/workspace-staging-browser.cjs
