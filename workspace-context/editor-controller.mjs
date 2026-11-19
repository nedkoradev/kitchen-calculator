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

  async function run(initialPhase, action) {
    if (phase !== 'idle') throw new Error('A workspace command is in progress');
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
      phase = 'idle';
    }
  }

  function save(command, options = {}) {
    phase = 'saving';
    const requestId = identifier(operationId());
    return workspace[command]({...options, write: request => {
      writeOperationId = requestId;
      return persistence.write({scope: profile, operationId: requestId, ...request});
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
      return {...workspace.state, phase, error: error && {...error}};
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
    editScene(patch) { return run('editing', () => workspace.editScene(patch)); },
    undo() { return run('editing', () => workspace.undo()); },
    redo() { return run('editing', () => workspace.redo()); },
  };
}
