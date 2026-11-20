import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Pilot settings exposes non-destructive standard folder restoration and manager', async () => {
  const editor = await readFile(new URL('../release-candidate/editor.mjs', import.meta.url), 'utf8');
  for (const name of ['Горни шкафове', 'Долни шкафове', 'Гардероби', 'Спални', 'Комоди', 'Електроуреди'])
    assert.ok(editor.includes(name));
  assert.match(editor, /existing\.has\(name\.toLocaleLowerCase\('bg'\)\)/);
  assert.match(editor, /store\.changeFolder\(\{scope, revision,/);
  assert.match(editor, /Управление на папките/);
  assert.match(editor, /settingsSections\.append\(section\)/);
  assert.match(editor, /form\.className = 'pilotSaveFolderForm'/);
});
test('Pilot save form is vertical with full-width name and folder controls', async () => {
  const css = await readFile(new URL('../release-candidate/panels.css', import.meta.url), 'utf8');
  assert.match(css, /\.pilotSaveFolderForm\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.pilotSaveFolderForm > label\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.pilotSaveFolderForm > label > :is\(input, select\)/);
});
