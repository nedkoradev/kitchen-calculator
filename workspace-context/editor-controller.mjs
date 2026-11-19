import {identifier, validateDocument} from '../document-format/model.mjs';
import {createWorkspaceContext, prepareNewDocument} from './context.mjs';

// The ports are deliberately injected. The controller has no cloud, DOM or browser storage dependency.
export function createWorkspaceController({scope, persistence, drafts, confirmDiscard, newId,
  operationId = () => crypto.randomUUID()}) {
  const profile = Object.freeze({ownerUid: identifier(scope?.ownerUid), actorUid: identifier(scope?.actorUid)});
  const draftStore = drafts && {
    read: () => drafts.read(profile),
    write: text => drafts.write(profile, text),
  };
  const workspace = createWorkspaceContext({newId, draftStore});
  let phase = 'idle';
  let error = null;
  let writeOperationId;
  let pending;

  async function run(initialPhase, action) {
    if (phase !== 'idle' && phase !== 'awaiting-reconciliation') throw new Error('A workspace command is in progress');
    if (pending && initialPhase !== 'reconciling') {
      throw Object.assign(new Error('Reconcile the pending save first'), {code: 'reconciliation-required'});
    }
    phase = initialPhase;
    error = null;
    writeOperationId = undefined;
    try {
      return await action();
    } catch (failure) {
      error = {phase, code: failure?.code ?? 'workspace-error', message: failure?.message ?? String(failure)};
      if (writeOperationId !== undefined) error.operationId = writeOperationId;
      throw failure;
    } finally {
      phase = pending ? 'awaiting-reconciliation' : 'idle';
    }
  }

  function save(command, options = {}) {
    phase = 'saving';
    const requestId = identifier(operationId());
    return workspace[command]({...options, write: async request => {
      writeOperationId = requestId;
      const attempt = {...structuredClone(request), operationId: requestId};
      try {
        const result = await persistence.write({scope: profile, operationId: requestId, ...request});
        if (result?.id !== attempt.document.id || result.revision !== attempt.document.revision) {
          throw Object.assign(new Error('Invalid save acknowledgement'), {code: 'unknown-outcome'});
        }
        return result;
      } catch (failure) {
        if (failure?.code === 'unknown-outcome') pending = attempt;
        throw failure;
      }
    }});
  }

  async function replace(command, apply) {
    if (!workspace.state.dirty) return apply(false);
    phase = 'confirming';
    const decision = await confirmDiscard?.({command, document: workspace.state.document});
    if (decision == null || decision.action === 'cancel') return false;
    if (decision.action === 'save') return apply(false, await save('saveDocument', decision.options));
    if (decision.action !== 'discard') throw new TypeError('Unknown discard decision');
    return apply(true);
  }

  return {
    get state() {
      return {...workspace.state, phase, error: error && {...error}, pendingOperationId: pending?.operationId ?? null};
    },
    newDocument(options = {}) {
      return run('editing', async () => {
        const snapshot = structuredClone(options);
        prepareNewDocument(snapshot);
        return replace('newDocument', discardChanges => {
          workspace.newDocument({...snapshot, discardChanges});
          return true;
        });
      });
    },
    openProject(id) {
      return run('loading', async () => {
        identifier(id);
        const project = structuredClone(await persistence.readProject({scope: profile, id}));
        validateDocument(project);
        if (project.type !== 'project' || project.id !== id) throw new TypeError('Unexpected project');
        return replace('openProject', (discardChanges, saved) => {
          workspace.openProject(saved?.id === id ? saved : project, {discardChanges});
          return true;
        });
      });
    },
    insertModel(id) {
      return run('loading', async () => {
        identifier(id);
        const model = structuredClone(await persistence.readModel({scope: profile, id}));
        if (model?.id !== id) throw new TypeError('Unexpected model');
        phase = 'editing';
        workspace.insertModel(model);
        return true;
      });
    },
    saveDocument(options) { return run('saving', () => save('saveDocument', options)); },
    saveAsDocument(options) { return run('saving', () => save('saveAsDocument', options)); },
    reconcileSave() {
      return run('reconciling', async () => {
        if (!pending) return false;
        writeOperationId = pending.operationId;
        const outcome = await persistence.reconcile({scope: profile, ...structuredClone(pending)});
        if (outcome?.status === 'committed') workspace.confirmReconciledSave(pending.document, outcome);
        else if (outcome?.status !== 'not-committed') {
          throw Object.assign(new Error('Save outcome is still unknown'), {code: 'unknown-outcome'});
        }
        pending = undefined;
        return outcome.status;
      });
    },
    editScene(patch, {allowPartRemoval = false} = {}) {
      return run('editing', () => {
        if (Array.isArray(patch?.parts) && allowPartRemoval !== true) {
          const replacementIds = new Set(patch.parts.map(item => item?.part?.key));
          if (workspace.state.document.parts.some(({part}) => !replacementIds.has(part.key))) {
            throw new TypeError('Replacing parts would remove existing IDs; explicitly allow removal');
          }
        }
        return workspace.editScene(patch);
      });
    },
    undo() { return run('editing', () => workspace.undo()); },
    redo() { return run('editing', () => workspace.redo()); },
  };
}
