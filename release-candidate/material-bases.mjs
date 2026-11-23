import {identifier} from '../document-format/model.mjs';

export const MATERIAL_PREFERENCES_ID = '_app_preferences';
export const materialBaseOperations = new Set([
  'materialBases',
  'materialBaseRead',
  'materialBaseSave',
  'materialBaseRename',
  'materialBaseDelete',
  'materialBaseSetDefault',
]);

const fail = (code, message = code) => Object.assign(new Error(message), {code});

function normalizeName(name) {
  return String(name ?? '').trim().normalize('NFKC').toLocaleLowerCase('bg');
}

function baseIdFromName(name, newId = () => crypto.randomUUID()) {
  const slug = String(name).trim().toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, '_')
    .replace(/^_+|_+$/g, '');
  return 'base_' + (slug || newId().replaceAll('-', '').slice(0, 12));
}

function catalogData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw fail('invalid-material-catalog', 'Invalid material catalog');
  }
  const catalog = {};
  for (const key of ['pdcMaterials', 'edgeMaterials', 'backMaterials', 'worktops']) {
    catalog[key] = Array.isArray(data[key]) ? JSON.parse(JSON.stringify(data[key])) : [];
  }
  catalog.servicePrices = data.servicePrices && typeof data.servicePrices === 'object' &&
    !Array.isArray(data.servicePrices) ? JSON.parse(JSON.stringify(data.servicePrices)) : {};
  return catalog;
}

export async function handleMaterialBaseOperation({db, tx, operation, request = {}, uid,
  newId = () => crypto.randomUUID()}) {
  const ownerUid = identifier(uid);
  const materials = db.collection('users').doc(ownerUid).collection('materials');
  const preferences = materials.doc(MATERIAL_PREFERENCES_ID);

  if (operation === 'materialBases') {
    const [snap, pref] = await Promise.all([
      tx.get(materials),
      tx.get(preferences),
    ]);
    const items = snap.docs
      .filter(doc => doc.id !== MATERIAL_PREFERENCES_ID)
      .map(doc => ({id: doc.id, name: doc.data().name || doc.id}))
      .sort((a, b) => a.name.localeCompare(b.name, 'bg') || a.id.localeCompare(b.id));
    return {items, defaultBaseId: pref.data()?.defaultMaterialBaseId || ''};
  }

  if (operation === 'materialBaseRead') {
    const id = identifier(request.id);
    if (id === MATERIAL_PREFERENCES_ID) throw fail('invalid-material-base', 'Invalid material base');
    const snap = await tx.get(materials.doc(id));
    if (!snap.exists) throw fail('not-found', 'Material base not found');
    return {id, name: snap.data().name || id, data: snap.data()};
  }

  if (operation === 'materialBaseSave') {
    const name = String(request.name ?? '').trim();
    if (!name || name.length > 100) throw fail('invalid-material-base-name', 'Invalid material base name');
    const data = catalogData(request.data);
    const snap = await tx.get(materials);
    const existing = snap.docs.filter(doc => doc.id !== MATERIAL_PREFERENCES_ID);
    const duplicate = existing.find(doc => normalizeName(doc.data().name || doc.id) === normalizeName(name));

    let id;
    if (request.id !== undefined && request.id !== null && request.id !== '') {
      id = identifier(request.id);
      if (id === MATERIAL_PREFERENCES_ID) throw fail('invalid-material-base', 'Invalid material base');
      const ref = materials.doc(id);
      if (!(await tx.get(ref)).exists) throw fail('not-found', 'Material base not found');
      if (duplicate && duplicate.id !== id) {
        throw fail('material-base-name-conflict', 'A material base with this name already exists');
      }
    } else {
      if (duplicate) throw fail('material-base-name-conflict', 'A material base with this name already exists');
      id = baseIdFromName(name, newId);
      const ids = new Set(existing.map(doc => doc.id));
      if (ids.has(id)) id = id + '_' + newId().replaceAll('-', '').slice(0, 8);
      let suffix = 2;
      while (ids.has(id)) id = baseIdFromName(name, newId) + '_' + suffix++;
    }

    await tx.set(materials.doc(id), {...data, name, updatedAt: Date.now()});
    return {id, name, data};
  }

  if (operation === 'materialBaseRename') {
    const id = identifier(request.id);
    if (id === MATERIAL_PREFERENCES_ID) throw fail('invalid-material-base', 'Invalid material base');
    const name = String(request.name ?? '').trim();
    if (!name || name.length > 100) throw fail('invalid-material-base-name', 'Invalid material base name');
    const ref = materials.doc(id);
    if (!(await tx.get(ref)).exists) throw fail('not-found', 'Material base not found');
    const snap = await tx.get(materials);
    const duplicate = snap.docs.find(doc => doc.id !== MATERIAL_PREFERENCES_ID &&
      doc.id !== id && normalizeName(doc.data().name || doc.id) === normalizeName(name));
    if (duplicate) throw fail('material-base-name-conflict', 'A material base with this name already exists');
    await tx.set(ref, {name, updatedAt: Date.now()}, {merge: true});
    return {id, name};
  }

  if (operation === 'materialBaseDelete') {
    const id = identifier(request.id);
    if (id === MATERIAL_PREFERENCES_ID) throw fail('invalid-material-base', 'Invalid material base');
    const ref = materials.doc(id);
    if (!(await tx.get(ref)).exists) throw fail('not-found', 'Material base not found');
    const pref = await tx.get(preferences);
    await tx.delete(ref);
    if (pref.data()?.defaultMaterialBaseId === id) {
      await tx.set(preferences, {
        schemaVersion: 1,
        defaultMaterialBaseId: '',
        updatedAt: Date.now(),
      }, {merge: true});
    }
    return {id};
  }

  if (operation === 'materialBaseSetDefault') {
    const id = request.id === '' || request.id == null ? '' : identifier(request.id);
    if (id && id !== MATERIAL_PREFERENCES_ID) {
      if (!(await tx.get(materials.doc(id))).exists) throw fail('not-found', 'Material base not found');
    }
    await tx.set(preferences, {
      schemaVersion: 1,
      defaultMaterialBaseId: id,
      updatedAt: Date.now(),
    }, {merge: true});
    return {id};
  }

  throw fail('invalid-operation', 'Unknown material base operation');
}
