import {decorateAction} from '../icons.mjs';
import {PROJECTS_FOLDER} from '../document-format/model.mjs';

const OTHER = '__other__'; // UI-only: never persisted as a folder ID.
const folderName = folder => folder.name === 'Импорт от v2.95' ? 'За подреждане' : folder.name;
const node = (tag, className = '', text) => {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
};
function action(label, callback, icon) {
  const result = node('button', '', label);
  result.type = 'button';
  result.onclick = callback;
  if (icon) decorateAction(result, icon, label);
  return result;
}

/**
 * v3-only explorer view. The list endpoint exposes metadata, not thumbnail
 * images: use the existing cabinet/room pictograms, never fabricated previews.
 * The caller owns all mutations, authorization, insertion and cloud refresh.
 */
export function renderPilotLibrary(panel, {folders, documents, selectedFolderId = null,
  notice, canChangeFolder = false, canChangeModel = false, onChoose}) {
  const folderById = new Map(folders.map(folder => [folder.id, folder]));
  const unassigned = documents.some(item => item.type === 'model' && item.folderId === null);
  let selected = selectedFolderId === '' && unassigned ? OTHER :
    folderById.has(selectedFolderId) ? selectedFolderId : PROJECTS_FOLDER.id;
  let context = null;
  let contextTrigger = null;

  if (notice) {
    const alert = node('p', 'pilotLibraryNotice', notice);
    alert.setAttribute('role', 'alert');
    panel.append(alert);
  }
  const foldersBar = node('nav', 'pilotLibraryFolderBar');
  foldersBar.setAttribute('aria-label', 'Папки на библиотеката');
  const pathBar = node('div', 'pilotLibraryPath');
  const subfolders = node('div', 'pilotLibrarySubfolders');
  subfolders.setAttribute('role', 'group');
  subfolders.setAttribute('aria-label', 'Подпапки');
  const grid = node('div', 'pilotLibraryTiles');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', 'Модели и проекти в папката');
  const manage = node('div', 'pilotLibraryManage');
  manage.setAttribute('role', 'group');
  manage.setAttribute('aria-label', 'Управление на папки');
  panel.append(foldersBar, pathBar, subfolders, grid, manage);

  function closeContext() {
    context?.remove();
    context = null;
    contextTrigger = null;
  }
  function switchFolder(id) {
    closeContext();
    selected = id;
    render();
  }
  function rootOf(id) {
    let folder = folderById.get(id);
    const visited = new Set();
    while (folder?.parentId && folderById.has(folder.parentId) && !visited.has(folder.id)) {
      visited.add(folder.id);
      folder = folderById.get(folder.parentId);
    }
    return folder?.id ?? id;
  }
  function folderButton(folder, className, active) {
    const control = action(folderName(folder), () => switchFolder(folder.id), 'open');
    control.className += ' ' + className;
    control.dataset.folderId = folder.id;
    control.setAttribute('aria-pressed', String(active));
    return control;
  }

  function showContext(item, trigger, event) {
    closeContext();
    if (!canChangeModel) return;
    const menu = node('div', 'pilotLibraryContext');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Действия за ' + item.name);
    const canMoveToAnotherFolder = folders.some(folder =>
      folder.id !== PROJECTS_FOLDER.id && folder.id !== item.folderId);
    for (const [label, key] of [['Преименувай', 'rename'], ['Премести в папка', 'move'],
      ['Копирай в папка', 'copy'], ['Изтрий', 'delete']]) {
      const control = action(label, () => onChoose({
        documentChange: {item, action: key}, folderId: selected === OTHER ? '' : selected,
      }));
      control.setAttribute('role', 'menuitem');
      control.disabled = key === 'move' && (item.type === 'project' || !canMoveToAnotherFolder) ||
        key === 'copy' && item.type === 'model' && !canMoveToAnotherFolder;
      if (key === 'move' && item.type === 'project')
        control.title = 'Проектите остават в системната папка „Проекти“.';
      menu.append(control);
    }
    panel.append(menu);
    context = menu;
    contextTrigger = trigger;
    const rect = trigger.getBoundingClientRect();
    const left = event?.clientX ?? rect.right - 4;
    const top = event?.clientY ?? rect.bottom;
    menu.style.left = Math.max(8, Math.min(left, window.innerWidth - 208)) + 'px';
    menu.style.top = Math.max(8, Math.min(top, window.innerHeight - 208)) + 'px';
    menu.querySelector('button:not(:disabled)')?.focus();
  }

  function itemTile(item) {
    const wrap = node('div', 'pilotLibraryTileWrap');
    const isProject = item.type === 'project';
    const label = (isProject ? 'Отвори проект · ' : 'Добави модел · ') + item.name;
    const open = action(item.name, () => onChoose({item}), isProject ? 'room' : 'cabinet');
    open.classList.add('pilotLibraryTile');
    open.setAttribute('aria-label', label);
    open.title = isProject ? 'Отвори проекта' : 'Добави модела към текущата сцена';
    const more = action('⋯', () => {
      if (context && contextTrigger === open) closeContext();
      else showContext(item, open);
    });
    more.className = 'pilotLibraryMore';
    more.setAttribute('aria-label', 'Действия за ' + item.name);
    more.title = 'Действия за модела';
    if (!canChangeModel) more.hidden = true;
    wrap.append(open, more);
    wrap.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      showContext(item, open, event);
    });
    open.addEventListener('keydown', event => {
      if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        showContext(item, open);
      }
    });
    return wrap;
  }

  function render() {
    const current = folderById.get(selected);
    const root = rootOf(selected);
    foldersBar.replaceChildren();
    for (const folder of folders.filter(item => item.parentId === null)) {
      foldersBar.append(folderButton(folder, 'pilotLibraryFolderTab', root === folder.id));
    }
    if (unassigned) {
      const other = action('Други', () => switchFolder(OTHER), 'open');
      other.className += ' pilotLibraryFolderTab';
      other.setAttribute('aria-pressed', String(selected === OTHER));
      foldersBar.append(other);
    }

    pathBar.replaceChildren();
    if (current) {
      const segments = [];
      for (let cursor = current; cursor; cursor = folderById.get(cursor.parentId)) segments.unshift(cursor);
      pathBar.append(node('strong', '', segments.map(folderName).join(' / ')));
      if (current.parentId) pathBar.append(action('← Назад', () => switchFolder(current.parentId)));
    } else pathBar.append(node('strong', '', 'Други'));

    subfolders.replaceChildren();
    const children = folders.filter(folder => folder.parentId === selected);
    for (const folder of children) subfolders.append(folderButton(folder, 'pilotLibrarySubfolder', false));
    subfolders.hidden = children.length === 0;

    grid.replaceChildren();
    const visible = documents.filter(item => item.folderId === (selected === OTHER ? null : selected));
    for (const item of visible) grid.append(itemTile(item));
    if (!visible.length) grid.append(node('p', 'pilotLibraryEmpty', children.length ?
      'Избери подпапка или добави модел тук.' : 'Няма модели в тази папка.'));

    manage.replaceChildren();
    if (canChangeFolder) {
      manage.append(action('Нова папка', () => onChoose({change: {
        action: 'create', parentId: !current || selected === PROJECTS_FOLDER.id ? null : selected,
      }, folderId: selected === OTHER ? '' : selected})));
      if (current && selected !== PROJECTS_FOLDER.id) {
        for (const [label, key] of [['Преименувай папка', 'rename'], ['Премести папка', 'move'],
          ['Изтрий празна папка', 'delete']]) {
          manage.append(action(label, () => onChoose({
            change: {action: key, id: selected}, folderId: selected,
          })));
        }
      }
    }
    manage.append(action('Затвори', () => onChoose(null)));
  }
  panel.addEventListener('pointerdown', event => {
    if (context && !context.contains(event.target) && !event.target.closest('.pilotLibraryMore')) closeContext();
  });
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !context) return;
    event.preventDefault();
    event.stopPropagation();
    const trigger = contextTrigger;
    closeContext();
    trigger?.focus();
  }, true);
  render();
}
