// Hosting binds this handler to the chosen HTTPS endpoint after approval.
export function createWorkspaceHttpHandler({dispatch, allowedOrigins}) {
  const origins = new Set(allowedOrigins);
  return async function handle(request) {
    const origin = request.headers.get('origin');
    if (!origins.has(origin)) return new Response(null, {status: 403});
    const headers = {'access-control-allow-origin': origin, vary: 'Origin', 'cache-control': 'no-store'};
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...headers,
      'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'authorization, content-type'}});
    const reply = (body, status = 200) => Response.json(body, {status, headers});
    if (request.method !== 'POST') return reply({error: {code: 'invalid-method'}}, 405);
    const authorization = request.headers.get('authorization');
    if (!authorization?.startsWith('Bearer ')) return reply({error: {code: 'permission-denied'}}, 401);
    let input;
    try {
      const reader = request.body?.getReader();
      const chunks = [];
      let size = 0;
      while (reader) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 900_000) {
          await reader.cancel();
          return reply({error: {code: 'document-too-large'}}, 413);
        }
        chunks.push(value);
      }
      input = JSON.parse(await new Blob(chunks).text());
    } catch {
      return reply({error: {code: 'invalid-request'}}, 400);
    }
    try {
      const result = await dispatch({token: authorization.slice(7), operation: input.operation, request: input.request});
      return reply({result: result ?? null});
    } catch (error) {
      // Infrastructure errors and token-verifier details are kept off the wire.
      const code = typeof error.code === 'string' && !error.code.includes('/') ? error.code : 'workspace-error';
      const message = error instanceof TypeError || error.path ? error.message : code;
      return reply({error: {code, message}});
    }
  };
}
