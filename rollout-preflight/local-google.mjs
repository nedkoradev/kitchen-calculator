import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {initializeFirestore} from 'firebase-admin/firestore';
import {projectId as productionProject} from '../pilot/config.mjs';
import {createPublicDispatch} from '../release-candidate/public-access.mjs';
import {startWorkspaceHost} from './stage-server.mjs';

const origin = 'http://localhost:8053';
const emulatorProject = 'demo-nediq-v3-release';

export function localGoogleConfig(env) {
  const authProject = env.NEDIQ_TEST_AUTH_PROJECT;
  const apiKey = env.NEDIQ_TEST_FIREBASE_WEB_API_KEY;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(authProject ?? '') ||
      authProject === productionProject || authProject.startsWith('demo-') ||
      !/^[A-Za-z0-9_-]{25,100}$/.test(apiKey ?? '') ||
      env.FIREBASE_AUTH_EMULATOR_HOST || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8090') {
    throw new Error('Use a separate Firebase Auth project and the loopback Firestore Emulator on port 8090');
  }
  return Object.freeze({origin, public: true, localGoogle: true, projectId: authProject,
    authDomain: authProject + '.firebaseapp.com', apiKey});
}

async function main() {
  const config = localGoogleConfig(process.env);
  const authApp = initializeApp({projectId: config.projectId}, 'local-google-auth');
  const dataApp = initializeApp({projectId: emulatorProject}, 'local-google-data');
  try {
    const db = initializeFirestore(dataApp, {host: '127.0.0.1:8090', ssl: false});
    const bundledCatalog = JSON.parse(await readFile(new URL('../materials/default.json', import.meta.url), 'utf8'));
    const dispatch = createPublicDispatch({db, auth: getAuth(authApp), bundledCatalog});
    const host = await startWorkspaceHost({pilot: config, port: 8053, createPilotDispatch: () => dispatch});
    console.log('Local acceptance: ' + host.origin);
    const stop = async () => {
      await host.close();
      await Promise.all([deleteApp(authApp), deleteApp(dataApp)]);
    };
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop);
  } catch (failure) {
    await Promise.all([deleteApp(authApp), deleteApp(dataApp)]);
    throw failure;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
