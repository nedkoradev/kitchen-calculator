import {projectName} from '../project-model.mjs';
import {SCHEMA_VERSION, PROJECTS_FOLDER, identifier, record, validateDocument} from './model.mjs';

async function convert(type, scope, sourceId, sourceName, revision, folderId, data, catalog, originalSettings) {
  if (typeof sourceName !== 'string') throw new TypeError('Invalid legacy name');
  const sourceKey = JSON.stringify([type, identifier(scope), identifier(sourceId)]);
  const {name, nameKey} = projectName(sourceName);
  const {parts, room, assemblyNames, settings, ...legacyFields} = data;
  delete legacyFields.materials;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceKey));
  const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  const document = {
    schemaVersion: SCHEMA_VERSION,
    type, id: 'legacy:v1:' + digest, name, nameKey, revision, folderId,
    materials: catalog, parts, groups: assemblyNames ?? {}, room: room ?? null, settings: settings ?? {},
    source: {type, scope, id: sourceId, name: sourceName, fields: legacyFields, originalSettings},
  };
  validateDocument(document);
  return JSON.parse(JSON.stringify(document));
}

export async function readLegacyProject(input, {scope, id, catalog} = {}) {
  record(input, 'legacy project');
  if (input.schemaVersion !== 1) throw new TypeError('Unsupported legacy project schema version');
  const data = record(input.data, 'legacy project snapshot');
  return convert('project', scope, id, input.name, input.revision, PROJECTS_FOLDER.id, data, data.materials ?? catalog);
}

export async function readLegacyCabinet(input, {scope, id = input?.id, catalog, folderId} = {}) {
  const {id: embeddedId, name, parts, room, materials, assemblyNames, settings, calculationSettings, ...fields} =
    record(input, 'legacy cabinet');
  if (embeddedId !== undefined && embeddedId !== id) throw new TypeError('Conflicting legacy cabinet IDs');
  if (!Array.isArray(parts) || !parts.length) throw new TypeError('Empty legacy cabinet');
  if (input.v2 !== undefined && input.v2 !== true) throw new TypeError('Unsupported legacy cabinet format');
  // The caller resolves aliases/tombstones with the v2 folder data before converting.
  if (folderId === undefined && (input.folderId !== undefined && input.folderId !== null || input.category)) {
    throw new TypeError('Resolve the legacy cabinet folder explicitly');
  }
  if (settings !== undefined) record(settings, 'legacy cabinet settings');
  if (calculationSettings !== undefined) record(calculationSettings, 'legacy cabinet calculation settings');
  return convert('model', scope, id, name, 1, folderId ?? null, {
    ...fields, parts, room, assemblyNames,
    // The saved calculation settings drive the legacy reports. Keep both original maps in provenance.
    settings: {...settings, ...calculationSettings},
  }, materials ?? catalog, {settings, calculationSettings});
}
