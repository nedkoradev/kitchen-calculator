import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment, assertFails, assertSucceeds} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {createEmulatorBackend, projectId} from './emulator/workspace-rc-backend.mjs';
import {prepareNewDocument} from '../workspace-context/context.mjs';
import {createWorkspaceContext} from '../workspace-context/context.mjs';

test('authenticated release rules and trusted service enforce roles, journals and folder transactions', async () => {
  const backend = await createEmulatorBackend();
  const rules = await initializeTestEnvironment({projectId});
  try {
    const principals = ['owner', 'editor', 'viewer', 'outsider'];
    const tokens = Object.fromEntries(await Promise.all(principals.map(async uid => [uid, await backend.identity(uid)])));
    const call = (actorUid, operation, request = {}) => backend.service({token: tokens[actorUid], operation,
      request: {scope: {ownerUid: 'owner', actorUid}, ...request}});
    await backend.db.doc('workspace_v3/owner/grants/editor').set({role: 'editor'});
    await backend.db.doc('workspace_v3/owner/grants/viewer').set({role: 'viewer'});
    const root = await call('owner', 'changeFolder', {change: {action: 'create', name: 'Модели'}, revision: 0});
    const id = root.folders.at(-1).id;
    const nested = await call('editor', 'changeFolder', {change: {action: 'create', parentId: id, name: 'Рафтове'}, revision: 1});
    const child = nested.folders.at(-1).id;
    await assert.rejects(call('editor', 'changeFolder', {change: {action: 'move', id, parentId: child}, revision: 2}), /hierarchy/);
    await assert.rejects(call('owner', 'changeFolder', {change: {action: 'delete', id: 'system:projects'}, revision: 2}), {code: 'protected-folder'});
    await assert.rejects(call('viewer', 'changeFolder', {change: {action: 'delete', id: child}, revision: 2}), {code: 'permission-denied'});
    await call('editor', 'changeFolder', {change: {action: 'rename', id: child, name: 'Ниши'}, revision: 2});
    await call('editor', 'changeFolder', {change: {action: 'move', id: child, parentId: null}, revision: 3});
    const document = {...prepareNewDocument({name: 'Модел', type: 'model', folderId: child}), id: 'model', revision: 1};
    const write = {document, expectedRevision: null, operationId: 'op'};
    const receipt = await call('editor', 'write', write);
    assert.deepEqual(await call('editor', 'write', write), receipt);
    await assert.rejects(call('editor', 'changeFolder', {change: {action: 'delete', id: child}, revision: 4}), {code: 'folder-not-empty'});
    await call('owner', 'changeFolder', {change: {action: 'delete', id}, revision: 4});
    await assert.rejects(call('outsider', 'list'), {code: 'permission-denied'});

    for (const uid of principals) {
      const client = rules.authenticatedContext(uid).firestore();
      const doc = sdk.doc(client, 'workspace_v3/owner/documents/model');
      if (uid === 'outsider') await assertFails(sdk.getDoc(doc));
      else await assertSucceeds(sdk.getDoc(doc));
      await assertFails(sdk.setDoc(doc, document));
    }
    const editor = rules.authenticatedContext('editor').firestore();
    const journal = sdk.doc(editor, 'workspace_v3/owner/pending/editor');
    await assertSucceeds(sdk.getDoc(journal));
    await assertFails(sdk.deleteDoc(journal));
    await assertFails(sdk.getDoc(sdk.doc(rules.authenticatedContext('viewer').firestore(), journal.path)));
    await backend.db.doc('workspace_v3/owner/grants/editor').delete();
    await assertFails(sdk.getDoc(sdk.doc(editor, 'workspace_v3/owner/documents/model')));
    assert.deepEqual(await call('editor', 'reconcile', {operationId: 'op'}), {status: 'committed', ...receipt});
    await call('editor', 'acknowledge', {operationId: 'op'});
    assert.equal(await call('editor', 'pending'), null);
    await assert.rejects(call('editor', 'write', write), {code: 'permission-denied'});
    await assert.rejects(call('viewer', 'pending', {scope: {ownerUid: 'owner', actorUid: 'editor'}}), {code: 'permission-denied'});
  } finally {
    await rules.cleanup();
    await backend.close();
  }
});

test('renderer failure does not commit state, undo stack or staged document', async () => {
  let fail = false;
  const workspace = createWorkspaceContext({beforeSceneChange() { if (fail) throw Error('renderer failure'); }});
  workspace.editScene({settings: {sheetUtilization: 70}});
  const before = workspace.state;
  fail = true;
  assert.throws(() => workspace.editScene({settings: {sheetUtilization: 90}}), /renderer failure/);
  assert.throws(() => workspace.undo(), /renderer failure/);
  assert.throws(() => workspace.newDocument({discardChanges: true}), /renderer failure/);
  assert.deepEqual(workspace.state, before);
});

