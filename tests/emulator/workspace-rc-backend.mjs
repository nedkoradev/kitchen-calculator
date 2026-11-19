import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {createWorkspaceService} from '../../release-candidate/service.mjs';

export const projectId = 'demo-nediq-v3-release';
const loopback = /^(127\.0\.0\.1|localhost):\d+$/;
export async function createEmulatorBackend() {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!loopback.test(host ?? '') || !loopback.test(process.env.FIRESTORE_EMULATOR_HOST ?? '')) {
    throw new Error('Both local emulators are required');
  }
  const app = initializeApp({projectId}, 'release-test-' + crypto.randomUUID());
  const db = getFirestore(app);
  const auth = getAuth(app);
  const service = createWorkspaceService({db, verifyToken: token => auth.verifyIdToken(token, true)});
  return {
    db, service,
    async identity(uid) {
      const email = uid + '@fixture.invalid';
      const password = 'fixture-password';
      const users = await auth.getUser(uid).catch(error => {
        if (error.code !== 'auth/user-not-found') throw error;
        return null;
      });
      if (!users) await auth.createUser({uid, email, password});
      const response = await fetch('http://' + host + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake',
        {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({email, password, returnSecureToken: true})});
      if (!response.ok) throw new Error('Could not sign into Auth Emulator');
      return (await response.json()).idToken;
    },
    close: () => deleteApp(app),
  };
}
