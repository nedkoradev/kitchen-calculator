import {version} from '../release-candidate/release.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createPilotVerifier, pilotConfig, projectId, restrictPilot, restrictPilotDispatch} from '../pilot/config.mjs';
import {createWorkspaceHttpHandler} from '../release-candidate/http.mjs';
import {createWorkspaceService} from '../release-candidate/service.mjs';
import {startLocalStaging, startWorkspaceHost} from '../rollout-preflight/stage-server.mjs';
import {buildPilotPreview} from '../rollout-preflight/staging-html.mjs';
import {exportPlan, planPilotMigration, applyPilotMigration} from '../pilot/migration.mjs';

const env = {NEDIQ_PILOT_ENABLED: '1', GOOGLE_CLOUD_PROJECT: projectId,
  NEDIQ_PILOT_UID: 'private-test-uid', NEDIQ_PILOT_ORIGIN: 'https://example.run.app',
  NEDIQ_FIREBASE_AUTH_DOMAIN: projectId + '.firebaseapp.com',
  NEDIQ_FIREBASE_WEB_API_KEY: 'synthetic-config-only-test-key'};
const profile = {uid: env.NEDIQ_PILOT_UID, firebase: {sign_in_provider: 'google.com'}, email_verified: true};

test('pilot fails closed for missing deployment scope and serves no private UID in the staged HTML', async () => {
  assert.equal(pilotConfig({}), null);
  assert.throws(() => pilotConfig({...env, FIRESTORE_EMULATOR_HOST: '127.0.0.1:8089'}));
  assert.throws(() => pilotConfig({...env, GOOGLE_CLOUD_PROJECT: 'other'}));
  assert.throws(() => pilotConfig({...env, NEDIQ_PILOT_ORIGIN: 'https://example.run.app/subpath'}));
  const config = pilotConfig(env);
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const staged = buildPilotPreview(source, config);
  assert.match(staged, /staging-auth\.mjs/);
  assert.doesNotMatch(staged, /private-test-uid|src="\.\/cloud\.js"|src="\.\/app-release\.js"/);
});

test('verified Google pilot cannot impersonate another owner or use non-Google sign-in', async () => {
  assert.deepEqual(await restrictPilot(async () => profile, profile.uid)('test-token'), profile);
  await assert.rejects(restrictPilot(async () => ({...profile, email_verified: false}), profile.uid)('token'));
  await assert.rejects(restrictPilot(async () => ({...profile, firebase: {sign_in_provider: 'password'}}), profile.uid)('token'));
  await assert.rejects(restrictPilot(async () => ({...profile, uid: 'outsider'}), profile.uid)('token'));
  const dispatch = restrictPilotDispatch(args => args, profile.uid);
  await assert.rejects(dispatch({request: {scope: {ownerUid: 'another-owner', actorUid: profile.uid}}}), {code: 'permission-denied'});
  const request = {request: {scope: {ownerUid: profile.uid, actorUid: profile.uid}}};
  assert.equal(await dispatch(request), request);
});

test('pilot copy requires explicit draft review and blocks shared grants and altered approvals', async () => {
  assert.throws(() => exportPlan('uid/other'));
  const copy = {ownerUid: profile.uid, projects: [], cabinets: [], folders: [], drafts: [],
    evidence: {sharedGrants: 0}};
  assert.equal((await planPilotMigration(copy)).status, 'blocked');
  assert.equal((await planPilotMigration({...copy, evidence: {sharedGrants: 1}}, {drafts: [], confirmNoDrafts: true})).status, 'blocked');
  const plan = await planPilotMigration(copy, {drafts: [], confirmNoDrafts: true});
  assert.equal(plan.status, 'compatible');
  await assert.rejects(applyPilotMigration(null, plan, 'wrong'), /exact reviewed approval/);
  plan.candidates.folders.push({id: 'wrong'});
  await assert.rejects(applyPilotMigration(null, plan, plan.approvalSha256), /exact reviewed approval/);
});

