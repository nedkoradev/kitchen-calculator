import {identifier} from '../document-format/model.mjs';
import {parseWorkspaceDraft} from '../workspace-context/context.mjs';
import {validateDraftForRestore} from '../draft-store.mjs';
import {readLegacyCabinet, readLegacyProject} from '../document-format/legacy.mjs';

function profile(scope) {
  return [identifier(scope?.ownerUid), identifier(scope?.actorUid)];
}

export function createWorkspaceDraftAdapter(storage) {
  const key = scope => 'nedIQ.workspace.test.v1:' + JSON.stringify(profile(scope));
  function read(scope) {
    const raw = storage.getItem(key(scope));
    if (raw == null) return null;
    const envelope = JSON.parse(raw);
    if (JSON.stringify(envelope?.profile) !== JSON.stringify(profile(scope)) || typeof envelope.text !== 'string') {
      throw new TypeError('Invalid draft profile envelope');
    }
    parseWorkspaceDraft(envelope.text);
    return envelope.text;
  }
  return {
    read,
    write(scope, text) {
      parseWorkspaceDraft(text);
      read(scope);
      const data = JSON.stringify({profile: profile(scope), text});
      if (storage.setItem(key(scope), data, {strict: true}) === false) throw new Error('Draft storage declined the write');
    },
  };
}

// Dry run only. Return independent candidate snapshots and never take a writable storage port.
export async function inspectLegacyDraft(input, scope) {
  const [owner, actor] = profile(scope);
  const expectedOwner = owner === actor ? owner : JSON.stringify([actor, owner]);
  const original = structuredClone(input);
  try {
    if (original?.owner !== expectedOwner) throw new Error('Legacy draft belongs to another profile');
    validateDraftForRestore(original);
  } catch (error) {
    return {status: 'incompatible', error: error.message, records: []};
  }
  const records = [];
  for (const entry of original.records) {
    const {kind, id, name, snapshot, session} = entry;
    const history = {undo: session?.undo?.length ?? 0, redo: session?.redo?.length ?? 0};
    if (!snapshot.parts.length && !entry.dirty && !history.undo && !history.redo) {
      records.push({kind, status: 'empty', history});
      continue;
    }
    try {
      const sourceScope = JSON.stringify(['legacy-draft', owner, actor]);
      const candidate = kind === 'project'
        ? await readLegacyProject({schemaVersion: 1, name, revision: 1, data: snapshot}, {scope: sourceScope, id})
        : await readLegacyCabinet({...snapshot, id, name}, {scope: sourceScope});
      records.push({kind, status: 'snapshot-compatible', candidate, dirty: !!entry.dirty, history});
    } catch (error) {
      records.push({kind, status: 'incompatible', error: error.message, history});
    }
  }
  return {status: records.every(entry => entry.status !== 'incompatible') ? 'snapshot-compatible' : 'review-required',
    records, rollback: 'Retain the original bundle and legacy storage keys; discard only generated candidates.'};
}