test('authenticated clients cannot duplicate names or overwrite another committed revision', async () => {
  const backend = await createEmulatorBackend();
  try {
    const ownerUid = 'race-owner';
    const editorUid = 'race-editor';
    const tokens = {[ownerUid]: await backend.identity(ownerUid), [editorUid]: await backend.identity(editorUid)};
    const call = (actorUid, operation, request = {}) => backend.service({token: tokens[actorUid], operation,
      request: {scope: {ownerUid, actorUid}, ...request}});
    await backend.db.doc('workspace_v3/' + ownerUid + '/grants/' + editorUid).set({role: 'editor'});
    const project = {...prepareNewDocument({name: 'Кухня'}), id: 'scene', revision: 1};
    const first = {document: project, expectedRevision: null, operationId: 'create'};
    await call(ownerUid, 'write', first);
    await call(ownerUid, 'acknowledge', first);
    const duplicate = {...prepareNewDocument({name: '  КУХНЯ  ', type: 'model'}), id: 'duplicate', revision: 1};
    await assert.rejects(call(editorUid, 'write', {...first, document: duplicate}), {code: 'name-conflict'});
    const results = await Promise.allSettled([ownerUid, editorUid].map((actor, index) =>
      call(actor, 'write', {document: {...project, revision: 2, settings: {sheetUtilization: 70 + index}},
        expectedRevision: 1, operationId: 'update'})));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.find(result => result.status === 'rejected').reason.code, 'revision-conflict');
    assert.equal((await call(ownerUid, 'readProject', {id: 'scene'})).revision, 2);
    assert.equal((await call(ownerUid, 'list')).documents.length, 1);
  } finally {
    await backend.close();
  }
});

test('composite rules retain v2 access while restricting v3 writes to the service', async () => {
  const rules = await initializeTestEnvironment({projectId});
  try {
    const owner = rules.authenticatedContext('composite-owner').firestore();
    const outsider = rules.authenticatedContext('composite-outsider').firestore();
    const legacyPath = 'users/composite-owner/v2_cabinets/synthetic';
    await assertSucceeds(sdk.setDoc(sdk.doc(owner, legacyPath), {name: 'Синтетичен шкаф'}));
    await assertSucceeds(sdk.getDoc(sdk.doc(owner, legacyPath)));
    await assertFails(sdk.getDoc(sdk.doc(outsider, legacyPath)));
    const v3 = sdk.doc(owner, 'workspace_v3/composite-owner/documents/candidate');
    await assertFails(sdk.setDoc(v3, {name: 'Direct write'}));
    await assertFails(sdk.getDoc(sdk.doc(outsider, 'workspace_v3/composite-owner/pending/composite-owner')));
  } finally {
    await rules.cleanup();
  }
});

test('pilot exporter reads one legacy subtree and applies a reviewed migration exactly once', async () => {
  const {exportPlan, exportPilotCopy, planPilotMigration, applyPilotMigration} = await import('../pilot/migration.mjs');
  const backend = await createEmulatorBackend();
  try {
    const uid = 'synthetic-pilot-export';
    await backend.db.doc('users/' + uid + '/v2_projects/source').set({
      name: 'Пилот', schemaVersion: 1, revision: 2, data: {
        parts: [], room: {w: 3000, h: 2600, d: 3000},
        materials: {pdcMaterials: [], edgeMaterials: [], backMaterials: [], worktops: []}, settings: {},
      },
    });
    await backend.db.doc('users/other-synthetic-owner/v2_cabinets/other').set({name: 'Other'});
    const copy = await exportPilotCopy(backend.db, exportPlan(uid));
    assert.equal(copy.projects.length, 1);
    assert.equal(copy.cabinets.length, 0);
    assert.equal(copy.evidence.sharedGrants, 0);
    const plan = await planPilotMigration(copy, {drafts: [], confirmNoDrafts: true});
    assert.equal(plan.status, 'compatible', JSON.stringify(plan.report?.blockers));
    assert.deepEqual(await applyPilotMigration(backend.db, plan, plan.approvalSha256), {status: 'applied', count: 1});
    assert.deepEqual(await applyPilotMigration(backend.db, plan, plan.approvalSha256), {status: 'already-applied', count: 1});
    assert.equal((await backend.db.doc('users/' + uid + '/v2_projects/source').get()).data().revision, 2);
  } finally { await backend.close(); }
});

