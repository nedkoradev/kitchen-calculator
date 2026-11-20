const methods = ['readProject', 'readModel', 'write', 'pending', 'reconcile', 'acknowledge', 'list', 'changeFolder', 'legacyBases', 'legacyList', 'legacyRead'];

export function createWorkspaceClient(invoke) {
  return Object.fromEntries(methods.map(operation => [operation, request => invoke(operation, request)]));
}

export function createWorkspaceHttpClient({endpoint, getIdToken, fetch: fetchRequest = globalThis.fetch}) {
  return createWorkspaceClient(async (operation, request) => {
    const token = await getIdToken(request.scope);
    let payload;
    try {
      const response = await fetchRequest(endpoint, {method: 'POST',
        headers: {'content-type': 'application/json', authorization: 'Bearer ' + token},
        body: JSON.stringify({operation, request})});
      if (response.status >= 500) throw new Error('Endpoint unavailable');
      payload = await response.json();
      if (!Object.hasOwn(payload, 'result') && !payload.error?.code) throw new Error('Invalid response');
    } catch {
      throw Object.assign(new Error('Workspace request was not confirmed'),
        {code: operation === 'write' ? 'unknown-outcome' : 'unavailable'});
    }
    if (payload.error) throw Object.assign(new Error(payload.error.message ?? payload.error.code), {code: payload.error.code});
    return payload.result;
  });
}
