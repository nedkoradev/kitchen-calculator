import {projectName} from '../project-model.mjs';
import {PROJECTS_FOLDER, validateDocument} from '../document-format/model.mjs';
import {legacyDocumentId} from '../document-format/legacy.mjs';
import {createReportContext} from '../report-context.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';
import {documentToSnapshot, snapshotToDocument, toEditorSnapshot} from '../workspace-ui/scene-adapter.mjs';

const sameSource = (document, ownerUid, item) =>
  document.source?.scope === ownerUid && document.source?.id === item.id &&
  document.source?.type === item.type;

function compatible(document, item, ownerUid, folderId) {
  validateDocument(document);
  if (document.type !== item.type || document.source?.name !== item.name ||
      !sameSource(document, ownerUid, item)) {
    throw new Error('Legacy identity or name changed during conversion');
  }
  if (document.type === 'project') {
    if (document.folderId !== PROJECTS_FOLDER.id) throw new Error('Project is not in the Projects folder');
    const snapshot = toEditorSnapshot(document);
    createReportContext({id: document.id, kind: 'project'}, snapshot);
  } else if (document.folderId !== folderId || folderId === PROJECTS_FOLDER.id) {
    throw new Error('Model destination folder is not valid');
  }
  const {identity, snapshot} = documentToSnapshot(document);
  if (comparableJson(snapshotToDocument(snapshot, identity)) !== comparableJson(document)) {
    throw new Error('Scene roundtrip mismatch');
  }
  if (new TextEncoder().encode(comparableJson(document)).length > 800_000) {
    throw new Error('Document exceeds the 800 KB v3 write limit');
  }
}

function counts(rows) {
  return Object.fromEntries([...new Set(rows.map(row => row.status))]
    .map(status => [status, rows.filter(row => row.status === status).length]));
}

export async function inspectLegacyMigration({store, scope, ownerUid = scope?.ownerUid,
  catalogIds = {}, modelFolderId = null}) {
  if (!scope || scope.actorUid !== scope.ownerUid || ownerUid !== scope.ownerUid) {
    throw Object.assign(new Error('Only the owner can migrate their v2 documents'), {code: 'permission-denied'});
  }
  const [legacy, library] = await Promise.all([
    store.legacyList({scope, legacyOwnerId: ownerUid}),
    store.list({scope}),
  ]);
  if (!Array.isArray(legacy.documents) || !Array.isArray(library.documents) || !Array.isArray(library.folders)) {
    throw new TypeError('Invalid document listing');
  }
  const hasModels = legacy.documents.some(item => item.type === 'model');
  if (hasModels && !library.folders.some(folder => folder.id === modelFolderId &&
      folder.id !== PROJECTS_FOLDER.id)) {
    throw Object.assign(new Error('Choose a v3 Library folder for the models'), {code: 'legacy-folder-required'});
  }

  const currentById = new Map(library.documents.map(item => [item.id, item]));
  const currentByName = new Map();
  for (const item of library.documents) {
    if (typeof item.name !== 'string') continue;
    const key = projectName(item.name).nameKey;
    const existing = currentByName.get(key) ?? [];
    existing.push(item);
    currentByName.set(key, existing);
  }

  const rows = [];
  for (const item of legacy.documents) {
    const row = {id: item.id, name: item.name, type: item.type, status: 'blocked', reason: '', document: null};
    rows.push(row);
    try {
      if (!['project', 'model'].includes(item.type) || typeof item.id !== 'string' || typeof item.name !== 'string') {
        throw new Error('Unsupported legacy document listing');
      }
      if (item.requiresCatalog && !Object.hasOwn(catalogIds, item.id)) {
        row.reason = 'Choose the exact original material library';
        continue;
      }
      const readRequest = {
        scope, legacyOwnerId: ownerUid, id: item.id, type: item.type,
        ...(item.requiresCatalog ? {catalogId: catalogIds[item.id]} : {}),
        ...(item.type === 'model' ? {folderId: modelFolderId} : {}),
      };
      const document = await store.legacyRead(readRequest);
      compatible(document, item, ownerUid, modelFolderId);
      row.document = document;
      row.readRequest = readRequest;
      const existing = currentById.get(document.id);
      if (existing) {
        if (existing.type !== document.type) {
          row.status = 'conflict';
          row.reason = 'A different v3 document already uses the migration ID';
          continue;
        }
        const previous = await store[document.type === 'project' ? 'readProject' : 'readModel']({scope, id: document.id});
        if (!sameSource(previous, ownerUid, item)) {
          row.status = 'conflict';
          row.reason = 'The migration ID belongs to another source';
        } else if (comparableJson(previous) === comparableJson(document)) {
          row.status = 'already-imported';
          row.reason = 'The matching v3 document already exists; it was not changed';
        } else {
          row.status = 'existing-not-updated';
          row.reason = 'The source ID exists in v3 but its content differs; it was not changed';
        }
        continue;
      }
      const nameKey = projectName(document.name).nameKey;
      const nameOwner = currentByName.get(nameKey)?.find(entry => entry.id !== document.id);
      if (nameOwner) {
        row.status = 'conflict';
        row.reason = `The v3 name is already used by ${nameOwner.type}`;
        continue;
      }
      row.status = 'ready';
      row.reason = 'Compatible; will create a new v3 document';
    } catch (error) {
      row.reason = error?.message ?? 'Compatibility check failed';
    }
  }

  const batchNames = new Map();
  for (const row of rows.filter(item => item.status === 'ready')) {
    const key = projectName(row.document.name).nameKey;
    const entries = batchNames.get(key) ?? [];
    entries.push(row);
    batchNames.set(key, entries);
  }
  for (const entries of batchNames.values()) {
    if (entries.length < 2) continue;
    for (const row of entries) {
      row.status = 'conflict';
      row.reason = 'Two legacy documents have the same normalized name';
    }
  }
  return {scope: {...scope}, ownerUid, rows, counts: counts(rows)};
}

