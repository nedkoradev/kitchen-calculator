import {createV3SharingStore} from '../release-candidate/sharing.mjs';
import {installSharingUI} from '../sharing-ui.mjs';
import {fallbackUrl} from '../pilot/config.mjs';
import {installPilotPanels} from '../release-candidate/panels.mjs';
import {mountWorkspaceEditor} from '../release-candidate/editor.mjs';
import {createWorkspaceHttpClient} from '../release-candidate/client.mjs';
import {createWorkspaceDraftAdapter} from '../workspace-persistence/drafts.mjs';
import {prepareNewDocument} from '../workspace-context/context.mjs';
import {createGoogleAccountChoiceProvider} from './google-account-choice.mjs';

export async function startStagingAuth({authOrigin, pilot, materialsReady, activate, editor, views}) {
  const allowedOrigin = pilot?.localGoogle
    ? pilot.origin === 'http://localhost:8053' && location.origin === pilot.origin
    : pilot
      ? location.protocol === 'https:' && location.origin === pilot.origin
      : location.hostname === '127.0.0.1' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(authOrigin);
  if (!allowedOrigin) throw new Error('Unexpected authentication origin');
  document.getElementById('projectNewCabinet').title = 'Нов шкаф';
  const app = window.firebase.initializeApp(pilot
    ? {apiKey: pilot.apiKey, authDomain: pilot.authDomain, projectId: pilot.localGoogle ? pilot.projectId : 'kitchen-designer-9d437'}
    : {apiKey: 'demo-emulator-key', authDomain: 'demo-nediq-v3-release.firebaseapp.com', projectId: 'demo-nediq-v3-release'},
  'workspace-pilot');
  const auth = window.firebase.auth(app);
  if (!pilot) auth.useEmulator(authOrigin);
  await auth.setPersistence(window.firebase.auth.Auth.Persistence.SESSION);
  const panel = document.createElement('section');
  panel.id = 'staging-auth';
  panel.setAttribute('aria-label', 'Вход в локалния преглед');
  panel.innerHTML = '<form><label>Имейл <input type="email" name="email" autocomplete="username" required></label>' +
    '<label>Парола <input type="password" name="password" autocomplete="current-password" required></label>' +
    '<button type="submit">Вход</button></form><button type="button" data-google>Вход с Google</button>' +
    '<button type="button" data-logout hidden>Изход</button><span role="status" aria-live="polite"></span>';
  document.querySelector('main').before(panel);
  const form = panel.querySelector('form');
  const google = panel.querySelector('[data-google]');
  const logout = panel.querySelector('[data-logout]');
  for (const id of ['cloudLogin', 'cloudLogout']) document.getElementById(id).hidden = true;
  const status = panel.querySelector('[role=status]');
  status.textContent = pilot?.localGoogle ? 'Локален тестов вход' : pilot?.public ? 'Вход в NED-IQ' : pilot ? 'Пилотен вход' : 'Локален тестов вход';
  form.hidden = !!pilot;
  const back = pilot && !pilot.public ? document.createElement('a') : null;
  if (back) {
    back.href = fallbackUrl;
    back.textContent = 'Отвори NED-IQ v2.95';
    panel.append(back);
  }
  let session;
  let signingOut = false;

  function lock() {
    document.body.dataset.stageAuth = 'locked';
    for (const selector of ['main', '#documentMenus', '#mainNavigation', '#shellMenus']) {
      const node = document.querySelector(selector);
      if (node) node.inert = true;
    }
  }
  lock();
  document.addEventListener('keydown', event => {
    if (document.body.dataset.stageAuth !== 'locked' || panel.contains(event.target)) return;
    if (event.ctrlKey || event.metaKey || event.key === 'Delete') {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  const authOperation = async callback => {
    form.querySelector('button').disabled = true;
    google.disabled = true;
    try { await callback(); }
    catch { status.textContent = 'Входът не е потвърден.'; }
    finally {
      form.elements.password.value = '';
      form.querySelector('button').disabled = false;
      google.disabled = false;
    }
  };
  form.onsubmit = event => {
    event.preventDefault();
    void authOperation(() => auth.signInWithEmailAndPassword(form.elements.email.value, form.elements.password.value));
  };
  google.onclick = () => {
    // Always let the person choose their Google account at each explicit sign-in,
    // including a new sign-in after logout. Do not force logout on page refresh.
    void authOperation(() => auth.signInWithPopup(
      createGoogleAccountChoiceProvider(window.firebase.auth.GoogleAuthProvider)));
  };
  logout.onclick = async () => {
    const state = session?.bridge.state;
    if (state?.busy || (state && state.gate !== 'ready') || (state?.workspace?.dirty && !['saved', 'restored'].includes(state.workspace.draftStatus))) {
      status.textContent = 'Изчакай проверката на журнала или запази работата преди изход.';
      return;
    }
    signingOut = true;
    try { await auth.signOut(); }
    catch { signingOut = false; status.textContent = 'Изходът не е потвърден.'; }
  };

  auth.onAuthStateChanged(async user => {
    if (!user) {
      lock();
      if (session || signingOut) location.reload();
      return;
    }
    if (session) {
      if (session.uid !== user.uid) { lock(); location.reload(); }
      return;
    }
    const scope = {ownerUid: user.uid, actorUid: user.uid};
    const store = createWorkspaceHttpClient({endpoint: '/staging-api', getIdToken: ({actorUid}) => {
      if (auth.currentUser?.uid !== actorUid) throw new Error('Authentication scope changed');
      return auth.currentUser.getIdToken();
    }});
    if (pilot) {
      try { await store.pending({scope}); }
      catch {
        status.textContent = 'Пилотният достъп или журналът е недостъпен.';
        logout.hidden = false;
        return;
      }
    }
    await materialsReady;
    if (session || auth.currentUser?.uid !== user.uid) return;
    activate();
    const startingDocument = prepareNewDocument({materials: editor.capture().materials});
    let integration;
    let openSharing;
    if (pilot?.public && !pilot.localGoogle) {
      const db = app.firestore();
      const account = () => ({actorUid: auth.currentUser?.uid,
        sharingAuth: auth.currentUser?.emailVerified ? 'ready' : 'unverified'});
      const sharing = createV3SharingStore(db, () => auth.currentUser);
      openSharing = installSharingUI({sharing, account, personalOnly: true});
    }
    const panels = installPilotPanels({...views, logout, fallback: back, openSharing,
      canEdit: () => integration?.bridge.state.canAct === true,
      onMaterialApply: () => integration.flush()});
    integration = mountWorkspaceEditor(editor, {store, drafts: createWorkspaceDraftAdapter(localStorage),
      initialScope: scope, startingDocument, panels, legacy: pilot?.public === true});
    document.getElementById('headerRight').prepend(panel);
    session = {uid: user.uid, ...integration};
    for (const selector of ['#documentMenus', '#mainNavigation', '#shellMenus']) {
      const node = document.querySelector(selector);
      if (node) node.inert = false;
    }
    document.body.dataset.stageAuth = 'active';
    form.hidden = google.hidden = true;
    logout.hidden = false;
    status.textContent = pilot?.public ? user.email + ' · Собственик' : 'Профилът е удостоверен';
    status.title = status.textContent;
    if (pilot?.public) panel.classList.add('publicProfile');
    if (pilot) document.getElementById('appVersion').textContent = pilot.public ? 'v' + pilot.version : 'v3.0';
  });
}
