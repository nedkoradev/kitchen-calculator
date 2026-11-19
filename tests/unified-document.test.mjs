import test from 'node:test';
import assert from 'node:assert/strict';
import {readLegacyCabinet, readLegacyProject} from '../document-format/legacy.mjs';
import {PROJECTS_FOLDER, validateDocument, validateLibrary} from '../document-format/model.mjs';
import {cutLayout} from '../grain.mjs';

const catalog = {
  pdcMaterials: [{name: 'Бяло'}, {name: 'Дъб', grainRequired: true, textureUrl: 'materials/textures/oak.png'}],
  backMaterials: [{name: 'Гръб'}, {name: 'Орех'}],
  worktops: [{name: 'Камък'}, {name: 'Плот'}],
  edgeMaterials: [{name: 'Тънък', price: 2}, {name: 'Дебел', price: 5}],
  servicePrices: {cut: 2},
};
const parts = ['pdc', 'back', 'worktop'].map((materialType, i) => ({
  name: 'Детайл ' + i,
  part: {key: 'p' + i, x: i * 100, y: 100, z: 0, w: 18, h: 600, d: 430,
    assembly: 'outer', assemblyStack: [null, 'inner'], constructorCabinet: 'inner', locked: true},
  finish: {materialType, material: 1, grainAxis: 'y', edges: [0, null, '1', null]},
  allEdges: false,
}));
const room = {w: 3500, h: 2600, d: 3000};
const project = {
  schemaVersion: 1, name: '  Кухня  Дъб  ', revision: 7,
  data: {parts, room, materials: catalog, assemblyNames: {outer: 'Кухня', inner: 'Шкаф'},
    settings: {sheetUtilization: 85, camera: {position: [1, 2, 3], target: [0, 0, 0], zoom: 1}},
    other: {flag: true}},
};
const cabinet = {v2: true, name: 'Шкаф', parts, category: 'Долни', calculationSettings: {sheetUtilization: 85}};
const cloud = {scope: 'firestore:owner', id: 'same'};
const cabinetOptions = {...cloud, catalog, folderId: 'bottom'};

test('legacy project keeps its room, revision, nested groups, camera and catalog contents', async () => {
  const original = structuredClone(project);
  const doc = await readLegacyProject(original, {...cloud, catalog: {}});
  assert.equal(doc.name, 'Кухня Дъб');
  assert.equal(doc.folderId, PROJECTS_FOLDER.id);
  assert.equal(doc.revision, 7);
  for (const key of ['room', 'parts', 'materials', 'settings']) assert.deepEqual(doc[key], project.data[key]);
  assert.deepEqual(doc.groups, project.data.assemblyNames);
  assert.deepEqual(doc.source.fields.other, {flag: true});
  doc.parts[0].part.assemblyStack.push('new');
  doc.materials.pdcMaterials[1].name = 'change';
  doc.room.w++;
  assert.deepEqual(original, project);
});

test('legacy cabinet indices retain board family, edge slots, grain, texture and prices', async () => {
  const original = structuredClone(cabinet);
  const external = structuredClone(catalog);
  const doc = await readLegacyCabinet(original, {...cabinetOptions, catalog: external});
  assert.equal(doc.room, null);
  assert.equal(doc.revision, 1);
  assert.deepEqual(doc.settings, cabinet.calculationSettings);
  assert.deepEqual(doc.parts, parts);
  for (const [index, key] of ['pdcMaterials', 'backMaterials', 'worktops'].entries()) {
    const {part, finish} = doc.parts[index];
    const material = doc.materials[key][finish.material];
    assert.deepEqual(material, catalog[key][1]);
    assert.deepEqual(cutLayout(part, finish, material), cutLayout(parts[index].part, parts[index].finish, catalog[key][1]));
  }
  assert.deepEqual(doc.materials.edgeMaterials, catalog.edgeMaterials);
  doc.materials.edgeMaterials[0].price = 0;
  doc.parts[0].finish.edges[0] = null;
  assert.deepEqual(original, cabinet);
  assert.deepEqual(external, catalog);
  assert.equal(doc.source.fields.category, 'Долни');
});

test('IDs are stable and isolated by source, including a local cabinet and the same Firestore IDs', async () => {
  const local = {id: cloud.id, name: 'Локален', parts, room};
  const doc = await readLegacyCabinet(local, {scope: 'local:profile', catalog});
  assert.deepEqual(doc.room, room);
  assert.equal(doc.folderId, null);
  const model = await readLegacyCabinet(cabinet, cabinetOptions);
  assert.equal(model.id, (await readLegacyCabinet(cabinet, cabinetOptions)).id);
  assert.equal(new Set([doc.id, model.id, (await readLegacyProject(project, cloud)).id]).size, 3);
  assert.notEqual((await readLegacyCabinet({...local, id: 'c'}, {scope: 'a:b', catalog})).id,
    (await readLegacyCabinet({...local, id: 'b:c'}, {scope: 'a', catalog})).id);
});

