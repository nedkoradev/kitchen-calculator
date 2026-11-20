import {projectName} from '../project-model.mjs';
import {PROJECTS_FOLDER, SCHEMA_VERSION, validateDocument} from '../document-format/model.mjs';
import {comparableJson, insertIntoScene} from './insertion.mjs';

const draftVersion = 1;
const draftHistoryLimit = 10;
const historyLimit = 80;

export function prepareNewDocument({type = 'project', name = type === 'project' ? 'Нов проект' : 'Нов модел',
  folderId = type === 'project' ? PROJECTS_FOLDER.id : null,
  room = type === 'project' ? {w: 3000, h: 2600, d: 3000} : null,
  materials = {pdcMaterials: [], backMaterials: [], worktops: [], edgeMaterials: []}, settings = {}} = {}) {
  const document = {schemaVersion: SCHEMA_VERSION, id: null, revision: 0, type, ...projectName(name), folderId,
    parts: [], groups: {}, materials, room, settings};
  validateWorking(document);
  return document;
}

function sceneOf({parts, groups, materials, room, settings}) {
  return {parts, groups, materials, room, settings};
}

function validateWorking(document) {
  validateDocument(document?.id === null && document.revision === 0
    ? {...document, id: 'working-document', revision: 1}
    : document);
}

export function parseWorkspaceDraft(raw) {
  const draft = JSON.parse(raw);
  if (draft?.schemaVersion !== draftVersion) throw new TypeError('Unsupported workspace draft');
  validateWorking(draft.document);
  const {document} = draft;
  validateWorking({...document, ...sceneOf(draft.savedScene)});
  for (const history of [draft.past, draft.future]) {
    if (!Array.isArray(history) || history.length > draftHistoryLimit) throw new TypeError('Invalid workspace draft history');
    for (const scene of history) validateWorking({...document, ...sceneOf(scene)});
  }
  return draft;
}

export function createWorkspaceContext({newId = () => crypto.randomUUID(), draftStore, initialScene, beforeSceneChange = () => {}} = {}) {
  let document = prepareNewDocument(structuredClone(initialScene));
  let savedScene = sceneOf(document);
  let past = [];
  let future = [];
  let saving = false;
  let draftStatus = draftStore ? 'empty' : 'disabled';

  if (draftStore) {
    try {
      const raw = draftStore.read();
      if (raw != null) {
        const draft = parseWorkspaceDraft(raw);
        ({document, savedScene, past, future} = draft);
        draftStatus = 'restored';
      }
    } catch {
      draftStatus = 'read-error';
    }
  }

  function persistDraft() {
    if (!draftStore || draftStatus === 'read-error') return;
    try {
      draftStore.write(JSON.stringify({schemaVersion: draftVersion, document, savedScene,
        past: past.slice(-draftHistoryLimit), future: future.slice(-draftHistoryLimit)}));
      draftStatus = 'saved';
    } catch {
      draftStatus = 'write-error';
    }
  }

  function dirty() {
    return comparableJson(sceneOf(document)) !== comparableJson(savedScene);
  }

  function ensureIdle() {
    if (saving) throw new Error('A document save is in progress');
  }

  function replace(candidate, discardChanges) {
    ensureIdle();
    if (dirty() && discardChanges !== true) throw new Error('Confirm discarding unsaved changes');
    const snapshot = structuredClone(candidate);
    validateWorking(snapshot);
    beforeSceneChange(structuredClone(snapshot));
    document = snapshot;
    savedScene = sceneOf(snapshot);
    past = [];
    future = [];
    persistDraft();
  }

  function commitScene(scene) {
    const candidate = {...document, ...scene};
    validateWorking(candidate);
    if (comparableJson(scene) === comparableJson(sceneOf(document))) return false;
    beforeSceneChange(structuredClone(candidate));
    past.push(sceneOf(document));
    if (past.length > historyLimit) past.shift();
    document = candidate;
    future = [];
    persistDraft();
    return true;
  }

  function navigate(from, to) {
    ensureIdle();
    if (!from.length) return false;
    const candidate = {...document, ...from.at(-1)};
    beforeSceneChange(structuredClone(candidate));
    to.push(sceneOf(document));
    from.pop();
    document = candidate;
    persistDraft();
    return true;
  }

  function acceptSave(snapshot, result) {
    if (result?.id !== snapshot.id || result.revision !== snapshot.revision) {
      throw new Error('Invalid save acknowledgement');
    }
    if (document.type !== snapshot.type) {
      past = [];
      future = [];
    }
    document = snapshot;
    savedScene = sceneOf(snapshot);
    persistDraft();
    return structuredClone(snapshot);
  }

  async function save(candidate, expectedRevision, write) {
    const snapshot = structuredClone(candidate);
    validateDocument(snapshot);
    if (typeof write !== 'function') throw new TypeError('A persistence callback is required');
    saving = true;
    try {
      const result = await write({document: structuredClone(snapshot), expectedRevision});
      return acceptSave(snapshot, result);
    } finally {
      saving = false;
    }
  }

  function saveCopy({name, type = document.type,
    folderId = type === document.type ? document.folderId : type === 'project' ? PROJECTS_FOLDER.id : null, write}) {
    const id = newId();
    if (id === document.id) throw new TypeError('Save As requires a new ID');
    return save({schemaVersion: SCHEMA_VERSION, ...sceneOf(document), type, folderId,
      ...projectName(name), id, revision: 1}, null, write);
  }

  return {
    get state() {
      return {document: structuredClone(document), dirty: dirty(), canUndo: past.length > 0,
        canRedo: future.length > 0, saving, draftStatus};
    },
    newDocument({discardChanges, ...options} = {}) {
      replace(prepareNewDocument(options), discardChanges);
    },
    openProject(project, {discardChanges = false} = {}) {
      if (project?.type !== 'project') throw new TypeError('Expected a saved project');
      validateDocument(project);
      replace(project, discardChanges);
    },
    insertModel(model) {
      ensureIdle();
      if (model?.type !== 'model') throw new TypeError('Expected a library model');
      validateDocument(model);
      const next = insertIntoScene(structuredClone(sceneOf(document)), structuredClone(model), newId);
      commitScene(next);
    },
    editScene(patch) {
      ensureIdle();
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Expected a scene patch');
      const scene = sceneOf(document);
      for (const key of Object.keys(patch)) {
        if (!Object.hasOwn(scene, key)) throw new TypeError('Unknown scene field: ' + key);
      }
      return commitScene({...scene, ...structuredClone(patch)});
    },
    async saveDocument({name, folderId, type, write} = {}) {
      ensureIdle();
      if (document.id === null) return saveCopy({name, folderId, type, write});
      if (name !== undefined || folderId !== undefined || type !== undefined) throw new TypeError('Use Save As to change name or folder');
      return save({...document, revision: document.revision + 1}, document.revision, write);
    },
    async saveAsDocument(options = {}) {
      ensureIdle();
      return saveCopy(options);
    },
    confirmReconciledSave(snapshot, result) {
      ensureIdle();
      const candidate = structuredClone(snapshot);
      validateDocument(candidate);
      return acceptSave(candidate, result);
    },
    undo() { return navigate(past, future); },
    redo() { return navigate(future, past); },
  };
}
