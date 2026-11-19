import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceBridge} from '../workspace-ui/bridge.mjs';
import {createWorkspaceController} from '../workspace-context/editor-controller.mjs';

const alpha = {ownerUid: 'alpha', actorUid: 'editor'};
const beta = {ownerUid: 'beta', actorUid: 'editor'};

test('fresh bridge blocks actions until server journal is read and a lost acknowledgement is reconciled', async () => {
  const events = [];
  const states = [];
  let release;
  let pending = 'previous';
  const delayed = new Promise(resolve => { release = resolve; });
  const bridge = createWorkspaceBridge({render: view => states.push(view.gate),
    createController: options => createWorkspaceController({...options, persistence: {
      async pending() { events.push('pending'); await delayed; return pending && {operationId: pending}; },
      async reconcile(request) {
        events.push(request.operationId);
        return {status: 'committed', id: 'confirmed', revision: 1};
      },
      async acknowledge() { pending = null; },
      async write({document}) { events.push('write'); return {id: document.id, revision: document.revision}; },
    }})});
  assert.equal(await bridge.execute('saveDocument', {name: 'Blocked'}), false);
  const opening = bridge.initialize(alpha);
  assert.equal(bridge.state.gate, 'checking-journal');
  assert.equal(await bridge.execute('saveAsDocument', {name: 'Blocked'}), false);
  assert.equal(await bridge.initialize(beta), false);
  release();
  assert.equal(await opening, true);
  assert.deepEqual(events, ['pending', 'previous', 'pending']);
  assert.deepEqual(bridge.state.workspace.reconciledDocument, {id: 'confirmed', revision: 1});
  assert.equal(bridge.state.workspace.document.id, null);
  assert.ok(states.includes('reconciling'));
  await bridge.execute('saveDocument', {name: 'After check'});
  assert.equal(events.at(-1), 'write');
});

test('profile switching verifies both journals and never activates a profile whose journal is unavailable', async () => {
  const events = [];
  let offline = true;
  const bridge = createWorkspaceBridge({createController: options => createWorkspaceController({...options, persistence: {
    async pending({scope}) {
      events.push(scope.ownerUid);
      if (scope.ownerUid === 'beta' && offline) throw new Error('offline');
      return null;
    },
  }})});
  await bridge.initialize(alpha);
  assert.equal(await bridge.initialize(beta), false);
  assert.equal(bridge.state.gate, 'journal-blocked');
  assert.deepEqual(bridge.state.scope, alpha);
  assert.equal(await bridge.execute('newDocument'), false);
  offline = false;
  assert.equal(await bridge.initialize(), true);
  assert.deepEqual(bridge.state.scope, beta);
  assert.deepEqual(events, ['alpha', 'alpha', 'beta', 'alpha', 'beta']);
});

test('unresolved reconciliation fails closed and dirty decisions preserve work on cancellation or write failure', async () => {
  let receipt = {status: 'unknown'};
  let pending = 'op';
  let decision = {action: 'cancel'};
  const bridge = createWorkspaceBridge({confirmDiscard: () => decision,
    createController: options => createWorkspaceController({...options, persistence: {
      async pending() { return pending && {operationId: pending}; },
      async reconcile() { if (receipt.status === 'not-committed') pending = null; return receipt; },
      async write() { throw Object.assign(new Error('Revision conflict'), {code: 'revision-conflict'}); },
    }})});
  assert.equal(await bridge.initialize(alpha), false);
  assert.equal(await bridge.execute('saveDocument', {name: 'Blocked'}), false);
  receipt = {status: 'not-committed'};
  assert.equal(await bridge.initialize(), true);
  await bridge.execute('editScene', {settings: {sheetUtilization: 75}});
  assert.equal(await bridge.execute('newDocument'), false);
  decision = {action: 'save', options: {name: 'First'}};
  assert.equal(await bridge.execute('newDocument'), false);
  assert.equal(bridge.state.error.code, 'revision-conflict');
  assert.equal(bridge.state.workspace.dirty, true);
  assert.equal(bridge.state.workspace.canUndo, true);
  decision = {action: 'discard'};
  assert.equal(await bridge.execute('newDocument'), true);
  assert.equal(bridge.state.workspace.dirty, false);
});
