import {createFirestorePersistence} from './firestore-adapter.mjs';

export function createTestFirestorePersistence(options) {
  const {db, namespace} = options;
  if (!db?.app?.options?.projectId?.startsWith('demo-') || !/^workspace33_test_[a-z0-9_]+$/.test(namespace)) {
    throw new TypeError('Expected a demo Firestore project and isolated test namespace');
  }
  return createFirestorePersistence(options);
}
