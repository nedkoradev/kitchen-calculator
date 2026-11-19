import {identifier, record, SCHEMA_VERSION, validateDocument} from '../document-format/model.mjs';

const sceneKeys = ['parts', 'room', 'materials', 'settings'];
const identityKeys = ['schemaVersion', 'id', 'revision', 'name', 'nameKey', 'type', 'folderId', 'source'];

export class SceneMappingError extends TypeError {
  constructor(path, reason) {
    super(path + ': ' + reason);
    this.path = path;
    this.reason = reason;
  }
}

function only(value, allowed, path) {
  record(value, path);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new SceneMappingError(path + '.' + key, 'Unsupported field');
  }
}

function safeKey(value, path) {
  if (['__proto__', 'constructor', 'prototype'].includes(value)) throw new SceneMappingError(path, 'Unsafe ID');
  try { return identifier(value); }
  catch { throw new SceneMappingError(path, 'Invalid ID'); }
}

function validateScene(document) {
  // Working documents are allowed to have no persisted ID or revision yet.
  validateDocument(document.id === null && document.revision === 0
    ? {...document, id: 'working', revision: 1} : document);
  const usedGroups = new Set();
  for (const [index, item] of document.parts.entries()) {
    const path = 'parts[' + index + ']';
    only(item, ['part', 'name', 'finish', 'allEdges'], path);
    safeKey(item.part.key, path + '.part.key');
    if (item.name !== undefined && typeof item.name !== 'string') throw new SceneMappingError(path + '.name', 'Expected text');
    if (item.allEdges !== undefined && typeof item.allEdges !== 'boolean') throw new SceneMappingError(path + '.allEdges', 'Expected boolean');
    const {assembly, assemblyStack, constructorCabinet} = item.part;
    for (const id of [assembly, constructorCabinet, ...(assemblyStack ?? [])]) {
      if (id != null) usedGroups.add(safeKey(id, path + '.part.group'));
    }
  }
  for (const key of Object.keys(document.groups)) {
    if (!usedGroups.has(safeKey(key, 'groups.' + key))) throw new SceneMappingError('groups.' + key, 'Unreferenced group name');
  }
}

export function snapshotToDocument(snapshot, identity) {
  only(snapshot, [...sceneKeys, 'assemblyNames'], 'snapshot');
  only(identity, identityKeys, 'identity');
  const {assemblyNames, ...scene} = snapshot;
  const document = {...identity, schemaVersion: identity.schemaVersion ?? SCHEMA_VERSION, ...scene, groups: assemblyNames};
  validateScene(document);
  return structuredClone(document);
}

// Identity travels separately because the renderer snapshot has no document metadata.
export function documentToSnapshot(document) {
  only(document, [...identityKeys, ...sceneKeys, 'groups'], 'document');
  validateScene(document);
  const {parts, room, materials, settings, groups, ...identity} = document;
  return structuredClone({identity, snapshot: {parts, room, materials, settings, assemblyNames: groups}});
}

export function toEditorSnapshot(document) {
  const {snapshot} = documentToSnapshot(document);
  if (snapshot.room === null) throw new SceneMappingError('room', 'The editor requires a working room');
  only(snapshot.room, ['w', 'h', 'd'], 'room');
  only(snapshot.materials, ['pdcMaterials', 'edgeMaterials', 'backMaterials', 'worktops', 'activeBase', 'servicePrices'], 'materials');
  only(snapshot.settings, ['viewMode', 'projectTab', 'camera', 'sheetUtilization'], 'settings');
  if (snapshot.settings.camera) only(snapshot.settings.camera, ['position', 'target', 'zoom'], 'settings.camera');
  if (snapshot.settings.viewMode !== undefined && !['perspective', 'iso', 'front', 'top', 'left', 'right'].includes(snapshot.settings.viewMode)) {
    throw new SceneMappingError('settings.viewMode', 'Unsupported view');
  }
  if (snapshot.settings.projectTab !== undefined && !['3d', 'cut', 'costs'].includes(snapshot.settings.projectTab)) {
    throw new SceneMappingError('settings.projectTab', 'Unsupported report tab');
  }
  return snapshot;
}
