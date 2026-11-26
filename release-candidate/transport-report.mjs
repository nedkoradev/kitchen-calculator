import {cutLayout} from '../grain.mjs';
import {partLabelIndex} from '../part-labels.mjs';
import {reportInputs} from '../report-context.mjs';
import {placeStack, planTransport, stackHeight, transferPanel, transportWeight} from './transport-layout.mjs';
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

function number(form, label, value = '', required = true) {
  const input = node('input');
  Object.assign(input, {type: 'number', min: '1', max: '100000', step: '1', required, value});
  return field(form, label, input);
}

function toggle(form, label, checked = false) {
  const input = node('input');
  Object.assign(input, {type: 'checkbox', checked});
  return field(form, label, input);
}

function panelsFor(context, include) {
  const {customParts, allParts, finishes, selectedBoard, labels} = reportInputs(context);
  const ids = partLabelIndex(allParts);
  return customParts.filter(part => include(part, finishes[part.key])).map(part => {
    const finish = finishes[part.key];
    const material = selectedBoard(finish);
    const {A: w, B: d, thickness} = cutLayout(part, finish, material);
    const weight = material?.weightKgM2;
    const applies = !material?.weightThicknessMm || material.weightThicknessMm === thickness;
    return {id: part.key, group: part.assembly ?? part.key, label: ids.get(part.key) ?? labels[part.key],
      w, d, thickness, color: /^#[\da-f]{6}$/i.test(material?.color) ? material.color : '#c4aa86',
      kg: applies && Number.isFinite(weight) && weight > 0 ? w * d / 1e6 * weight : null};
  });
}

function weightLabel(parts) {
  const {kg, known} = transportWeight(parts);
  return known ? '~' + new Intl.NumberFormat('bg-BG', {maximumFractionDigits: 2}).format(kg) +
    ' кг' + (known < parts.length ? ' за ' + known + ' от ' + parts.length + ' детайла' : '') :
    parts.length ? 'липсват данни' : '0 кг';
}

