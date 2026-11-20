import {createServer} from 'node:http';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createWorkspaceService} from '../release-candidate/service.mjs';
import {startWorkspaceHost} from '../rollout-preflight/stage-server.mjs';
import {databaseId, pilotConfig, projectId, restrictPilot, restrictPilotDispatch} from './config.mjs';

const config = pilotConfig(process.env);
const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');

if (!config) {
  createServer((request, response) => {
    if (request.method === 'GET' && (request.url === '/' || request.url === '/fallback')) {
      response.writeHead(302, {location: 'https://nediq.eu/', 'cache-control': 'no-store'});
    } else response.writeHead(503, {'cache-control': 'no-store'});
    response.end();
  }).listen(port, '0.0.0.0');
} else {
  const app = initializeApp({projectId});
  const auth = getAuth(app);
  const verifyGoogle = restrictPilot(token => auth.verifyIdToken(token), config.uid);
  let minute = -1;
  let accepted = 0;
  const verify = async token => {
    await verifyGoogle(token);
    const current = Math.floor(Date.now() / 60_000);
    if (current !== minute) { minute = current; accepted = 0; }
    if (++accepted > 120) {
      throw new Error('Pilot request limit exceeded');
    }
    return auth.verifyIdToken(token, true);
  };
  const db = getFirestore(app, databaseId);
  const dispatch = restrictPilotDispatch(createWorkspaceService({db, verifyToken: verify}), config.uid);
  await startWorkspaceHost({pilot: config, port, createPilotDispatch: () => dispatch});
}
