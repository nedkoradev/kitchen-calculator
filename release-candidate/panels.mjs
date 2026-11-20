import {decorateAction} from '../icons.mjs';
import {nedConfirmAction} from '../ui-messages.mjs';

const byId = id => document.getElementById(id);
const element = (tag, className) => Object.assign(document.createElement(tag), {className});
const edges = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const margin = 6;

function viewport() {
  const view = window.visualViewport;
  return {left: (view?.offsetLeft ?? 0) + margin, top: (view?.offsetTop ?? 0) + margin,
    width: Math.max(1, (view?.width ?? window.innerWidth) - 2 * margin),
    height: Math.max(1, (view?.height ?? window.innerHeight) - 2 * margin)};
}

function limit(rect, area) {
  const width = Math.min(area.width, Math.max(300, rect.width));
  const height = Math.min(area.height, Math.max(240, rect.height));
  return {width, height,
    left: Math.max(area.left, Math.min(rect.left, area.left + area.width - width)),
    top: Math.max(area.top, Math.min(rect.top, area.top + area.height - height))};
}

function action(label, icon, click) {
  const button = Object.assign(document.createElement('button'), {type: 'button', onclick: click});
  if (icon) decorateAction(button, icon, label, {iconOnly: true});
  else button.textContent = label;
  return button;
}

function fitWindow(dialog, title) {
  const head = dialog.querySelector(':scope > .dialogHead') ?? element('div', 'dialogHead');
  if (!head.parentNode) {
    const heading = document.createElement('strong');
    heading.textContent = title;
    head.append(heading);
    dialog.prepend(head);
  }
  if (!dialog.getAttribute('aria-labelledby')) dialog.setAttribute('aria-label', title);
  const content = element('div', 'pilotWindowBody');
  content.append(...Array.from(dialog.children).filter(node => node !== head));
  dialog.append(content);
  dialog.classList.add('pilotWindow');
  const controls = element('div', 'pilotWindowControls');
  // Keep the existing shared dialog close action and drag handle.
  let close = head.querySelector('button');
  if (!close) {
    close = action('Затваряне на прозореца', 'close', () => dialog.requestClose());
    head.append(close);
  }
  const maximize = action('Разгъни прозореца', 'room', toggle);
  controls.append(maximize);
  close.after(controls);
  let saved;
  let expanded = false;
  let restoreFocus;

  function compact() { return viewport().width < 620; }
  function apply(rect) {
    dialog.style.removeProperty('--dialog-x');
    dialog.style.removeProperty('--dialog-y');
    for (const [key, value] of Object.entries(rect)) dialog.style.setProperty('--pilot-' + key, value + 'px');
  }
  function layout() {
    const area = viewport();
    const width = Math.round(area.width * 0.8);
    const height = Math.round(area.height * 0.8);
    apply(compact() || expanded ? area : limit(saved ?? {
      width, height, left: area.left + (area.width - width) / 2, top: area.top + (area.height - height) / 2,
    }, area));
    dialog.dataset.full = String(compact() || expanded);
    maximize.hidden = compact();
    decorateAction(maximize, 'room', expanded ? 'Възстанови прозореца' : 'Разгъни прозореца', {iconOnly: true});
    maximize.setAttribute('aria-pressed', String(expanded));
  }
  function remember() {
    if (dialog.open && !compact() && !expanded) saved = dialog.getBoundingClientRect().toJSON();
  }
  function toggle() {
    remember();
    expanded = !expanded;
    layout();
  }
  const keyboard = action('Премести или преоразмери прозореца', 'group', () => keyboard.focus());
  keyboard.className = 'pilotKeyboardMove';
  keyboard.title = 'Стрелки: преместване. Shift + стрелки: размер.';
  keyboard.setAttribute('aria-description', keyboard.title);
  controls.prepend(keyboard);
  keyboard.addEventListener('keydown', event => {
    const delta = {ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24]}[event.key];
    if (!delta || compact() || expanded) return;
    event.preventDefault();
    const rect = dialog.getBoundingClientRect().toJSON();
    const [x, y] = delta;
    if (event.shiftKey) { rect.width += x; rect.height += y; }
    else { rect.left += x; rect.top += y; }
    saved = limit(rect, viewport());
    apply(saved);
  });
  head.addEventListener('pointerdown', event => {
    if ((compact() || expanded) && !event.target.closest('button')) event.stopImmediatePropagation();
  }, true);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) head.addEventListener(event, remember);
  for (const direction of edges) {
    const handle = element('span', 'pilotResize');
    handle.dataset.edge = direction;
    handle.setAttribute('aria-hidden', 'true');
    let start;
    handle.onpointerdown = event => {
      if (!event.isPrimary || event.button !== 0 || compact() || expanded) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      start = {x: event.clientX, y: event.clientY, rect: dialog.getBoundingClientRect().toJSON()};
    };
    handle.onpointermove = event => {
      if (!start || !handle.hasPointerCapture(event.pointerId)) return;
      const area = viewport();
      const {left, top, width, height, right, bottom} = start.rect;
      const x = event.clientX - start.x, y = event.clientY - start.y;
      const nextLeft = direction.includes('w') ? Math.max(area.left, Math.min(right - 300, left + x)) : left;
      const nextTop = direction.includes('n') ? Math.max(area.top, Math.min(bottom - 240, top + y)) : top;
      saved = limit({left: nextLeft, top: nextTop,
        width: direction.includes('w') ? right - nextLeft : direction.includes('e') ? Math.min(width + x, area.left + area.width - left) : width,
        height: direction.includes('n') ? bottom - nextTop : direction.includes('s') ? Math.min(height + y, area.top + area.height - top) : height,
      }, area);
      apply(saved);
    };
    handle.onlostpointercapture = () => { start = undefined; };
    dialog.append(handle);
  }
  const resize = () => { if (dialog.open) layout(); };
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  dialog.addEventListener('beforetoggle', event => {
    if (event.newState !== 'open') return;
    restoreFocus = document.activeElement;
    layout();
  });
  dialog.addEventListener('close', () => {
    if (!dialog.open && restoreFocus?.isConnected) {
      restoreFocus.focus();
    }
  });
  if (!dialog.isConnected) document.body.append(dialog);
  return {dialog, content, show() {
    if (dialog.open) return;
    dialog.showModal();
    const focus = content.querySelector('button:not([disabled]), select, input') ?? close;
    focus.focus();
  }};
}

