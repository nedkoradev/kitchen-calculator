import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cabinetPreviewSvg} from '../release-candidate/library-preview.mjs';

test('v3 library previews draw actual panel geometry as in v2.96', () => {
  const part = {x: 0, y: 300, z: 0, w: 600, h: 600, d: 18};
  const first = cabinetPreviewSvg([{part}]);
  const second = cabinetPreviewSvg([{part: {...part, w: 900}}]);
  assert.match(first, /<polygon/);
  assert.match(first, /viewBox="0 0 100 100"/);
  assert.notEqual(first, second);
  assert.match(cabinetPreviewSvg([]), /Няма изглед/);
});

test('v3 library loads authorized model/project previews with bounded reads and fallback', async () => {
  const browser = await readFile(new URL('../release-candidate/library-browser.mjs', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../release-candidate/editor.mjs', import.meta.url), 'utf8');
  assert.match(browser, /previewReads < 3/);
  assert.match(browser, /loadPreview\(item\)/);
  assert.match(browser, /\.catch\(\(\) => null\)/);
  assert.match(browser, /open\.querySelector\('\.actionSvg'\)\?\.remove\(\)/);
  assert.match(editor, /item\.type === 'project' \? store\.readProject : store\.readModel/);
  assert.match(editor, /bridge\.state\.scope\?\.actorUid !== scope\.actorUid/);
});

test('v3 reports share library-style selectable tabs', async () => {
  const panels = await readFile(new URL('../release-candidate/panels.mjs', import.meta.url), 'utf8');
  assert.match(panels, /element\('nav', 'pilotLibraryFolderBar'\)/);
  assert.match(panels, /button\.classList\.add\('pilotLibraryFolderTab'\)/);
  assert.match(panels, /button\.setAttribute\('aria-pressed', String\(type === kind\)\)/);
});
