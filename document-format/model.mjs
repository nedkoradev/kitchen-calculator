import {projectData, projectName} from '../project-model.mjs';

export const SCHEMA_VERSION = 1;
export const PROJECTS_FOLDER = Object.freeze({id: 'system:projects', name: 'Проекти', parentId: null});
const catalogByType = new Map([['pdc', 'pdcMaterials'], ['back', 'backMaterials'], ['worktop', 'worktops']]);

export function identifier(value) {
  if (typeof value !== 'string' || !value || !value.isWellFormed() || /[/\x00-\x1f\x7f]/u.test(value) ||
      value === '.' || value === '..' || /^__.*__$/.test(value) ||
      new TextEncoder().encode(value).length > 1500) {
    throw new TypeError('Invalid identifier');
  }
  return value;
}

export function record(value, label) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new TypeError('Invalid ' + label);
  }
  return value;
}

// Undefined optional object fields are omitted on the existing JSON storage boundary.
function checkJson(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value) || Number.isFinite(value)) return;
  if (ancestors.has(value)) throw new TypeError('Cyclic document data');
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) checkJson(entry, ancestors);
  } else {
    for (const entry of Object.values(record(value, 'JSON value'))) {
      if (entry !== undefined) checkJson(entry, ancestors);
    }
  }
  ancestors.delete(value);
}

function checkIndex(value, catalog) {
  if (value == null || value === '') return;
  const index = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(index) || index < 0 || !catalog[index]) throw new TypeError('Unresolved catalog index');
}

export function validateDocument(document) {
  record(document, 'document');
  if (document.schemaVersion !== SCHEMA_VERSION) throw new TypeError('Unsupported document schema version');
  identifier(document.id);
  if (typeof document.name !== 'string') throw new TypeError('Invalid document name');
  const {name, nameKey} = projectName(document.name);
  if (document.name !== name || document.nameKey !== nameKey) throw new TypeError('Noncanonical document name');
  if (!Number.isSafeInteger(document.revision) || document.revision < 1) throw new TypeError('Invalid revision');
  if (document.folderId !== null) identifier(document.folderId);
  if (!['project', 'model'].includes(document.type) || (document.type === 'project') !== (document.folderId === PROJECTS_FOLDER.id)) {
    throw new TypeError('Document type does not match folder');
  }
  record(document.materials, 'catalog');
  record(document.settings, 'settings');
  for (const name of Object.values(record(document.groups, 'groups'))) {
    if (typeof name !== 'string') throw new TypeError('Invalid group name');
  }
  if (document.room !== null) record(document.room, 'room');
  checkJson(document);
  // Also apply the existing geometry, camera and report settings constraints.
  const validationRoom = document.type === 'model' && document.room === null
    ? {w: 500, h: 500, d: 500} : document.room;
  projectData({parts: document.parts, room: validationRoom, materials: document.materials, settings: document.settings});
  for (const key of [...catalogByType.values(), 'edgeMaterials']) {
    for (const entry of document.materials[key]) record(entry, 'material');
  }
  for (const {finish} of document.parts) {
    if (finish == null) continue;
    record(finish, 'finish');
    const key = catalogByType.get(finish.materialType ?? 'pdc');
    if (!key) throw new TypeError('Unknown material type');
    checkIndex(finish.material, document.materials[key]);
    if (finish.edges !== undefined) {
      if (!Array.isArray(finish.edges) || finish.edges.length !== 4) throw new TypeError('Invalid edge slots');
      for (const edge of finish.edges) checkIndex(edge, document.materials.edgeMaterials);
    }
  }
  return document;
}

const reservedFolderNames = new Set(['проекти', 'без категория', 'всички модели']);
const invalidFolderCharacters = /[/\\\p{Cc}]/u;

function folderNameKey(value) {
  if (typeof value !== 'string' || !value.isWellFormed() || invalidFolderCharacters.test(value)) {
    throw new TypeError('Invalid folder name');
  }
  const name = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (!name || name.length > 80 || name === '.' || name === '..' || invalidFolderCharacters.test(name)) {
    throw new TypeError('Invalid folder name');
  }
  const key = name.toLowerCase();
  if (reservedFolderNames.has(key)) throw new TypeError('Reserved folder name');
  return key;
}

// Validate a candidate library snapshot independently of the storage mechanism.
export function validateLibrary(documents, folders) {
  const byId = new Map();
  const namesByParent = new Map();
  for (const folder of folders) {
    record(folder, 'folder');
    identifier(folder.id);
    if (byId.has(folder.id)) throw new TypeError('Duplicate folder ID');
    byId.set(folder.id, folder);
    if (folder.id === PROJECTS_FOLDER.id) continue;
    const key = folderNameKey(folder.name);
    if (!namesByParent.has(folder.parentId)) namesByParent.set(folder.parentId, new Set());
    const siblings = namesByParent.get(folder.parentId);
    if (siblings.has(key)) throw new TypeError('Duplicate sibling folder name');
    siblings.add(key);
  }
  const projects = byId.get(PROJECTS_FOLDER.id);
  if (projects?.name !== PROJECTS_FOLDER.name || projects.parentId !== null || Object.keys(projects).length !== 3) throw new TypeError('Invalid system folder');
  for (const folder of folders) {
    const ancestors = new Set([folder.id]);
    let parent = folder.parentId;
    while (parent !== null) {
      if (parent === PROJECTS_FOLDER.id || ancestors.has(parent) || !byId.has(parent)) throw new TypeError('Invalid folder hierarchy');
      ancestors.add(parent);
      parent = byId.get(parent).parentId;
    }
  }
  const ids = new Set();
  const names = new Set();
  for (const document of documents) {
    validateDocument(document);
    if (document.folderId !== null && !byId.has(document.folderId)) throw new TypeError('Unknown folder');
    if (ids.has(document.id)) throw new TypeError('Duplicate document ID');
    if (names.has(document.nameKey)) throw new TypeError('Duplicate document name');
    ids.add(document.id);
    names.add(document.nameKey);
  }
}
