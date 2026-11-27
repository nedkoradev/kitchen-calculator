import {t} from './i18n.mjs';
import {cutLayout} from '../grain.mjs';
import {partLabelIndex} from '../part-labels.mjs';
import {reportInputs} from '../report-context.mjs';
import {placeStack, planTransportLoads, stackHeight, startStack, transferPanel, transportWeight} from './transport-layout.mjs';
import {createTransportView} from './transport-view.mjs';

const node = (tag, text) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  return element;
};

function button(text, click) {
  const control = node('button', text);
  control.type = 'button';
  control.onclick = click;
  return control;
}

function field(form, text, input) {
  const label = node('label', text);
  label.append(input);
  form.append(label);
  return input;
}

function number(form, label, value) {
  const input = node('input');
  Object.assign(input, {type: 'number', min: '1', max: '100000', step: '1', required: true, value});
  return field(form, label, input);
}

function toggle(form, label, checked = false) {
  const input = node('input');
  Object.assign(input, {type: 'checkbox', checked});
  return field(form, label, input);
}

const normalize = value => String(value ?? '').normalize('NFKC').trim().toLowerCase();

function panelsFor(context, include, liveCatalog) {
  const {customParts, allParts, finishes, selectedBoard, labels} = reportInputs(context);
  const ids = partLabelIndex(allParts);
  return customParts.filter(part => include(part, finishes[part.key])).map(part => {
    const finish = finishes[part.key];
    const material = selectedBoard(finish);
    const {A: w, B: d, thickness} = cutLayout(part, finish, material);
    const key = {back: 'backMaterials', worktop: 'worktops'}[finish.materialType] ?? 'pdcMaterials';
    const matches = (liveCatalog?.[key] ?? []).filter(candidate => material &&
      (material.id ? candidate.id === material.id : normalize(material.name) && normalize(candidate.name) === normalize(material.name)));
    const weight = matches.length === 1 ? matches[0].weightKgM2 : !liveCatalog ? material?.weightKgM2 : null;
    return {id: part.key, group: part.assembly ?? part.key, label: ids.get(part.key) ?? labels[part.key],
      w, d, thickness, color: /^#[\da-f]{6}$/i.test(material?.color) ? material.color : '#c4aa86',
      kg: Number.isFinite(weight) && weight > 0 ? w * d / 1e6 * weight : null};
  });
}

function weightLabel(parts) {
  const {kg, known} = transportWeight(parts);
  return known ? '~' + new Intl.NumberFormat(document.documentElement.lang === 'en' ? 'en-GB' : 'bg-BG', {maximumFractionDigits: 2}).format(kg) +
    t(' кг') + (known < parts.length ? t(' за ') + known + t(' от ') + parts.length + t(' детайла') : '') :
    parts.length ? t('липсват данни') : t('0 кг');
}

