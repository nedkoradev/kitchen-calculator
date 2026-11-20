import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Pilot folder menu uses authenticated v3 manifest rather than legacy categories', async () => {
  const source = await readFile(new URL('../release-candidate/editor.mjs', import.meta.url), 'utf8');
  assert.match(source, /const \{folders\} = await store\.list\(\{scope\}\)/);
  assert.match(source, /items\.replaceChildren\(\)/);
  assert.match(source, /openLibrary\(folderId\)/);
  assert.match(source, /selectedFolderId && folders\.some/);
  assert.match(source, /store\.changeFolder\(\{scope, change, revision\}\)/);
  assert.match(source, /\{folders, revision\} = await store\.list\(\{scope\}\)/);
});
