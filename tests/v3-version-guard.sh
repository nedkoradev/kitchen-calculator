#!/usr/bin/env bash
set -euo pipefail
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir -p "$scratch"/{scripts,release-candidate,docs,_data}
cp scripts/check-v3-version.mjs "$scratch/scripts/"
cd "$scratch"
git init -q
git config user.name fixture
git config user.email fixture@example.test
write_version() { printf "export const version = '%s';\n" "$1" >release-candidate/release.mjs; }
commit() { git add . && git commit -qm "$1"; }
write_version 3.0.9
printf '{"major":2,"minor":96}\n' >_data/version.json
commit baseline
base=$(git rev-parse HEAD)
printf 'docs\n' >docs/notes.md
commit docs
node scripts/check-v3-version.mjs "$base"
printf 'runtime\n' >release-candidate/ui.mjs
commit runtime
if node scripts/check-v3-version.mjs "$base"; then exit 1; fi
write_version 3.0.8
commit lower
if node scripts/check-v3-version.mjs "$base"; then exit 1; fi
write_version 3.0.10
commit higher
node scripts/check-v3-version.mjs "$base"
[[ -z "$(git diff "$base" HEAD -- _data/version.json)" ]]
echo 'PASS docs exemption, same/lower rejection and numeric version bump'