export function createTransportReport(includeInCut, loadCatalog) {
  const root = node('section');
  root.className = 'transportReport';
  root.hidden = true;
  const visual = node('section');
  const toolbar = node('div');
  toolbar.className = 'pilotLibraryFolderBar';
  const host = node('div');
  host.className = 'transportCanvas';
  visual.append(toolbar, host);
  const aside = node('section');
  aside.className = 'transportSidebar';
  const form = node('form');
  form.className = 'transportParameters';
  form.append(node('h3', t('Параметри')));
  const width = number(form, t('Ширина на товарната площ (мм)'), '1200');
  const depth = number(form, t('Дължина на товарната площ (мм)'), '800');
  const defaultHeight = '800';
  const height = number(form, t('Максимална височина (мм)'), defaultHeight);
  const rotate = toggle(form, t('Разреши завъртане на 90°'), true);
  const byGroup = toggle(form, t('Подреждай по шкаф'));
  const arrange = node('button', t('Подреди автоматично'));
  arrange.className = 'nedPrimaryButton';
  form.append(arrange);
  const status = node('p');
  status.setAttribute('role', 'status');
  const totals = node('p');
  const weight = node('section');
  weight.className = 'transportLoadWeight';
  const loadWeight = node('strong');
  const projectWeight = node('p');
  weight.append(node('h3', t('Тегло на текущия товар')), loadWeight, projectWeight);
  const loadPicker = node('select');
  loadPicker.setAttribute('aria-label', t('Товар'));
  const loadField = node('label', t('Товар'));
  loadField.className = 'transportLoadPicker';
  loadField.append(loadPicker);
  toolbar.before(loadField);
  const stacksPane = node('section');
  const remainingPane = node('section');
  aside.append(weight, form, status, totals, stacksPane, remainingPane);
  root.append(visual, aside);

  let view, plan, layout, area, selected, drag, source, contextKey, request = 0;
  const emptyLoad = {stacks: []};
  loadPicker.onchange = () => {
    layout = plan.loads[Number(loadPicker.value)];
    selected = layout.stacks[0];
    options.partId = null;
    status.textContent = '';
    render(true);
    loadPicker.focus();
  };
  const options = {labels: false, dimensions: false};
  for (const [label, mode] of [['3D', '3d'], [t('Отгоре'), 'top'], [t('Отстрани'), 'side']]) {
    toolbar.append(button(label, () => view?.aim(mode)));
  }
  for (const [label, key] of [[t('Етикети'), 'labels'], [t('Размери'), 'dimensions'], [t('Покажи слоевете'), 'layers']]) {
    const control = button(label, () => {
      options[key] = !options[key];
      control.setAttribute('aria-pressed', String(options[key]));
      view?.update(layout, area, selected, options);
    });
    control.setAttribute('aria-pressed', 'false');
    toolbar.append(control);
  }
  visual.append(node('p', t('Плъзнете ред от списъка върху купчина или свободно място. За цяла купчина задръжте Shift.')));

  function moveStack(stack, x, z) {
    if (!placeStack(layout.stacks, stack, x, z, area)) {
      status.textContent = t('Купчината трябва да остане в товарната площ и да не застъпва друга купчина.');
      return;
    }
    Object.assign(stack, {x, z});
    status.textContent = '';
    render();
  }

  function transfer(item, target, slot) {
    if (!item || !target) return;
    const {stack, index, part} = item;
    if (!transferPanel(layout.stacks, stack, index, target, slot, part, area)) {
      status.textContent = t('Плоскостта не се побира или няма цяла опора на това място.');
      return;
    }
    if (!stack) plan.remaining = plan.remaining.filter(row => row !== part);
    selected = target;
    status.textContent = '';
    render();
  }

  function makeDraggable(row, item) {
    row.draggable = true;
    row.ondragstart = event => {
      drag = item;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.part.label);
    };
    row.ondragend = () => { drag = null; };
  }

  function render(resetCamera = false) {
    stacksPane.replaceChildren(node('h3', t('Купчини')));
    const placed = layout.stacks.flatMap(stack => stack.layers);
    const placedCount = plan.loads.reduce((sum, load) =>
      sum + load.stacks.reduce((count, stack) => count + stack.layers.length, 0), 0);
    loadField.hidden = plan.loads.length === 0;
    loadPicker.replaceChildren(...plan.loads.map((load, index) =>
      new Option(t('Товар ') + (index + 1) + t(' от ') + plan.loads.length, index)));
    if (layout !== emptyLoad) loadPicker.value = String(plan.loads.indexOf(layout));
    totals.textContent = t('Общо за разкрой: ') + source.length + t(' · Подредени: ') + placedCount +
      t(' · Остават: ') + plan.remaining.length + t(' · В този товар: ') + placed.length;
    loadWeight.textContent = weightLabel(placed);
    projectWeight.textContent = t('Общо за детайлите: ') + weightLabel(source);
    const picker = node('select');
    picker.setAttribute('aria-label', t('Избери купчина'));
    picker.add(new Option(t('Избери купчина'), ''));
    for (const [index, stack] of layout.stacks.entries()) {
      picker.add(new Option(t('Купчина ') + (index + 1) + ' · ' + weightLabel(stack.layers), index));
    }
    picker.value = selected ? String(layout.stacks.indexOf(selected)) : '';
    picker.onchange = () => {
      selected = picker.value === '' ? null : layout.stacks[Number(picker.value)];
      options.partId = null;
      render();
      stacksPane.querySelector('select')?.focus();
    };
    stacksPane.append(picker);
    if (selected) {
      stacksPane.append(node('p', [selected.w, selected.d, stackHeight(selected)].join(' × ') + t(' мм · ') +
        weightLabel(selected.layers)), node('p', t('Слоеве отдолу нагоре')));
      const layers = node('ol');
      const stack = selected;
      for (const [index, part] of stack.layers.entries()) {
        const item = {stack, index, part};
        const row = node('li');
        const identify = button(part.label + ' · ' + part.w + ' × ' + part.d + ' × ' + part.thickness + t(' мм'), () => {
          options.partId = part.id;
          render();
          stacksPane.querySelector('[aria-pressed="true"]')?.focus();
        });
        identify.setAttribute('aria-pressed', String(options.partId === part.id));
        row.append(identify);
        makeDraggable(row, item);
        row.ondragover = event => { if (drag) event.preventDefault(); };
        row.ondrop = event => { event.preventDefault(); transfer(drag, stack, index); };
        const up = button(t('Нагоре'), () => transfer(item, stack, index + 2));
        const down = button(t('Надолу'), () => transfer(item, stack, index - 1));
        up.disabled = stack.positioned || index === stack.layers.length - 1;
        down.disabled = stack.positioned || index === 0;
        row.append(up, down);
        layers.append(row);
      }
      stacksPane.append(layers);
    }
    remainingPane.replaceChildren(node('h3', t('Оставащи детайли (') + plan.remaining.length + ')'));
    const remaining = node('ul');
    for (const part of plan.remaining) {
      const row = node('li', part.label + ' · ' + part.w + ' × ' + part.d + t(' мм · ') + t(part.reason));
      const item = {stack: null, index: -1, part};
      makeDraggable(row, item);
      const move = button(t('Добави към купчината'), () => transfer(item, selected, selected.layers.length));
      move.disabled = !selected;
      row.append(move);
      remaining.append(row);
    }
    remainingPane.append(remaining);
    view?.update(layout, area, selected, options, resetCamera);
  }

  function recalculate() {
    area = {w: width.valueAsNumber, d: depth.valueAsNumber,
      height: height.valueAsNumber, rotate: rotate.checked, byGroup: byGroup.checked};
    plan = planTransportLoads(source, area);
    layout = plan.loads[0] ?? emptyLoad;
    selected = layout.stacks[0];
    options.partId = null;
    status.textContent = '';
    render(true);
  }

  form.onsubmit = event => {
    event.preventDefault();
    if (form.reportValidity()) recalculate();
  };

  return {root, show(context) {
    root.hidden = false;
    if (!view) {
      try {
        view = createTransportView(host, stack => { selected = stack; options.partId = null; render(); }, moveStack,
          (stack, point) => {
            if (!drag) return;
            if (stack) {
              transfer(drag, stack, stack.layers.length);
              return;
            }
            const {stack: from, index, part} = drag;
            const created = startStack(layout.stacks, from, index, part,
              Math.round(point.x), Math.round(point.z), area);
            if (!created) {
              status.textContent = t('Няма свободно място за нова купчина на тази позиция.');
              return;
            }
            if (!from) plan.remaining = plan.remaining.filter(row => row !== part);
            selected = created;
            options.partId = part.id;
            status.textContent = '';
            render();
          });
      } catch {
        host.textContent = t('3D изгледът изисква WebGL.');
      }
    }
    const key = JSON.stringify([context.documentId, context.revision, context.scope]);
    if (contextKey !== key) {
      contextKey = key;
      source = panelsFor(context, includeInCut);
      if (!form.checkValidity()) {
        width.value = '1200';
        depth.value = '800';
        height.value = defaultHeight;
      }
      recalculate();
    } else render(true);
    const ticket = ++request;
    void loadCatalog?.(context.snapshot.materials.activeBase).then(catalog => {
      if (!catalog || ticket !== request) return;
      const updated = panelsFor(context, includeInCut, catalog);
      const weights = new Map(updated.map(part => [part.id, part.kg]));
      source = updated;
      for (const part of [...plan.remaining, ...plan.loads.flatMap(load => load.stacks.flatMap(stack => stack.layers))]) {
        part.kg = weights.get(part.id) ?? null;
      }
      render();
    }).catch(() => {});
  }, hide() {
    request++;
    root.hidden = true;
    view?.dispose();
    view = null;
  }};
}
