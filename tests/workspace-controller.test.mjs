import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceController} from '../workspace-context/editor-controller.mjs';
import {PROJECTS_FOLDER, validateDocument} from '../document-format/model.mjs';

const scope = {ownerUid: 'owner', actorUid: 'editor'};
const room = {w: 500, h: 500, d: 500};
const materials = {
  pdcMaterials: [{name: 'Дъб', textureUrl: 'oak.png', grainRequired: true}],
  backMaterials: [], worktops: [], edgeMaterials: [{name: 'Кант'}],
};
const part = {part: {key: 'original', x: 0, y: 50, z: 0, w: 100, h: 100, d: 100,
  assembly: 'outer', assemblyStack: [null, 'inner']},
finish: {materialType: 'pdc', material: 0, grainAxis: 'z', edges: [0, null, null, 0]}};
const project = {
  schemaVersion: 1, id: 'project', name: 'Проект', nameKey: 'проект', revision: 5, type: 'project',
  folderId: PROJECTS_FOLDER.id, parts: [part], groups: {outer: 'Външна', inner: 'Вътрешна'},
  room, materials, settings: {},
};
const model = {...project, id: 'model', type: 'model', folderId: null, room: null};
const acknowledge = async ({document}) => ({id: document.id, revision: document.revision});

function fixture(options = {}) {
  let next = 0;
  const persistence = {readProject: async () => project, readModel: async () => model, write: acknowledge,
    ...options.persistence};
  return createWorkspaceController({...options, scope: options.scope ?? scope, persistence,
    newId: () => 'new-' + ++next, operationId: () => 'operation-' + ++next});
}

test('project loads replace scenery only after dirty approval, with cancellation and serialization', async () => {
  let answer;
  const controller = fixture({confirmDiscard: () => new Promise(resolve => { answer = resolve; })});
  await controller.insertModel('model');
  const before = controller.state.document;
  const pending = controller.openProject('project');
  assert.equal(controller.state.phase, 'loading');
  await assert.rejects(controller.undo(), /progress/);
  await Promise.resolve();
  assert.equal(controller.state.phase, 'confirming');
  answer({action: 'cancel'});
  assert.equal(await pending, false);
  assert.deepEqual(controller.state.document, before);
  assert.equal(controller.state.dirty, true);
  const retry = controller.openProject('project');
  await Promise.resolve();
  answer({action: 'discard'});
  assert.equal(await retry, true);
  assert.deepEqual(controller.state.document, project);
  assert.equal(controller.state.canUndo, false);
});

test('failed or invalid reads never discard or run save-and-continue', async () => {
  let confirmed = 0;
  const controller = fixture({confirmDiscard() { confirmed++; return {action: 'discard'}; },
    persistence: {readProject: async ({id}) => {
      if (id === 'invalid') return {...project, room: null};
      throw Object.assign(new Error('unavailable'), {code: 'unavailable'});
    }}});
  await controller.insertModel('model');
  const before = controller.state.document;
  await assert.rejects(controller.openProject('offline'), /unavailable/);
  assert.deepEqual(controller.state.error, {phase: 'loading', code: 'unavailable', message: 'unavailable'});
  await assert.rejects(controller.openProject('invalid'));
  await assert.rejects(controller.newDocument({room: null}));
  assert.equal(confirmed, 0);
  assert.deepEqual(controller.state.document, before);
  assert.equal(controller.state.canUndo, true);
});

