import test, {after, before, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {createTestFirestorePersistence} from '../workspace-persistence/firestore-test-adapter.mjs';
import {createWorkspaceBridge} from '../workspace-ui/bridge.mjs';
import {createWorkspaceController} from '../workspace-context/editor-controller.mjs';
import {prepareNewDocument} from '../workspace-context/context.mjs';
import {createWorkspaceDraftAdapter} from '../workspace-persistence/drafts.mjs';

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
  throw new Error('Requires the local demo Firestore emulator');
}
const namespace = 'workspace33_test_emulator';
let env;
before(async () => { env = await initializeTestEnvironment({projectId: 'demo-kitchen-projects'}); });
after(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

// This namespace is exercised with the rules-unit-testing privileged emulator context.
// The adapter's authenticated identity and role boundary is checked separately from deployed rules.
const inEmulator = action => env.withSecurityRulesDisabled(dbContext => action(dbContext.firestore()));
const scope = (actorUid = 'alice', ownerUid = 'alice') => ({ownerUid, actorUid});
function adapter(db, actorUid = 'alice', overrides = {}) {
  return createTestFirestorePersistence({db, sdk, namespace, actorUid,
    readRole: async ({transaction, scope: {actorUid, ownerUid}}) =>
      (await transaction.get(sdk.doc(db, namespace, ownerUid, 'grants', actorUid))).data()?.role,
    ...overrides});
}
const document = (id = 'kitchen', options) => ({...prepareNewDocument(options), id, revision: 1});
const create = (id, operationId, options) => ({scope: scope(), document: document(id, options),
  expectedRevision: null, operationId});

test('transaction roundtrip, normalization, owner scopes and roles', () => inEmulator(async db => {
  const alice = adapter(db);
  const request = create('kitchen', 'op1', {name: 'Кухня'});
  await alice.write(request);
  await alice.acknowledge({scope: scope(), operationId: 'op1'});
  assert.deepEqual(await alice.readProject({scope: scope(), id: 'kitchen'}), request.document);
  await assert.rejects(alice.write(create('other', 'op2', {name: '  КУХНЯ  ', type: 'model'})), {code: 'name-conflict'});
  await assert.rejects(alice.readProject({scope: scope('bob'), id: 'kitchen'}), {code: 'permission-denied'});
  const bob = adapter(db, 'bob');
  await assert.rejects(bob.readProject({scope: scope('bob'), id: 'kitchen'}), {code: 'permission-denied'});
  await sdk.setDoc(sdk.doc(db, namespace, 'alice', 'grants', 'bob'), {role: 'viewer'});
  assert.equal((await bob.readProject({scope: scope('bob'), id: 'kitchen'})).id, 'kitchen');
  await assert.rejects(bob.write({...request, scope: scope('bob')}), {code: 'permission-denied'});
  await bob.write({...request, scope: scope('bob', 'bob')});
  assert.deepEqual(await bob.readProject({scope: scope('bob', 'bob'), id: 'kitchen'}), request.document);
}));

test('two editors race the same revision and the losing receipt stays final', () => inEmulator(db => inEmulator(async editorDb => {
  const alice = adapter(db);
  const editor = adapter(editorDb, 'editor');
  const initial = create('kitchen', 'initial');
  await alice.write(initial);
  await alice.acknowledge({scope: scope(), operationId: 'initial'});
  await sdk.setDoc(sdk.doc(db, namespace, 'alice', 'grants', 'editor'), {role: 'editor'});
  const requests = [alice, editor].map((store, i) => ({store, request: {
    scope: scope(i ? 'editor' : 'alice'), operationId: 'revision-2',
    expectedRevision: 1, document: {...initial.document, revision: 2, settings: {sheetUtilization: 80 - i}},
  }}));
  const outcomes = await Promise.allSettled(requests.map(({store, request}) => store.write(request)));
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  const rejected = outcomes.findIndex(value => value.status === 'rejected');
  assert.equal(outcomes[rejected].reason.code, 'revision-conflict');
  await assert.rejects(requests[rejected].store.write(requests[rejected].request), {code: 'revision-conflict'});
  const saved = await alice.readProject({scope: scope(), id: 'kitchen'});
  assert.equal(saved.revision, 2);
  assert.deepEqual(saved, requests[1 - rejected].request.document);
})));

test('same create or Save As receipt is idempotent and its payload cannot change', () => inEmulator(async db => {
  const store = adapter(db);
  const request = create('model', 'same', {type: 'model', name: 'Модел'});
  const first = await store.write(request);
  assert.deepEqual(await store.write(request), first);
  await assert.rejects(store.write({...request, document: {...request.document, id: 'other'}}), {code: 'operation-conflict'});
  await store.acknowledge({scope: scope(), operationId: request.operationId});
  assert.deepEqual(await store.write(request), first);
  assert.equal((await store.readModel({scope: scope(), id: 'model'})).id, 'model');
  await assert.rejects(store.readModel({scope: scope(), id: 'other'}), {code: 'not-found'});
}));

test('reconcile fences a delayed commit and an operation not yet reserved', () => inEmulator(async db => {
  const store = adapter(db);
  let release, waiting;
  const paused = new Promise(resolve => { waiting = resolve; });
  const delay = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const delayed = adapter(db, 'alice', {sdk: {...sdk, async runTransaction(...args) {
    if (++calls === 2) {
      waiting();
      await delay;
    }
    return sdk.runTransaction(...args);
  }}});
  const request = create('kitchen', 'delayed');
  const write = delayed.write(request);
  await paused;
  assert.deepEqual(await store.pending({scope: scope()}), {operationId: 'delayed'});
  try {
    assert.deepEqual(await store.reconcile(request), {status: 'not-committed'});
  } finally {
    release();
  }
  await assert.rejects(write, {code: 'not-committed'});
  const absent = create('other', 'never-started');
  assert.deepEqual(await store.reconcile(absent), {status: 'not-committed'});
  await assert.rejects(store.write(absent), {code: 'not-committed'});
  await assert.rejects(store.readProject({scope: scope(), id: 'kitchen'}), {code: 'not-found'});
}));

test('lost acknowledgement is recoverable after controller restart with history intact', () => inEmulator(async db => {
  const store = adapter(db);
  const rows = new Map();
  const drafts = createWorkspaceDraftAdapter({getItem: key => rows.get(key), setItem: (key, value) => rows.set(key, value)});
  const base = {scope: scope(), drafts};
  const controller = createWorkspaceController({...base, newId: () => 'large', operationId: () => 'lost',
    persistence: {...store, async write(request) {
      await store.write(request);
      throw Object.assign(new Error('Lost confirmation'), {code: 'unknown-outcome'});
    }}});
  const parts = Array.from({length: 750}, (_, i) => ({part: {key: 'panel-' + i,
    x: i, y: 9, z: 0, w: 50, h: 18, d: 100}}));
  await controller.editScene({parts});
  const dirty = controller.state.document;
  await assert.rejects(controller.saveDocument({name: 'Голяма сцена'}), {code: 'unknown-outcome'});
  assert.deepEqual(controller.state.document, dirty);
  assert.equal(controller.state.canUndo, true);
  const restarted = createWorkspaceController({...base, persistence: adapter(db)});
  assert.equal(restarted.state.draftStatus, 'restored');
  await assert.rejects(restarted.saveDocument({name: 'Друг запис'}), {code: 'reconciliation-required'});
  assert.deepEqual(restarted.state.document, dirty);
  assert.equal(restarted.state.canUndo, true);
  assert.deepEqual(await store.pending({scope: scope()}), {operationId: 'lost'});
  assert.equal(await restarted.recoverPendingSave(), 'lost');
  assert.equal(await restarted.reconcileSave(), 'committed');
  assert.deepEqual(restarted.state.reconciledDocument, {id: 'large', revision: 1});
  assert.deepEqual(restarted.state.document, dirty);
  assert.equal(restarted.state.canUndo, true);
  assert.equal(await store.pending({scope: scope()}), null);
  await restarted.openProject('large'); // No confirmation handler, so dirty work is retained.
  assert.equal(restarted.state.document.id, null);
  assert.equal((await store.readProject({scope: scope(), id: 'large'})).parts.length, 750);
}));

test('revoked editor can reconcile only their own reservation and a delayed write stays rejected', () => inEmulator(async db => {
  const grant = sdk.doc(db, namespace, 'alice', 'grants', 'editor');
  await sdk.setDoc(grant, {role: 'editor'});
  const profile = scope('editor');
  const editor = adapter(db, 'editor');
  const outsider = adapter(db, 'outsider');
  let release, waiting;
  const paused = new Promise(resolve => { waiting = resolve; });
  const delay = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const delayed = adapter(db, 'editor', {sdk: {...sdk, async runTransaction(...args) {
    if (++calls === 2) {
      waiting();
      await delay;
    }
    return sdk.runTransaction(...args);
  }}});
  const controller = createWorkspaceController({scope: profile, persistence: delayed,
    newId: () => 'revoked', operationId: () => 'reserved'});
  await controller.editScene({settings: {sheetUtilization: 70}});
  const before = controller.state.document;
  const write = controller.saveDocument({name: 'Отнет достъп'});
  await paused;
  try {
    assert.deepEqual(await editor.pending({scope: profile}), {operationId: 'reserved'});
    await sdk.deleteDoc(grant);
    await assert.rejects(outsider.reconcile({scope: profile, operationId: 'reserved'}), {code: 'permission-denied'});
    await assert.rejects(outsider.reconcile({scope: scope('outsider'), operationId: 'reserved'}), {code: 'permission-denied'});
    await assert.rejects(outsider.write({...create('revoked', 'reserved'), scope: profile}), {code: 'permission-denied'});
  } finally {
    release();
  }
  await assert.rejects(write, {code: 'unknown-outcome'});
  assert.equal(controller.state.pendingOperationId, 'reserved');
  assert.deepEqual(controller.state.document, before);
  assert.equal(controller.state.canUndo, true);
  const restarted = createWorkspaceController({scope: profile, persistence: editor});
  assert.equal(await restarted.recoverPendingSave(), 'reserved');
  assert.equal(await restarted.reconcileSave(), 'not-committed');
  assert.equal(await editor.pending({scope: profile}), null);
  await assert.rejects(editor.write({...create('revoked', 'reserved'), scope: profile}), {code: 'permission-denied'});
  await assert.rejects(adapter(db).readProject({scope: scope(), id: 'revoked'}), {code: 'not-found'});

  await sdk.setDoc(grant, {role: 'editor'});
  const request = {...create('committed', 'committed-op'), scope: profile};
  await editor.write(request);
  await sdk.deleteDoc(grant);
  await assert.rejects(outsider.acknowledge({scope: profile, operationId: request.operationId}), {code: 'permission-denied'});
  assert.deepEqual(await editor.reconcile(request), {status: 'committed', id: 'committed', revision: 1});
  await editor.acknowledge({scope: profile, operationId: request.operationId});
  assert.equal(await editor.pending({scope: profile}), null);
}));

test('a Firestore permission error after reservation commit stays reconcilable', () => inEmulator(async db => {
  const request = create('never-written', 'lost-reservation-ack');
  const store = adapter(db, 'alice', {sdk: {...sdk, async runTransaction(...args) {
    await sdk.runTransaction(...args);
    throw Object.assign(new Error('Injected SDK error'), {code: 'permission-denied'});
  }}});
  await assert.rejects(store.write(request), {code: 'unknown-outcome'});
  const recovered = adapter(db);
  assert.deepEqual(await recovered.pending({scope: scope()}), {operationId: request.operationId});
  assert.deepEqual(await recovered.reconcile(request), {status: 'not-committed'});
  assert.equal(await recovered.pending({scope: scope()}), null);
  await assert.rejects(recovered.readProject({scope: scope(), id: request.document.id}), {code: 'not-found'});
}));

test('UI startup checks the emulator journal after reload and before switching profiles', () => inEmulator(async db => {
  const alpha = scope();
  const beta = scope('bob', 'bob');
  const aliceStore = adapter(db);
  await aliceStore.write(create('existing', 'lost-before-reload', {name: 'Потвърден'}));
  const journalEvents = [];
  let bobOffline = true;
  const bridge = createWorkspaceBridge({createController: options => {
    const store = adapter(db, options.scope.actorUid);
    return createWorkspaceController({...options, persistence: {...store,
      async pending(request) {
        journalEvents.push(request.scope.ownerUid);
        if (request.scope.ownerUid === 'bob' && bobOffline) throw new Error('journal offline');
        return store.pending(request);
      },
    }});
  }});
  assert.equal(await bridge.execute('saveDocument', {name: 'Too early'}), false);
  assert.equal(await bridge.initialize(alpha), true);
  assert.deepEqual(bridge.state.workspace.reconciledDocument, {id: 'existing', revision: 1});
  assert.equal(await aliceStore.pending({scope: alpha}), null);
  assert.equal(await bridge.initialize(beta), false);
  assert.deepEqual(bridge.state.scope, alpha);
  assert.equal(await bridge.execute('saveDocument', {name: 'Blocked switch'}), false);
  bobOffline = false;
  assert.equal(await bridge.initialize(), true);
  assert.deepEqual(bridge.state.scope, beta);
  const first = await bridge.execute('saveDocument', {name: 'Потвърден'});
  assert.equal(first.revision, 1);
  assert.notEqual(first.id, 'existing');
  assert.deepEqual(journalEvents, ['alice', 'alice', 'alice', 'bob', 'alice', 'bob']);
}));
