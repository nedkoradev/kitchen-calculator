import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPilotVerifier, pilotConfig, projectId, restrictPilot, restrictPilotDispatch} from '../pilot/config.mjs';
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
  assert.throws(() => dispatch({request: {scope: {ownerUid: 'another-owner', actorUid: profile.uid}}}), {code: 'permission-denied'});
  const request = {request: {scope: {ownerUid: profile.uid, actorUid: profile.uid}}};
  assert.equal(dispatch(request), request);
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
