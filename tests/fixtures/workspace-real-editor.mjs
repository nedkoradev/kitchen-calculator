import {mountWorkspaceEditor} from '../../release-candidate/editor.mjs';
import {prepareNewDocument} from '../../workspace-context/context.mjs';
import {documentToSnapshot, snapshotToDocument} from '../../workspace-ui/scene-adapter.mjs';
import {createWorkspaceDraftAdapter} from '../../workspace-persistence/drafts.mjs';
import {createFixtureWorkspaceStore, folders} from './workspace-real-store.mjs';

export function fixtureDocuments() {
  const scene = {
    room: {w: 3000, h: 2600, d: 3000},
    assemblyNames: {outer: 'Корпус', inner: 'Рафтова група'},
    materials: {
      pdcMaterials: [
        {name: 'Контролна плоскост', textureUrl: 'materials/textures/дъб небраска.png',
          color: '#ddd0b8', fullW: 2000, fullH: 1000, fullPrice: 35, halfW: 1000, halfH: 1000, halfPrice: 20},
        {name: 'Тестова бяла', color: '#ffffff', fullW: 2000, fullH: 1000, fullPrice: 40},
      ],
      edgeMaterials: [{name: 'Контролен кант', price: 2}],
      backMaterials: [], worktops: [], activeBase: '', servicePrices: {cutStart: 3, cutPart: 1, edging: 0.5},
    },
    settings: {sheetUtilization: 80, viewMode: 'front', projectTab: '3d'},
  };
  const shelf = (id, x, y, z, w = 600) => ({
    part: {key: 'custom' + id, x, y, z, w, h: 18, d: 400, assembly: 'outer', assemblyStack: [null, 'inner'], locks: {h: true}},
    name: 'Рафт', finish: {material: 0, materialType: 'pdc', color: '#ddd0b8',
      edges: [0, null, null, null], grainRequired: true, grainAxis: 'x'}, allEdges: false,
  });
  function make(id, name, parts, type = 'project') {
    const {identity} = documentToSnapshot(prepareNewDocument({name, type, folderId: type === 'model' ? 'shelves' : undefined}));
    return snapshotToDocument({...scene, parts}, {...identity, id, revision: 1});
  }
  return [
    make('test-project', 'Контролна кухня', [shelf(101, -350, 9, 0), shelf(102, 350, 9, 0)]),
    make('test-model', 'Библиотечен рафт', [shelf(103, 0, 109, 500)], 'model'),
    make('test-large', 'Кухня с 750 детайла', Array.from({length: 750}, (_, i) =>
      shelf(200 + i, (i % 30) * 40 - 600, 9 + Math.floor(i / 30) * 24, 0, 20))),
  ];
}

export function mountRealEditor(editor) {
  const fixtures = fixtureDocuments();
  const connection = {};
  const store = createFixtureWorkspaceStore(localStorage, fixtures, connection);
  const profiles = [['alpha', 'Алфа'], ['beta', 'Бета']].map(([uid, label]) =>
    ({scope: {ownerUid: uid, actorUid: uid}, label}));
  const integration = mountWorkspaceEditor(editor, {
    store: {...store, list: async ({scope}) => ({folders, documents: store.list(scope), revision: 0})},
    profiles, initialScope: profiles[0].scope, startingDocument: fixtures[0],
    drafts: createWorkspaceDraftAdapter(localStorage),
  });
  return {...integration, store, connection};
}
