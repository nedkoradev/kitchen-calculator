const actions = new Set(['newDocument', 'openProject', 'insertModel', 'saveDocument',
  'saveAsDocument', 'editScene', 'undo', 'redo']);
const journalErrors = new Set(['unknown-outcome', 'reconciliation-required', 'journal-acknowledgement-failed']);

// The view supplies choices and receives snapshots; controller factories own all persistence.
export function createWorkspaceBridge({createController, confirmDiscard, render = () => {}}) {
  let active = null;
  let requested = null;
  let busy = false;
  let gate = 'initializing';
  let action = null;
  let confirmation = null;
  let continuingSave = false;
  let error = null;

  function state() {
    return {scope: active ? {...active.scope} : null, workspace: active?.controller.state ?? null,
      gate, busy, action, confirmation, continuingSave, error: error && {...error}, canAct: gate === 'ready' && !busy};
  }

  function publish() { render(state()); }

  function setError(failure) {
    error = {code: failure?.code ?? 'workspace-error', message: failure?.message ?? String(failure)};
  }

  async function verify(entry) {
    gate = 'checking-journal';
    publish();
    if (await entry.controller.recoverPendingSave()) {
      gate = 'reconciling';
      publish();
      const outcome = await entry.controller.reconcileSave();
      if (!['committed', 'not-committed'].includes(outcome)) throw new Error('Unresolved save operation');
      gate = 'checking-journal';
      publish();
      if (await entry.controller.recoverPendingSave()) throw new Error('Another save needs reconciliation');
    }
  }

  function makeEntry(scope) {
    const fixedScope = Object.freeze({...scope});
    return {scope: fixedScope, controller: createController({scope: fixedScope, async confirmDiscard(request) {
      confirmation = request.command;
      publish();
      try {
        const choice = await confirmDiscard?.(request) ?? {action: 'cancel'};
        continuingSave = choice.action === 'save';
        return choice;
      } finally {
        confirmation = null;
        publish();
      }
    }})};
  }

  async function initialize(scope) {
    if (busy) return false;
    busy = true;
    error = null;
    try {
      if (scope !== undefined) {
        requested = null;
        const sameProfile = active?.scope.ownerUid === scope.ownerUid && active.scope.actorUid === scope.actorUid;
        const previous = active?.controller.state;
        if (!sameProfile && previous?.dirty && !['saved', 'restored'].includes(previous.draftStatus)) {
          throw new Error('Current unsaved work has no restorable draft');
        }
        requested = sameProfile ? null : makeEntry(scope);
      }
      if (requested && active) await verify(active);
      const candidate = requested ?? active;
      if (!candidate) throw new Error('A profile is required');
      await verify(candidate);
      active = candidate;
      requested = null;
      gate = 'ready';
      return true;
    } catch (failure) {
      gate = 'journal-blocked';
      setError(failure);
      return false;
    } finally {
      busy = false;
      publish();
    }
  }

  return {
    get state() { return state(); },
    initialize,
    async execute(command, ...args) {
      if (!actions.has(command)) throw new TypeError('Unknown workspace action');
      if (!active || busy || gate !== 'ready') return false;
      busy = true;
      error = null;
      action = command;
      try {
        const task = active.controller[command](...args);
        publish();
        const result = await task;
        const current = active.controller.state;
        if (current.pendingOperationId) {
          gate = 'journal-blocked';
          if (current.error) setError(current.error);
        }
        return result;
      } catch (failure) {
        setError(failure);
        if (active.controller.state.pendingOperationId || journalErrors.has(failure?.code)) gate = 'journal-blocked';
        return false;
      } finally {
        busy = false;
        action = null;
        continuingSave = false;
        publish();
      }
    },
  };
}
