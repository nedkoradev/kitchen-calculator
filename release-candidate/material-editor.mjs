import {t} from './i18n.mjs';
import {nedConfirmAction, nedConfirmDelete} from '../ui-messages.mjs';
import {validTextureUrl} from '../grain.mjs';
import {photoOrientation} from '../photo-orientation.mjs';
import {installMaterialPhotoEditor} from '../material-photo-editor.mjs';

const sections = [
  {key: 'pdcMaterials', title: t('ПДЧ материали'), fields: [
    ['name', t('Материал')], ['fullW', t('Ширина на цял лист (мм)'), 'number'],
    ['fullH', t('Височина на цял лист (мм)'), 'number'], ['halfW', t('Ширина на половин лист (мм)'), 'number'],
    ['halfH', t('Височина на половин лист (мм)'), 'number'], ['fullPrice', t('Цена цял лист (€)'), 'number'],
    ['halfPrice', t('Цена половин лист (€)'), 'number'], ['color', t('Цвят')],
    ['url', t('Връзка към доставчик')], ['textureUrl', t('Текстура (URL)')],
    ['textureWidthMm', t('Ширина на текстурата (мм)'), 'number'],
    ['textureHeightMm', t('Височина на текстурата (мм)'), 'number'],
    ['grainRequired', t('Посока на фладера е важна'), 'checkbox']]},
  {key: 'backMaterials', title: t('Гръб HDF'), fields: [
    ['name', t('Материал')], ['thick', t('Дебелина (мм)'), 'number'],
    ['fullW', t('Ширина на цял лист (мм)'), 'number'], ['fullH', t('Височина на цял лист (мм)'), 'number'],
    ['halfW', t('Ширина на половин лист (мм)'), 'number'], ['halfH', t('Височина на половин лист (мм)'), 'number'],
    ['fullPrice', t('Цена цял лист (€)'), 'number'], ['halfPrice', t('Цена половин лист (€)'), 'number'],
    ['color', t('Цвят')], ['url', t('Връзка към доставчик')], ['textureUrl', t('Текстура (URL)')],
    ['textureWidthMm', t('Ширина на текстурата (мм)'), 'number'],
    ['textureHeightMm', t('Височина на текстурата (мм)'), 'number'],
    ['grainRequired', t('Посока на фладера е важна'), 'checkbox']]},
  {key: 'worktops', title: t('Плотове'), fields: [
    ['name', t('Материал')], ['fullW', t('Дължина на цял плот (мм)'), 'number'],
    ['depth', t('Дълбочина (мм)'), 'number'], ['halfW', t('Дължина на половин плот (мм)'), 'number'],
    ['quarterW', t('Дължина на 1/4 плот (мм)'), 'number'], ['fullPrice', t('Цена цял плот (€)'), 'number'],
    ['halfPrice', t('Цена половин плот (€)'), 'number'], ['quarterPrice', t('Цена 1/4 плот (€)'), 'number'],
    ['color', t('Цвят')], ['url', t('Връзка към доставчик')], ['textureUrl', t('Текстура (URL)')],
    ['textureWidthMm', t('Ширина на текстурата (мм)'), 'number'],
    ['textureHeightMm', t('Височина на текстурата (мм)'), 'number'],
    ['grainRequired', t('Посока на фладера е важна'), 'checkbox']]},
  {key: 'edgeMaterials', title: t('Кантове'), fields: [
    ['name', t('Материал')], ['price', t('Цена за метър (€)'), 'number'],
    ['color', t('Цвят')], ['url', t('Връзка към доставчик')], ['textureUrl', t('Текстура (URL)')],
    ['textureWidthMm', t('Ширина на текстурата (мм)'), 'number'],
    ['textureHeightMm', t('Височина на текстурата (мм)'), 'number'],
    ['grainRequired', t('Посока на фладера е важна'), 'checkbox']]},
];
const catalogKeys = [...sections.map(section => section.key), 'servicePrices'];
function cloneCatalog(value) {
  const input = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(catalogKeys.map(key => [key, key === 'servicePrices'
    ? structuredClone(input[key] && typeof input[key] === 'object' ? input[key] : {})
    : structuredClone(Array.isArray(input[key]) ? input[key] : [])]));
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(label, handler) {
  const node = element('button', '', label);
  node.type = 'button';
  node.onclick = handler;
  return node;
}
export function materialSupplierLink(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function summary(section, material) {
  if (section.key === 'edgeMaterials') return ['—', material.price ?? '—'];
  if (section.key === 'worktops') return [
    [material.fullW, material.depth].filter(v => v !== undefined).join(' × ') + ' мм',
    [material.fullPrice, material.halfPrice, material.quarterPrice].filter(v => v !== undefined).join(' / ') + ' €'];
  return [[material.fullW, material.fullH].filter(v => v !== undefined).join(' × ') + ' мм',
    [material.fullPrice, material.halfPrice].filter(v => v !== undefined).join(' / ') + ' €'];
}

/**
 * v3-only editor for the selected cloud material base, independent from the
 * current workspace document's embedded catalog. Mutations stay in memory
 * until the explicit "Запази базата" action succeeds.
 */
export function createPilotMaterialEditor(container, onDirty = () => {}) {
  let selected = null, catalog = null, baseline = null;
  const dirty = () => catalog !== null && JSON.stringify(catalog) !== baseline;
  const announce = () => onDirty(dirty());

  function openForm(section, index) {
    const original = index === null ? {} : catalog[section.key][index];
    const draft = structuredClone(original);
    delete draft.weightThicknessMm;
    const popup = element('dialog', 'materialEditDialog pilotMaterialEditorDialog');
    popup.setAttribute('aria-label', index === null ? t('Нов материал') : t('Промени материал'));
    const form = element('form', 'pilotMaterialEditorForm');
    const title = element('h3', '', index === null ? t('Нов материал') : t('Промени материал'));
    const appearance = element('section', 'materialAppearance pilotMaterialAppearance');
    appearance.append(element('h4', '', t('Декор и текстура')));
    // Reuse the verified v2 gallery, GitHub upload guidance and photo validation.
    // A local file is only a preview: no blob/data URL is ever saved in the catalog.
    const readPhoto = installMaterialPhotoEditor(appearance, original, popup);
    // The shared picker can select repository images; expose its validated
    // local-file workflow as well, without uploading or persisting raw bytes.
    appearance.querySelector('.materialActions')?.append(action(t('Снимка от компютъра'),
      () => appearance.querySelector('#materialPhotoUpload')?.click()));
    const inputs = new Map();
    const weightFields = section.key === 'edgeMaterials' ? [] : [
      ['weightKgM2', t('Тегло (кг/м²)'), 'number'],
    ];
    const fields = [...section.fields, ...weightFields];
    for (const [key, label, kind] of fields) {
      if (key === 'textureUrl') continue; // The shared photo chooser owns this field.
      const row = element('label', 'pilotMaterialEditorField');
      row.append(element('span', '', label));
      const input = document.createElement('input');
      input.type = key === 'color' ? 'color' : kind === 'checkbox' ? 'checkbox' : kind === 'number' ? 'number' : 'text';
      if (kind === 'number') input.step = 'any';
      if (kind === 'checkbox') input.checked = !!draft[key];
      else input.value = key === 'color' ? /^#[0-9a-f]{6}$/i.test(draft.color || '') ? draft.color : '#ffffff' : draft[key] ?? '';
      if (key === 'name') input.required = true;
      input.setAttribute('aria-label', label);
      inputs.set(key, input);
      row.append(input);
      if (key === 'color') {
        // Keep an actual, keyboard-operable native color picker rather than
        // a text-only field; preserve existing colors until explicitly changed.
        input.addEventListener('input', () => {
          input.dataset.changed = 'true';
          readPhoto.useColor();
        });
        row.append(action(t('Избери цвят'), () => input.click()));
        appearance.insertBefore(row, appearance.children[1] || null);
      } else form.append(row);
    }
    form.prepend(appearance);
    const controls = element('div', 'materialActions');
    const save = action(t('Запази'), () => {});
    save.type = 'submit';
    save.onclick = null;
    const initialInputs = () => JSON.stringify([...inputs].map(([key, input]) =>
      [key, input.type === 'checkbox' ? input.checked : input.value]));
    const startingInputs = initialInputs();
    const guardedClose = async () => {
      if (initialInputs() !== startingInputs &&
          !await nedConfirmAction('Има незаписани промени. Да ги отхвърля ли?')) return;
      popup.close();
    };
    const cancel = action(t('Отказ'), () => { void guardedClose(); });
    popup.addEventListener('cancel', event => {
      event.preventDefault();
      void guardedClose();
    });
    controls.append(cancel, save);
    form.prepend(title);
    form.append(controls);
    form.onsubmit = event => {
      event.preventDefault();
      for (const [key, , kind] of fields) {
        const input = inputs.get(key);
        if (kind === 'checkbox') {
          if (input.checked || Object.hasOwn(draft, key)) draft[key] = input.checked;
          continue;
        }
        if (key === 'textureUrl' || (key === 'color' && input.dataset.changed !== 'true')) continue;
        if (input.value.trim() === '') {
          delete draft[key];
          continue;
        }
        if (kind === 'number') {
          const number = Number(input.value);
          if (!Number.isFinite(number) || number < 0) { input.setCustomValidity(t('Невалидна стойност')); input.reportValidity(); return; }
          draft[key] = number;
        } else draft[key] = input.value.trim();
      }
      if (!draft.name?.trim()) return;
      const textureUrl = validTextureUrl(readPhoto());
      if (textureUrl) {
        draft.textureUrl = textureUrl;
        if (textureUrl !== original.textureUrl) {
          draft.textureGrainDirection = photoOrientation({textureUrl});
        }
      } else {
        delete draft.textureUrl;
        delete draft.textureGrainDirection;
      }
      if (index === null) catalog[section.key].push(draft);
      else catalog[section.key][index] = draft;
      popup.close();
      render();
      announce();
    };
    popup.append(form);
    popup.onclose = () => popup.remove();
    document.body.append(popup);
    popup.showModal();
  }

  function render() {
    container.replaceChildren();
    if (!selected) {
      container.append(element('p', 'pilotMaterialEditorHint', 'Избери материална база, за да видиш и редактираш материалите.'));
      return;
    }
    container.append(element('h3', 'pilotMaterialPreviewTitle', selected.name));
    container.append(element('p', 'pilotMaterialEditorHint',
      'Редактираш избраната материална база. Материалите на вече записаните проекти не се променят. Използвай „Запази базата“ за запис в облака.'));
    for (const section of sections) {
      const block = element('section', 'pilotMaterialPreviewSection');
      block.append(element('h3', '', section.title));
      const scroll = element('div', 'pilotMaterialTableScroll');
      const table = element('table', 'pilotMaterialPreviewTable');
      const headers = table.createTHead().insertRow();
      for (const label of [t('Материал'), t('Размери'), t('Цени'), t('Действия')]) headers.append(element('th', '', label));
      const body = table.createTBody();
      catalog[section.key].forEach((item, index) => {
        const row = body.insertRow();
        const [size, price] = summary(section, item);
        const materialCell = row.insertCell();
        const identity = element('span', 'pilotMaterialIdentity');
        const swatch = element('span', 'pilotMaterialSwatch');
        swatch.style.backgroundColor = item.color || '#ffffff';
        swatch.title = t('Цвят на материала');
        const photo = validTextureUrl(item.textureUrl);
        if (photo) {
          const thumbnail = document.createElement('img');
          thumbnail.className = 'pilotMaterialTextureThumb';
          thumbnail.src = photo;
          thumbnail.alt = 'Декор ' + (item.name || t('Без име'));
          thumbnail.loading = 'lazy';
          thumbnail.onerror = () => thumbnail.replaceWith(swatch);
          identity.append(thumbnail);
        } else identity.append(swatch);
        const supplier = materialSupplierLink(item.url);
        if (supplier) {
          const link = element('a', 'pilotMaterialSupplierLink', item.name || t('Без име'));
          link.href = supplier;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          identity.append(link);
        } else identity.append(document.createTextNode(item.name || t('Без име')));
        materialCell.append(identity);
        row.insertCell().textContent = size;
        row.insertCell().textContent = String(price);
        const commands = row.insertCell();
        commands.className = 'pilotMaterialRowActions';
        commands.append(action(t('Промени'), () => openForm(section, index)),
          action(t('Изтрий'), async () => {
            if (!await nedConfirmDelete('Да изтрия ли материала „' + (item.name || t('Без име')) + '“ от тази база?')) return;
            catalog[section.key].splice(index, 1);
            render();
            announce();
          }));
      });
      if (!catalog[section.key].length) {
        const empty = body.insertRow().insertCell();
        empty.colSpan = 4;
        empty.textContent = t('Няма материали.');
      }
      scroll.append(table);
      block.append(scroll, action(t('Нов материал'), () => openForm(section, null)));
      container.append(block);
    }
    const services = element('section', 'pilotMaterialPreviewSection');
    services.append(element('h3', '', t('Услуги')));
    for (const [key, value] of Object.entries(catalog.servicePrices)) {
      const label = element('label', 'pilotMaterialServiceField');
      label.append(element('span', '', key));
      const input = document.createElement('input');
      input.type = 'number';
      input.step = 'any';
      input.value = value ?? '';
      input.setAttribute('aria-label', 'Цена за ' + key);
      input.onchange = () => {
        if (input.value === '') return;
        const number = Number(input.value);
        if (!Number.isFinite(number) || number < 0) { input.value = value; return; }
        catalog.servicePrices[key] = number;
        announce();
      };
      label.append(input);
      services.append(label);
    }
    container.append(services);
  }

  return {
    setBase(base) {
      selected = base ? {id: base.id, name: base.name} : null;
      catalog = base ? cloneCatalog(base.data) : null;
      baseline = catalog ? JSON.stringify(catalog) : null;
      render();
      announce();
    },
    getData() { return catalog ? structuredClone(catalog) : null; },
    isDirty: dirty,
    markSaved(base) {
      this.setBase(base);
    },
    get id() { return selected?.id || ''; },
  };
}