test('one revocation-aware verification per request and only the verified pilot consumes quota', async () => {
  const calls = [];
  const revoked = Object.assign(new Error('revoked'), {code: 'auth/id-token-revoked'});
  let now = 0;
  const verify = createPilotVerifier({async verifyIdToken(token, checkRevoked) {
    calls.push([token, checkRevoked]);
    if (token === 'revoked') throw revoked;
    return token === 'outsider' ? {...profile, uid: 'outsider'} : profile;
  }}, profile.uid, {limit: 1, now: () => now});

  await assert.rejects(verify('revoked'), error => error === revoked);
  await assert.rejects(verify('outsider'), /not authorized/);
  assert.deepEqual(await verify('pilot'), profile);
  await assert.rejects(verify('over-limit'), /request limit/);
  now = 60_000;
  assert.deepEqual(await verify('next-minute'), profile);
  assert.deepEqual(calls, ['revoked', 'outsider', 'pilot', 'over-limit', 'next-minute']
    .map(token => [token, true]));
});

test('pending logs fixed reasons for denied Auth, claims and Firestore without changing responses', async () => {
  const reasons = [];
  const report = reason => reasons.push(reason);
  let claims = profile;
  let authCode;
  let firestoreCode;
  let reads = 0;
  const verifyToken = createPilotVerifier({async verifyIdToken(_token, checkRevoked) {
    assert.equal(checkRevoked, true);
    if (authCode) throw Object.assign(new Error('private Auth detail'), {code: authCode});
    return claims;
  }}, profile.uid, {report});
  function ref(path) {
    return {path, collection: name => ref(path + '/' + name), doc: id => ref(path + '/' + id)};
  }
  const db = {
    collection: ref, doc: ref,
    async runTransaction(run) {
      return run({async get(reference) {
        reads++;
        assert.equal(reference.path, 'workspace_v3/' + profile.uid + '/pending/' + profile.uid);
        if (firestoreCode) throw Object.assign(new Error('private database detail'), {code: firestoreCode});
        return {data: () => undefined};
      }});
    },
  };
  const dispatch = restrictPilotDispatch(createWorkspaceService({db, verifyToken}), profile.uid, report);
  const handle = createWorkspaceHttpHandler({dispatch, allowedOrigins: [env.NEDIQ_PILOT_ORIGIN]});
  const pending = async (scope = {ownerUid: profile.uid, actorUid: profile.uid}) => {
    const response = await handle(new Request(env.NEDIQ_PILOT_ORIGIN + '/staging-api', {
      method: 'POST', headers: {origin: env.NEDIQ_PILOT_ORIGIN, authorization: 'Bearer private-test-token'},
      body: JSON.stringify({operation: 'pending', request: {scope}}),
    }));
    return response.json();
  };

  async function expectDenied(reason, code = 'permission-denied', scope) {
    assert.deepEqual(await pending(scope), {error: {code, message: code}});
    assert.deepEqual(reasons.splice(0), [reason]);
  }
  authCode = 'auth/insufficient-permission';
  await expectDenied('auth-insufficient-permission');
  authCode = 'auth/private-detail';
  await expectDenied('auth-verification-failed');
  authCode = undefined;
  claims = {...profile, firebase: {sign_in_provider: 'password'}};
  await expectDenied('pilot-provider-mismatch');
  claims = {...profile, email_verified: false};
  await expectDenied('pilot-email-unverified');
  claims = {...profile, uid: 'outsider'};
  await expectDenied('pilot-uid-mismatch');
  claims = profile;
  await expectDenied('pilot-scope-mismatch', 'permission-denied', {ownerUid: 'other', actorUid: profile.uid});
  assert.equal(reads, 0);

  firestoreCode = 7;
  await expectDenied('firestore-pending-permission-denied', 'workspace-error');
  firestoreCode = undefined;
  assert.deepEqual(await pending(), {result: null});
  assert.deepEqual(reasons, []);
  assert.equal(reads, 2);
});