export function createTransportReport(includeInCut) {
  const root = node('section');
  root.className = 'transportReport';
  root.hidden = true;
  const visual = node('section');
  const toolbar = node('div');
  toolbar.className = 'pilotLibraryFolderBar';
  const host = node('div');
  host.className = 'transportCanvas';
  visual.append(toolbar, host);
  const aside = node('aside');
  const form = node('form');
  form.className = 'transportParameters';
  form.append(node('h3', 'Параметри'));
  const width = number(form, 'Ширина на товарната площ (мм)', '1200');
  const depth = number(form, 'Дължина на товарната площ (мм)', '800');
  const height = number(form, 'Максимална височина (мм)', '', false);
  const rotate = toggle(form, 'Разреши завъртане на 90°', true);
  const byGroup = toggle(form, 'Подреждай по шкаф');
  const arrange = node('button', 'Подреди автоматично');
  arrange.className = 'nedPrimaryButton';
  form.append(arrange);
  const status = node('p');
  status.setAttribute('role', 'status');
  const totals = node('p');
  const stacksPane = node('section');
  const remainingPane = node('section');
  aside.append(form, status, totals, stacksPane, remainingPane);
  root.append(visual, aside);

  let view, layout, area, selected, drag, source, contextKey;
  const options = {labels: false, dimensions: false};
  for (const [label, mode] of [['3D', '3d'], ['Отгоре', 'top'], ['Отстрани', 'side']]) {
    toolbar.append(button(label, () => view?.aim(mode)));
  }
  for (const [label, key] of [['Етикети', 'labels'], ['Размери', 'dimensions']]) {
    const control = button(label, () => {
      options[key] = !options[key];
      control.setAttribute('aria-pressed', String(options[key]));
      view?.update(layout, area, selected, options);
    });
    control.setAttribute('aria-pressed', 'false');
    toolbar.append(control);
  }
  visual.append(node('p', 'Задръжте Shift и плъзнете купчина, за да я преместите.'));

  function moveStack(stack, x, z) {
    if (!placeStack(layout.stacks, stack, x, z, area)) {
      status.textContent = 'Купчината трябва да остане в товарната площ и да не застъпва друга купчина.';
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
      status.textContent = 'Плоскостта не се побира или няма цяла опора на това място.';
      return;
    }
    if (!stack) layout.remaining = layout.remaining.filter(row => row !== part);
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
    stacksPane.replaceChildren(node('h3', 'Купчини'));
    const placed = layout.stacks.flatMap(stack => stack.layers);
    totals.textContent = 'Подредени: ' + placed.length + ' от ' + source.length +
      ' · Тегло: ' + weightLabel(placed) + ' · Общо за проекта: ' + weightLabel(source);
    const picker = node('select');
    picker.setAttribute('aria-label', 'Избери купчина');
    picker.add(new Option('Избери купчина', ''));
    for (const [index, stack] of layout.stacks.entries()) {
      picker.add(new Option('Купчина ' + (index + 1) + ' · ' + weightLabel(stack.layers), index));
    }
    picker.value = selected ? String(layout.stacks.indexOf(selected)) : '';
    picker.onchange = () => { selected = picker.value === '' ? null : layout.stacks[Number(picker.value)]; render(); };
    stacksPane.append(picker);
    if (selected) {
      stacksPane.append(node('p', [selected.w, selected.d, stackHeight(selected)].join(' × ') + ' мм · ' +
        weightLabel(selected.layers)), node('p', 'Слоеве отдолу нагоре'));
      const layers = node('ol');
      const stack = selected;
      for (const [index, part] of stack.layers.entries()) {
        const item = {stack, index, part};
        const row = node('li', part.label + ' · ' + part.w + ' × ' + part.d + ' мм');
        makeDraggable(row, item);
        row.ondragover = event => { if (drag) event.preventDefault(); };
        row.ondrop = event => { event.preventDefault(); transfer(drag, stack, index); };
        const up = button('Нагоре', () => transfer(item, stack, index + 2));
        const down = button('Надолу', () => transfer(item, stack, index - 1));
        up.disabled = index === stack.layers.length - 1;
        down.disabled = index === 0;
        row.append(up, down);
        layers.append(row);
      }
      stacksPane.append(layers);
    }
    remainingPane.replaceChildren(node('h3', 'Оставащи детайли (' + layout.remaining.length + ')'));
    const remaining = node('ul');
    for (const part of layout.remaining) {
      const row = node('li', part.label + ' · ' + part.w + ' × ' + part.d + ' мм · ' + part.reason);
      const item = {stack: null, index: -1, part};
      makeDraggable(row, item);
      const move = button('Добави към купчината', () => transfer(item, selected, selected.layers.length));
      move.disabled = !selected;
      row.append(move);
      remaining.append(row);
    }
    remainingPane.append(remaining);
    view?.update(layout, area, selected, options, resetCamera);
  }

  function recalculate() {
    area = {w: width.valueAsNumber, d: depth.valueAsNumber,
      height: height.value ? height.valueAsNumber : Infinity, rotate: rotate.checked, byGroup: byGroup.checked};
    layout = planTransport(source, area);
    selected = layout.stacks[0];
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
        view = createTransportView(host, stack => { selected = stack; render(); }, moveStack,
          stack => transfer(drag, stack, stack.layers.length));
      } catch {
        host.textContent = '3D изгледът изисква WebGL.';
      }
    }
    const key = JSON.stringify([context.documentId, context.revision, context.scope]);
    if (contextKey !== key) {
      contextKey = key;
      source = panelsFor(context, includeInCut);
      if (!form.checkValidity()) {
        width.value = '1200';
        depth.value = '800';
        height.value = '';
      }
      recalculate();
    } else render(true);
  }, hide() {
    root.hidden = true;
    view?.dispose();
    view = null;
  }};
}
