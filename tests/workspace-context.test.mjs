import test from 'node:test';
import assert from 'node:assert/strict';
import {readLegacyCabinet, readLegacyProject} from '../document-format/legacy.mjs';
import {validateDocument} from '../document-format/model.mjs';
import {createWorkspaceContext} from '../workspace-context/context.mjs';

const room = {w: 4000, h: 2500, d: 3000};
const catalog = {
  pdcMaterials: [{name: 'Дъб', textureUrl: 'oak.png', grainRequired: true}],
  backMaterials: [{name: 'Гръб'}],
  worktops: [{name: 'Плот'}],
  edgeMaterials: [{name: 'Кант'}],
};
const parts = ['pdc', 'back', 'worktop'].map((materialType, i) => ({
  part: {key: 'p' + i, x: i * 50, y: 50, z: 0, w: 18, h: 100, d: 100,
    assembly: 'outer', assemblyStack: [null, 'inner'], constructorCabinet: 'inner', locks: {w: true}},
  finish: {materialType, material: 0, grainAxis: 'y', edges: [null, 0, null, 0]},
}));
const groups = {outer: 'Външна', inner: 'Вътрешна'};
const scope = 'test-owner';
const model = () => readLegacyCabinet({name: 'Шкаф', parts, assemblyNames: groups, room: {...room, w: 3000}},
  {scope, id: 'cabinet', catalog});
const project = (id = 'project', materials = catalog) => readLegacyProject({
  name: 'Проект', schemaVersion: 1, revision: 7,
  data: {parts: [{...parts[0], part: {...parts[0].part, x: -600}}], room, materials,
    assemblyNames: groups, settings: {sheetUtilization: 85}},
}, {scope, id});
const acknowledge = async ({document}) => ({id: document.id, revision: document.revision});

function workspace(options = {}) {
  let next = 0;
  return createWorkspaceContext({newId: () => 'generated-' + ++next, ...options});
}

test('open replaces the entire scene, keeps identity and requires explicit discard', async () => {
  const context = workspace();
  context.insertModel(await model());
  const dirty = context.state;
  const target = await project();
  assert.throws(() => context.openProject(target), /Confirm/);
  assert.throws(() => context.newDocument(), /Confirm/);
  assert.throws(() => context.openProject({...target, room: null}, {discardChanges: true}));
  assert.deepEqual(context.state, dirty);
  context.openProject(target, {discardChanges: true});
  assert.deepEqual(context.state.document, target);
  assert.equal(context.state.dirty, false);
  assert.equal(context.state.canUndo, false);
  context.newDocument({type: 'model'});
  assert.equal(context.state.document.type, 'model');
  assert.equal(context.state.document.id, null);
  assert.equal(context.state.document.revision, 0);
  assert.deepEqual(context.state.document.parts, []);
});

test('insertion allocates fresh nested groups and remaps all four catalogs without modifying either source', async () => {
  const targetCatalog = {
    pdcMaterials: [{name: 'Дъб', textureUrl: 'wrong.png'}, {grainRequired: true, textureUrl: 'oak.png', name: 'Дъб'}],
    backMaterials: [{name: 'Друг гръб'}],
    worktops: [{name: 'Друг плот'}],
    edgeMaterials: [{name: 'Друг кант'}],
  };
  const original = await project('project', targetCatalog);
  const source = await model();
  const before = structuredClone(source);
  const context = workspace();
  context.openProject(original);
  context.insertModel(source);
  const inserted = context.state.document;
  assert.equal(inserted.id, original.id);
  assert.equal(inserted.revision, original.revision);
  assert.deepEqual(inserted.room, original.room);
  assert.deepEqual(inserted.settings, original.settings);
  assert.deepEqual(inserted.parts[0], original.parts[0]);
  assert.deepEqual(inserted.materials.pdcMaterials, targetCatalog.pdcMaterials);
  assert.equal(inserted.materials.pdcMaterials[1].textureUrl, 'oak.png');
  for (const key of ['backMaterials', 'worktops', 'edgeMaterials']) {
    assert.deepEqual(inserted.materials[key], [...targetCatalog[key], ...catalog[key]]);
  }
  const copies = inserted.parts.slice(1);
  for (const [index, {part, finish}] of copies.entries()) {
    assert.notEqual(part.key, parts[index].part.key);
    assert.equal(part.assembly, copies[0].part.assembly);
    assert.equal(part.assemblyStack[0], null);
    assert.equal(part.assemblyStack[1], part.constructorCabinet);
    assert.equal(inserted.groups[part.assembly], groups.outer);
    assert.equal(inserted.groups[part.constructorCabinet], groups.inner);
    assert.notEqual(part.assembly, 'outer');
    assert.deepEqual(part.locks, {w: true});
    assert.deepEqual(finish, {...parts[index].finish, material: 1, edges: [null, 1, null, 1]});
  }
  validateDocument(inserted);
  assert.deepEqual(source, before);
  assert.deepEqual(original.materials, targetCatalog);
  inserted.parts[1].part.locks.w = false;
  assert.equal(context.state.document.parts[1].part.locks.w, true);
  context.insertModel(source);
  const all = context.state.document.parts;
  assert.equal(new Set(all.map(({part}) => part.key)).size, all.length);
  assert.notEqual(all[1].part.assembly, all[4].part.assembly);
});

