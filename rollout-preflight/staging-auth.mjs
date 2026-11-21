import {fallbackUrl} from '../pilot/config.mjs';
import {installPilotPanels} from '../release-candidate/panels.mjs';
import {mountWorkspaceEditor} from '../release-candidate/editor.mjs';
import {createWorkspaceHttpClient} from '../release-candidate/client.mjs';
import {createWorkspaceDraftAdapter} from '../workspace-persistence/drafts.mjs';
import {prepareNewDocument} from '../workspace-context/context.mjs';

const loginErrors = new Map([
  ['auth/unauthorized-domain', 'Този адрес не е разрешен за Google вход. Свържи се с администратора.'],
  ['auth/popup-blocked', 'Браузърът блокира прозореца за вход. Разреши изскачащите прозорци за този адрес и опитай отново.'],
  ['auth/popup-closed-by-user', 'Прозорецът за вход е затворен. Опитай отново.'],
  ['auth/web-storage-unsupported', 'Браузърът блокира хранилището, необходимо за Google вход. Опитай в обикновен прозорец.'],
  ['auth/network-request-failed', 'Връзката с Google входа прекъсна. Провери интернет връзката и опитай отново.'],
  ['auth/operation-not-allowed', 'Google входът не е включен за приложението. Свържи се с администратора.'],
  ['auth/invalid-api-key', 'Настройките за Google вход са невалидни. Свържи се с администратора.'],
]);

function authErrorMessage(error) {
  return loginErrors.get(error?.code) ?? 'Входът не е потвърден. Опитай отново.';
}

export async function startStagingAuth({authOrigin, pilot, materialsReady, activate, editor, views}) {
  const allowedOrigin = pilot?.localGoogle
    ? pilot.origin === 'http://localhost:8053' && location.origin === pilot.origin
    : pilot
      ? location.protocol === 'https:' && location.origin === pilot.origin
      : location.hostname === '127.0.0.1' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(authOrigin);
  if (!allowedOrigin) throw new Error('Unexpected authentication origin');
  const app = window.firebase.initializeApp(pilot
    ? {apiKey: pilot.apiKey, authDomain: pilot.authDomain, projectId: pilot.localGoogle ? pilot.projectId : 'kitchen-designer-9d437'}
    : {apiKey: 'demo-emulator-key', authDomain: 'demo-nediq-v3-release.firebaseapp.com', projectId: 'demo-nediq-v3-release'},
  'workspace-pilot');
  const auth = window.firebase.auth(app);
  if (!pilot) auth.useEmulator(authOrigin);
  const panel = document.createElement('section');
  panel.id = 'staging-auth';
  panel.setAttribute('aria-label', 'Вход в локалния преглед');
  panel.innerHTML = '<form><label>Имейл <input type="email" name="email" autocomplete="username" required></label>' +
    '<label>Парола <input type="password" name="password" autocomplete="current-password" required></label>' +
    '<button type="submit">Вход</button></form><button type="button" data-google>Вход с Google</button>' +
    '<button type="button" data-logout hidden>Изход</button><span role="status" aria-live="polite"></span><p role="alert" class="staging-auth-error"></p>';
  document.querySelector('main').before(panel);
  const form = panel.querySelector('form');
  const google = panel.querySelector('[data-google]');
  const logout = panel.querySelector('[data-logout]');
  for (const id of ['cloudLogin', 'cloudLogout']) document.getElementById(id).hidden = true;
  const status = panel.querySelector('[role=status]');
  const errorStatus = panel.querySelector('[role=alert]');
  const showError = message => { errorStatus.textContent = message; };
  const submit = form.querySelector('button');
  google.disabled = submit.disabled = true;
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
    showError('');
    submit.disabled = true;
    google.disabled = true;
    try { await callback(); }
    catch (error) { showError(authErrorMessage(error)); }
    finally {
      form.elements.password.value = '';
      submit.disabled = false;
      google.disabled = false;
    }
  };
  form.onsubmit = event => {
    event.preventDefault();
    void authOperation(() => auth.signInWithEmailAndPassword(form.elements.email.value, form.elements.password.value));
  };
  google.onclick = () => { void authOperation(() => auth.signInWithPopup(new window.firebase.auth.GoogleAuthProvider())); };
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

  const sessionPersistence = window.firebase.auth.Auth.Persistence;
  try { await auth.setPersistence(sessionPersistence.SESSION); }
  catch {
    try {
      await auth.setPersistence(sessionPersistence.NONE);
      status.textContent = 'Входът важи само до презареждане на страницата.';
    } catch {
      showError('Сесията не може да се стартира в този браузър. Опитай в обикновен прозорец.');
      return;
    }
  }
  submit.disabled = google.disabled = false;

  async function onAuthState(user) {
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
      catch (error) {
        if (auth.currentUser?.uid !== user.uid) return;
        showError(error?.code === 'permission-denied'
          ? 'Входът е потвърден от Google, но NED-IQ отказа достъп до работното пространство.'
          : 'Входът е потвърден от Google, но работното пространство е недостъпно. Опитай отново.');
        logout.hidden = false;
        return;
      }
    }
    await materialsReady;
    if (session || auth.currentUser?.uid !== user.uid) return;
    const draftStorage = localStorage;
    activate();
    const startingDocument = prepareNewDocument({materials: editor.capture().materials});
    let integration;
    const panels = installPilotPanels({...views, logout, fallback: back,
      canEdit: () => integration?.bridge.state.canAct === true,
      onMaterialApply: () => integration.flush()});
    integration = mountWorkspaceEditor(editor, {store, drafts: createWorkspaceDraftAdapter(draftStorage),
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
    showError('');
    status.textContent = 'Профилът е удостоверен';
    if (pilot) document.getElementById('appVersion').textContent = pilot.public ? 'v3.0.0' : 'v3.0';
  }
  auth.onAuthStateChanged(user => {
    void onAuthState(user).catch(() => {
      if (auth.currentUser?.uid !== user?.uid) return;
      lock();
      showError('Входът е потвърден, но редакторът не може да се зареди. Презареди страницата и опитай отново.');
      logout.hidden = false;
    });
  }, error => {
    lock();
    showError(authErrorMessage(error));
  });
}
