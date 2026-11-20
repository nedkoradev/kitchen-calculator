import {createWorkspaceBridge} from '../workspace-ui/bridge.mjs';
import {createWorkspaceController} from '../workspace-context/editor-controller.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';
import {documentToSnapshot, snapshotToDocument, toEditorSnapshot} from '../workspace-ui/scene-adapter.mjs';
import {nedConfirmDelete, nedPromptName} from '../ui-messages.mjs';
import {decorateAction} from '../icons.mjs';
import {PROJECTS_FOLDER} from '../document-format/model.mjs';

const byId = id => document.getElementById(id);
const isTyping = event => event.target?.matches?.('input, textarea, select, [contenteditable]');
function folderLabel(folder, folders) {
  const parent = folders.find(candidate => candidate.id === folder.parentId);
  return parent ? folderLabel(parent, folders) + ' / ' + folder.name : folder.name;
}

function dialog(heading, build) {
  const node = document.createElement('dialog');
  node.className = 'nedConfirmOverlay';
  node.setAttribute('aria-label', heading);
  const panel = document.createElement('div');
  panel.className = 'nedConfirmPanel';
  const title = document.createElement('h3');
  title.textContent = heading;
  panel.append(title);
  const parentFocus = document.activeElement;
  return new Promise(resolve => {
    const done = value => {
      node.close();
      node.remove();
      if (parentFocus?.isConnected) parentFocus.focus();
      resolve(value);
    };
    build(panel, done);
    node.append(panel);
    node.addEventListener('cancel', event => { event.preventDefault(); done(null); });
    document.body.append(node);
    node.showModal();
  });
}

function button(label, click) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.onclick = click;
  return node;
}

