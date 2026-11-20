#!/usr/bin/env bash
set -euo pipefail
image="$1"
container=$(docker run --rm -d "$image")
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker exec "$container" node --input-type=module -e '
  import assert from "node:assert/strict";
  import {setTimeout as delay} from "node:timers/promises";
  let response;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      response = await fetch("http://127.0.0.1:8080/", {redirect: "manual", signal: AbortSignal.timeout(1000)});
      break;
    } catch { await delay(250); }
  }
  assert.equal(response?.status, 302);
  assert.equal(response.headers.get("location"), "https://nedkoradev.github.io/kitchen-calculator/");
  const fallback = await fetch("http://127.0.0.1:8080/fallback", {redirect: "manual"});
  assert.equal(fallback.status, 302);
  assert.equal(fallback.headers.get("location"), response.headers.get("location"));
  const api = await fetch("http://127.0.0.1:8080/staging-api",
    {method: "POST", signal: AbortSignal.timeout(1000)});
  assert.equal(api.status, 503);
  console.log("PASS disabled container redirects to v2.95 and blocks API");
'
