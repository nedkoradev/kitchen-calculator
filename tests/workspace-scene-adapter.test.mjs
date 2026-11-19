import test from 'node:test';
import assert from 'node:assert/strict';
import {documentToSnapshot, SceneMappingError, snapshotToDocument, toEditorSnapshot} from '../workspace-ui/scene-adapter.mjs';
import {createReportContext, reportInputs} from '../report-context.mjs';

const identity = {schemaVersion: 1, id: 'kitchen', revision: 4, name: 'Кухня', nameKey: 'кухня',
  type: 'project', folderId: 'system:projects', source: {id: 'legacy'}};
const snapshot = {
  room: {w: 3401, h: 2600, d: 3000},
  assemblyNames: {outer: 'Шкаф', inner: 'Рафт'},
  parts: [{part: {key: 'custom101', x: -10.5, y: 25, z: 100, w: 620, h: 18, d: 401,
    locks: {w: true}, assembly: 'outer', assemblyStack: [null, 'inner'], constructorCabinet: 'inner', turn: 2},
  name: 'Рафт', finish: {material: 1, materialType: 'pdc', edges: [0, null, 0, null], grainRequired: true,
    grainAxis: 'z', note: 'Срез', includeInCut: true}, allEdges: false}],
  materials: {pdcMaterials: [{name: 'Бяло'}, {name: 'Дъб', textureUrl: 'oak.png', price: 25}],
    edgeMaterials: [{name: 'Дъб', price: 2}], backMaterials: [], worktops: [],
    servicePrices: {cutPart: 1.5}, activeBase: 'test'},
  settings: {sheetUtilization: 80, viewMode: 'top', projectTab: 'cut',
    camera: {position: [1, 2, 3], target: [0, 0, 0], zoom: 1.1}},
};

test('identity, room, rotated geometry, finishes, group references and report inputs roundtrip losslessly', () => {
  const before = structuredClone(snapshot);
  const document = snapshotToDocument(snapshot, identity);
  const exported = documentToSnapshot(document);
  assert.deepEqual(exported, {snapshot, identity});
  assert.deepEqual(snapshotToDocument(exported.snapshot, exported.identity), document);
  const originalReport = createReportContext({id: 'kitchen', kind: 'project'}, snapshot, {kind: 'cabinet-set', cabinetIds: ['inner']});
  const reboundReport = createReportContext({id: 'kitchen', kind: 'project'}, toEditorSnapshot(document),
    {kind: 'cabinet-set', cabinetIds: ['inner']});
  assert.deepEqual(reboundReport, originalReport);
  const {selectedBoard, servicePrices, libraryEdges} = reportInputs(reboundReport);
  assert.equal(selectedBoard(snapshot.parts[0].finish).textureUrl, 'oak.png');
  assert.equal(servicePrices.cutPart, 1.5);
  assert.equal(libraryEdges[0].price, 2);
  exported.snapshot.parts[0].part.x = 0;
  exported.identity.source.id = 'changed';
  assert.equal(document.source.id, 'legacy');
  assert.deepEqual(snapshot, before);
  assert.deepEqual(documentToSnapshot(document).snapshot, before);
});

test('unsupported fields and unsafe references fail with a location before renderer import', () => {
  const unknown = {...snapshot, unsupported: 'data'};
  assert.throws(() => snapshotToDocument(unknown, identity),
    error => error instanceof SceneMappingError && error.path === 'snapshot.unsupported');
  const unattached = {...snapshot, assemblyNames: {...snapshot.assemblyNames, missing: 'Missing'}};
  assert.throws(() => snapshotToDocument(unattached, identity), {path: 'groups.missing'});
  const malformed = structuredClone(snapshot);
  malformed.parts[0].part.key = '__proto__';
  assert.throws(() => snapshotToDocument(malformed, identity), {path: 'parts[0].part.key'});
  malformed.parts[0].part.key = 'custom101';
  malformed.parts[0].finish.material = 10;
  assert.throws(() => snapshotToDocument(malformed, identity), /catalog index/);
  const additional = {...snapshot, settings: {...snapshot.settings, extension: {flag: true}}};
  const mapped = snapshotToDocument(additional, identity);
  assert.deepEqual(documentToSnapshot(mapped).snapshot, additional);
  assert.throws(() => toEditorSnapshot(mapped), {path: 'settings.extension'});
});