test('workspace host serves the bundled material catalog and blocks other JSON', async t => {
  const host = await startLocalStaging();
  t.after(() => host.close());
  const catalog = await fetch(host.origin + '/materials/default.json');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get('content-type'), 'application/json');
  assert.deepEqual(await catalog.json(),
    JSON.parse(await readFile(new URL('../materials/default.json', import.meta.url), 'utf8')));
  for (const path of ['/package.json', '/firebase.json', '/materials/internal.json']) {
    assert.equal((await fetch(host.origin + path)).status, 404);
  }
});

test('real pilot HTTP routes distinguish the candidate, service URL and configured auth origin', async t => {
  const configured = 'nediq-v3-pilot-579302190437.europe-west1.run.app';
  const canonical = 'nediq-v3-pilot-inu5wh5ola-ew.a.run.app';
  const candidate = 'candidate---' + canonical;
  const pilot = pilotConfig({...env, NEDIQ_PILOT_ORIGIN: 'https://' + configured});
  const server = await startWorkspaceHost({pilot, createPilotDispatch: () => () => {
    assert.fail('Alias or unauthenticated request reached the dispatcher');
  }});
  t.after(() => server.close());
  const http = (host, path, method = 'GET', origin = 'https://' + host) => new Promise((resolve, reject) => {
    request({hostname: '127.0.0.1', port: server.port, path, method, headers: {host, origin}}, async response => {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      resolve({status: response.statusCode, location: response.headers.location, body: Buffer.concat(chunks).toString()});
    }).on('error', reject).end();
  });
  for (const host of [candidate, canonical, configured]) {
    const response = await http(host, '/fallback');
    assert.equal(response.status, 302);
    assert.equal(response.location, 'https://nedkoradev.github.io/kitchen-calculator/');
  }
  assert.equal((await http(canonical, '/')).location, pilot.origin + '/');
  assert.ok((await http(configured, '/')).body.includes('Pilot v' + version));
  assert.equal((await http(configured, '/materials/default.json')).status, 200);
  assert.equal((await http(configured, '/rollout-preflight/staging-auth.mjs')).status, 200);
  assert.equal((await http(candidate, '/')).status, 403);
  assert.equal((await http('nediq-v3-pilot-other.a.run.app', '/fallback')).status, 403);
  assert.equal((await http(canonical, '/staging-api', 'POST', pilot.origin)).status, 403);
  assert.equal((await http(configured, '/staging-api', 'POST', 'https://' + canonical)).status, 403);
  assert.equal((await http(configured, '/staging-api', 'POST')).status, 401);
});

test('public rendering is independently enabled and keeps the dedicated Pilot unchanged', async () => {
  const {publicConfig} = await import('../release-candidate/public-access.mjs');
  const candidateEnv = {...env, NEDIQ_PILOT_ENABLED: '0', NEDIQ_PUBLIC_ENABLED: '1', NEDIQ_PUBLIC_ORIGIN: 'https://nediq.eu'};
  delete candidateEnv.NEDIQ_PILOT_UID;
  const config = publicConfig(candidateEnv);
  assert.equal(publicConfig(env), null);
  assert.throws(() => publicConfig({...candidateEnv, NEDIQ_PILOT_ENABLED: '1'}));
  assert.throws(() => publicConfig({...candidateEnv, NEDIQ_PUBLIC_ORIGIN: 'https://example.run.app'}));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(buildPilotPreview(html, config).includes('id="appVersion">v' + version));
  assert.ok(buildPilotPreview(html, pilotConfig(env)).includes('Pilot v' + version));
});