test('insertion is one history operation and undo/redo compare with the last successful save', async () => {
  const context = workspace();
  const original = await project();
  context.openProject(original);
  context.insertModel(await model());
  const edited = context.state.document;
  assert.equal(context.state.dirty, true);
  assert.equal(context.undo(), true);
  assert.deepEqual(context.state.document, original);
  assert.equal(context.state.dirty, false);
  assert.equal(context.undo(), false);
  assert.equal(context.redo(), true);
  assert.deepEqual(context.state.document, edited);
  const saved = await context.saveDocument({write: async request => {
    assert.equal(request.expectedRevision, 7);
    assert.equal(request.document.id, original.id);
    assert.equal(request.document.revision, 8);
    return acknowledge(request);
  }});
  assert.equal(context.state.dirty, false);
  context.undo();
  assert.equal(context.state.dirty, true);
  assert.equal(context.state.document.revision, 8);
  context.redo();
  assert.equal(context.state.dirty, false);
  assert.deepEqual(context.state.document, saved);
});

test('failed writes and invalid acknowledgements keep the prior state and pending writes block replacement', async () => {
  const context = workspace();
  const original = await project();
  context.openProject(original);
  context.insertModel(await model());
  const before = context.state;
  await assert.rejects(context.saveDocument({write: async () => { throw new Error('stale revision'); }}), /stale/);
  await assert.rejects(context.saveAsDocument({name: 'Копие', write: async () => ({id: 'other', revision: 1})}),
    /acknowledgement/);
  assert.deepEqual(context.state, before);
  let complete;
  const pending = context.saveDocument({write: request => new Promise(resolve => {
    complete = () => resolve(acknowledge(request));
  })});
  assert.equal(context.state.saving, true);
  assert.throws(() => context.newDocument({discardChanges: true}), /progress/);
  assert.throws(() => context.undo(), /progress/);
  await assert.rejects(context.saveDocument({write: acknowledge}), /progress/);
  complete();
  await pending;
  assert.equal(context.state.document.revision, 8);
});

test('first save and Save As create independent schema 1 documents', async () => {
  const context = workspace();
  context.insertModel(await model());
  const write = async request => {
    assert.equal(request.expectedRevision, null);
    assert.equal(request.document.revision, 1);
    validateDocument(request.document);
    const response = await acknowledge(request);
    request.document.parts.length = 0;
    return response;
  };
  const first = await context.saveDocument({name: 'Първи', write});
  const copy = await context.saveAsDocument({name: 'Копие', type: 'model', folderId: 'bottom', write});
  assert.notEqual(first.id, copy.id);
  assert.equal(copy.folderId, 'bottom');
  assert.equal(context.state.document.id, copy.id);
  copy.parts.length = 0;
  assert.equal(context.state.document.parts.length, parts.length);
  assert.equal(first.parts.length, parts.length);
  assert.equal(context.state.dirty, false);
});

test('draft recovery restores history and the saved revision, and handles invalid or unavailable storage', async () => {
  let raw;
  const store = {read: () => raw, write: value => { raw = value; }};
  const context = workspace({draftStore: store});
  const original = await project();
  context.openProject(original);
  context.insertModel(await model());
  const reopened = workspace({draftStore: store});
  assert.equal(reopened.state.draftStatus, 'restored');
  assert.deepEqual(reopened.state.document, context.state.document);
  assert.equal(reopened.state.dirty, true);
  reopened.undo();
  assert.deepEqual(reopened.state.document, original);
  assert.equal(reopened.state.dirty, false);
  const invalid = JSON.parse(raw);
  invalid.future[0].room = null;
  raw = JSON.stringify(invalid);
  const fallback = workspace({draftStore: store});
  assert.equal(fallback.state.draftStatus, 'read-error');
  assert.equal(fallback.state.document.id, null);
  assert.equal(raw, JSON.stringify(invalid));
  fallback.insertModel(await model());
  assert.equal(raw, JSON.stringify(invalid));
  const offline = workspace({draftStore: {read: () => null, write() { throw new Error('quota'); }}});
  offline.insertModel(await model());
  assert.equal(offline.state.draftStatus, 'write-error');
  assert.equal(offline.state.dirty, true);
});

test('invalid placement or generated ID leaves the scene and history intact', async () => {
  const context = workspace({newId: () => 'p0'});
  const source = await model();
  const before = context.state;
  assert.throws(() => context.insertModel(source), /Duplicate generated/);
  assert.deepEqual(context.state, before);
  source.parts[0].part.w = room.w + 1;
  assert.throws(() => context.insertModel(source), /свободно място/);
  assert.deepEqual(context.state, before);
});
