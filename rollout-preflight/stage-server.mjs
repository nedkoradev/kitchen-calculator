import {fallbackUrl} from '../pilot/config.mjs';
import {createServer} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {initializeApp, deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {buildLocalPreview, buildPilotPreview} from './staging-html.mjs';
import {createWorkspaceService} from '../release-candidate/service.mjs';
import {createWorkspaceHttpHandler} from '../release-candidate/http.mjs';

const projectId = 'demo-nediq-v3-release';
const root = fileURLToPath(new URL('..', import.meta.url));
const isLoopback = host => /^127\.0\.0\.1:\d{1,5}$/.test(host ?? '');
const assets = new Set(['.js', '.mjs', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff2']);
const types = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2'};
const moduleDirectories = new Set(['document-format', 'workspace-context', 'workspace-persistence',
  'workspace-ui', 'release-candidate', 'assets', 'materials']);
const sdkPaths = {'/staging-sdk/app.js': 'node_modules/firebase/firebase-app-compat.js',
  '/staging-sdk/auth.js': 'node_modules/firebase/firebase-auth-compat.js'};
const blocked = new Set(['/cloud.js', '/local-reset.js', '/sw.js', '/app-release.js']);

function assetPath(path) {
  if (Object.hasOwn(sdkPaths, path)) return sdkPaths[path];
  if (path === '/rollout-preflight/staging-auth.mjs' || path === '/pilot/config.mjs') return path.slice(1);
  if (!assets.has(extname(path)) || blocked.has(path) || path.includes('\\')) return null;
  const parts = path.slice(1).split('/');
  if (parts.some(part => !part || part.startsWith('.'))) return null;
  if (parts.length > 1 && !moduleDirectories.has(parts[0])) return null;
  return parts.join('/');
}

export function startLocalStaging({enabled = false, port = 0} = {}) {
  return startWorkspaceHost({enabled, port});
}

export async function startWorkspaceHost({enabled = false, port = 0, pilot = null, createPilotDispatch} = {}) {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (enabled && (!isLoopback(authHost) || !isLoopback(process.env.FIRESTORE_EMULATOR_HOST))) {
    throw new Error('Enable staged Auth only inside the two local emulators');
  }
  if (!pilot) process.env.METADATA_SERVER_DETECTION = 'none';
  const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const fallback = buildLocalPreview(source);
  const preview = pilot ? buildPilotPreview(source, pilot) : enabled ? buildLocalPreview(source, {enabled, authOrigin: 'http://' + authHost}) : fallback;
  const app = enabled ? initializeApp({projectId}, 'local-staging-' + crypto.randomUUID()) : null;
  let endpoint;
  let origin = pilot?.origin;

  const listener = createServer(async (incoming, outgoing) => {
    const send = (status, content, mime = 'text/plain') => {
      outgoing.writeHead(status, {'content-type': mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
      outgoing.end(content);
    };
    try {
      if (incoming.headers.host !== new URL(origin).host) return send(403, 'Loopback only');
      const path = decodeURIComponent(new URL(incoming.url, origin).pathname);
      if (path === '/staging-api') {
        if (!endpoint) return send(404, 'Disabled');
        const request = new Request(origin + path, {method: incoming.method, headers: incoming.headers,
          ...(['GET', 'HEAD'].includes(incoming.method) ? {} : {body: Readable.toWeb(incoming), duplex: 'half'})});
        const response = await endpoint(request);
        outgoing.writeHead(response.status, Object.fromEntries(response.headers));
        return outgoing.end(Buffer.from(await response.arrayBuffer()));
      }
      if (incoming.method !== 'GET') return send(405, 'Read-only preview');
      if (pilot && path === '/fallback') {
        outgoing.writeHead(302, {location: fallbackUrl, 'cache-control': 'no-store'});
        return outgoing.end();
      }
      if (path === '/' || path === '/fallback') return send(200, path === '/' ? preview : fallback, 'text/html; charset=utf-8');
      const file = assetPath(path);
      if (!file) return send(404, 'Not found');
      const resolved = await realpath(resolve(root, file));
      if (!resolved.startsWith(resolve(root) + sep)) return send(404, 'Not found');
      return send(200, await readFile(resolved), types[extname(file)]);
    } catch {
      if (!outgoing.headersSent) send(404, 'Unavailable');
      else outgoing.end();
    }
  });
  await new Promise((done, reject) => {
    listener.once('error', reject);
    listener.listen(port, pilot ? '0.0.0.0' : '127.0.0.1', done);
  });
  origin ??= 'http://127.0.0.1:' + listener.address().port;
  if (app) {
    const dispatch = createWorkspaceService({db: getFirestore(app), verifyToken: token => getAuth(app).verifyIdToken(token, true)});
    endpoint = createWorkspaceHttpHandler({dispatch, allowedOrigins: [origin]});
  }
  if (pilot) endpoint = createWorkspaceHttpHandler({dispatch: createPilotDispatch(), allowedOrigins: [origin]});
  return {origin, async close() {
    await new Promise((done, reject) => listener.close(error => error ? reject(error) : done()));
    if (app) await deleteApp(app);
  }};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stage = await startLocalStaging({enabled: process.argv[2] === '--enabled', port: 8053});
  console.log('Local preview: ' + stage.origin);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await stage.close(); });
}
