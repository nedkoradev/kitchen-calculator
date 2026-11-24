import {projectName} from '../project-model.mjs';
import {identifier, PROJECTS_FOLDER, validateDocument, validateLibrary} from '../document-format/model.mjs';
import {legacyDocumentId} from '../document-format/legacy.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';
import {createFirestorePersistence} from '../workspace-persistence/firestore-adapter.mjs';
import {handleMaterialBaseOperation, materialBaseOperations} from './material-bases.mjs';

const namespace = 'workspace_v3';
const failure = (code, message = code) => Object.assign(new Error(message), {code});
const operations = new Set(['readProject', 'readModel', 'write', 'migrateLegacy', 'pending', 'reconcile', 'acknowledge', 'list', 'changeFolder', 'changeModel', ...materialBaseOperations]);
const blankLibrary = () => ({revision: 0, folders: [PROJECTS_FOLDER]});

// A trusted process owns writes. The deployment supplies Admin Firestore and
// a verified Firebase ID-token reader. Neither is available to browser code.
export function createWorkspaceService({db, verifyToken, newId = () => crypto.randomUUID()}) {
  const sdk = {
    doc: (db, ...segments) => db.doc(segments.join('/')),
    runTransaction: (db, callback) => db.runTransaction(callback),
  };

  return async function dispatch({token, operation, request = {}}) {
    if (!operations.has(operation)) throw failure('invalid-operation');
    let principal;
    try { principal = await verifyToken(token); }
    catch { throw failure('permission-denied'); }
    const actorUid = identifier(principal?.uid);
    const ownerUid = identifier(request.scope?.ownerUid);
    if (request.scope?.actorUid !== actorUid) throw failure('permission-denied');
    const scope = Object.freeze({actorUid, ownerUid});
    const owner = db.collection(namespace).doc(ownerUid);
    const manifest = owner.collection('settings').doc('folders');
    const documents = owner.collection('documents');
    if (materialBaseOperations.has(operation)) {
      if (ownerUid !== actorUid) throw failure('permission-denied');
      return db.runTransaction(tx => handleMaterialBaseOperation({db, tx, operation, request, uid: actorUid}));
    }
    async function role(transaction) {
      if (ownerUid === actorUid) return 'owner';
      return (await transaction.get(owner.collection('grants').doc(actorUid))).data()?.role;
    }
    const store = createFirestorePersistence({
      sdk, db, namespace, actorUid, readRole: ({transaction}) => role(transaction),
      async validatePlacement({transaction, document}) {
        if (document.folderId === null || document.folderId === PROJECTS_FOLDER.id) return true;
        return (await transaction.get(manifest)).data()?.folders.some(folder => folder.id === document.folderId) === true;
      },
    });

    if (operation === 'migrateLegacy') {
      const document = request.document;
      validateDocument(document);
      const source = document.source;
      if (source?.type !== document.type || source.scope !== ownerUid ||
          document.id !== await legacyDocumentId(document.type, source.scope, source.id)) {
        throw failure('invalid-legacy-source');
      }
      if (document.type === 'model' && document.folderId === null) {
        throw failure('legacy-folder-required');
      }
      if (new TextEncoder().encode(comparableJson(document)).length > 800_000) {
        throw failure('document-too-large');
      }
      const documentRef = documents.doc(document.id);
      const nameRef = owner.collection('names').doc(document.nameKey);
      return db.runTransaction(async tx => {
        const access = await role(tx);
        if (!['owner', 'editor'].includes(access)) throw failure('permission-denied');
        const [previousSnapshot, claimSnapshot] = await Promise.all([tx.get(documentRef), tx.get(nameRef)]);
        const previous = previousSnapshot.data();
        if (previous) {
          const sameSource = previous.source?.type === source.type &&
            previous.source?.scope === source.scope && previous.source?.id === source.id;
          if (!sameSource) return {status: 'id-conflict'};
          return {status: comparableJson(previous) === comparableJson(document)
            ? 'already-imported' : 'existing-not-updated'};
        }
        const claim = claimSnapshot.data();
        if (claim) return {status: claim.id === document.id ? 'index-conflict' : 'name-conflict'};
        if (document.folderId !== null && document.folderId !== PROJECTS_FOLDER.id &&
            (await tx.get(manifest)).data()?.folders.some(folder => folder.id === document.folderId) !== true) {
          return {status: 'folder-not-found'};
        }
        tx.create(documentRef, JSON.parse(JSON.stringify(document)));
        tx.create(nameRef, {id: document.id});
        return {status: 'imported'};
      });
    }

    if (operation === 'list') {
      return db.runTransaction(async tx => {
        if (!['owner', 'editor', 'viewer'].includes(await role(tx))) throw failure('permission-denied');
        const library = (await tx.get(manifest)).data() ?? blankLibrary();
        validateLibrary([], library.folders);
        const query = documents.select('id', 'type', 'folderId', 'name', 'revision');
        const rows = (await tx.get(query)).docs.map(row => row.data());
        return {...library, documents: rows};
      });
    }
    if (operation === 'changeModel') {
      const {action, id, revision, folderId} = request;
      if (!['rename', 'move', 'copy', 'delete'].includes(action)) throw failure('invalid-operation');
      const ref = documents.doc(identifier(id));
      const copyId = action === 'copy' ? identifier(newId()) : null;
      return db.runTransaction(async tx => {
        if (!['owner', 'editor'].includes(await role(tx))) throw failure('permission-denied');
        const previous = (await tx.get(ref)).data();
        if (!['model', 'project'].includes(previous?.type)) throw failure('not-found');
        if (previous.revision !== revision) throw failure('revision-conflict');
        if (previous.type === 'project' && action === 'move') throw failure('protected-folder');
        if (previous.type === 'project' && action === 'copy' &&
            folderId !== undefined && folderId !== PROJECTS_FOLDER.id) throw failure('protected-folder');
        const names = owner.collection('names');
        if (action === 'delete') {
          const nameRef = names.doc(previous.nameKey);
          const claim = (await tx.get(nameRef)).data();
          if (claim && claim.id !== id) throw failure('index-conflict');
          tx.delete(ref);
          if (claim) tx.delete(nameRef);
          return null;
        }
        const placement = previous.type === 'project' ? PROJECTS_FOLDER.id :
          action === 'move' || action === 'copy' ? identifier(folderId) : previous.folderId;
        if (previous.type === 'model' && (action === 'move' || action === 'copy')) {
          const library = (await tx.get(manifest)).data() ?? blankLibrary();
          if (placement === PROJECTS_FOLDER.id || !library.folders.some(folder => folder.id === placement)) {
            throw failure('folder-not-found');
          }
        }
        const naming = action === 'rename' || action === 'copy' ? projectName(request.name) : {};
        const next = {...previous, ...naming, folderId: placement, id: copyId ?? id,
          revision: copyId ? 1 : revision + 1};
        if (copyId) delete next.source;
        validateDocument(next);
        const nameRef = names.doc(next.nameKey);
        if (copyId || next.nameKey !== previous.nameKey) {
          const claim = (await tx.get(nameRef)).data();
          if (claim) throw failure('name-conflict');
          if (!copyId) {
            const oldNameRef = names.doc(previous.nameKey);
            const oldClaim = (await tx.get(oldNameRef)).data();
            if (oldClaim && oldClaim.id !== id) throw failure('index-conflict');
            if (oldClaim) tx.delete(oldNameRef);
          }
          tx.create(nameRef, {id: next.id});
        }
        if (copyId) tx.create(documents.doc(copyId), next);
        else tx.set(ref, next);
        return {id: next.id, revision: next.revision};
      });
    }
    if (operation === 'changeFolder') {
      const {change, revision} = request;
      const createdId = change?.action === 'create' ? identifier(newId()) : null;
      return db.runTransaction(async tx => {
        if (!['owner', 'editor'].includes(await role(tx))) throw failure('permission-denied');
        const library = (await tx.get(manifest)).data() ?? blankLibrary();
        if (library.revision !== revision) throw failure('revision-conflict');
        const folders = structuredClone(library.folders);
        if (change?.action === 'create') {
          folders.push({id: createdId, parentId: change.parentId ?? null, name: change.name});
        } else {
          const folderId = identifier(change?.id);
          if (folderId === PROJECTS_FOLDER.id) throw failure('protected-folder');
          const index = folders.findIndex(folder => folder.id === folderId);
          if (index === -1) throw failure('folder-not-found');
          if (change.action === 'rename') folders[index].name = change.name;
          else if (change.action === 'move') folders[index].parentId = change.parentId ?? null;
          else if (change.action === 'delete') {
            if (folders.some(folder => folder.parentId === folderId)) throw failure('folder-not-empty');
            if (!(await tx.get(documents.where('folderId', '==', folderId).limit(1))).empty) throw failure('folder-not-empty');
            folders.splice(index, 1);
          } else throw failure('invalid-operation');
        }
        validateLibrary([], folders);
        const next = {revision: revision + 1, folders};
        tx.set(manifest, next);
        return next;
      });
    }
    return store[operation]({...request, scope});
  };
}