function protectMaterialEditors(onApply) {
  const formState = form => Array.from(form.querySelectorAll('input,select,textarea'),
    input => [input.type === 'file' ? input.files.length : input.value, input.checked]);
  const observed = new WeakSet();
  new MutationObserver(records => {
    for (const {target} of records) {
      if (!target.open || observed.has(target) || !target.matches('dialog.materialEditDialog')) continue;
      if (!target.querySelector('.materialAppearance,.extraServiceRows')) continue;
      const form = target.querySelector('form');
      if (!form) continue;
      observed.add(target);
      const initial = JSON.stringify(formState(form));
      let confirming = false;
      target.addEventListener('cancel', async event => {
        if (JSON.stringify(formState(form)) === initial) return;
        event.preventDefault();
        if (confirming) return;
        confirming = true;
        try {
          if (await nedConfirmAction('Има незаписани промени. Да ги отхвърля ли?')) target.close();
        } finally { confirming = false; }
      });
      form.addEventListener('submit', () => queueMicrotask(() => { if (!target.open) onApply(); }));
    }
  }).observe(document.body, {subtree: true, attributes: true, attributeFilter: ['open']});
}

export function installPilotPanels({renderMaterials, renderReport, logout, fallback, onMaterialApply, canEdit}) {
  const create = (id, title, existing = byId(id)) => {
    const dialog = existing ?? document.createElement('dialog');
    dialog.id = id;
    return fitWindow(dialog, title);
  };
  const materials = create('pilotMaterials', 'Материали');
  const reports = create('pilotReports', 'Справки');
  const library = create('pilotLibrary', 'Обща библиотека');
  const settings = create('settingsDialog', 'Настройки');
  const space = create('nedSpaceDialog', 'Информация за хранилището');
  const photos = create('nedPhotosDialog', 'Снимки за фладер');
  create('helpDialog', 'Помощ');
  create('uiCatalogDialog', 'UI каталог');
  const extra = byId('projectExtraPane');
  materials.content.append(extra);
  const results = byId('projectResults');
  // Reuse the report tables without switching the editor out of its 3D tab.
  reports.content.append(results);
  const summaries = ['projectSummary', 'projectCutPane', 'projectCostPane'];
  function showReport(kind, scope) {
    if (!canEdit()) return;
    renderReport(scope);
    if (results.parentElement !== reports.content) reports.content.append(results);
    results.hidden = false;
    for (const id of summaries) byId(id).hidden = id !== 'projectSummary' && id !== (kind === 'costs' ? 'projectCostPane' : 'projectCutPane');
    for (const [type, button] of reportButtons) button.setAttribute('aria-pressed', String(type === kind));
    reports.show();
  }
  const reportChoices = element('div', 'materialActions');
  const reportButtons = [
    ['cut', action('Разкрой', null, () => showReport('cut'))],
    ['costs', action('Себестойност', null, () => showReport('costs'))],
  ];
  reportChoices.append(...reportButtons.map(([, button]) => button));
  reports.content.prepend(reportChoices);
  function showMaterials() {
    if (!canEdit()) return;
    if (extra.parentElement !== materials.content) materials.content.append(extra);
    renderMaterials();
    extra.hidden = false;
    materials.show();
  }
  const sections = settings.content.querySelector('.settingsSections');
  const addSection = (title, control) => {
    const section = document.createElement('section');
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading, control);
    sections.append(section);
  };
  addSection('Акаунт', logout);
  if (fallback) addSection('За приложението', fallback);
  const diagnostics = element('div', 'pilotDiagnostics');
  addSection('Диагностика', diagnostics);

  const projectsMenuItem = byId('libraryMenu')?.querySelector('[role="menuitem"]');
  if (projectsMenuItem) projectsMenuItem.onclick = () => byId('navLibrary').click();
  byId('commandLogout')?.remove();
  byId('sharingOpen')?.remove();
  const commands = new Map([
    ['navMaterials', showMaterials], ['navCut', () => showReport('cut')], ['navCosts', () => showReport('costs')],
    ['tabProjectCut', () => showReport('cut')], ['tabProjectCosts', () => showReport('costs')],
    ['nedSpaceOpen', space.show], ['nedPhotosOpen', photos.show],
    ['foldersOpen', () => byId('navLibrary').click()],
  ]);
  window.addEventListener('click', event => {
    const trigger = event.target.closest?.('button');
    const command = commands.get(trigger?.id);
    if (command && document.body.dataset.stageAuth === 'active') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const menu = trigger.closest('.shellMenu[open]');
      if (menu) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
      command();
    }
  }, true);
  window.addEventListener('ned-report-request', event => {
    if (document.body.dataset.stageAuth !== 'active') return;
    event.stopImmediatePropagation();
    showReport(event.detail?.kind, event.detail?.scope);
  }, true);
  protectMaterialEditors(onMaterialApply);
  let finishLibrary;
  library.dialog.addEventListener('close', () => { if (!library.dialog.open) finishLibrary?.(null); });
  return {diagnostics, library(build) {
    if (library.dialog.open) return Promise.resolve(null);
    return new Promise(resolve => {
      finishLibrary = result => {
        finishLibrary = undefined;
        library.dialog.close();
        resolve(result);
      };
      library.content.replaceChildren();
      build(library.content, finishLibrary);
      library.show();
    });
  }};
}
