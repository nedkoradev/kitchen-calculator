import test from 'node:test';
import assert from 'node:assert/strict';
import {readLegacyCabinet, readLegacyProject} from '../document-format/legacy.mjs';
import {PROJECTS_FOLDER} from '../document-format/model.mjs';
import {applyLegacyMigration, inspectLegacyMigration} from '../release-candidate/legacy-migration.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';
import {documentToSnapshot} from '../workspace-ui/scene-adapter.mjs';
import {fixtureDocuments} from './fixtures/workspace-real-editor.mjs';
import {folders} from './fixtures/workspace-real-store.mjs';

const scope = {ownerUid: 'owner', actorUid: 'owner'};
const modelFolderId = 'shelves';

function sourceRecords() {
  const [project, model] = fixtureDocuments();
  const projectData = documentToSnapshot(project).snapshot;
  const modelData = documentToSnapshot(model).snapshot;
  const catalog = structuredClone(modelData.materials);
  Object.assign(catalog.pdcMaterials[0], {
    grainRequired: true, textureGrainDirection: 'horizontal', textureWidthMm: 1200, textureHeightMm: 600,
  });
  return {
    projects: [{id: 'legacy-project', name: project.name, type: 'project', requiresCatalog: false,
      record: {schemaVersion: 1, revision: 7, name: project.name, data: projectData}}],
    cabinets: [{id: 'legacy-model', name: model.name, type: 'model', requiresCatalog: true, folderId: 'old-category',
      record: {id: 'legacy-model', v2: true, name: model.name, parts: modelData.parts, room: modelData.room,
        materials: undefined, category: 'Стар шкаф', settings: modelData.settings,
        calculationSettings: {sheetUtilization: 80}, assemblyNames: modelData.assemblyNames},
      catalog}],
  };
}

function fakeStore({existing = [], changeSource = false, failMigration = null} = {}) {
  const source = sourceRecords();
  const documents = structuredClone(existing);
  let migrationCalls = 0;
  let sourceChanged = false;
  const readLegacy = async request => {
    if (request.scope.actorUid !== 'owner' || request.legacyOwnerId !== 'owner') {
      throw Object.assign(new Error('permission-denied'), {code: 'permission-denied'});
    }
    const item = [...source.projects, ...source.cabinets].find(row => row.id === request.id);
    if (!item) throw Object.assign(new Error('not-found'), {code: 'not-found'});
    const record = structuredClone(item.record);
    if (changeSource && sourceChanged && request.id === 'legacy-project') record.revision++;
    const converted = item.type === 'project'
      ? await readLegacyProject(record, {scope: 'owner', id: item.id})
      : await readLegacyCabinet({...record, materials: item.requiresCatalog ? undefined : item.catalog},
        {scope: 'owner', id: item.id, catalog: item.catalog, folderId: request.folderId});
    if (item.requiresCatalog) converted.source.catalogId = request.catalogId ?? 'source';
    return converted;
  };
  const store = {
    async legacyList() {
      return {documents: [...source.projects, ...source.cabinets].map(({id, name, type, requiresCatalog, folderId}) =>
        ({id, name, type, requiresCatalog, folderId})), catalogs: [{id: 'source', name: 'Оригинална база'}]};
    },
    async legacyRead(request) { return readLegacy(request); },
    async list() { return {folders, documents, revision: 1}; },
    async readProject({id}) {
      const doc = documents.find(row => row.id === id && row.type === 'project');
      if (!doc) throw Object.assign(new Error('not-found'), {code: 'not-found'});
      return structuredClone(doc);
    },
    async readModel({id}) {
      const doc = documents.find(row => row.id === id && row.type === 'model');
      if (!doc) throw Object.assign(new Error('not-found'), {code: 'not-found'});
      return structuredClone(doc);
    },
    async migrateLegacy({document}) {
      migrationCalls++;
      if (failMigration) throw Object.assign(new Error(failMigration), {code: failMigration});
      const previous = documents.find(row => row.id === document.id);
      if (previous) return {status: comparableJson(previous) === comparableJson(document)
        ? 'already-imported' : 'existing-not-updated'};
      if (documents.some(row => row.nameKey === document.nameKey)) return {status: 'name-conflict'};
      documents.push(structuredClone(document));
      return {status: 'imported'};
    },
  };
  return {store, source, documents, calls: () => migrationCalls, changeSource: () => { sourceChanged = true; }};
}