test('save-and-continue waits for a scoped acknowledgement and handles conflicts and uncertain outcomes', async () => {
  let failure = 'revision-conflict';
  let sent;
  const controller = fixture({confirmDiscard: async () => ({action: 'save'}),
    persistence: {write: async request => {
      sent = request;
      if (failure) throw Object.assign(new Error(failure), {code: failure});
      return acknowledge(request);
    }}});
  await controller.openProject('project');
  await controller.insertModel('model');
  const edited = controller.state.document;
  await assert.rejects(controller.newDocument(), /revision-conflict/);
  assert.deepEqual(controller.state.document, edited);
  assert.deepEqual(sent.scope, scope);
  assert.equal(sent.expectedRevision, 5);
  assert.match(sent.operationId, /^operation-/);
  failure = 'unknown-outcome';
  await assert.rejects(controller.openProject('project'), /unknown-outcome/);
  assert.equal(controller.state.error.code, failure);
  assert.equal(controller.state.error.operationId, sent.operationId);
  assert.deepEqual(controller.state.document, edited);
  failure = null;
  await controller.openProject('project');
  assert.equal(controller.state.document.revision, 6);
  assert.deepEqual(controller.state.document.parts, edited.parts);
  assert.equal(controller.state.dirty, false);
  assert.equal(await controller.newDocument(), true);
  assert.equal(controller.state.document.id, null);
});

test('patches are atomic, schema-validated and reversible alongside library copies', async () => {
  const controller = fixture();
  await controller.openProject('project');
  await controller.insertModel('model');
  const inserted = controller.state.document;
  assert.equal(inserted.id, project.id);
  assert.deepEqual(inserted.room, project.room);
  const copied = inserted.parts[1];
  assert.notEqual(copied.part.key, part.part.key);
  assert.notEqual(copied.part.assembly, 'outer');
  assert.equal(inserted.groups[copied.part.assembly], 'Външна');
  assert.deepEqual(copied.finish, part.finish);
  assert.deepEqual(inserted.materials, materials);

  const patch = {parts: [structuredClone(copied)], groups: {[copied.part.assembly]: 'Редактиран'},
    materials: {...materials, pdcMaterials: [{name: 'Клен'}]}, settings: {sheetUtilization: 70},
    room: {...room, w: 650}};
  assert.equal(await controller.editScene(patch), true);
  const edited = controller.state.document;
  for (const key of Object.keys(patch)) assert.deepEqual(edited[key], patch[key]);
  patch.parts[0].part.x = 800;
  assert.equal(await controller.editScene({room: edited.room}), false);
  await assert.rejects(controller.editScene({materials: {...materials, pdcMaterials: []}}));
  await assert.rejects(controller.editScene({id: 'invalid'}), /Unknown scene field/);
  assert.deepEqual(controller.state.document, edited);
  validateDocument(edited);
  await controller.undo();
  assert.deepEqual(controller.state.document, inserted);
  await controller.redo();
  assert.deepEqual(controller.state.document, edited);
});

test('Save As separates IDs and role changes cannot restore history invalid for the new type', async () => {
  const controller = fixture();
  await controller.newDocument({type: 'model'});
  await controller.editScene({room});
  const copy = await controller.saveAsDocument({name: 'Копие', type: 'project'});
  validateDocument(copy);
  assert.notEqual(copy.id, project.id);
  assert.equal(copy.revision, 1);
  assert.equal(controller.state.canUndo, false);
  const second = await controller.saveAsDocument({name: 'Второ копие'});
  assert.notEqual(second.id, copy.id);
  await assert.rejects(fixture({persistence: {write: async () => {
    throw Object.assign(new Error('name taken'), {code: 'name-conflict'});
  }}}).saveDocument({name: 'Заето'}), /name taken/);
});

test('draft ports always receive the captured owner and actor and restore only that scope', async () => {
  const rows = new Map();
  const key = ({ownerUid, actorUid}) => JSON.stringify([ownerUid, actorUid]);
  const drafts = {read: profile => rows.get(key(profile)), write: (profile, text) => rows.set(key(profile), text)};
  const currentScope = {...scope};
  const controller = fixture({scope: currentScope, drafts});
  currentScope.actorUid = 'other';
  await controller.openProject('project');
  await controller.editScene({settings: {sheetUtilization: 77}});
  const restored = fixture({drafts});
  assert.equal(restored.state.draftStatus, 'restored');
  assert.deepEqual(restored.state.document, controller.state.document);
  assert.equal(restored.state.dirty, true);
  assert.equal(fixture({scope: currentScope, drafts}).state.draftStatus, 'empty');
  assert.equal(fixture({scope: {...scope, ownerUid: 'other'}, drafts}).state.draftStatus, 'empty');
  assert.equal(rows.size, 1);
});
