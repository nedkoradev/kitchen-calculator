#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
node rollout-preflight/composite-rules.mjs > "$scratch/workspace-v3.rules"
cp tests/emulator/workspace-v3.json "$scratch/firebase.json"
./node_modules/.bin/firebase emulators:exec --only auth,firestore --project demo-nediq-v3-release \
  --config "$scratch/firebase.json" "bash tests/emulator/run-release-checks.sh"
