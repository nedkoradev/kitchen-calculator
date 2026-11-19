import {identifier, validateDocument} from '../document-format/model.mjs';
import {comparableJson} from '../workspace-context/insertion.mjs';

class AdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => new AdapterError(code, message);

async function fingerprint(document, expectedRevision) {
  const bytes = new TextEncoder().encode(comparableJson({document, expectedRevision}));
  if (bytes.length > 800_000) throw fail('document-too-large', 'Document exceeds 800 KB');
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Server deployments must derive actorUid from a verified identity, never request data.
export function createFirestorePersistence({sdk, db, namespace, actorUid, readRole, validatePlacement}) {
  identifier(actorUid);

  function paths(scope) {
    if (scope?.actorUid !== actorUid) throw fail('permission-denied', 'Actor does not match the client');
    const owner = identifier(scope.ownerUid);
    return (collection, id) => collection === 'operations'
      ? sdk.doc(db, namespace, owner, 'actors', actorUid, collection, identifier(id))
      : sdk.doc(db, namespace, owner, collection, identifier(id));
  }

  async function authorize(tx, scope, write) {
    if (scope.ownerUid === actorUid) return;
    const role = await readRole?.({transaction: tx, scope});
    if (role === 'editor' || (!write && role === 'viewer')) return;
    throw fail('permission-denied', 'The profile has insufficient access');
  }

  async function transaction(scope, access, run) {
    scope = Object.freeze({...scope});
    const ref = paths(scope);
    return sdk.runTransaction(db, async tx => {
      if (access !== null) await authorize(tx, scope, access);
      return run(tx, ref);
    });
  }

  function read(type, {scope, id}) {
    return transaction(scope, false, async (tx, ref) => {
      const document = (await tx.get(ref('documents', id))).data();
      if (document?.type !== type) throw fail('not-found', 'Document not found');
      validateDocument(document);
      return document;
    });
  }

  return {
    readProject: request => read('project', request),
    readModel: request => read('model', request),
    async write({scope, document: input, expectedRevision, operationId}) {
      scope = Object.freeze({...scope});
      paths(scope);
      identifier(operationId);
      const document = JSON.parse(JSON.stringify(validateDocument(input)));
      if ((expectedRevision === null && document.revision !== 1) ||
          (expectedRevision !== null && (!Number.isSafeInteger(expectedRevision) ||
            expectedRevision < 1 || document.revision !== expectedRevision + 1))) {
        throw fail('revision-conflict', 'Candidate revision does not match the expected revision');
      }
      const signature = await fingerprint(document, expectedRevision);
      const checkReceipt = value => {
        if (value.actorUid !== actorUid || (value.signature !== undefined && value.signature !== signature)) {
          throw fail('operation-conflict', 'Operation ID belongs to another request');
        }
        return value;
      };
      let reserved = false;
      const execution = async () => {
        const receipt = await transaction(scope, true, async (tx, ref) => {
          const op = ref('operations', operationId);
          const journal = ref('pending', actorUid);
          const existing = (await tx.get(op)).data();
          if (existing) return checkReceipt(existing);
          const prior = (await tx.get(journal)).data();
          if (prior && prior.operationId !== operationId) throw fail('reconciliation-required', 'Resolve the outstanding operation');
          const entry = {status: 'pending', actorUid, signature};
          tx.set(op, entry);
          tx.set(journal, {operationId});
          return entry;
        });
        if (receipt.status !== 'pending') return receipt;
        reserved = true;
        return transaction(scope, true, async (tx, ref) => {
          const op = ref('operations', operationId);
          const journal = ref('pending', actorUid);
          const current = checkReceipt((await tx.get(op)).data());
          if (current.status !== 'pending') return current;
          const documentRef = ref('documents', document.id);
          const nameRef = ref('names', document.nameKey);
          const previous = (await tx.get(documentRef)).data();
          const claim = (await tx.get(nameRef)).data();
          const validPlacement = await validatePlacement?.({transaction: tx, scope, document});
          let code;
          if (validPlacement === false) code = 'folder-not-found';
          else if (expectedRevision === null ? !!previous : previous?.revision !== expectedRevision) code = 'revision-conflict';
          else if (previous && (previous.nameKey !== document.nameKey || previous.type !== document.type ||
            previous.folderId !== document.folderId)) code = 'invalid-update';
          else if (claim && claim.id !== document.id) code = 'name-conflict';
          if (code) {
            const rejected = {...current, status: 'not-committed', code};
            tx.set(op, rejected);
            tx.delete(journal);
            return rejected;
          }
          const committed = {...current, status: 'committed', id: document.id, revision: document.revision};
          tx.set(documentRef, document);
          tx.set(nameRef, {id: document.id});
          tx.set(op, committed);
          return committed;
        });
      };
      let result;
      try {
        result = await execution();
      } catch (error) {
        if (!reserved && error instanceof AdapterError && ['permission-denied', 'operation-conflict', 'reconciliation-required'].includes(error.code)) throw error;
        throw fail('unknown-outcome', 'Check the operation before retrying');
      }
      if (result.status !== 'committed') throw fail(result.code ?? 'not-committed', 'Write was rejected');
      return {id: result.id, revision: result.revision};
    },
    pending({scope}) {
      return transaction(scope, null, async (tx, ref) => (await tx.get(ref('pending', actorUid))).data() ?? null);
    },
    acknowledge({scope, operationId}) {
      return transaction(scope, null, async (tx, ref) => {
        const op = (await tx.get(ref('operations', operationId))).data();
        const journal = ref('pending', actorUid);
        const pending = (await tx.get(journal)).data();
        if (op?.actorUid !== actorUid || op.status !== 'committed') throw fail('operation-conflict', 'Write is not confirmed');
        if (pending?.operationId === operationId) tx.delete(journal);
      });
    },
    async reconcile({scope, operationId, document, expectedRevision}) {
      scope = Object.freeze({...scope});
      paths(scope);
      const signature = document && await fingerprint(document, expectedRevision);
      try {
        return await transaction(scope, null, async (tx, ref) => {
          const op = ref('operations', operationId);
          const journal = ref('pending', actorUid);
          const existing = (await tx.get(op)).data();
          const pending = (await tx.get(journal)).data();
          // An existing receipt grants only control over that actor's operation in this owner namespace.
          // Fencing an operation that has not been reserved still requires document write access.
          if (!existing) await authorize(tx, scope, true);
          if (existing && (existing.actorUid !== actorUid ||
            (signature && existing.signature && signature !== existing.signature))) {
            throw fail('operation-conflict', 'Cannot reconcile another operation');
          }
          if (existing && !['committed', 'pending', 'not-committed'].includes(existing.status)) {
            throw fail('unknown-outcome', 'Unrecognized operation state');
          }
          if (existing?.status === 'committed') {
            return {status: 'committed', id: existing.id, revision: existing.revision};
          }
          // A tombstone on the same document fences both delayed reservation and delayed commit.
          if (!existing || existing.status === 'pending') {
            tx.set(op, {...existing, actorUid, status: 'not-committed'});
          }
          if (pending?.operationId === operationId) tx.delete(journal);
          return {status: 'not-committed'};
        });
      } catch (error) {
        if (['permission-denied', 'operation-conflict'].includes(error.code)) throw error;
        throw fail('unknown-outcome', 'Could not establish the outcome of the operation');
      }
    },
  };
}
