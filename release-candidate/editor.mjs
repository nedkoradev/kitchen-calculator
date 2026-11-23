import {createWorkspaceBridge} from '../workspace-ui/bridge.mjs';
import {createWorkspaceController} from '../workspace-context/editor-controller.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';
import {documentToSnapshot, snapshotToDocument, toEditorSnapshot} from '../workspace-ui/scene-adapter.mjs';
import {applyLegacyMigration, inspectLegacyMigration} from './legacy-migration.mjs';
import {nedConfirmDelete, nedPromptName} from '../ui-messages.mjs';
import {decorateAction} from '../icons.mjs';
import {PROJECTS_FOLDER} from '../document-format/model.mjs';
import {installV3GroupNames} from './group-names.mjs';

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

export function mountWorkspaceEditor(editor, {store, drafts, profiles, initialScope, startingDocument, panels, legacy = false}) {
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
  let v3GroupNames = null;

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
    v3GroupNames?.refresh();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => v3GroupNames?.refresh());
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
      form.className = 'pilotSaveFolderForm';
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

  let initialScene = {materials: startingDocument.materials, settings: startingDocument.settings};
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
  v3GroupNames = installV3GroupNames({getDocument: () => bridge.state.workspace?.document});

  let activeMaterialBaseId = '';
  let activeMaterialBaseName = '';
  let suppressMaterialBaseSave = false;

  function emitMaterial(type, detail) {
    window.dispatchEvent(new CustomEvent('kitchen-v2-cloud-' + type, {detail}));
  }
  function materialScope() {
    return bridge.state.scope ?? initialScope;
  }
  function sameMaterialScope(scope) {
    return bridge.state.scope?.ownerUid === scope.ownerUid &&
      bridge.state.scope?.actorUid === scope.actorUid;
  }
  function catalogFromEditor() {
    const materials = editor.capture().materials ?? {};
    return {
      pdcMaterials: Array.isArray(materials.pdcMaterials) ? structuredClone(materials.pdcMaterials) : [],
      edgeMaterials: Array.isArray(materials.edgeMaterials) ? structuredClone(materials.edgeMaterials) : [],
      backMaterials: Array.isArray(materials.backMaterials) ? structuredClone(materials.backMaterials) : [],
      worktops: Array.isArray(materials.worktops) ? structuredClone(materials.worktops) : [],
      servicePrices: materials.servicePrices && typeof materials.servicePrices === 'object'
        ? structuredClone(materials.servicePrices) : {},
    };
  }
  function catalogForBase(data, name) {
    return {
      pdcMaterials: Array.isArray(data?.pdcMaterials) ? structuredClone(data.pdcMaterials) : [],
      edgeMaterials: Array.isArray(data?.edgeMaterials) ? structuredClone(data.edgeMaterials) : [],
      backMaterials: Array.isArray(data?.backMaterials) ? structuredClone(data.backMaterials) : [],
      worktops: Array.isArray(data?.worktops) ? structuredClone(data.worktops) : [],
      servicePrices: data?.servicePrices && typeof data.servicePrices === 'object'
        ? structuredClone(data.servicePrices) : {},
      activeBase: name || '',
    };
  }
  function updateInitialSceneForBase(data, name) {
    initialScene = {...initialScene, materials: catalogForBase(data, name)};
  }

  async function refreshMaterialBases() {
    const scope = materialScope();
    const result = await store.materialBases({scope});
    if (!sameMaterialScope(scope) && bridge.state.scope) return result;
    const detail = {uid: scope.ownerUid, items: result.items ?? [], defaultBaseId: result.defaultBaseId ?? ''};
    emitMaterial('material-list', detail);
    panels?.setMaterialBases?.(result);
    return result;
  }

  async function setMaterialDefault(id) {
    const scope = materialScope();
    try {
      await store.materialBaseSetDefault({scope, id});
      if (!sameMaterialScope(scope) && bridge.state.scope) return;
      emitMaterial('material-default-saved', {uid: scope.ownerUid, id});
    } catch (error) {
      if (!sameMaterialScope(scope) && bridge.state.scope) return;
      emitMaterial('material-default-error', {message: error.message});
    }
  }

  async function activateMaterialBase(id, automatic = false) {
    const scope = materialScope();
    const base = await store.materialBaseRead({scope, id});
    if (!sameMaterialScope(scope) && bridge.state.scope) throw Error('Профилът или базата са променени.');
    activeMaterialBaseId = base.id;
    activeMaterialBaseName = base.name;
    updateInitialSceneForBase(base.data, base.name);
    panels?.setActiveMaterialBase?.(base.id, base.name);
    panels?.showMaterialBasePreview?.(base);
    if (!automatic) await setMaterialDefault(base.id);
    const savedDocument = !!bridge.state.workspace?.document?.id;
    if (!savedDocument || automatic) {
      suppressMaterialBaseSave = true;
      try {
        emitMaterial('material-loaded', {
          uid: scope.ownerUid,
          id: base.id,
          automatic,
          name: base.name,
          data: base.data,
        });
      } finally {
        suppressMaterialBaseSave = false;
      }
    } else {
      panels?.setMaterialBaseStatus?.('Активна база: ' + base.name + '. Записаният документ запазва своята материална база.');
    }
    return base;
  }

  async function saveCurrentMaterialBase() {
    const scope = materialScope();
    const data = catalogFromEditor();
    let id = activeMaterialBaseId || null;
    let name = activeMaterialBaseName;
    if (!id) {
      name = await nedPromptName('Име на новата материална база', '', {
        heading: 'Нова материална база',
        okLabel: 'Създай',
      });
      if (!name) throw Error('Операцията е отказана.');
    }
    const result = await store.materialBaseSave({scope, id, name, data});
    if (!sameMaterialScope(scope) && bridge.state.scope) throw Error('Профилът или базата са променени.');
    activeMaterialBaseId = result.id;
    activeMaterialBaseName = result.name;
    updateInitialSceneForBase(result.data, result.name);
    if (!id) await setMaterialDefault(result.id);
    emitMaterial('material-saved', {uid: scope.ownerUid, id: result.id, name: result.name});
    await refreshMaterialBases();
    panels?.setActiveMaterialBase?.(result.id, result.name);
    panels?.showMaterialBasePreview?.({id: result.id, name: result.name, data: result.data});
    return {id: result.id, name: result.name, data: result.data};
  }

  async function createMaterialBase(name) {
    const scope = materialScope();
    const data = catalogFromEditor();
    const result = await store.materialBaseSave({scope, id: null, name, data});
    if (!sameMaterialScope(scope) && bridge.state.scope) throw Error('Профилът или базата са променени.');
    activeMaterialBaseId = result.id;
    activeMaterialBaseName = result.name;
    updateInitialSceneForBase(result.data, result.name);
    await setMaterialDefault(result.id);
    emitMaterial('material-saved', {uid: scope.ownerUid, id: result.id, name: result.name});
    await refreshMaterialBases();
    return {id: result.id, name: result.name, data: result.data};
  }

  async function renameMaterialBase(id, name) {
    const scope = materialScope();
    const result = await store.materialBaseRename({scope, id, name});
    if (!sameMaterialScope(scope) && bridge.state.scope) throw Error('Профилът или базата са променени.');
    if (activeMaterialBaseId === result.id) {
      activeMaterialBaseName = result.name;
      updateInitialSceneForBase(initialScene.materials, result.name);
    }
    await refreshMaterialBases();
    return result;
  }

  async function deleteMaterialBase(id) {
    const scope = materialScope();
    const result = await store.materialBaseDelete({scope, id});
    if (!sameMaterialScope(scope) && bridge.state.scope) throw Error('Профилът или базата са променени.');
    if (activeMaterialBaseId === result.id) {
      activeMaterialBaseId = '';
      activeMaterialBaseName = '';
      updateInitialSceneForBase({}, '');
    }
    emitMaterial('material-list', await store.materialBases({scope}));
    await refreshMaterialBases();
    return result;
  }

  if (panels && typeof store.materialBases === 'function') {
    panels.installMaterialBases({
      refresh: refreshMaterialBases,
      activate: activateMaterialBase,
      create: createMaterialBase,
      save: saveCurrentMaterialBase,
      rename: renameMaterialBase,
      remove: deleteMaterialBase,
      getCatalog: catalogFromEditor,
    });

    window.addEventListener('kitchen-v2-material-list-request', () => {
      void refreshMaterialBases().catch(error => emitMaterial('material-error', {
        operation: 'list',
        automatic: false,
        message: error.message,
      }));
    });
    window.addEventListener('kitchen-v2-material-load-request', event => {
      void activateMaterialBase(event.detail?.id, !!event.detail?.automatic).catch(error => {
        emitMaterial('material-error', {
          operation: 'load',
          automatic: !!event.detail?.automatic,
          message: error.message,
        });
      });
    });
    window.addEventListener('kitchen-v2-material-default-request', event => {
      void setMaterialDefault(event.detail?.id || '');
    });
    window.addEventListener('kitchen-v2-material-save-request', event => {
      const detail = event.detail ?? {};
      if (suppressMaterialBaseSave) return;
      void (async () => {
        const scope = materialScope();
        if (!activeMaterialBaseId) throw Error('Избери или създай активна материална база.');
        const result = await store.materialBaseSave({
          scope,
          id: activeMaterialBaseId,
          name: activeMaterialBaseName,
          data: detail.data ?? catalogFromEditor(),
        });
        if (!sameMaterialScope(scope) && bridge.state.scope) throw Error('Профилът или базата са променени.');
        activeMaterialBaseId = result.id;
        activeMaterialBaseName = result.name;
        updateInitialSceneForBase(result.data, result.name);
        emitMaterial('material-saved', {uid: scope.ownerUid, id: result.id, name: result.name});
        await refreshMaterialBases();
        panels?.setActiveMaterialBase?.(result.id, result.name);
        panels?.showMaterialBasePreview?.({id: result.id, name: result.name, data: result.data});
      })().catch(error => emitMaterial('material-error', {
        operation: 'save',
        automatic: false,
        message: error.message,
      }));
    });
    window.dispatchEvent(new CustomEvent('kitchen-project-auth', {
      detail: {
        uid: initialScope.ownerUid,
        role: 'owner',
        sharingAuth: 'ready',
        scope: initialScope,
      },
    }));
  }

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

  const migrationLabels = {
    ready: 'готов за миграция',
    blocked: 'блокиран',
    conflict: 'конфликт',
    'already-imported': 'вече мигриран',
    'existing-not-updated': 'съществуващият v3 документ е запазен',
    imported: 'мигриран',
    failed: 'неуспешен',
    unknown: 'резултатът не е потвърден',
    'not-attempted': 'не е изпълнен',
  };

  function migrationReport(panel, rows) {
    const listing = documentElement('div', 'libraryDialogItems');
    for (const row of rows) {
      const item = document.createElement('p');
      item.textContent = `${migrationLabels[row.status] ?? row.status} · ${row.type === 'project' ? 'Проект' : 'Модел'} · ${row.name}: ${row.reason}`;
      listing.append(item);
    }
    panel.append(listing);
  }

  async function migrateLegacyLibrary(ownerUid, legacy, catalogs) {
    const scope = bridge.state.scope;
    const sameOwner = () => bridge.state.scope?.ownerUid === scope.ownerUid &&
      bridge.state.scope?.actorUid === scope.actorUid && scope.actorUid === scope.ownerUid &&
      ownerUid === scope.ownerUid && bridge.state.canAct;
    if (!sameOwner() || !await flush()) return;

    let {folders, revision} = await store.list({scope});
    if (!sameOwner()) return;
    const models = legacy.documents.filter(item => item.type === 'model');
    const needsCatalog = legacy.documents.filter(item => item.requiresCatalog);
    const catalogOptions = Array.isArray(catalogs) ? catalogs : [];
    const options = await dialog('Подготовка на миграция', (panel, done) => {
      panel.classList.add('pilotSaveFolderForm', 'migrationDialogPanel');
      const description = document.createElement('p');
      description.textContent = 'Провери съвместимостта преди запис. Оригиналите v2.95 остават непроменени; съществуващи документи във v3 не се презаписват. Папката е само целево място за моделите във v3.';
      panel.append(description);

      const folderControls = documentElement('div', 'migrationFolderControls');
      const folder = document.createElement('select');
      folder.setAttribute('aria-label', 'Целева папка във v3');
      const refreshFolders = (selected = '') => {
        const choices = folders.filter(item => item.id !== PROJECTS_FOLDER.id);
        folder.replaceChildren(new Option(choices.length ? 'Избери папка в библиотеката…' : 'Няма папка във v3 — създай папка по-долу…', ''),
          ...choices.map(item => new Option(folderLabel(item, folders), item.id)));
        folder.value = selected;
      };
      if (models.length) {
        const label = document.createElement('label');
        label.textContent = 'Целева папка във v3';
        label.append(folder);
        refreshFolders();
        const createRow = documentElement('div', 'migrationFolderActions');
        const create = button('Създай папка „Импорт от v2.95“', async () => {
          create.disabled = true;
          try {
            ({folders, revision} = await store.changeFolder({scope, revision,
              change: {action: 'create', name: 'Импорт от v2.95', parentId: null}}));
            refreshFolders(folders.find(item => item.name === 'Импорт от v2.95')?.id ?? '');
          } catch (error) {
            feedback.textContent = error.message;
            try {
              const latest = await store.list({scope});
              ({folders, revision} = latest);
              refreshFolders(folders.find(item => item.name === 'Импорт от v2.95')?.id ?? '');
            } catch (refreshError) {
              feedback.textContent += `; папките не са презаредени: ${refreshError.message}`;
            }
          } finally {
            create.disabled = false;
          }
        });
        createRow.append(create);
        folderControls.append(label, createRow);
        panel.append(folderControls);
      }

      const catalogList = documentElement('div', 'migrationCatalogList');
      catalogList.style.height = window.matchMedia('(max-width:620px)').matches ? '38dvh' : '42dvh';
      catalogList.style.maxHeight = catalogList.style.height;
      catalogList.style.minHeight = '90px';
      catalogList.style.overflowY = 'auto';
      catalogList.style.overscrollBehavior = 'contain';
      const catalogSelects = new Map();
      if (needsCatalog.length) {
        const catalogHint = document.createElement('p');
        catalogHint.textContent = 'Материалните бази не се копират автоматично. За всеки документ с индекси избери точната оригинална база от v2.95.';
        catalogList.append(catalogHint);
      } else if (models.length || legacy.documents.length) {
        const catalogHint = document.createElement('p');
        catalogHint.textContent = 'Документите имат вградена или стандартна материална информация. Отделна обща база Материали не се копира автоматично.';
        catalogList.append(catalogHint);
      }
      for (const item of needsCatalog) {
        const label = document.createElement('label');
        label.textContent = `Оригинална материална база · ${item.name}`;
        const select = document.createElement('select');
        select.setAttribute('aria-label', label.textContent);
        select.add(new Option('Избери точната база…', ''));
        catalogOptions.forEach((catalog, index) => select.add(new Option(catalog.name, String(index))));
        label.append(select);
        catalogList.append(label);
        catalogSelects.set(item.id, select);
      }
      panel.append(catalogList);

      const feedback = document.createElement('p');
      feedback.setAttribute('role', 'status');
      const actions = documentElement('div', 'nedConfirmActions');
      const cancel = button('Отказ', () => done(null));
      const confirm = button('Провери съвместимостта', () => {
        if (models.length && !folder.value) {
          feedback.textContent = 'Избери или създай папка за моделите.';
          return;
        }
        const catalogIds = {};
        for (const [id, select] of catalogSelects) {
          if (select.value === '') {
            feedback.textContent = 'Избери точната материална база за всеки документ, който я изисква.';
            return;
          }
          catalogIds[id] = catalogOptions[Number(select.value)].id;
        }
        if (!sameOwner()) return;
        done({modelFolderId: folder.value || null, catalogIds});
      });
      actions.append(cancel, confirm);
      panel.append(feedback, actions);
    });
    if (!options || !sameOwner()) return;

    const plan = await inspectLegacyMigration({store, scope, ownerUid,
      catalogIds: options.catalogIds, modelFolderId: options.modelFolderId});
    if (!sameOwner()) return;
    const ready = plan.rows.filter(row => row.status === 'ready').length;
    const proceed = await dialog('Проверка на миграция v2.95 → v3', (panel, done) => {
      const summary = document.createElement('p');
      summary.textContent = `Проекти: ${legacy.documents.filter(item => item.type === 'project').length} · Модели: ${models.length} · Готови: ${ready}. Само съвместимите документи ще се създадат; оригиналите няма да се променят.`;
      panel.append(summary);
      migrationReport(panel, plan.rows);
      const actions = documentElement('div', 'nedConfirmActions');
      actions.append(button('Отказ', () => done(false)));
      if (ready) actions.append(button(`Мигрирай ${ready} съвместими документа`, () => done(true)));
      panel.append(actions);
    });
    if (!proceed || !sameOwner()) return;

    const result = await applyLegacyMigration({store, plan});
    await dialog('Отчет за миграцията', (panel, done) => {
      const imported = result.rows.filter(row => row.status === 'imported').length;
      const skipped = result.rows.filter(row => row.status === 'already-imported').length;
      const failed = result.rows.filter(row => ['blocked', 'conflict', 'existing-not-updated', 'failed', 'unknown', 'not-attempted'].includes(row.status)).length;
      const summary = document.createElement('p');
      summary.textContent = `Добавени: ${imported} · Вече съществуват: ${skipped} · Нерешени: ${failed}. Оригиналите v2.95 са запазени. При неясен резултат повторната проверка не създава дубликати.`;
      panel.append(summary);
      migrationReport(panel, result.rows);
      panel.append(button('Затвори', () => done(true)));
    });
  }

  async function openLegacyLibrary() {
    const scope = bridge.state.scope;
    const bases = await store.legacyBases({scope});
    const owner = await dialog('Библиотеки v2.95', (panel, done) => {
      for (const base of bases) panel.append(button(base.name + ' · ' + ({owner: 'Собственик', editor: 'Редактор', viewer: 'Наблюдател'}[base.role] ?? ''), () => done(base.id)));
      panel.append(button('Отказ', () => done(null)));
    });
    if (!owner || bridge.state.scope?.actorUid !== scope.actorUid || !bridge.state.canAct) return;
    const {documents, catalogs, folders = []} = await store.legacyList({scope, legacyOwnerId: owner});
    const item = await dialog('Документи v2.95', (panel, done) => {
      const hint = document.createElement('p');
      hint.textContent = 'Оригиналът остава във v2.95. Записването тук създава личен v3 документ.';
      panel.append(hint);
      const listing = documentElement('div', 'libraryDialogItems');
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Папка v2.95');
      select.add(new Option('Всички документи', ''));
      for (const folder of folders) select.add(new Option(folder.label, folder.id));
      const refresh = () => listing.replaceChildren(...documents
        .filter(item => !select.value || item.folderId === select.value)
        .map(item => button((item.type === 'project' ? 'Отвори проект · ' : 'Добави модел · ') + item.name,
          () => done(item))));
      select.onchange = refresh;
      refresh();
      panel.append(select, listing, button('Отказ', () => done(null)));
      if (owner === scope.ownerUid && scope.actorUid === scope.ownerUid && documents.length) {
        panel.append(button('Мигрирай всички мои документи в v3…',
          () => done({migration: true})));
      }
    });
    if (item?.migration && bridge.state.scope?.actorUid === scope.actorUid && bridge.state.canAct) {
      return migrateLegacyLibrary(owner, {documents, catalogs}, catalogs);
    }
    if (!item || bridge.state.scope?.actorUid !== scope.actorUid || !bridge.state.canAct) return;
    let catalogId;
    if (item.requiresCatalog) {
      catalogId = await dialog('Оригинална материална база', (panel, done) => {
        const hint = document.createElement('p');
        hint.textContent = 'Избери базата, с която е записан документът. Старият запис не съдържа тази информация.';
        panel.append(hint);
        for (const catalog of catalogs) panel.append(button(catalog.name, () => done(catalog.id)));
        panel.append(button('Отказ', () => done(null)));
      });
      if (catalogId === null) return;
    }
    if (bridge.state.scope?.actorUid !== scope.actorUid) return;
    return run('openLegacyDocument', {legacyOwnerId: owner, id: item.id, type: item.type, catalogId});
  }

  async function openLibrary(selectedFolderId = null) {
    if (!await flush()) return;
    const scope = bridge.state.scope;
    const {folders, documents, revision} = await store.list({scope});
    if (bridge.state.scope.ownerUid !== scope.ownerUid || !bridge.state.canAct) return;
    const build = (panel, done) => {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Папка');
      for (const folder of folders) select.add(new Option(folderLabel(folder, folders), folder.id));
      if (selectedFolderId && folders.some(folder => folder.id === selectedFolderId)) select.value = selectedFolderId;
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
      panel.append(select, listing, folderActions);
      if (legacy) panel.append(button('Документи v2.95…', () => done({legacy: true})));
      panel.append(button('Отказ', () => done(null)));
    };
    const chosen = await (panels ? panels.library(build) : dialog('Обща библиотека', build));
    if (!chosen) return;
    if (chosen.legacy) return openLegacyLibrary();
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

  // The legacy menu categories are not authoritative in the v3 Pilot.
  // Resolve every folder entry from the same authenticated v3 manifest used by Save and Settings.
  if (panels) {
    const menu = byId('libraryMenu');
    const items = menu?.querySelector('.documentMenuItems');
    if (items) {
      const refreshMenu = async () => {
        items.replaceChildren(byId('navLibrary'));
        const scope = bridge.state.scope;
        if (!scope || !bridge.state.canAct) return;
        try {
          const {folders} = await store.list({scope});
          if (bridge.state.scope?.ownerUid !== scope.ownerUid || !bridge.state.canAct) return;
          const add = (label, folderId) => {
            const item = button(label, () => {
              menu.open = false;
              void openLibrary(folderId).catch(report);
            });
            item.setAttribute('role', 'menuitem');
            items.append(item);
          };
          byId('navLibrary').textContent = 'Всички модели…';
          for (const folder of folders) add(folderLabel(folder, folders), folder.id);
        } catch (error) { report(error); }
      };
      menu.addEventListener('toggle', () => { if (menu.open) void refreshMenu(); });
      items.replaceChildren(byId('navLibrary'));
    }
  }

  const standardFolderNames = ['Горни шкафове', 'Долни шкафове', 'Гардероби', 'Спални', 'Комоди', 'Електроуреди'];
  async function restoreStandardFolders() {
    const scope = bridge.state.scope;
    if (!scope || !bridge.state.canAct) return;
    let {folders, revision} = await store.list({scope});
    const existing = new Set(folders.filter(folder => folder.parentId === null)
      .map(folder => folder.name.toLocaleLowerCase('bg')));
    for (const name of standardFolderNames) {
      if (existing.has(name.toLocaleLowerCase('bg'))) continue;
      const result = await store.changeFolder({scope, revision,
        change: {action: 'create', name, parentId: null}});
      ({folders, revision} = result);
      existing.add(name.toLocaleLowerCase('bg'));
    }
    return folders;
  }
  if (panels) {
    const settingsSections = byId('settingsDialog')?.querySelector('.settingsSections');
    if (settingsSections) {
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = 'Папки в библиотеката';
      const description = document.createElement('p');
      description.textContent = 'Управлявай папките или добави липсващите стандартни категории. Съществуващите папки и модели се запазват.';
      const manage = button('Управление на папките', () => {
        byId('settingsDialog').close();
        void openLibrary().catch(report);
      });
      const restore = button('Добави стандартните папки', async () => {
        restore.disabled = true;
        try {
          const folders = await restoreStandardFolders();
          description.textContent = 'Готово: ' + folders.length + ' папки. Списъкът е обновен в библиотеката и при запазване.';
        } catch (error) { report(error); }
        finally { restore.disabled = false; }
      });
      section.append(heading, description, manage, restore);
      settingsSections.append(section);
    }
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
