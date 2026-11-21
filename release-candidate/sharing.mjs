import {createSharingStore} from '../sharing-store.mjs';

export function createV3SharingStore(db, getUser) {
  return createSharingStore({db, getUser, sdk: {
    doc: (db, ...path) => db.doc(path.join('/')),
    collection: (db, ...path) => db.collection(path.join('/')),
    getDocsFromServer: ref => ref.get({source: 'server'}),
    runTransaction: (db, callback) => db.runTransaction(tx => callback({
      get: async ref => {
        const snap = await tx.get(ref);
        return {exists: () => snap.exists};
      },
      set: (...args) => tx.set(...args),
      delete: ref => tx.delete(ref),
    })),
  }});
}
