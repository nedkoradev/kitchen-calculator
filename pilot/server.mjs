import {createServer} from 'node:http';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {createWorkspaceService} from '../release-candidate/service.mjs';
import {startWorkspaceHost} from '../rollout-preflight/stage-server.mjs';
import {createPilotVerifier, databaseId, fallbackUrl, pilotConfig, projectId, restrictPilotDispatch} from './config.mjs';

const config = pilotConfig(process.env);
const port = Number(process.env.PORT ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');

if (!config) {
  createServer((request, response) => {
    if (request.method === 'GET' && (request.url === '/' || request.url === '/fallback')) {
      response.writeHead(302, {location: fallbackUrl, 'cache-control': 'no-store'});
    } else response.writeHead(503, {'cache-control': 'no-store'});
    response.end();
  }).listen(port, '0.0.0.0');
} else {
  const app = initializeApp({projectId});
  // Emit only fixed reason codes. Do not serialize SDK errors or request data.
  const report = reason => console.warn(JSON.stringify({event: 'nediq-pilot-access', reason}));
  const verify = createPilotVerifier(getAuth(app), config.uid, {report});
  const db = getFirestore(app, databaseId);
  const dispatch = restrictPilotDispatch(createWorkspaceService({db, verifyToken: verify}), config.uid, report);
  await startWorkspaceHost({pilot: config, port, createPilotDispatch: () => dispatch});
}
