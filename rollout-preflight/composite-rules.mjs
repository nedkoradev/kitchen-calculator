import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

const header = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n";
const footer = '  }\n}\n';
const anchor = '  // This does not override other allows; keep the matches above narrowly scoped.\n';
export const start = '  // BEGIN proposed v3 workspace (review before activation)\n';
export const end = '  // END proposed v3 workspace\n';

export function composeRules(legacy, proposal) {
  if (!legacy.startsWith("rules_version = '2';") || legacy.split(anchor).length !== 2 || legacy.includes(start)) {
    throw new Error('Legacy rules changed at the insertion point; review the composition');
  }
  if (!proposal.startsWith(header) || !proposal.endsWith(footer)) throw new Error('Unexpected proposal wrapper');
  const body = proposal.slice(header.length, -footer.length);
  if (!body.includes('match /workspace_v3/{owner}') || body.includes('match /users/') || body.includes('{document=**}')) {
    throw new Error('Unexpected matches in the proposal');
  }
  return legacy.replace(anchor, start + body + end + '\n' + anchor);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [legacy, proposal] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../tests/emulator/workspace-v3.rules', import.meta.url), 'utf8'),
  ]);
  process.stdout.write(composeRules(legacy, proposal));
}
