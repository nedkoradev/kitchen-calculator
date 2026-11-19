const assert = require('node:assert/strict');
const {chromium} = require('playwright');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.KITCHEN_TEST_URL || 'http://127.0.0.1:8000/';
    const testPage = new URL('workspace-controller-fixture.html', base).href;
    await page.route(testPage, route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Workspace integration</title>'}));
    await page.goto(testPage);
    const result = await page.evaluate(async () => {
      const {createWorkspaceController} = await import('./workspace-context/editor-controller.mjs');
      const {createWorkspaceDraftAdapter} = await import('./workspace-persistence/drafts.mjs');
      const catalog = {pdcMaterials: [{name: 'Oak', textureUrl: 'oak.png'}],
        backMaterials: [], worktops: [], edgeMaterials: [{name: 'Oak edge'}]};
      const room = {w: 3000, h: 2500, d: 3000};
      const panel = i => ({part: {key: 'panel-' + i, x: (i % 50) * 40 - 1000, y: 20,
        z: Math.floor(i / 50) * 40, w: 20, h: 40, d: 20, assembly: 'group'},
        finish: {material: 0, grainAxis: 'y', edges: [0, null, null, 0]}});
      const project = {schemaVersion: 1, id: 'project', revision: 3, type: 'project',
        name: 'Project', nameKey: 'project', room, folderId: 'system:projects', settings: {},
        materials: catalog, groups: {group: 'Group'}, parts: Array.from({length: 750}, (_, i) => panel(i))};
      const model = {...project, id: 'model', type: 'model', folderId: null, room: null, parts: [panel(0)]};
      let action = 'cancel';
      let fail = true;
      const options = {
        scope: {ownerUid: 'test-owner', actorUid: 'test-editor'},
        drafts: createWorkspaceDraftAdapter(localStorage),
        confirmDiscard: () => ({action}),
        persistence: {
          readModel: async () => model,
          readProject: async () => project,
          write: async ({document}) => {
            if (fail) throw new Error('isolated write failure');
            return {id: document.id, revision: document.revision};
          },
        },
      };
      const timings = {};
      const measure = async (key, command) => {
        const start = performance.now();
        const output = await command();
        timings[key] = +(performance.now() - start).toFixed(1);
        return output;
      };
      const editor = createWorkspaceController(options);
      await measure('openMs', () => editor.openProject('project'));
      await measure('editMs', () => editor.editScene({settings: {sheetUtilization: 75}}));
      await measure('undoMs', () => editor.undo());
      await measure('redoMs', () => editor.redo());
      const restored = await measure('restoreMs', () => createWorkspaceController(options));
      const isolated = createWorkspaceController({...options, scope: {...options.scope, actorUid: 'other-editor'}});
      const otherProfileEmpty = isolated.state.draftStatus === 'empty';
      const draftRestored = restored.state.dirty && restored.state.document.parts.length === 750 && restored.state.canUndo;
      const cancelled = await editor.newDocument();
      action = 'save';
      let retainedAfterFailure = false;
      try {
        await editor.newDocument();
      } catch (error) {
        retainedAfterFailure = editor.state.dirty && editor.state.document.parts.length === 750 && editor.state.error.phase === 'saving';
      }
      fail = false;
      await editor.newDocument();
      await editor.insertModel('model');
      const copied = editor.state.document;
      action = 'discard';
      await editor.openProject('project');
      return {timings, draftRestored, otherProfileEmpty, cancelled, retainedAfterFailure,
        copy: {id: copied.id, room: copied.room, parts: copied.parts.length, group: Object.values(copied.groups)[0],
          texture: copied.materials.pdcMaterials[0].textureUrl, edges: copied.parts[0].finish.edges},
        opened: {id: editor.state.document.id, count: editor.state.document.parts.length, dirty: editor.state.dirty}};
    });
    assert.equal(result.draftRestored, true);
    assert.equal(result.otherProfileEmpty, true);
    assert.equal(result.cancelled, false);
    assert.equal(result.retainedAfterFailure, true);
    assert.deepEqual(result.copy, {id: null, room: {w: 3000, h: 2600, d: 3000}, parts: 1,
      group: 'Group', texture: 'oak.png', edges: [0, null, null, 0]});
    assert.deepEqual(result.opened, {id: 'project', count: 750, dirty: false});
    assert.deepEqual(errors, []);
    console.log('PASS isolated Chromium workspace controller, 750 panels, timings (ms):', result.timings);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
