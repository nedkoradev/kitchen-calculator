import {releaseMetadata} from './release.mjs';
import {identifier} from '../document-format/model.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';
import {createLegacyLibrary, legacyOperations} from './legacy-library.mjs';
import {createWorkspaceService} from './service.mjs';
import {projectId} from '../pilot/config.mjs';

export const publicOrigin = 'https://nediq.eu';
const cloudRunOrigins = Object.freeze([
  'https://nediq-v3-public-579302190437.europe-west1.run.app',
  'https://nediq-v3-public-inu5wh5ola-ew.a.run.app',
]);

export function publicConfig(env) {
  if (env.NEDIQ_PUBLIC_ENABLED !== '1') return null;
  if (env.NEDIQ_PILOT_ENABLED === '1' || env.GOOGLE_CLOUD_PROJECT !== projectId ||
      env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST ||
      env.NEDIQ_PUBLIC_ORIGIN !== publicOrigin ||
      env.NEDIQ_FIREBASE_AUTH_DOMAIN !== projectId + '.firebaseapp.com' ||
      !/^[\w-]{25,100}$/.test(env.NEDIQ_FIREBASE_WEB_API_KEY ?? '')) throw new Error('Invalid public configuration');
  return Object.freeze({public: true, origin: publicOrigin, release: releaseMetadata(env), alternateOrigins: cloudRunOrigins,
    authDomain: env.NEDIQ_FIREBASE_AUTH_DOMAIN, apiKey: env.NEDIQ_FIREBASE_WEB_API_KEY});
}

export function createPublicDispatch({db, auth, bundledCatalog}) {
  const legacy = createLegacyLibrary(db, bundledCatalog);
  const denied = () => Object.assign(new Error('Access denied'), {code: 'permission-denied'});
  return async input => {
    let principal;
    try {
      principal = await auth.verifyIdToken(input.token, true);
      identifier(principal.uid);
      if (principal.firebase?.sign_in_provider !== 'google.com' || principal.email_verified !== true ||
          (typeof principal.email !== 'string' || !principal.email.includes('@'))) throw denied();
    } catch { throw denied(); }
    const scope = input.request?.scope;
    if (scope?.actorUid !== principal.uid || scope.ownerUid !== principal.uid) throw denied();
    if (legacyOperations.has(input.operation)) return legacy({...input, principal});
    if (input.operation === 'migrateLegacy') {
      const document = input.request?.document;
      const source = document?.source;
      if (!source || source.scope !== principal.uid || source.type !== document.type || typeof source.id !== 'string') {
        throw denied();
      }
      const request = {
        scope, legacyOwnerId: principal.uid, id: source.id, type: source.type,
        folderId: document.type === 'model' ? document.folderId : null,
        ...(Object.hasOwn(source, 'catalogId') ? {catalogId: source.catalogId} : {}),
      };
      const original = await legacy({operation: 'legacyRead', request, principal});
      if (comparableJson(original) !== comparableJson(document)) {
        throw Object.assign(new Error('The v2 source changed; recheck the migration'), {code: 'legacy-source-changed'});
      }
    }
    // The sharing grant for a v2 source only authorizes a legacy read. All v3
    // operations, including the journal, remain in the verified user's base.
    return createWorkspaceService({db, verifyToken: async () => principal})(input);
  };
}
