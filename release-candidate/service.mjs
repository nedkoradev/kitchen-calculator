import {identifier, PROJECTS_FOLDER, validateLibrary} from '../document-format/model.mjs';
import {createFirestorePersistence} from '../workspace-persistence/firestore-adapter.mjs';

const namespace = 'workspace_v3';
const failure = (code, message = code) => Object.assign(new Error(message), {code});
const operations = new Set(['readProject', 'readModel', 'write', 'pending', 'reconcile', 'acknowledge', 'list', 'changeFolder']);
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
