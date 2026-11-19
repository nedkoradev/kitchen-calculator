import {createWorkspaceBridge} from '../../workspace-ui/bridge.mjs';
import {createWorkspaceController} from '../../workspace-context/editor-controller.mjs';
import {prepareNewDocument} from '../../workspace-context/context.mjs';
import {comparableJson} from '../../workspace-context/insertion.mjs';
import {documentToSnapshot, snapshotToDocument, toEditorSnapshot} from '../../workspace-ui/scene-adapter.mjs';
import {createWorkspaceDraftAdapter} from '../../workspace-persistence/drafts.mjs';
import {nedPromptName} from '../../ui-messages.mjs';
import {decorateAction} from '../../icons.mjs';
import {createFixtureWorkspaceStore, folderLabel, folders} from './workspace-real-store.mjs';

const byId = id => document.getElementById(id);
const isTyping = event => event.target?.matches?.('input, textarea, select, [contenteditable]');
const fixtureScope = ownerUid => ({ownerUid, actorUid: ownerUid});

function fixtureDocuments() {
  const scene = {
    room: {w: 3000, h: 2600, d: 3000},
    assemblyNames: {outer: 'Корпус', inner: 'Рафтова група'},
    materials: {
      pdcMaterials: [
        {name: 'Контролна плоскост', textureUrl: 'materials/textures/дъб небраска.png',
          color: '#ddd0b8', fullW: 2000, fullH: 1000, fullPrice: 35, halfW: 1000, halfH: 1000, halfPrice: 20},
        {name: 'Тестова бяла', color: '#ffffff', fullW: 2000, fullH: 1000, fullPrice: 40},
      ],
      edgeMaterials: [{name: 'Контролен кант', price: 2}],
      backMaterials: [], worktops: [], activeBase: '', servicePrices: {cutStart: 3, cutPart: 1, edging: 0.5},
    },
    settings: {sheetUtilization: 80, viewMode: 'front', projectTab: '3d'},
  };
  const shelf = (id, x, y, z, w = 600) => ({
    part: {key: 'custom' + id, x, y, z, w, h: 18, d: 400, assembly: 'outer', assemblyStack: [null, 'inner'], locks: {h: true}},
    name: 'Рафт', finish: {material: 0, materialType: 'pdc', color: '#ddd0b8',
      edges: [0, null, null, null], grainRequired: true, grainAxis: 'x'}, allEdges: false,
  });
  function make(id, name, parts, type = 'project') {
    const {identity} = documentToSnapshot(prepareNewDocument({name, type, folderId: type === 'model' ? 'shelves' : undefined}));
    return snapshotToDocument({...scene, parts}, {...identity, id, revision: 1});
  }
  return [
    make('test-project', 'Контролна кухня', [shelf(101, -350, 9, 0), shelf(102, 350, 9, 0)]),
    make('test-model', 'Библиотечен рафт', [shelf(103, 0, 109, 500)], 'model'),
    make('test-large', 'Кухня с 750 детайла', Array.from({length: 750}, (_, i) =>
      shelf(200 + i, (i % 30) * 40 - 600, 9 + Math.floor(i / 30) * 24, 0, 20))),
  ];
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

async function saveOptions(document, saveAs) {
  const name = await nedPromptName('Име на документа', saveAs ? '' : document.id ? document.name : '');
  if (!name) return null;
  if (!saveAs) return {name};
  const selected = await dialog('Папка за новия запис', (panel, done) => {
    const row = documentElement('div', 'nedConfirmActions');
    for (const folder of folders) row.append(button(folderLabel(folder), () => done(folder.id)));
    row.append(button('Отказ', () => done(null)));
    panel.append(row);
  });
  if (!selected) return null;
  return {name, folderId: selected, type: selected === folders[0].id ? 'project' : 'model'};
}

function documentElement(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

export function mountRealEditor(editor) {
  const fixtures = fixtureDocuments();
  const connection = {};
  const store = createFixtureWorkspaceStore(localStorage, fixtures, connection);
  const drafts = createWorkspaceDraftAdapter(localStorage);
  const status = documentElement('p', 'nedWorkspaceStatus');
  status.id = 'integration-status';
  status.setAttribute('role', 'status');
  const controls = documentElement('nav', 'toolIcons');
  controls.setAttribute('aria-label', 'Интеграция NED-IQ');
  const retry = button('Провери журнала', () => bridge.initialize());
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Тестов профил');
  select.add(new Option('Алфа', 'alpha'));
  select.add(new Option('Бета', 'beta'));
  select.onchange = () => bridge.initialize(fixtureScope(select.value));
  const library = button('Обща библиотека', () => openLibrary());
  decorateAction(library, 'open', 'Обща библиотека');
  controls.append(library, select, retry);
  document.querySelector('main').before(controls, status);
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
    select.disabled = state.busy;
    library.disabled = !state.canAct || !!visualError;
    if (state.busy || state.gate !== 'ready' || !workspace || capturing) return;
    const signature = sceneSignature(state);
    if (signature !== installed) {
      applying = true;
      try {
        editor.apply(toEditorSnapshot(workspace.document));
        displayed = editor.capture();
        installed = signature;
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

  const bridge = createWorkspaceBridge({
    createController: options => createWorkspaceController({...options, drafts,
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
      const options = await saveOptions(document, false);
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
    const chosen = await dialog('Обща библиотека', (panel, done) => {
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'Папка');
      for (const folder of folders) select.add(new Option(folderLabel(folder), folder.id));
      const listing = documentElement('div', 'libraryDialogItems');
      const refresh = () => listing.replaceChildren(...store.list(scope).filter(item => item.folderId === select.value)
        .map(item => button((item.type === 'project' ? 'Отвори проект · ' : 'Добави модел · ') + item.name, () => done(item))));
      select.onchange = refresh;
      refresh();
      panel.append(select, listing, button('Отказ', () => done(null)));
    });
    if (chosen) await run(chosen.type === 'project' ? 'openProject' : 'insertModel', chosen.id);
  }

  async function save(saveAs) {
    if (!await flush()) return;
    const current = bridge.state.workspace.document;
    const options = saveAs || !current.id ? await saveOptions(current, saveAs) : {};
    if (options) await run(saveAs ? 'saveAsDocument' : 'saveDocument', options);
  }

  const file = {
    new: () => run('newDocument', {materials: fixtures[0].materials, settings: fixtures[0].settings}),
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
      void handler();
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
    void command();
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
  void bridge.initialize(fixtureScope('alpha'));
  return {bridge, store, connection, flush};
}