export async function applyLegacyMigration({store, plan, onProgress = () => {}}) {
  if (!plan || !Array.isArray(plan.rows) || plan.scope?.actorUid !== plan.ownerUid ||
      plan.scope?.ownerUid !== plan.ownerUid) {
    throw new TypeError('Invalid migration plan');
  }
  const rows = plan.rows.map(row => ({...row}));
  let stop = false;
  for (const row of rows) {
    if (row.status !== 'ready') continue;
    if (stop) {
      row.status = 'not-attempted';
      row.reason = 'Stopped after an unresolved server response';
      continue;
    }
    try {
      const current = await store.legacyRead(row.readRequest);
      if (comparableJson(current) !== comparableJson(row.document)) {
        row.status = 'failed';
        row.reason = 'The v2 source changed after preflight; retry the migration';
        continue;
      }
      const result = await store.migrateLegacy({scope: plan.scope, document: row.document});
      if (result?.status === 'imported') {
        row.status = 'imported';
        row.reason = 'Created in v3';
      } else if (result?.status === 'already-imported') {
        row.status = 'already-imported';
        row.reason = 'The matching v3 document already exists; it was not changed';
      } else if (result?.status === 'existing-not-updated') {
        row.status = 'existing-not-updated';
        row.reason = 'Existing v3 content differs; it was not changed';
      } else if (['id-conflict', 'index-conflict', 'name-conflict', 'folder-not-found'].includes(result?.status)) {
        row.status = result.status === 'folder-not-found' ? 'failed' : 'conflict';
        row.reason = `v3 refused the document (${result.status})`;
      } else {
        row.status = 'unknown';
        row.reason = `Unrecognized v3 response (${result?.status ?? 'missing status'}); stopped to avoid duplicate writes`;
        stop = true;
      }
    } catch (error) {
      const code = error?.code?.replace(/^functions\//, '');
      const uncertain = ['unavailable', 'unknown-outcome', 'deadline-exceeded', 'internal', 'unknown'].includes(code);
      row.status = uncertain ? 'unknown' : 'failed';
      row.reason = error?.message ?? 'Migration failed';
      if (uncertain || code === 'permission-denied') stop = true;
    }
    onProgress({row: {...row}});
  }
  for (const row of rows) {
    if (row.status === 'ready') {
      row.status = 'not-attempted';
      row.reason = 'Stopped after an unresolved server response';
    }
  }
  return {rows, counts: counts(rows)};
}
