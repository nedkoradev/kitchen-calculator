#!/usr/bin/env bash
set -euo pipefail
container=$(docker run --network none --rm -d \
  -e GOOGLE_CLOUD_PROJECT=kitchen-designer-9d437 -e NEDIQ_PUBLIC_ENABLED=1 \
  -e NEDIQ_PUBLIC_ORIGIN=https://nediq.eu \
  -e NEDIQ_FIREBASE_AUTH_DOMAIN=kitchen-designer-9d437.firebaseapp.com \
  -e NEDIQ_FIREBASE_WEB_API_KEY=synthetic-config-only-test-key "$1")
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker exec -i "$container" node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';

const probe = (path, {host = 'nediq.eu', origin = 'https://nediq.eu', method = 'GET'} = {}) =>
  new Promise((resolve, reject) => {
    request({hostname: '127.0.0.1', port: 8080, path, method, headers: {host, origin}}, async response => {
      const parts = [];
      for await (const chunk of response) parts.push(chunk);
      resolve({status: response.statusCode, body: Buffer.concat(parts).toString()});
    }).on('error', reject).end();
  });
let page;
for (let attempt = 0; attempt < 30; attempt++) {
  try { page = await probe('/'); break; }
  catch { await delay(250); }
}
assert.equal(page?.status, 200);
assert.match(page.body, /<title>NED-IQ v3\.0\.0<\/title>/);
const catalog = await probe('/materials/default.json');
assert.equal(catalog.status, 200);
assert.ok(JSON.parse(catalog.body).pdcMaterials.length > 0);
assert.equal((await probe('/rollout-preflight/staging-auth.mjs')).status, 200);
assert.equal((await probe('/staging-sdk/app.js')).status, 200);
assert.equal((await probe('/staging-sdk/auth.js')).status, 200);
const sheetJsPath = page.body.match(/src="\.\/(assets\/vendor\/sheetjs\/xlsx-[\d.]+\.min\.js)"/)?.[1];
assert.ok(sheetJsPath);
assert.equal((await probe('/' + sheetJsPath)).status, 200);
assert.equal((await probe('/', {host: 'other.example'})).status, 403);
assert.equal((await probe('/staging-api', {method: 'POST'})).status, 401);
assert.equal((await probe('/staging-api', {method: 'POST', origin: 'https://other.example'})).status, 403);
console.log('PASS public container serves v3.0.0 and rejects foreign host, origin and anonymous API');
NODE
