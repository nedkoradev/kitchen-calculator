import {defaultFolders, mergeLegacyFolders, resolveFolder} from '../library-folders.mjs';
import {identifier} from '../document-format/model.mjs';
import {readLegacyCabinet, readLegacyProject} from '../document-format/legacy.mjs';

const collections = {project: 'v2_projects', model: 'v2_cabinets'};
const roles = ['editor', 'viewer'];
const fail = code => Object.assign(new Error(code), {code});
const preferencesId = '_app_preferences';

export const legacyOperations = new Set(['legacyBases', 'legacyList', 'legacyRead']);

export function createLegacyLibrary(db, bundledCatalog) {
  const owners = db.collection('users');
  return ({operation, request, principal}) => db.runTransaction(async tx => {
    const actor = identifier(principal.uid);
    const email = identifier(principal.email.trim().toLowerCase());
    async function sharedRole(ownerId) {
      const grant = (await tx.get(owners.doc(ownerId).collection('access_grants').doc(email))).data();
      return grant?.ownerUid === ownerId && roles.includes(grant.role) ? grant.role : null;
    }
    if (operation === 'legacyBases') {
      const inbox = db.collection('nediq_access').doc(email).collection('bases');
      const received = await tx.get(inbox);
      const shared = await Promise.all(received.docs.map(async doc => {
        const role = await sharedRole(doc.id);
        return role && {id: doc.id, name: doc.data().ownerName, role};
      }));
      return [{id: actor, name: 'Моята библиотека v2.95', role: 'owner'}, ...shared.filter(Boolean)];
    }

    const ownerId = identifier(request.legacyOwnerId);
    if (ownerId !== actor && !await sharedRole(ownerId)) throw fail('permission-denied');
    const owner = owners.doc(ownerId);
    const materials = owner.collection('materials');
    if (operation === 'legacyList') {
      const [projects, models, bases, preferences] = await Promise.all([
        tx.get(owner.collection(collections.project).select('name', 'data.materials')),
        tx.get(owner.collection(collections.model).select('name', 'materials', 'folderId', 'category')),
        tx.get(materials.select('name')),
        tx.get(materials.doc(preferencesId)),
      ]);
      const documents = (rows, type, embedded) => rows.docs.map(doc => ({
        id: doc.id, name: doc.data().name, type, requiresCatalog: !embedded(doc.data()),
      }));
      const modelRows = models.docs.map(doc => doc.data());
      const folders = mergeLegacyFolders(preferences.data()?.folders ?? defaultFolders(), modelRows);
      return {
        folders: folders.filter(folder => !folder.deleted).map(({id, label}) => ({id, label})),
        documents: [...documents(projects, 'project', row => row.data?.materials),
          ...documents(models, 'model', row => row.materials).map((document, index) => ({
            ...document, folderId: resolveFolder(modelRows[index], folders),
          }))],
        catalogs: [{id: '', name: 'Вградена стандартна база'}, ...bases.docs.filter(doc => doc.id !== preferencesId)
          .map(doc => ({id: doc.id, name: doc.data().name ?? doc.id}))],
      };
    }

    if (operation !== 'legacyRead' || !Object.hasOwn(collections, request.type)) throw fail('invalid-operation');
    const id = identifier(request.id);
    const record = (await tx.get(owner.collection(collections[request.type]).doc(id))).data();
    if (!record) throw fail('not-found');
    const project = request.type === 'project';
    let catalog;
    if (!(project ? record.data?.materials : record.materials)) {
      // Legacy cabinet records usually have indices only. An explicit catalog
      // choice avoids silently interpreting them against the current scene.
      let source;
      if (request.catalogId === '') source = bundledCatalog;
      else if (request.catalogId != null && request.catalogId !== preferencesId) {
        source = (await tx.get(materials.doc(identifier(request.catalogId)))).data();
      }
      if (!source) throw fail('legacy-catalog-required');
      const {pdcMaterials = [], edgeMaterials = [], backMaterials = [], worktops = [], servicePrices} = source;
      catalog = {pdcMaterials, edgeMaterials, backMaterials, worktops, servicePrices};
    }
    const read = project ? readLegacyProject : readLegacyCabinet;
    return read(record, {scope: ownerId, id, catalog, folderId: null});
  }, {readOnly: true});
}
