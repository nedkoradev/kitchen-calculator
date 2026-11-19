const assert = require('node:assert/strict');
const {openKitchen} = require('./browser-harness.cjs');

(async () => {
  const {browser, page, errors, field} = await openKitchen({extraHooks: `
    window.__realEditorPorts = {
      capture: captureProjectSnapshot,
      title(name) { $('projectTitle').value = name; $('projectName').value = name; },
      apply(snapshot) {
        applyProjectSnapshot(snapshot, {preserveIdentity: true});
        syncDocumentCounters();
        build(false);
        updateSelection();
        refreshGroupList();
      },
      onChange(listener) {
        const renderScene = build;
        build = (...args) => { const result = renderScene(...args); listener(); return result; };
      },
      frameMode: () => viewMode,
      group() { createAssembly(); }
    };
  `});
  try {
    await page.locator('#modeProject').click();
    await page.evaluate(async () => {
      const {mountRealEditor} = await import('/tests/fixtures/workspace-real-editor.mjs');
      window.__integration = mountRealEditor(window.__realEditorPorts);
    });
    const status = page.locator('#integration-status');
    const settled = () => page.waitForFunction(() => window.__integration.bridge.state.canAct);
    const snapshot = () => page.evaluate(() => window.__realEditorPorts.capture());
    const state = () => page.evaluate(() => window.__integration.bridge.state);
    const partCount = count => page.waitForFunction(count => window.__test.parts().length === count, count);
    const libraryButton = page.getByRole('button', {name: 'Обща библиотека', exact: true});
    const open = async (label, folder) => {
      await libraryButton.click();
      const library = page.getByRole('dialog', {name: 'Обща библиотека'});
      if (folder) await library.getByLabel('Папка').selectOption(folder);
      await library.getByRole('button', {name: label, exact: true}).click();
    };
    await settled();
    await open('Отвори проект · Контролна кухня');
    await partCount(2);
    await settled();
    const original = await snapshot();
    assert.equal((await state()).workspace.document.id, 'test-project');
    assert.deepEqual(original.assemblyNames, {outer: 'Корпус', inner: 'Рафтова група'});
    assert.equal(original.parts[0].finish.grainAxis, 'x');
    assert.match(original.materials.pdcMaterials[0].textureUrl, /дъб/);
    assert.ok(await page.locator('#view canvas').count());
    assert.equal(await page.evaluate(() => window.__realEditorPorts.frameMode()), 'front');
    await page.evaluate(() => window.__test.view('perspective'));
    assert.equal(await page.evaluate(() => window.__realEditorPorts.frameMode()), 'perspective');

    await page.locator('#reportsMenu summary').click();
    await page.locator('#navCut').click();
    assert.match(await page.locator('#projectCutList tbody').innerText(), /600 × 400 мм/);
    await page.locator('#reportsMenu summary').click();
    await page.locator('#navCosts').click();
    assert.match(await page.locator('#projectCosts tbody').innerText(), /27\.00 €/);
    await page.locator('#tabProject3d').evaluate(button => button.click());

    await page.evaluate(() => window.__test.select('custom101', true));
    await field('partW', 640);
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.parts[0].part.w === 640);
    await page.locator('#materialSelect').evaluate(select => {
      select.value = '1';
      select.dispatchEvent(new Event('change', {bubbles: true}));
    });
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.parts[0].finish.material === 1);
    await page.evaluate(() => { window.__test.selectKeys(['custom101', 'custom102']); window.__realEditorPorts.group(); });
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.parts[0].part.assembly !== 'outer');
    await page.keyboard.press('Control+z');
    await page.waitForFunction(() => window.__test.parts()[0].assembly === 'outer');
    await page.keyboard.press('Control+Shift+z');
    await page.waitForFunction(() => window.__test.parts()[0].assembly !== 'outer');

    await open('Добави модел · Библиотечен рафт', 'shelves');
    await partCount(3);
    const inserted = await snapshot();
    assert.deepEqual(inserted.room, original.room);
    assert.notEqual(inserted.parts[2].part.key, 'custom103');
    assert.notEqual(inserted.parts[2].part.assembly, 'outer');
    assert.equal((await state()).workspace.document.id, 'test-project');

    await page.keyboard.press('Control+n');
    await page.getByRole('dialog', {name: 'Незаписани промени'}).waitFor();
    await page.keyboard.press('Escape');
    await settled();
    assert.equal((await snapshot()).parts.length, 3);
    await page.keyboard.press('Control+Shift+s');
    await page.getByRole('textbox', {name: 'Име на документа'}).fill('Тестово копие');
    await page.getByRole('dialog').getByRole('button', {name: 'Запази', exact: true}).click();
    await page.getByRole('dialog', {name: 'Папка за новия запис'}).getByRole('button', {name: 'Проекти'}).click();
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.name === 'Тестово копие');
    const saved = await state();
    assert.notEqual(saved.workspace.document.id, 'test-project');
    assert.equal(saved.workspace.document.revision, 1);

    await field('roomWidth', 3400);
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.room.w === 3400);
    await page.evaluate(() => { window.__integration.connection.dropAcknowledgement = true; });
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => window.__integration.bridge.state.gate === 'journal-blocked');
    assert.equal((await snapshot()).room.w, 3400);
    await page.getByRole('button', {name: 'Провери журнала'}).click();
    await settled();
    assert.match(await status.innerText(), /Сверен запис/);
    assert.equal((await state()).workspace.document.revision, 2);
    const beforeInvalid = (await state()).workspace;
    await page.evaluate(() => { window.__integration.connection.invalidProject = 'test-project'; });
    await open('Отвори проект · Контролна кухня');
    await page.waitForFunction(() => window.__integration.bridge.state.error?.message.includes('settings.unsupported'));
    assert.deepEqual((await state()).workspace.document, beforeInvalid.document);
    assert.equal((await state()).workspace.canUndo, beforeInvalid.canUndo);
    assert.equal((await snapshot()).room.w, 3400);
    await page.evaluate(() => { window.__integration.connection.invalidProject = null; });
    await page.evaluate(() => { window.__integration.connection.offline = 'beta'; });
    await page.getByLabel('Тестов профил').selectOption('beta');
    await page.waitForFunction(() => window.__integration.bridge.state.gate === 'journal-blocked');
    assert.equal((await state()).scope.ownerUid, 'alpha');
    await page.evaluate(() => { window.__integration.connection.offline = null; });
    await page.getByRole('button', {name: 'Провери журнала'}).click();
    await settled();
    await partCount(0);
    assert.equal((await state()).scope.ownerUid, 'beta');
    await open('Отвори проект · Кухня с 750 детайла');
    await partCount(750);
    await settled();
    assert.equal((await state()).workspace.document.parts.length, 750);
    for (const width of [1400, 900, 390, 320]) {
      await page.setViewportSize({width, height: 820});
      await libraryButton.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', {name: 'Обща библиотека'});
      await dialog.waitFor();
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'detached'});
    }
    await page.keyboard.press('Control+n');
    await partCount(0);
    await page.keyboard.press('Control+s');
    await page.getByRole('textbox', {name: 'Име на документа'}).fill('Първи запис');
    await page.getByRole('dialog').getByRole('button', {name: 'Запази', exact: true}).click();
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.name === 'Първи запис');
    assert.equal((await state()).workspace.document.revision, 1);
    assert.deepEqual(errors, []);
    console.log('PASS real v2.95 renderer with isolated schema 1 commands, reports, large scene, journal and profile');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