test('preflight and one-document writes preserve project/model scene data and v2 originals', async () => {
  const fake = fakeStore();
  const originals = structuredClone(fake.source);
  const plan = await inspectLegacyMigration({store: fake.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  assert.deepEqual(plan.rows.map(row => row.status), ['ready', 'ready']);
  const project = plan.rows[0].document;
  const model = plan.rows[1].document;
  assert.equal(project.revision, 7);
  assert.equal(project.folderId, PROJECTS_FOLDER.id);
  assert.equal(model.folderId, modelFolderId);
  assert.deepEqual(model.parts[0], fake.source.cabinets[0].record.parts[0]);
  assert.equal(model.materials.pdcMaterials[0].textureUrl, 'materials/textures/дъб небраска.png');
  assert.deepEqual({
    grainRequired: model.materials.pdcMaterials[0].grainRequired,
    textureGrainDirection: model.materials.pdcMaterials[0].textureGrainDirection,
    textureWidthMm: model.materials.pdcMaterials[0].textureWidthMm,
    textureHeightMm: model.materials.pdcMaterials[0].textureHeightMm,
  }, {grainRequired: true, textureGrainDirection: 'horizontal', textureWidthMm: 1200, textureHeightMm: 600});
  assert.deepEqual(model.parts[0].finish.edges, [0, null, null, null]);
  assert.deepEqual(model.parts[0].part.assemblyStack, [null, 'inner']);
  assert.equal(model.settings.sheetUtilization, 80);
  assert.deepEqual(model.source.originalSettings, {
    settings: fake.source.cabinets[0].record.settings,
    calculationSettings: fake.source.cabinets[0].record.calculationSettings,
  });
  const report = await applyLegacyMigration({store: fake.store, plan});
  assert.deepEqual(report.rows.map(row => row.status), ['imported', 'imported']);
  assert.deepEqual(fake.source, originals);
  assert.equal(fake.documents.length, 2);

  const repeated = await inspectLegacyMigration({store: fake.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  assert.deepEqual(repeated.rows.map(row => row.status), ['already-imported', 'already-imported']);
  assert.equal((await applyLegacyMigration({store: fake.store, plan: repeated})).rows.length, 2);
  assert.equal(fake.calls(), 2);
  assert.equal(fake.documents.length, 2);
});

test('migration preflight blocks missing catalogs, incompatible projects and name collisions', async () => {
  const missingCatalog = fakeStore();
  const first = await inspectLegacyMigration({store: missingCatalog.store, scope, modelFolderId});
  assert.equal(first.rows[1].status, 'blocked');
  assert.match(first.rows[1].reason, /original material library/);
  assert.equal(missingCatalog.calls(), 0);

  const unsupported = fakeStore();
  unsupported.source.projects[0].record.data.settings.unsupported = true;
  const unsupportedPlan = await inspectLegacyMigration({store: unsupported.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  assert.equal(unsupportedPlan.rows[0].status, 'blocked');

  const collisionDoc = {...(await readLegacyProject(sourceRecords().projects[0].record,
    {scope: 'owner', id: 'legacy-project'})), id: 'other-v3-id'};
  const collision = fakeStore({existing: [collisionDoc]});
  const result = await inspectLegacyMigration({store: collision.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  assert.equal(result.rows[0].status, 'conflict');
  assert.match(result.rows[0].reason, /name is already used/);
  assert.equal(result.rows[1].status, 'ready');
});

test('existing content is never overwritten and ambiguous responses stop the batch', async () => {
  const fake = fakeStore();
  const plan = await inspectLegacyMigration({store: fake.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  fake.store.migrateLegacy = async () => { throw Object.assign(new Error('Unavailable'), {code: 'unavailable'}); };
  const result = await applyLegacyMigration({store: fake.store, plan});
  assert.deepEqual(result.rows.map(row => row.status), ['unknown', 'not-attempted']);
  assert.equal(fake.documents.length, 0);

  const unexpected = fakeStore();
  const unexpectedPlan = await inspectLegacyMigration({store: unexpected.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  unexpected.store.migrateLegacy = async () => ({status: 'unrecognized'});
  const unexpectedReport = await applyLegacyMigration({store: unexpected.store, plan: unexpectedPlan});
  assert.deepEqual(unexpectedReport.rows.map(row => row.status), ['unknown', 'not-attempted']);
  assert.equal(unexpected.calls(), 0);

  const imported = fakeStore();
  const firstPlan = await inspectLegacyMigration({store: imported.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  await applyLegacyMigration({store: imported.store, plan: firstPlan});
  imported.documents[0].settings.sheetUtilization = 75;
  const retry = await inspectLegacyMigration({store: imported.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  assert.equal(retry.rows[0].status, 'existing-not-updated');
  assert.equal(imported.documents[0].settings.sheetUtilization, 75);
});

test('migration refuses shared source scopes, missing destinations and changed source snapshots', async () => {
  const fake = fakeStore();
  await assert.rejects(inspectLegacyMigration({store: fake.store,
    scope: {ownerUid: 'owner', actorUid: 'editor'}, ownerUid: 'owner'}), {code: 'permission-denied'});
  await assert.rejects(inspectLegacyMigration({store: fake.store, scope, modelFolderId: 'missing',
    catalogIds: {'legacy-model': 'source'}}), {code: 'legacy-folder-required'});
  const changed = fakeStore({changeSource: true});
  const plan = await inspectLegacyMigration({store: changed.store, scope, modelFolderId,
    catalogIds: {'legacy-model': 'source'}});
  changed.changeSource();
  const report = await applyLegacyMigration({store: changed.store, plan});
  assert.equal(report.rows[0].status, 'failed');
  assert.equal(changed.documents.length, 1);
});
