import {PROJECTS_FOLDER, validateLibrary} from '../../document-format/model.mjs';

export const modelFolder = Object.freeze({id: 'models', parentId: null, name: 'Модели'});
export const folders = Object.freeze([PROJECTS_FOLDER, modelFolder,
  Object.freeze({id: 'shelves', parentId: modelFolder.id, name: 'Рафтове'})]);

export function folderLabel(folder) {
  return folder.parentId ? folderLabel(folders.find(parent => parent.id === folder.parentId)) + ' / ' + folder.name : folder.name;
}
const fail = code => Object.assign(new Error(code), {code});

export function createFixtureWorkspaceStore(storage, fixtures, connection) {
  const key = scope => 'workspace35:fake-server:' + scope.ownerUid;
  function read(scope) {
    const raw = storage.getItem(key(scope));
    return raw ? JSON.parse(raw) : {documents: structuredClone(fixtures), pending: {}, operations: {}};
  }
  function write(scope, data) { storage.setItem(key(scope), JSON.stringify(data)); }
  function get(type, {scope, id}) {
    const doc = read(scope).documents.find(entry => entry.id === id && entry.type === type);
    if (!doc) throw fail('not-found');
    return doc;
  }
  return {
    list: scope => read(scope).documents,
    async pending({scope}) {
      if (connection.offline === scope.ownerUid) throw fail('unavailable');
      const id = read(scope).pending[scope.actorUid];
      return id ? {operationId: id} : null;
    },
    async readProject(request) {
      const doc = get('project', request);
      if (connection.invalidProject === request.id) doc.settings.unsupported = true;
      return doc;
    },
    async readModel(request) { return get('model', request); },
    async write({scope, document, expectedRevision, operationId}) {
      if (connection.offline === scope.ownerUid) throw fail('unavailable');
      const data = read(scope);
      const signature = JSON.stringify({document, expectedRevision});
      const previous = data.operations[operationId];
      if (previous) {
        if (previous.signature !== signature || previous.actor !== scope.actorUid) throw fail('operation-conflict');
        return previous.receipt;
      }
      if (data.pending[scope.actorUid]) throw fail('reconciliation-required');
      const index = data.documents.findIndex(entry => entry.id === document.id);
      if (expectedRevision === null ? index !== -1 : data.documents[index]?.revision !== expectedRevision) {
        throw fail('revision-conflict');
      }
      if (data.documents.some(entry => entry.id !== document.id && entry.nameKey === document.nameKey)) throw fail('name-conflict');
      if (index === -1) data.documents.push(document);
      else data.documents[index] = document;
      validateLibrary(data.documents, folders);
      const receipt = {id: document.id, revision: document.revision};
      data.operations[operationId] = {signature, receipt, actor: scope.actorUid};
      data.pending[scope.actorUid] = operationId;
      write(scope, data);
      if (connection.dropAcknowledgement) {
        connection.dropAcknowledgement = false;
        throw fail('unknown-outcome');
      }
      return receipt;
    },
    async reconcile({scope, operationId}) {
      const entry = read(scope).operations[operationId];
      return entry?.actor === scope.actorUid ? {status: 'committed', ...entry.receipt} : {status: 'unknown'};
    },
    async acknowledge({scope, operationId}) {
      const data = read(scope);
      if (data.pending[scope.actorUid] === operationId) {
        delete data.pending[scope.actorUid];
        write(scope, data);
      }
    },
  };
}
