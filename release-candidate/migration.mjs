import {readLegacyCabinet, readLegacyProject} from '../document-format/legacy.mjs';
import {PROJECTS_FOLDER, validateLibrary} from '../document-format/model.mjs';
import {resolveFolder, validateFolders} from '../library-folders.mjs';
import {createReportContext} from '../report-context.mjs';
import {documentToSnapshot, snapshotToDocument, toEditorSnapshot} from '../workspace-ui/scene-adapter.mjs';
import {inspectLegacyDraft} from '../workspace-persistence/drafts.mjs';
import {cutLayout} from '../grain.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';

function summarize(snapshot) {
  const catalog = snapshot.materials;
  const keys = {pdc: 'pdcMaterials', back: 'backMaterials', worktop: 'worktops'};
  return {
    parts: snapshot.parts.map(({part, finish}) => ({id: part.key,
      dimensions: [part.x, part.y, part.z, part.w, part.h, part.d],
      cut: cutLayout(part, finish, catalog[keys[finish?.materialType ?? 'pdc']]?.[finish?.material]),
      edges: finish?.edges})),
    priceInputs: catalog, groups: snapshot.assemblyNames, room: snapshot.room,
  };
}

function historySnapshots(rawSteps, document) {
  return (rawSteps ?? []).map(raw => {
    const step = JSON.parse(raw);
    const {identity, snapshot} = documentToSnapshot(document);
    const fields = new Set(['parts', 'labels', 'finishes', 'allEdgeFlags', 'assemblyNames', 'sheetUtilization',
      'selected', 'groupSelections', 'singleMemberSelection', 'partCounter', 'assemblyId']);
    for (const field of Object.keys(step)) if (!fields.has(field)) throw new Error('Unsupported history field ' + field);
    snapshot.parts = step.parts.map(part => ({part, name: step.labels[part.key] ?? part.key,
      finish: step.finishes[part.key] ?? {}, allEdges: !!step.allEdgeFlags[part.key]}));
    snapshot.assemblyNames = step.assemblyNames ?? {};
    snapshot.settings = {...snapshot.settings, sheetUtilization: step.sheetUtilization ?? 80};
    const converted = snapshotToDocument(snapshot, identity);
    return {scene: documentToSnapshot(converted).snapshot,
      editor: {selected: step.selected ?? null, groupSelections: step.groupSelections,
        singleMemberSelection: step.singleMemberSelection, partCounter: step.partCounter, assemblyId: step.assemblyId}};
  });
}

export function archiveWorkspaceCopy(input) {
  return structuredClone({format: 'ned-iq-v2-copy', version: 1, data: input});
}

