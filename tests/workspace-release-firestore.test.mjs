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
    const change = (actor, action, props = {}) => call(actor, 'changeModel',
      {action, id: 'model', revision: 1, ...props});
    await assert.rejects(change('viewer', 'delete'), {code: 'permission-denied'});
    await assert.rejects(change('outsider', 'rename', {name: 'Чужд'}), {code: 'permission-denied'});
    const copy = await change('editor', 'copy', {name: 'Копие', folderId: child});
    assert.notEqual(copy.id, 'model');
    const copyDoc = await call('editor', 'readModel', {id: copy.id});
    assert.deepEqual(copyDoc, {...document, id: copy.id, name: 'Копие', nameKey: 'копие'});
    await assert.rejects(change('owner', 'rename', {name: 'КОПИЕ'}), {code: 'name-conflict'});
    await assert.rejects(change('owner', 'move', {folderId: 'system:projects'}), {code: 'folder-not-found'});
    const {folders} = await call('owner', 'changeFolder', {change: {action: 'create', name: 'Целева'}, revision: 5});
    const target = folders.at(-1).id;
    await change('owner', 'rename', {name: 'Нов модел'});
    await assert.rejects(change('owner', 'delete'), {code: 'revision-conflict'});
    await change('editor', 'move', {revision: 2, folderId: target});
    const moved = await call('owner', 'readModel', {id: 'model'});
    assert.deepEqual(moved, {...document, name: 'Нов модел', nameKey: 'нов модел', folderId: target, revision: 3});
    await change('editor', 'delete', {id: copy.id});
    await assert.rejects(call('owner', 'readModel', {id: copy.id}), {code: 'not-found'});
    assert.equal((await backend.db.doc('workspace_v3/owner/names/копие').get()).exists, false);
    assert.equal((await backend.db.doc('workspace_v3/owner/names/модел').get()).exists, false);
    assert.equal((await backend.db.doc('workspace_v3/owner/names/нов модел').get()).data().id, 'model');
    // Projects share the guarded library operations but cannot move into model folders.
    const project = {...prepareNewDocument({name: 'Проект проба', type: 'project'}),
      id: 'project', revision: 1};
    await backend.db.doc('workspace_v3/owner/documents/project').set(project);
    await backend.db.doc('workspace_v3/owner/names/проект проба').set({id: 'project'});
    const projectAction = (actor, action, props = {}) => call(actor, 'changeModel',
      {action, id: 'project', revision: 1, ...props});
    await assert.rejects(projectAction('viewer', 'delete'), {code: 'permission-denied'});
    await assert.rejects(projectAction('outsider', 'rename', {name: 'Чужд проект'}), {code: 'permission-denied'});
    await assert.rejects(projectAction('owner', 'move', {folderId: target}), {code: 'protected-folder'});
    await assert.rejects(projectAction('owner', 'copy', {name: 'Лошо копие', folderId: target}), {code: 'protected-folder'});
    const projectCopy = await projectAction('editor', 'copy', {name: 'Проект копие', folderId: 'system:projects'});
    assert.notEqual(projectCopy.id, project.id);
    assert.deepEqual(await call('owner', 'readProject', {id: projectCopy.id}),
      {...project, id: projectCopy.id, name: 'Проект копие', nameKey: 'проект копие'});
    await assert.rejects(projectAction('owner', 'rename', {name: 'Проект копие'}), {code: 'name-conflict'});
    await projectAction('editor', 'rename', {name: 'Преименуван проект'});
    await assert.rejects(projectAction('owner', 'delete'), {code: 'revision-conflict'});
    assert.equal((await call('owner', 'readProject', {id: 'project'})).name, 'Преименуван проект');
    await projectAction('owner', 'delete', {id: projectCopy.id});
    await assert.rejects(call('owner', 'readProject', {id: projectCopy.id}), {code: 'not-found'});
    assert.equal((await backend.db.doc('workspace_v3/owner/names/проект копие').get()).exists, false);
    assert.equal((await backend.db.doc('workspace_v3/owner/names/проект проба').get()).exists, false);
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