function documentElement(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function mountWorkspaceEditor(editor, {store, drafts, profiles, initialScope, startingDocument, panels}) {
  const status = documentElement('p', 'nedWorkspaceStatus');
  status.id = 'integration-status';
  status.setAttribute('role', 'status');
  const retry = button('Провери журнала', () => bridge.initialize());
  const select = profiles ? document.createElement('select') : null;
  if (select) select.setAttribute('aria-label', 'Тестов профил');
  for (const {scope, label} of profiles ?? []) select.add(new Option(label, scope.ownerUid));
  if (select) {
    select.value = initialScope.ownerUid;
    select.onchange = () => bridge.initialize(profiles.find(profile => profile.scope.ownerUid === select.value).scope);
  }
  function report(failure) { status.textContent = failure.message; }
  const library = panels ? byId('navLibrary') : button('Обща библиотека', () => { void openLibrary().catch(report); });
  if (panels) {
    panels.diagnostics.append(retry);
    byId('shellBottomTools').after(status);
  } else {
    const controls = documentElement('nav', 'toolIcons');
    controls.setAttribute('aria-label', 'Интеграция NED-IQ');
    decorateAction(library, 'open', 'Обща библиотека');
    controls.append(library, ...(select ? [select] : []), retry);
    document.querySelector('main').before(controls, status);
  }
  let installed = null;
  let displayed = null;
  let applying = false;
  let capturing = false;
  let queued = false;
  let visualError = null;
  let captureError = null;
  let pointerGesture = null;

  function render(state) {
    const workspace = state.workspace;
    const message = state.confirmation ? 'Незаписани промени' : state.error?.message ??
      (state.gate !== 'ready' ? state.gate : workspace?.dirty ? 'Незаписани промени' : 'Готово');
    status.textContent = [visualError ?? captureError ?? message, workspace?.document.name,
      workspace?.draftStatus === 'restored' ? 'Възстановена чернова' : '',
      workspace?.reconciledDocument ? 'Сверен запис' : ''].filter(Boolean).join(' · ');
    document.querySelector('main').inert = !state.canAct || !!visualError;
    retry.disabled = state.busy;
    if (select) select.disabled = state.busy;
    library.disabled = !state.canAct || !!visualError;
    if (state.busy || state.gate !== 'ready' || !workspace || capturing) return;
    const signature = sceneSignature(state);
    if (signature !== installed) {
      applying = true;
      try {
        installCandidate(workspace.document);
        visualError = null;
      } catch (failure) {
        visualError = 'Грешка при зареждане на сцената: ' + failure.message;
      } finally {
        applying = false;
      }
    }
    editor.title(workspace.document.name);
    if (visualError) {
      status.textContent = visualError;
      document.querySelector('main').inert = true;
      library.disabled = true;
    }
    byId('undoStep').disabled = !workspace.canUndo;
    byId('redoStep').disabled = !workspace.canRedo;
  }

  function sceneSignature(state) {
    const {parts, room, materials, settings, groups} = state.workspace.document;
    return comparableJson([state.scope, parts, room, materials, settings, groups]);
  }

  function installCandidate(candidate, scope = bridge.state.scope) {
    if (capturing) return;
    const projection = toEditorSnapshot(candidate);
    const previous = editor.capture();
    applying = true;
    try {
      editor.apply(projection);
      displayed = editor.capture();
      installed = comparableJson([scope, candidate.parts, candidate.room, candidate.materials, candidate.settings, candidate.groups]);
    } catch (failure) {
      try { editor.apply(previous); }
      catch (rollbackFailure) {
        visualError = 'Сцената е блокирана: ' + rollbackFailure.message;
      }
      throw failure;
    } finally {
      applying = false;
    }
  }

  async function saveOptions() {
    const scope = bridge.state.scope;
    const sameScope = () => bridge.state.scope?.ownerUid === scope.ownerUid &&
      bridge.state.scope?.actorUid === scope.actorUid;
    let {folders, revision} = await store.list({scope});
    if (!sameScope()) return null;
    return dialog('Име и папка', (panel, done) => {
      const form = document.createElement('form');
      const field = (label, input) => {
        const node = document.createElement('label');
        node.textContent = label;
        input.setAttribute('aria-label', label);
        node.append(input);
        form.append(node);
      };
      const name = document.createElement('input');
      name.required = true;
      name.maxLength = 100;
      name.autofocus = true;
      const destination = document.createElement('select');
      destination.required = true;
      const hint = document.createElement('p');
      const refresh = (selected = '') => {
        destination.replaceChildren(new Option('Избери папка…', ''), ...folders.map(folder =>
          new Option(folderLabel(folder, folders), folder.id)));
        destination.value = selected;
        hint.textContent = folders.length === 1 ? '„Проекти“ е единствената налична папка.' : '';
      };
      field('Име на документа', name);
      field('Папка', destination);
      refresh();
      const feedback = document.createElement('p');
      feedback.setAttribute('role', 'status');
      const actions = documentElement('div', 'nedConfirmActions');
      const cancel = button('Отказ', () => done(null));
      const confirm = button('Запази');
      confirm.type = 'submit';
      if (store.changeFolder) {
        const create = button('Нова папка', async () => {
          const folderName = await nedPromptName('Име на папката');
          if (!folderName || !form.isConnected || !sameScope()) return;
          create.disabled = confirm.disabled = true;
          try {
            const existing = new Set(folders.map(folder => folder.id));
            const parentId = destination.value && destination.value !== PROJECTS_FOLDER.id ? destination.value : null;
            ({folders, revision} = await store.changeFolder({scope, revision,
              change: {action: 'create', name: folderName, parentId}}));
            refresh(folders.find(folder => !existing.has(folder.id))?.id);
            feedback.textContent = 'Папката е създадена.';
            destination.focus();
          } catch (error) {
            feedback.textContent = error.message;
          } finally {
            create.disabled = confirm.disabled = false;
          }
        });
        actions.append(create);
      }
      actions.append(cancel, confirm);
      form.append(hint, feedback, actions);
      form.onsubmit = event => {
        event.preventDefault();
        if (confirm.disabled || !name.value.trim() || !sameScope()) return;
        const folderId = destination.value;
        done({name: name.value.trim(), folderId, type: folderId === PROJECTS_FOLDER.id ? 'project' : 'model'});
      };
      panel.append(form);
    });
  }

  const initialScene = {materials: startingDocument.materials, settings: startingDocument.settings};
  const bridge = createWorkspaceBridge({
    activate: (scope, candidate) => installCandidate(candidate, scope),
    createController: options => createWorkspaceController({...options, drafts, initialScene, beforeSceneChange: installCandidate,
      newId: () => 'custom-' + crypto.randomUUID(),
      persistence: {...store,
        async readProject(request) {
          const doc = await store.readProject(request);
          toEditorSnapshot(doc);
          return doc;
        },
        async readModel(request) {
          const doc = await store.readModel(request);
          documentToSnapshot(doc);
          return doc;
        },
      }}),
    async confirmDiscard({document}) {
      const action = await dialog('Незаписани промени', (panel, done) => {
        const row = documentElement('div', 'nedConfirmActions');
        for (const [label, value] of [['Отказ', 'cancel'], ['Запази и продължи', 'save'], ['Отхвърли', 'discard']]) {
          row.append(button(label, () => done(value)));
        }
        panel.append(row);
      });
      if (!action) return {action: 'cancel'};
      if (action !== 'save' || document.id) return {action};
      const options = await saveOptions();
      return options ? {action, options} : {action: 'cancel'};
    },
    render,
  });

  async function flush() {
    if (applying || capturing || !bridge.state.canAct || !displayed || visualError) return false;
    capturing = true;
    captureError = null;
    try {
      const view = editor.capture();
      const current = bridge.state.workspace.document;
      const {identity} = documentToSnapshot(current);
      // View navigation stays transient. Keep the stored camera and only capture report settings here.
      view.settings = {...current.settings, sheetUtilization: view.settings.sheetUtilization};
      const patch = {};
      for (const key of ['parts', 'room', 'materials', 'assemblyNames']) {
        if (comparableJson(displayed[key]) !== comparableJson(view[key])) patch[key === 'assemblyNames' ? 'groups' : key] = view[key];
      }
      if (displayed.settings.sheetUtilization !== view.settings.sheetUtilization) patch.settings = view.settings;
      if (!Object.keys(patch).length) return true;
      snapshotToDocument(view, identity);
      const changed = await bridge.execute('editScene', patch, {allowPartRemoval: true});
      if (changed) {
        displayed = view;
        installed = sceneSignature(bridge.state);
      } else if (bridge.state.error) {
        installed = null;
      }
      return !bridge.state.error;
    } catch (failure) {
      installed = null;
      captureError = failure.message;
      return false;
    } finally {
      capturing = false;
      render(bridge.state);
    }
  }

  function sceneChanged() {
    if (applying || queued || pointerGesture !== null) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; void flush(); });
  }

  async function run(command, ...args) {
    if (!await flush()) return false;
    return bridge.execute(command, ...args);
  }

  async function openLibrary() {
    if (!await flush()) return;
    const scope = bridge.state.scope;
    const {folders, documents, revision} = await store.list({scope});
    if (bridge.state.scope.ownerUid !== scope.ownerUid || !bridge.state.canAct) return;
    const build = (panel, done) => {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Папка');
      for (const folder of folders) select.add(new Option(folderLabel(folder, folders), folder.id));
      const listing = documentElement('div', 'libraryDialogItems');
      const folderActions = documentElement('div', 'nedConfirmActions');
      const refresh = () => {
        listing.replaceChildren(...documents.filter(item => item.folderId === select.value)
          .map(item => button((item.type === 'project' ? 'Отвори проект · ' : 'Добави модел · ') + item.name,
            () => done({item}))));
        if (!store.changeFolder) return;
        const id = select.value;
        folderActions.replaceChildren(button('Нова папка', () => done({change: {action: 'create',
          parentId: id === PROJECTS_FOLDER.id ? null : id}})));
        if (id !== PROJECTS_FOLDER.id) {
          for (const [label, action] of [['Преименувай', 'rename'], ['Премести', 'move'], ['Изтрий празна папка', 'delete']]) {
            folderActions.append(button(label, () => done({change: {action, id}})));
          }
        }
      };
      select.onchange = refresh;
      refresh();
      panel.append(select, listing, folderActions, button('Отказ', () => done(null)));
    };
    const chosen = await (panels ? panels.library(build) : dialog('Обща библиотека', build));
    if (!chosen) return;
    if (chosen.item) {
      const {item} = chosen;
      return run(item.type === 'project' ? 'openProject' : 'insertModel', item.id);
    }
    const change = chosen.change;
    if (['create', 'rename'].includes(change.action)) {
      change.name = await nedPromptName('Име на папката', folders.find(folder => folder.id === change.id)?.name ?? '');
      if (!change.name) return;
    }
    if (change.action === 'move') {
      change.parentId = await dialog('Нова родителска папка', (panel, done) => {
        panel.append(button('Корен', () => done('')));
        for (const folder of folders.filter(folder => folder.id !== PROJECTS_FOLDER.id && folder.id !== change.id)) {
          panel.append(button(folderLabel(folder, folders), () => done(folder.id)));
        }
      });
      if (change.parentId === null) return;
      change.parentId ||= null;
    }
    if (change.action === 'delete' && !await nedConfirmDelete('Да изтрия ли празната папка?')) return;
    if (!bridge.state.canAct || bridge.state.scope.ownerUid !== scope.ownerUid) return;
    await store.changeFolder({scope, change, revision});
    return openLibrary();
  }

  async function save(saveAs) {
    if (!await flush()) return;
    const current = bridge.state.workspace.document;
    const options = saveAs || !current.id ? await saveOptions() : {};
    if (options) await run(saveAs ? 'saveAsDocument' : 'saveDocument', options);
  }

  const file = {
    new: () => run('newDocument', initialScene),
    open: openLibrary, save: () => save(false), saveAs: () => save(true),
  };
  for (const [id, handler] of Object.entries({
    commandFileNew: file.new, commandFileOpen: file.open, commandFileSave: file.save,
    commandFileSaveAs: file.saveAs, quickOpen: file.open, projectQuickOpen: file.open,
    quickSave: file.save, projectQuickSave: file.save, projectQuickSaveAs: file.saveAs,
    projectQuickAdd: file.open, navLibrary: file.open,
    undoStep: () => run('undo'), redoStep: () => run('redo'),
  })) {
    byId(id).onclick = () => {
      byId('fileMenu').open = false;
      if (panels && id === 'navLibrary') {
        const menu = byId('libraryMenu');
        menu.open = false;
        menu.querySelector('summary').focus();
      }
      void handler().catch(report);
    };
  }
  for (const id of ['modeProject', 'modeConstructor', 'cloudLogin', 'cloudLogout']) byId(id).hidden = true;
  document.addEventListener('keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || document.querySelector('dialog:modal')) return;
    const key = event.key.toLowerCase();
    const command = key === 'n' ? file.new : key === 'o' ? file.open : key === 's' ? event.shiftKey ? file.saveAs : file.save :
      !isTyping(event) && key === 'z' ? () => run(event.shiftKey ? 'redo' : 'undo') :
      !isTyping(event) && key === 'y' ? () => run('redo') : null;
    if (!command) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void command().catch(report);
  }, {capture: true});
  document.addEventListener('pointerdown', event => {
    if (event.button === 0 && event.target.closest('#view canvas')) pointerGesture = event.pointerId;
  }, true);
  for (const name of ['pointerup', 'pointercancel']) {
    document.addEventListener(name, event => {
      if (event.pointerId !== pointerGesture) return;
      pointerGesture = null;
      sceneChanged();
    }, true);
  }
  window.addEventListener('blur', () => {
    if (pointerGesture === null) return;
    pointerGesture = null;
    sceneChanged();
  });
  document.addEventListener('change', sceneChanged, true);
  editor.onChange(sceneChanged);
  void bridge.initialize(initialScope);
  return {bridge, flush};
}