test('public workspace HTML and release metadata serve the same version', async t => {
  const {publicConfig} = await import('../release-candidate/public-access.mjs');
  const config = publicConfig({...env, NEDIQ_PILOT_ENABLED: '0', NEDIQ_PUBLIC_ENABLED: '1',
    NEDIQ_PUBLIC_ORIGIN: 'https://nediq.eu', NEDIQ_RELEASE_SHA: 'a'.repeat(40),
    NEDIQ_RELEASE_DIGEST: 'sha256:' + 'b'.repeat(64), K_REVISION: 'nediq-v3-public-gh-123-1',
    NEDIQ_RELEASE_TIME: '2026-11-22T00:00:00Z', NEDIQ_RELEASE_RUN: '123'});
  const server = await startWorkspaceHost({pilot: config, createPilotDispatch: () => () => {
    assert.fail('Unexpected API request');
  }});
  t.after(() => server.close());
  const get = path => new Promise((resolve, reject) => {
    request({hostname: '127.0.0.1', port: server.port, path, headers: {host: 'nediq.eu'}}, async response => {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      resolve({status: response.statusCode, body: Buffer.concat(chunks).toString()});
    }).on('error', reject).end();
  });
  const page = await get('/');
  const release = await get('/release.json');
  assert.equal(page.status, 200);
  assert.equal(release.status, 200);
  assert.equal(JSON.parse(release.body).version, version);
  assert.ok(page.body.includes('<title>NED-IQ v' + version + '</title>'));
  assert.ok(page.body.includes('id="appVersion">v' + version + '</span>'));
  assert.ok(page.body.includes('"version":"' + version + '"'));
});

test('local Google acceptance uses separate Auth and an exact loopback emulator', async t => {
  const {localGoogleConfig} = await import('../rollout-preflight/local-google.mjs');
  const localEnv = {NEDIQ_TEST_AUTH_PROJECT: 'nediq-acceptance-test',
    NEDIQ_TEST_FIREBASE_WEB_API_KEY: 'synthetic-config-only-test-key',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8090'};
  for (const overrides of [
    {NEDIQ_TEST_AUTH_PROJECT: projectId},
    {NEDIQ_TEST_AUTH_PROJECT: 'demo-nediq-v3-release'},
    {NEDIQ_TEST_FIREBASE_WEB_API_KEY: ''},
    {FIRESTORE_EMULATOR_HOST: ''},
    {FIRESTORE_EMULATOR_HOST: 'example.com:8090'},
    {FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9100'},
  ]) {
    assert.throws(() => localGoogleConfig({...localEnv, ...overrides}), /separate Firebase Auth project/);
  }
  const pilot = localGoogleConfig(localEnv);
  const start = () => startWorkspaceHost({pilot, port: 8053, createPilotDispatch: () => () => {
    assert.fail('Request without valid Host, Origin or credentials reached the dispatcher');
  }});
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
    const original = process.env[key];
    t.after(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
    delete process.env[key];
  }
  await assert.rejects(start(), /loopback Firestore Emulator/);
  process.env.FIRESTORE_EMULATOR_HOST = localEnv.FIRESTORE_EMULATOR_HOST;
  const server = await start();
  t.after(() => server.close());
  assert.equal(server.address, '127.0.0.1');
  const http = (host, path, method = 'GET', origin = pilot.origin) => new Promise((resolve, reject) => {
    request({hostname: '127.0.0.1', port: server.port, path, method, headers: {host, origin}}, async response => {
      const chunks = [];
      for await (const chunk of response) chunks.push(chunk);
      resolve({status: response.statusCode, body: Buffer.concat(chunks).toString()});
    }).on('error', reject).end();
  });
  const validHost = new URL(pilot.origin).host;
  const page = await http(validHost, '/');
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('id="appVersion">v' + version));
  assert.match(page.body, /"projectId":"nediq-acceptance-test"/);
  assert.doesNotMatch(page.body, /kitchen-designer-9d437/);
  assert.equal((await http('example.com', '/')).status, 403);
  assert.equal((await http(validHost, '/staging-api', 'POST', 'https://example.com')).status, 403);
  assert.equal((await http(validHost, '/staging-api', 'POST')).status, 401);
});
