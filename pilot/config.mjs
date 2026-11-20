import {identifier} from '../document-format/model.mjs';

export const projectId = 'kitchen-designer-9d437';
export const databaseId = '(default)';
export const region = 'europe-west1';

export function pilotConfig(env) {
  if (env.NEDIQ_PILOT_ENABLED !== '1') return null;
  if (env.GOOGLE_CLOUD_PROJECT !== projectId || env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Pilot project or environment mismatch');
  }
  const uid = identifier(env.NEDIQ_PILOT_UID);
  const origin = new URL(env.NEDIQ_PILOT_ORIGIN);
  if (origin.protocol !== 'https:' || origin.origin !== env.NEDIQ_PILOT_ORIGIN ||
      !origin.hostname.endsWith('.run.app')) throw new Error('Expected exact Cloud Run HTTPS origin');
  const authDomain = env.NEDIQ_FIREBASE_AUTH_DOMAIN;
  if (authDomain !== projectId + '.firebaseapp.com' ||
      !/^[\w-]{25,100}$/.test(env.NEDIQ_FIREBASE_WEB_API_KEY ?? '')) throw new Error('Missing Firebase web configuration');
  const config = {origin: origin.origin, uid, authDomain, apiKey: env.NEDIQ_FIREBASE_WEB_API_KEY};
  return Object.freeze(config);
}

export function restrictPilot(verify, uid) {
  return async token => {
    const principal = await verify(token);
    if (principal?.uid !== uid || principal.firebase?.sign_in_provider !== 'google.com' ||
      principal.email_verified !== true) throw new Error('Pilot identity is not authorized');
    return principal;
  };
}

export function restrictPilotDispatch(dispatch, uid) {
  return input => {
    const scope = input.request?.scope;
    if (scope?.ownerUid !== uid || scope.actorUid !== uid) {
      throw Object.assign(new Error('Pilot scope is not authorized'), {code: 'permission-denied'});
    }
    return dispatch(input);
  };
}
