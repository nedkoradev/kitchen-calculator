import {createWorkspaceBridge} from '../../workspace-ui/bridge.mjs';
import {createWorkspaceController} from '../../workspace-context/editor-controller.mjs';
import {prepareNewDocument} from '../../workspace-context/context.mjs';
import {createWorkspaceDraftAdapter} from '../../workspace-persistence/drafts.mjs';
import {installDialogs} from '../../ui-messages.mjs';
import {createDataTable} from '../../ui-components.mjs';

const byId = id => document.getElementById(id);
const draftStorage = createWorkspaceDraftAdapter(localStorage);
const fixtureCatalog = {pdcMaterials: [{name: 'Дъб', textureUrl: 'oak.png'}],
  backMaterials: [], worktops: [], edgeMaterials: [{name: 'Кант дъб'}]};
const panel = i => ({part: {key: 'panel-' + i, x: (i % 50) * 40 - 1000, y: 20,
  z: Math.floor(i / 50) * 40, w: 20, h: 40, d: 20, assembly: 'outer', assemblyStack: [null, 'inner']},
  finish: {material: 0, edges: [0, null, null, 0], grainAxis: 'y'}});
const fixtureProject = {...prepareNewDocument({name: 'Кухня с 750 детайла', materials: fixtureCatalog}),
  id: 'fixture-project', revision: 4, parts: Array.from({length: 750}, (_, i) => panel(i)),
  groups: {outer: 'Корпус', inner: 'Вложена група'}};
const fixtureModel = {...fixtureProject, id: 'fixture-model', type: 'model', folderId: null, room: null,
  parts: [{...panel(0), part: {...panel(0).part, x: 1200}}]};

function fixturePersistence() {
  const journalKey = owner => 'demo-journal:' + owner;
  return {
    async pending({scope}) {
      if (sessionStorage.getItem('offline:' + scope.ownerUid)) throw new Error('Журналът е недостъпен');
      const saved = localStorage.getItem(journalKey(scope.ownerUid));
      return saved ? {operationId: JSON.parse(saved).operationId} : null;
    },
    async reconcile({scope}) {
      const document = JSON.parse(localStorage.getItem(journalKey(scope.ownerUid))).document;
      return {status: 'committed', id: document.id, revision: document.revision};
    },
    async acknowledge({scope}) { localStorage.removeItem(journalKey(scope.ownerUid)); },
    async readProject() { return fixtureProject; },
    async readModel() { return fixtureModel; },
    async write(request) {
      localStorage.setItem(journalKey(request.scope.ownerUid), JSON.stringify(request));
      if (sessionStorage.getItem('drop-confirmation')) {
        sessionStorage.removeItem('drop-confirmation');
        throw Object.assign(new Error('Изгубено потвърждение'), {code: 'unknown-outcome'});
      }
      return {id: request.document.id, revision: request.document.revision};
    },
  };
}

installDialogs();
function choice(dialog, trigger) {
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => {
    if (!trigger?.disabled) trigger?.focus();
    resolve(dialog.returnValue);
  }, {once: true}));
}

async function pickName(trigger) {
  const dialog = byId('name-dialog');
  dialog.querySelector('input').value = '';
  return await choice(dialog, trigger) === 'save' ? dialog.querySelector('input').value : null;
}

let lastDocument;
let trigger;
const bridge = createWorkspaceBridge({
  createController: options => createWorkspaceController({...options, persistence: fixturePersistence(), drafts: draftStorage}),
  async confirmDiscard({document}) {
    const action = await choice(byId('dirty-dialog'), trigger);
    if (action !== 'save' || document.id) return {action};
    const name = await pickName(trigger);
    return name ? {action, options: {name}} : {action: 'cancel'};
  },
  render({gate, busy, canAct, action, confirmation, continuingSave, error, workspace}) {
    const statuses = {'checking-journal': 'Проверка на журнала', reconciling: 'Сверяване',
      'journal-blocked': 'Записът е блокиран до проверка на журнала'};
    const progress = confirmation ? 'Незаписани промени' : continuingSave ? 'Записване' :
      action === 'openProject' || action === 'insertModel' ? 'Зареждане' : action?.startsWith('save') ? 'Записване' : '';
    byId('status').textContent = statuses[gate] || progress || [
      workspace?.dirty ? 'Незаписани промени' : 'Готово',
      workspace?.draftStatus === 'restored' ? 'Възстановена чернова' : '',
      workspace?.reconciledDocument ? 'Сверен запис' : '',
      ['read-error', 'write-error'].includes(workspace?.draftStatus) ? 'Черновата е недостъпна' : '',
    ].filter(Boolean).join(' · ');
    byId('error').textContent = error?.message ?? '';
    byId('retry').disabled = busy;
    byId('profile').disabled = busy;
    for (const button of document.querySelectorAll('[data-command], [data-edit], #library, #pick')) {
      button.disabled = !canAct || (button.dataset.command === 'undo' && !workspace?.canUndo) ||
        (button.dataset.command === 'redo' && !workspace?.canRedo);
    }
    const scene = workspace?.document;
    const serialized = JSON.stringify(scene);
    if (!scene || serialized === lastDocument) return;
    lastDocument = serialized;
    byId('heading').textContent = scene.name;
    byId('summary').textContent = scene.parts.length + ' детайла · ' + Object.keys(scene.groups).length + ' групи';
    byId('room').elements.width.value = scene.room?.w ?? '';
    byId('parts').replaceChildren(createDataTable(['Детайл', 'Размери (mm)', 'Група', 'Материал'],
      scene.parts.map(({part, finish}) => [part.key, [part.w, part.h, part.d].join(' × '),
        scene.groups[part.assembly] ?? '', scene.materials.pdcMaterials[finish?.material]?.name ?? ''])));
  },
});

const selectProfile = () => {
  const ownerUid = byId('profile').value;
  return bridge.initialize({ownerUid, actorUid: ownerUid});
};
byId('profile').onchange = selectProfile;
byId('retry').onclick = () => bridge.initialize();
for (const button of document.querySelectorAll('[data-command]')) {
  button.onclick = async () => {
    trigger = button;
    const command = button.dataset.command;
    const needsName = command === 'saveAsDocument' || (command === 'saveDocument' && !bridge.state.workspace.document.id);
    const name = needsName ? await pickName(button) : undefined;
    if (needsName && !name) return;
    await bridge.execute(command, needsName ? {name} : undefined);
    if (!button.disabled) button.focus();
  };
}
byId('room').onsubmit = event => {
  event.preventDefault();
  const room = bridge.state.workspace.document.room;
  return bridge.execute('editScene', {room: {...room, w: byId('room').elements.width.valueAsNumber}});
};
byId('library').onclick = () => {
  const dialog = byId('library-dialog');
  dialog.showModal();
  dialog.addEventListener('close', () => byId('library').focus(), {once: true});
};
byId('folders').onchange = () => {
  byId('pick').textContent = byId('folders').value === 'projects' ? 'Отвори проект' : 'Добави модел';
};
byId('pick').onclick = async () => {
  byId('library-dialog').close();
  trigger = byId('library');
  const projects = byId('folders').value === 'projects';
  await bridge.execute(projects ? 'openProject' : 'insertModel', projects ? 'fixture-project' : 'fixture-model');
  if (!trigger.disabled) trigger.focus();
};

await selectProfile();