export async function dryRunWorkspaceMigration(archive) {
  if (archive?.format !== 'ned-iq-v2-copy' || archive.version !== 1) throw new Error('Unsupported archive format');
  const {data: copy} = structuredClone(archive);
  const blockers = [];
  const records = [];
  const drafts = [];
  let folders;
  try {
    for (const field of ['projects', 'cabinets', 'drafts']) {
      if (copy[field] !== undefined && !Array.isArray(copy[field])) throw new Error('Invalid ' + field + ' archive');
    }
    const legacy = validateFolders(copy.folders);
    folders = [PROJECTS_FOLDER, ...legacy.filter(folder => !folder.deleted)
      .map(folder => ({id: folder.id, name: folder.label, parentId: null}))];
    validateLibrary([], folders);
    for (const field of Object.keys(copy)) {
      if (!['ownerUid', 'folders', 'projects', 'cabinets', 'drafts', 'grants', 'materials', 'settings'].includes(field)) {
        throw new Error('Unsupported archive field ' + field);
      }
    }
    for (const [actor, role] of Object.entries(copy.grants ?? {})) {
      if (!actor || !['editor', 'viewer'].includes(role)) throw new Error('Unsupported grant for ' + actor);
    }
  } catch (error) {
    return {status: 'blocked', blockers: [{source: 'archive', message: error.message}], candidates: null};
  }
  for (const [field, reader] of [['projects', readLegacyProject], ['cabinets', readLegacyCabinet]]) {
    for (const entry of copy[field] ?? []) {
      try {
        const supported = field === 'projects'
          ? ['schemaVersion', 'revision', 'name', 'nameKey', 'createdAt', 'updatedAt', 'data']
          : ['id', 'v2', 'name', 'parts', 'room', 'folderId', 'category', 'updatedAt', 'materials', 'assemblyNames', 'settings', 'calculationSettings'];
        for (const key of Object.keys(entry.record)) {
          if (!supported.includes(key)) throw new Error('Unsupported legacy field ' + key);
        }
        if (field === 'projects') {
          for (const key of Object.keys(entry.record.data)) {
            if (!['parts', 'room', 'materials', 'assemblyNames', 'settings'].includes(key)) throw new Error('Unsupported legacy snapshot field ' + key);
          }
        }
        const scope = JSON.stringify(['legacy', copy.ownerUid]);
        const folderId = field === 'cabinets' ? resolveFolder(entry.record, copy.folders) : undefined;
        if (field === 'cabinets' && folderId === null && (entry.record.folderId || entry.record.category)) {
          throw new Error('Legacy folder requires explicit mapping');
        }
        const candidate = await reader(entry.record, {scope, id: entry.id, catalog: entry.catalog, folderId});
        const {identity, snapshot} = documentToSnapshot(candidate);
        const roundtrip = snapshotToDocument(snapshot, identity);
        if (comparableJson(roundtrip) !== comparableJson(candidate)) throw new Error('Scene roundtrip mismatch');
        const source = field === 'projects' ? entry.record.data : entry.record;
        const sourceScene = {...snapshot, ...source, materials: source.materials ?? entry.catalog};
        if (comparableJson(summarize(sourceScene)) !== comparableJson(summarize(snapshot))) throw new Error('Source scene mismatch');
        if (candidate.type === 'project') {
          const attached = toEditorSnapshot(candidate);
          createReportContext({id: candidate.id, kind: 'project'}, attached);
        }
        records.push({source: entry.id, candidate, comparison: summarize(snapshot)});
      } catch (error) {
        blockers.push({source: field + '/' + entry.id, message: error.message});
      }
    }
  }
  try { validateLibrary(records.map(record => record.candidate), folders); }
  catch (error) { blockers.push({source: 'library', message: error.message}); }
  for (const {scope, bundle} of copy.drafts ?? []) {
    try {
      if (scope.ownerUid !== copy.ownerUid) throw new Error('Draft owner mismatch');
      const report = await inspectLegacyDraft(bundle, scope);
      if (report.status !== 'snapshot-compatible') throw new Error(JSON.stringify(report));
      drafts.push({scope, activeKind: bundle.activeKind, records: report.records.map(entry => {
        const legacy = bundle.records.find(record => record.kind === entry.kind);
        if (!entry.candidate) return entry;
        return {...entry, undo: historySnapshots(legacy.session?.undo, entry.candidate),
          redo: historySnapshots(legacy.session?.redo, entry.candidate)};
      })});
    } catch (error) {
      blockers.push({source: 'drafts/' + scope?.actorUid, message: error.message});
    }
  }
  const counts = {projects: copy.projects?.length ?? 0, cabinets: copy.cabinets?.length ?? 0,
    converted: records.length, drafts: drafts.length, grants: Object.keys(copy.grants ?? {}).length};
  return {status: blockers.length ? 'blocked' : 'compatible', blockers, counts,
    candidates: blockers.length ? null : {folders, documents: records, drafts, grants: copy.grants,
      materials: copy.materials, settings: copy.settings}};
}

export function rehearsalRollback(archive) {
  if (archive?.format !== 'ned-iq-v2-copy' || archive.version !== 1) throw new Error('Unsupported archive format');
  return structuredClone(archive.data);
}