test('unknown versions, malformed snapshots and unresolved material references fail explicitly', async () => {
  await assert.rejects(() => readLegacyProject({...project, schemaVersion: 2}, cloud), /schema version/);
  await assert.rejects(() => readLegacyCabinet(cabinet, cloud), /folder/);
  await assert.rejects(() => readLegacyCabinet(cabinet, {...cabinetOptions, catalog: undefined}), /catalog/);
  const oldProject = {...project, data: {...project.data, materials: undefined}};
  assert.deepEqual((await readLegacyProject(oldProject, {...cloud, catalog})).materials, catalog);
  const doc = await readLegacyProject(project, cloud);
  assert.throws(() => validateDocument({...doc, schemaVersion: 2}), /schema version/);
  assert.throws(() => validateDocument({...doc, room: null}), /формат/);
  assert.throws(() => validateDocument({...doc, revision: 0}), /revision/);
  doc.parts[1].finish.material = 99;
  assert.throws(() => validateDocument(doc), /catalog index/);
  doc.parts[1].finish.material = 1;
  doc.parts[1].finish.edges[0] = 99;
  assert.throws(() => validateDocument(doc), /catalog index/);
});

test('one library enforces names across folders and protects the Projects folder', async () => {
  const folder = {id: 'bottom', name: 'Долни', parentId: null};
  const documents = [await readLegacyCabinet(cabinet, cabinetOptions), await readLegacyProject(project, cloud)];
  validateLibrary(documents, [folder, PROJECTS_FOLDER]);
  const duplicate = await readLegacyCabinet({...cabinet, name: '  КУХНЯ  ДЪБ '}, cabinetOptions);
  assert.throws(() => validateLibrary([duplicate, documents[1]], [folder, PROJECTS_FOLDER]), /Duplicate document name/);
  assert.throws(() => validateLibrary([documents[0], documents[0]], [folder, PROJECTS_FOLDER]), /Duplicate document ID/);
  for (const folders of [[folder], [folder, {...PROJECTS_FOLDER, name: 'Друга'}],
    [folder, {...PROJECTS_FOLDER, parentId: folder.id}], [folder, {...PROJECTS_FOLDER, deleted: true} ]]) {
    assert.throws(() => validateLibrary([], folders), /system folder/);
  }
  assert.throws(() => validateLibrary(documents, [PROJECTS_FOLDER]), /Unknown folder/);
  assert.throws(() => validateDocument({...documents[0], folderId: PROJECTS_FOLDER.id}), /type does not match/);
});

test('folder names are unique among siblings and may repeat across separate branches', () => {
  const first = {id: 'first', name: 'Кухня', parentId: null};
  const second = {id: 'second', name: 'Дневна', parentId: null};
  const child = {id: 'child', name: 'Долен шкаф Ａ', parentId: first.id};
  const duplicate = {id: 'other', name: '  ДОЛЕН   ШКАФ a  ', parentId: first.id};
  assert.throws(() => validateLibrary([], [PROJECTS_FOLDER, first, child, duplicate]), /Duplicate sibling/);
  validateLibrary([], [PROJECTS_FOLDER, first, second, child, {...duplicate, parentId: second.id}]);
  assert.throws(() => validateLibrary([], [PROJECTS_FOLDER, first, {...second, name: 'КУХНЯ'}]), /Duplicate sibling/);
  assert.throws(() => validateLibrary([], [PROJECTS_FOLDER, first, {...child, name: 'ПРОЕКТИ'}]), /Reserved folder name/);
  for (const name of [null, '', '   ', '.', '..', 'A/B', 'A\\B', 'A／B', 'A\u0085B', 'а'.repeat(81), '\ud800']) {
    assert.throws(() => validateLibrary([], [PROJECTS_FOLDER, {...first, name}]), /Invalid folder name/);
  }
  validateLibrary([], [PROJECTS_FOLDER, {...first, name: 'а'.repeat(80)}]);
});

test('cabinet conversion retains both original settings maps when top-level keys overlap', async () => {
  const source = {...cabinet,
    settings: {sheetUtilization: 70, display: '2d', report: {grain: true, rounding: 2}},
    calculationSettings: {sheetUtilization: 85, report: {rounding: 1}},
  };
  const before = structuredClone(source);
  const document = await readLegacyCabinet(source, cabinetOptions);
  assert.deepEqual(document.settings, {sheetUtilization: 85, display: '2d', report: {rounding: 1}});
  assert.deepEqual(document.source.originalSettings, {
    settings: before.settings, calculationSettings: before.calculationSettings,
  });
  document.source.originalSettings.settings.report.grain = false;
  document.settings.report.rounding = 0;
  assert.equal(document.source.originalSettings.calculationSettings.report.rounding, 1);
  assert.deepEqual(source, before);
});

test('migration IDs are bounded and stable across long Unicode inputs without normalizing source keys', async () => {
  const scope = 'ю'.repeat(750);
  const id = '🪵'.repeat(375);
  const doc = await readLegacyProject(project, {scope, id});
  assert.match(doc.id, /^legacy:v1:[0-9a-f]{64}$/);
  assert.equal(new TextEncoder().encode(doc.id).length, 74);
  assert.equal(doc.source.scope, scope);
  assert.equal(doc.source.id, id);
  assert.equal(doc.id, (await readLegacyProject({...project, revision: 8}, {scope, id})).id);
  assert.notEqual(doc.id, (await readLegacyProject(project, {scope, id: id.slice(0, -2) + '🪚'})).id);
  assert.notEqual((await readLegacyProject(project, {scope, id: 'é'})).id,
    (await readLegacyProject(project, {scope, id: 'e\u0301'})).id);
  for (const invalid of [id + 'a', 'a/b', '.', '..', '__reserved__', '\ud800']) {
    await assert.rejects(() => readLegacyProject(project, {scope, id: invalid}), /Invalid identifier/);
  }
});