test('public v3 shares library and materials using only current verified grants', async () => {
  const {createPublicDispatch} = await import('../release-candidate/public-access.mjs');
  const {PROJECTS_FOLDER} = await import('../document-format/model.mjs');
  const {toEditorSnapshot} = await import('../workspace-ui/scene-adapter.mjs');
  const backend = await createEmulatorBackend();
  try {
    const materials = {pdcMaterials: [{name: 'Оригинално ПДЧ'}], edgeMaterials: [], worktops: [], backMaterials: []};
    const parts = [{part: {key: 'source-part', x: 0, y: 10, z: 0, w: 20, h: 20, d: 20}, finish: {material: 0}}];
    const owner = 'legacy-owner';
    const project = {schemaVersion: 1, revision: 3, name: 'Стара кухня',
      data: {materials, parts, room: {w: 3000, h: 2600, d: 3000}}};
    const model = {name: 'Стар шкаф', parts, v2: true, category: 'Долен шкаф'};
    const projectRef = backend.db.doc('users/' + owner + '/v2_projects/legacy-project');
    const modelRef = backend.db.doc('users/' + owner + '/v2_cabinets/legacy-model');
    const grant = (uid, role) => ({ownerUid: owner, role, ownerName: 'Споделена база'});
    await Promise.all([projectRef.set(project), modelRef.set(model),
      backend.db.doc('users/' + owner + '/materials/source').set({name: 'Оригинална', ...materials}),
      backend.db.doc('users/' + owner + '/materials/base_a').set({
        name: 'База A',
        pdcMaterials: [{name: 'ПДЧ A', fullW: 2800, fullH: 2070, fullPrice: 42}],
        edgeMaterials: [{name: 'Кант A', price: 1.5}],
        backMaterials: [{name: 'HDF A', thick: 3}],
        worktops: [{name: 'Плот A', fullW: 3000, depth: 600, fullPrice: 90}],
        servicePrices: {cutStart: 2},
      }),
      backend.db.doc('users/' + owner + '/materials/base_b').set({
        name: 'База B',
        pdcMaterials: [{name: 'ПДЧ B', fullW: 2500, fullH: 1830, fullPrice: 55}],
        edgeMaterials: [],
        backMaterials: [],
        worktops: [],
        servicePrices: {},
      }),
      backend.db.doc('users/' + owner + '/materials/_app_preferences').set({
        folders: [{id: 'wardrobes', label: 'Гардероби', aliases: ['Гардероби'], deleted: false, target: null}],
        defaultMaterialBaseId: 'base_a',
      }),
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
    const materialListing = await call(owner, 'materialBases');
    assert.equal(materialListing.defaultBaseId, 'base_a');
    assert.deepEqual(materialListing.items.map(item => item.id).sort(), ['base_a', 'base_b', 'source']);
    assert.equal((await call(owner, 'materialBaseRead', {id: 'base_a'})).data.pdcMaterials[0].name, 'ПДЧ A');
    assert.deepEqual(await call(owner, 'materialBaseSetDefault', {id: 'base_b'}), {id: 'base_b'});
    const saved = await call(owner, 'materialBaseSave', {
      id: 'base_b',
      name: 'База B',
      data: {pdcMaterials: [{name: 'ПДЧ B2'}], edgeMaterials: [], backMaterials: [], worktops: [], servicePrices: {}},
    });
    assert.equal(saved.id, 'base_b');
    assert.equal((await backend.db.doc('users/' + owner + '/materials/base_b').get()).data().pdcMaterials[0].name, 'ПДЧ B2');
    assert.equal((await call(owner, 'materialBaseRename', {id: 'base_b', name: 'База Beta'})).name, 'База Beta');
    await assert.rejects(call(owner, 'materialBaseSave', {name: 'База A', data: {}}),
      {code: 'material-base-name-conflict'});
    const created = await call(owner, 'materialBaseSave', {
      name: 'База C',
      data: {pdcMaterials: [{name: 'ПДЧ C'}], edgeMaterials: [], backMaterials: [], worktops: [], servicePrices: {}},
    });
    assert.equal(created.name, 'База C');
    assert.equal((await call(owner, 'materialBaseRead', {id: created.id})).data.pdcMaterials[0].name, 'ПДЧ C');
    assert.deepEqual(await call(owner, 'materialBaseSetDefault', {id: created.id}), {id: created.id});
    assert.deepEqual(await call(owner, 'materialBaseDelete', {id: created.id}), {id: created.id});
    assert.equal((await backend.db.doc('users/' + owner + '/materials/' + created.id).get()).exists, false);
    assert.equal((await backend.db.doc('users/' + owner + '/materials/_app_preferences').get()).data().defaultMaterialBaseId, '');
    assert.deepEqual(await call(owner, 'materialBaseSetDefault', {id: 'base_b'}), {id: 'base_b'});
    assert.equal((await backend.db.doc('users/' + owner + '/materials/base_a').get()).data().pdcMaterials[0].name, 'ПДЧ A');
    assert.equal((await backend.db.doc('users/' + owner + '/materials/base_b').get()).data().name, 'База Beta');
    assert.equal((await backend.db.doc('users/' + owner + '/materials/_app_preferences').get()).data().defaultMaterialBaseId, 'base_b');
    for (const role of [owner, 'viewer', 'editor']) {
      const listing = await call(role, 'legacyList');
      const folderId = listing.documents.find(doc => doc.id === 'legacy-model').folderId;
      assert.equal(listing.folders.find(folder => folder.id === folderId).label, 'Долен шкаф');
      assert.deepEqual(listing.folders.find(folder => folder.id === 'wardrobes'), {id: 'wardrobes', label: 'Гардероби'});
    }
    for (const role of ['viewer', 'editor']) {
      const result = await call(role, 'legacyRead', {id: 'legacy-project', type: 'project'});
      assert.deepEqual(toEditorSnapshot(result).parts, parts);
    }
    await assert.rejects(call('viewer', 'legacyRead', {id: 'legacy-model', type: 'model'}), {code: 'legacy-catalog-required'});
    for (const catalogId of ['source', '']) {
      const converted = await call('editor', 'legacyRead', {id: 'legacy-model', type: 'model', catalogId});
      assert.deepEqual(converted.materials.pdcMaterials, materials.pdcMaterials);
    }
    await backend.db.doc('workspace_v3/' + owner + '/settings/folders').set({revision: 1, folders: [
      PROJECTS_FOLDER, {id: 'v2-imports', parentId: null, name: 'Документи v2.95'},
    ]});
    const projectCandidate = await call(owner, 'legacyRead', {id: 'legacy-project', type: 'project'});
    assert.deepEqual(await call(owner, 'migrateLegacy', {document: projectCandidate}), {status: 'imported'});
    assert.deepEqual(await call(owner, 'migrateLegacy', {document: projectCandidate}), {status: 'already-imported'});
    const modelCandidate = await call(owner, 'legacyRead', {id: 'legacy-model', type: 'model',
      catalogId: 'source', folderId: 'v2-imports'});
    assert.equal(modelCandidate.source.catalogId, 'source');
    assert.deepEqual(await call(owner, 'migrateLegacy', {document: modelCandidate}), {status: 'imported'});
    const storedModel = (await backend.db.doc('workspace_v3/' + owner + '/documents/' + modelCandidate.id).get()).data();
    assert.deepEqual(storedModel, modelCandidate);
    await assert.rejects(call('editor', 'migrateLegacy', {document: projectCandidate}), {code: 'permission-denied'});
    const altered = structuredClone(modelCandidate);
    altered.parts[0].part.w++;
    await assert.rejects(call(owner, 'migrateLegacy', {document: altered}), {code: 'legacy-source-changed'});
    for (const uid of ['password', 'unverified', 'revoked', 'outsider']) {
      await assert.rejects(call(uid, 'legacyList'), {code: 'permission-denied'});
    }
    const shared = (actor, operation, request) => call(actor, operation,
      {...request, scope: {ownerUid: owner, actorUid: actor}});
    assert.equal(await shared('editor', 'pending'), null);
    assert.equal((await shared('editor', 'list')).documents.find(doc => doc.id === storedModel.id).name, storedModel.name);
    assert.equal((await shared('viewer', 'materialBaseRead', {id: 'base_a'})).data.pdcMaterials[0].name, 'ПДЧ A');
    const rename = {action: 'rename', id: storedModel.id, revision: storedModel.revision, name: 'Редактиран шкаф'};
    await assert.rejects(shared('viewer', 'changeModel', rename), {code: 'permission-denied'});
    await shared('editor', 'changeModel', rename);
    assert.equal((await shared('editor', 'readModel', {id: storedModel.id})).name, rename.name);
    await assert.rejects(shared('editor', 'changeModel', rename), {code: 'revision-conflict'});
    const renameBase = {id: 'base_b', name: 'Споделена база B'};
    await assert.rejects(shared('viewer', 'materialBaseRename', renameBase), {code: 'permission-denied'});
    await shared('editor', 'materialBaseRename', renameBase);
    assert.equal((await call(owner, 'materialBaseRead', {id: 'base_b'})).name, renameBase.name);
    await assert.rejects(shared('outsider', 'list'), {code: 'permission-denied'});
    await assert.rejects(shared('outsider', 'materialBases'), {code: 'permission-denied'});
    assert.equal(await call('editor', 'pending'), null);
    const context = createWorkspaceContext();
    context.openLegacyProject(await call('editor', 'legacyRead', {id: 'legacy-project', type: 'project'}));
    assert.equal(context.state.document.id, null);
    const copy = await context.saveDocument({name: 'Лично копие', write: data => call('editor', 'write', {...data, operationId: 'legacy-copy'})});
    assert.equal((await backend.db.doc('workspace_v3/editor/documents/' + copy.id).get()).data().revision, 1);
    await backend.db.doc('users/' + owner + '/access_grants/viewer@example.test').delete();
    assert.deepEqual((await call('viewer', 'legacyBases')).map(base => base.id), ['viewer']);
    await assert.rejects(call('viewer', 'legacyRead', {id: 'legacy-project', type: 'project'}), {code: 'permission-denied'});
    await assert.rejects(shared('viewer', 'list'), {code: 'permission-denied'});
    assert.deepEqual((await projectRef.get()).data(), project);
    assert.deepEqual((await modelRef.get()).data(), model);
  } finally { await backend.close(); }
});
