#!/usr/bin/env bash
set -euo pipefail
container=$(docker run --network none --rm -d \
  -e NEDIQ_RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  -e NEDIQ_RELEASE_DIGEST=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  -e K_REVISION=nediq-v3-public-gh-123-1 -e NEDIQ_RELEASE_TIME=2026-11-21T10:00:00Z -e NEDIQ_RELEASE_RUN=123 \
  -e GOOGLE_CLOUD_PROJECT=kitchen-designer-9d437 -e NEDIQ_PUBLIC_ENABLED=1 \
  -e NEDIQ_PUBLIC_ORIGIN=https://nediq.eu \
  -e NEDIQ_FIREBASE_AUTH_DOMAIN=kitchen-designer-9d437.firebaseapp.com \
  -e NEDIQ_FIREBASE_WEB_API_KEY=synthetic-config-only-test-key "$1")
trap 'docker stop "$container" >/dev/null 2>&1 || true' EXIT
docker exec -i "$container" node --input-type=module <<'NODE'
import {version, probeHost} from '/app/release-candidate/release.mjs';
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
assert.ok(page.body.includes('<title>NED-IQ v' + version + '</title>'));
assert.match(page.body, /<body data-stage-auth="locked">/);
assert.match(page.body, /release-candidate\/panels\.css/);
assert.doesNotMatch(page.body, /<script[^>]+src="\.\/cloud\.js"/);
const release = JSON.parse((await probe('/release.json')).body);
assert.equal(release.version, version);
assert.equal(release.sha, 'a'.repeat(40));
assert.equal(release.revision, 'nediq-v3-public-gh-123-1');
assert.equal((await probe('/release.json', {host: probeHost})).status, 200);
assert.equal((await probe('/app-shell.css', {host: probeHost})).status, 200);
assert.equal((await probe('/', {host: probeHost})).status, 403);
assert.equal((await probe('/staging-api', {host: probeHost, method: 'POST'})).status, 403);
const catalog = await probe('/materials/default.json');
assert.equal(catalog.status, 200);
assert.ok(JSON.parse(catalog.body).pdcMaterials.length > 0);
assert.equal((await probe('/rollout-preflight/staging-auth.mjs')).status, 200);
assert.equal((await probe('/staging-sdk/app.js')).status, 200);
assert.equal((await probe('/staging-sdk/auth.js')).status, 200);
assert.match(page.body, /staging-sdk\/firestore\.js/);
assert.equal((await probe('/staging-sdk/firestore.js')).status, 200);
assert.match(page.body, /src="\/staging-sdk\/xlsx-0\.20\.3\.min\.js"/);
assert.doesNotMatch(page.body, /xlsx@0\.18\.5/);
assert.equal((await probe('/staging-sdk/xlsx-0.20.3.min.js')).status, 200);
assert.equal((await probe('/', {host: 'other.example'})).status, 403);
assert.equal((await probe('/staging-api', {method: 'POST'})).status, 401);
assert.equal((await probe('/staging-api', {method: 'POST', origin: 'https://other.example'})).status, 403);
for (const host of ['nediq.eu', 'nediq-v3-public-579302190437.europe-west1.run.app',
  'nediq-v3-public-inu5wh5ola-ew.a.run.app']) {
  const origin = 'https://' + host;
  const options = {host, origin};
  const root = await probe('/', options);
  assert.equal(root.status, 200);
  assert.ok(root.body.includes('"origin":"' + origin + '"'));
  assert.equal((await probe('/staging-sdk/auth.js', options)).status, 200);
  assert.equal((await probe('/staging-api', {...options, method: 'OPTIONS'})).status, 204);
  assert.equal((await probe('/staging-api', {...options, method: 'POST'})).status, 401);
  assert.equal((await probe('/staging-api', {...options, origin: 'http://' + host, method: 'POST'})).status, 403);
  const crossOrigin = host === 'nediq.eu' ? 'https://nediq-v3-public-579302190437.europe-west1.run.app' : 'https://nediq.eu';
  assert.equal((await probe('/staging-api', {...options, origin: crossOrigin, method: 'POST'})).status, 403);
}
for (const host of ['other.example', 'nediq.eu.other.example', 'candidate---nediq-v3-public-inu5wh5ola-ew.a.run.app',
  'other-service-579302190437.europe-west1.run.app']) {
  assert.equal((await probe('/', {host})).status, 403);
}
console.log('PASS public container serves the configured v3 release and rejects foreign host, origin and anonymous API');
NODE