test('public v3 reads personal and granted v2 sources while keeping writes in the signed-in user’s base', async () => {
  const {createPublicDispatch} = await import('../release-candidate/public-access.mjs');
  const {toEditorSnapshot} = await import('../workspace-ui/scene-adapter.mjs');
  const backend = await createEmulatorBackend();
  try {
    const materials = {pdcMaterials: [{name: 'Оригинално ПДЧ'}], edgeMaterials: [], worktops: [], backMaterials: []};
    const parts = [{part: {key: 'source-part', x: 0, y: 10, z: 0, w: 20, h: 20, d: 20}, finish: {material: 0}}];
    const owner = 'legacy-owner';
    const project = {schemaVersion: 1, revision: 3, name: 'Стара кухня',
      data: {materials, parts, room: {w: 3000, h: 2600, d: 3000}}};
    const model = {name: 'Стар шкаф', parts, v2: true};
    const projectRef = backend.db.doc('users/' + owner + '/v2_projects/legacy-project');
    const modelRef = backend.db.doc('users/' + owner + '/v2_cabinets/legacy-model');
    const grant = (uid, role) => ({ownerUid: owner, role, ownerName: 'Споделена база'});
    await Promise.all([projectRef.set(project), modelRef.set(model),
      backend.db.doc('users/' + owner + '/materials/source').set({name: 'Оригинална', ...materials}),
      ...['viewer', 'editor'].flatMap(role => [
        backend.db.doc('users/' + owner + '/access_grants/' + role + '@example.test').set(grant(role, role)),
        backend.db.doc('nediq_access/' + role + '@example.test/bases/' + owner).set(grant(role, role)),
      ])]);
    const dispatch = createPublicDispatch({db: backend.db, bundledCatalog: {name: 'Standard', ...materials}, auth: {
      async verifyIdToken(uid, checkRevoked) {
        assert.equal(checkRevoked, true);
        if (uid === 'revoked') throw new Error('Revoked');
        return {uid, email: uid.toUpperCase() + '@example.test', email_verified: uid !== 'unverified',
          firebase: {sign_in_provider: uid === 'password' ? 'password' : 'google.com'}};
      },
    }});
    const call = (token, operation, request = {}) => dispatch({token, operation,
      request: {scope: {ownerUid: token, actorUid: token}, legacyOwnerId: owner, ...request}});
    assert.deepEqual((await call('viewer', 'legacyBases')).map(base => [base.id, base.role]),
      [['viewer', 'owner'], [owner, 'viewer']]);
    assert.deepEqual((await call(owner, 'legacyList')).documents.map(doc => [doc.type, doc.requiresCatalog]),
      [['project', false], ['model', true]]);
    for (const role of ['viewer', 'editor']) {
      const result = await call(role, 'legacyRead', {id: 'legacy-project', type: 'project'});
      assert.deepEqual(toEditorSnapshot(result).parts, parts);
    }
    await assert.rejects(call('viewer', 'legacyRead', {id: 'legacy-model', type: 'model'}), {code: 'legacy-catalog-required'});
    for (const catalogId of ['source', '']) {
      const converted = await call('editor', 'legacyRead', {id: 'legacy-model', type: 'model', catalogId});
      assert.deepEqual(converted.materials.pdcMaterials, materials.pdcMaterials);
    }
    for (const uid of ['password', 'unverified', 'revoked', 'outsider']) {
      await assert.rejects(call(uid, 'legacyList'), {code: 'permission-denied'});
    }
    await assert.rejects(call('editor', 'pending', {scope: {ownerUid: owner, actorUid: 'editor'}}), {code: 'permission-denied'});
    assert.equal(await call('editor', 'pending'), null);
    const context = createWorkspaceContext();
    context.openLegacyProject(await call('editor', 'legacyRead', {id: 'legacy-project', type: 'project'}));
    assert.equal(context.state.document.id, null);
    const copy = await context.saveDocument({name: 'Лично копие', write: data => call('editor', 'write', {...data, operationId: 'legacy-copy'})});
    assert.equal((await backend.db.doc('workspace_v3/editor/documents/' + copy.id).get()).data().revision, 1);
    await backend.db.doc('users/' + owner + '/access_grants/viewer@example.test').delete();
    assert.deepEqual((await call('viewer', 'legacyBases')).map(base => base.id), ['viewer']);
    await assert.rejects(call('viewer', 'legacyRead', {id: 'legacy-project', type: 'project'}), {code: 'permission-denied'});
    assert.deepEqual((await projectRef.get()).data(), project);
    assert.deepEqual((await modelRef.get()).data(), model);
  } finally { await backend.close(); }
});
