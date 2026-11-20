#!/usr/bin/env bash
set -euo pipefail
image="$1"
container=$(docker run --rm -d -p 127.0.0.1::8080 "$image")
trap 'docker stop "$container" >/dev/null' EXIT
origin=http://$(docker port "$container" 8080/tcp)
curl --fail --silent --show-error --retry 5 --retry-connrefused "$origin/" -o /dev/null
[[ $(curl --silent -o /dev/null -w '%{redirect_url}' "$origin/") == 'https://nediq.eu/' ]]
[[ $(curl --silent -o /dev/null -w '%{http_code}' -X POST "$origin/staging-api") == 503 ]]
