const assert = require('node:assert/strict');
const {openKitchen} = require('./browser-harness.cjs');

(async () => {
  const e2e = process.env.NEDIQ_EMULATOR_E2E === '1';
  const {browser, page, errors, field} = await openKitchen({extraHooks: `
    window.__realEditorPorts = {
      capture: captureProjectSnapshot,
      title(name) { $('projectTitle').value = name; $('projectName').value = name; },
      apply(snapshot) {
        if (window.__failRendererOnce) {
          window.__failRendererOnce = false;
          clearWorkspace();
          throw Error('Injected renderer failure');
        }
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
  let backend;
  try {
    await page.locator('#modeProject').click();
    let tokens;
    if (e2e) {
      const {createEmulatorBackend} = await import('./emulator/workspace-rc-backend.mjs');
      const {fixtureDocuments} = await import('./fixtures/workspace-real-editor.mjs');
      const {folders} = await import('./fixtures/workspace-real-store.mjs');
      backend = await createEmulatorBackend();
      const {createWorkspaceHttpHandler} = await import('../release-candidate/http.mjs');
      const origin = new URL(process.env.KITCHEN_TEST_URL).origin;
      const handler = createWorkspaceHttpHandler({dispatch: backend.service, allowedOrigins: [origin]});
      tokens = {};
      for (const owner of ['alpha', 'beta']) {
        tokens[owner] = await backend.identity(owner);
        const batch = backend.db.batch();
        batch.set(backend.db.doc('workspace_v3/' + owner + '/settings/folders'), {folders, revision: 1});
        for (const fixture of fixtureDocuments()) {
          batch.set(backend.db.doc('workspace_v3/' + owner + '/documents/' + fixture.id), fixture);
          batch.set(backend.db.doc('workspace_v3/' + owner + '/names/' + fixture.nameKey), {id: fixture.id});
        }
        await batch.commit();
      }
      await page.route('**/workspace-rc-rpc', async route => {
        const request = route.request();
        const headers = {...request.headers(), origin};
        const result = await handler(new Request(request.url(), {
          method: request.method(), body: request.postData(), headers,
        }));
        await route.fulfill({status: result.status, headers: Object.fromEntries(result.headers),
          body: await result.text()});
      });
    }
    await page.evaluate(async tokens => {
      const {fixtureDocuments, mountRealEditor} = await import('/tests/fixtures/workspace-real-editor.mjs');
      if (!tokens) {
        window.__integration = mountRealEditor(window.__realEditorPorts);
        return;
      }
      const {mountWorkspaceEditor} = await import('/release-candidate/editor.mjs');
      const {createWorkspaceClient, createWorkspaceHttpClient} = await import('/release-candidate/client.mjs');
      const {createWorkspaceDraftAdapter} = await import('/workspace-persistence/drafts.mjs');
      const {readLegacyCabinet, readLegacyProject} = await import('/document-format/legacy.mjs');
      const {documentToSnapshot} = await import('/workspace-ui/scene-adapter.mjs');
      const connection = {};
      const [legacyProjectSource, legacyModelSource] = fixtureDocuments();
      const oldProject = {schemaVersion: 1, revision: 3, name: 'Стара кухня',
        data: documentToSnapshot(legacyProjectSource).snapshot};
      const oldModel = {id: 'lower-model', v2: true, name: 'Контролен шкаф', category: 'Долен шкаф',
        ...documentToSnapshot(legacyModelSource).snapshot};
      const oldDocuments = structuredClone([oldProject, oldModel]);
      const http = createWorkspaceHttpClient({endpoint: '/workspace-rc-rpc', getIdToken: scope => tokens[scope.actorUid]});
      const store = createWorkspaceClient(async (operation, request) => {
        if (operation === 'pending' && connection.offline === request.scope.ownerUid) throw Error('Journal offline');
        if (operation === 'legacyBases') return [
          {id: request.scope.actorUid, name: 'Моята библиотека v2.95', role: 'owner'},
          ...(request.scope.actorUid === 'beta' ? [{id: 'legacy-owner', name: 'Споделена стара база', role: 'editor'}] : []),
        ];
        if (operation === 'legacyList') return {folders: [{id: 'wardrobes', label: 'Гардероби'}, {id: 'lower', label: 'Долен шкаф'}],
          documents: [{id: 'v2-project', type: 'project', name: 'Стара кухня', requiresCatalog: false},
            {id: 'lower-model', type: 'model', name: 'Контролен шкаф', folderId: 'lower', requiresCatalog: true}],
          catalogs: [{id: '', name: 'Вградена стандартна база'}, {id: 'v2-old-base', name: 'Оригинална база 2.96'}]};
        if (operation === 'legacyRead') return request.type === 'project'
          ? readLegacyProject(oldProject, {scope: request.legacyOwnerId, id: request.id})
          : readLegacyCabinet(oldModel, {scope: request.legacyOwnerId, id: request.id,
            catalog: documentToSnapshot(legacyModelSource).snapshot.materials, folderId: request.folderId});
        const result = await http[operation](request);
        if (operation === 'write' && connection.dropAcknowledgement) {
          connection.dropAcknowledgement = false;
          throw Object.assign(new Error('Lost acknowledgement'), {code: 'unknown-outcome'});
        }
        if (operation === 'readProject' && connection.invalidProject === request.id) result.settings.unsupported = true;
        return result;
      });
      const profiles = [['alpha', 'Алфа'], ['beta', 'Бета']].map(([uid, label]) =>
        ({scope: {ownerUid: uid, actorUid: uid}, label}));
      window.__integration = {...mountWorkspaceEditor(window.__realEditorPorts, {store, profiles,
        initialScope: profiles[0].scope, startingDocument: fixtureDocuments()[0],
        drafts: createWorkspaceDraftAdapter(localStorage), legacy: true}), store, connection,
        legacySources: oldDocuments};
    }, tokens);
    const status = page.locator('#integration-status');
    const settled = () => page.waitForFunction(() => window.__integration.bridge.state.canAct);
    const snapshot = () => page.evaluate(() => window.__realEditorPorts.capture());
    const state = () => page.evaluate(() => window.__integration.bridge.state);
    const partCount = count => page.waitForFunction(count => window.__test.parts().length === count, count);
    const libraryButton = page.getByRole('button', {name: 'Обща библиотека', exact: true});
    const fitsSupportedWidths = async dialog => {
      for (const width of [1400, 900, 390, 320]) {
        await page.setViewportSize({width, height: 820});
        const bounds = await dialog.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
          `Dialog must fit within ${width}px`);
      }
      await page.setViewportSize({width: 1400, height: 1000});
    };
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
    assert.match(await page.locator('#groupList').textContent(), /Корпус/);
    assert.match(await page.locator('#groupList').textContent(), /Рафтова група/);
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
    await page.getByRole('dialog', {name: 'Име и папка'}).getByLabel('Папка', {exact: true}).selectOption({label: 'Проекти'});
    await page.getByRole('dialog').getByRole('button', {name: 'Запази', exact: true}).click();
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.name === 'Тестово копие');
    await settled();
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
    if (e2e) {
      const beforeMigrationScene = await snapshot();
      const beforeV3Documents = await page.evaluate(async () => {
        const {scope} = window.__integration.bridge.state;
        return (await window.__integration.store.list({scope})).documents;
      });
      const originalV2Documents = await page.evaluate(() => window.__integration.legacySources);
      await libraryButton.click();
      await page.getByRole('button', {name: 'Документи v2.95…', exact: true}).click();
      await page.getByRole('button', {name: 'Моята библиотека v2.95 · Собственик', exact: true}).click();
      await page.getByRole('button', {name: 'Мигрирай всички мои документи в v3…', exact: true}).click();
      const migrationOptions = page.getByRole('dialog', {name: 'Подготовка на миграция'});
      await migrationOptions.getByLabel('Целева папка във v3', {exact: true}).waitFor();
      await migrationOptions.getByRole('button', {name: 'Създай папка „Импорт от v2.95“', exact: true}).waitFor();
      await fitsSupportedWidths(migrationOptions);
      await migrationOptions.getByLabel('Целева папка във v3', {exact: true}).selectOption('shelves');
      await migrationOptions.getByLabel('Оригинална материална база · Контролен шкаф').selectOption({label: 'Оригинална база 2.96'});
      await page.getByRole('button', {name: 'Провери съвместимостта', exact: true}).click();
      await fitsSupportedWidths(page.getByRole('dialog', {name: /Проверка на миграция/}));
      await page.getByRole('button', {name: 'Мигрирай 2 съвместими документа', exact: true}).click();
      const migrationReport = page.getByRole('dialog', {name: 'Отчет за миграцията'});
      await migrationReport.getByText(/Добавени: 2/).waitFor();
      await fitsSupportedWidths(migrationReport);
      assert.deepEqual(await snapshot(), beforeMigrationScene);
      assert.deepEqual(await page.evaluate(() => window.__integration.legacySources), originalV2Documents);
      const afterV3Documents = await page.evaluate(async () => {
        const {scope} = window.__integration.bridge.state;
        return (await window.__integration.store.list({scope})).documents;
      });
      assert.equal(afterV3Documents.length, beforeV3Documents.length + 2);
      await page.getByRole('button', {name: 'Затвори', exact: true}).click();

      await page.evaluate(() => {
        if (!window.__migrationLegacyList) window.__migrationLegacyList = window.__integration.store.legacyList;
        window.__integration.store.legacyList = async () => ({
          folders: [{id: 'wardrobes', label: 'Гардероби'}, {id: 'lower', label: 'Долен шкаф'}],
          documents: Array.from({length: 18}, (_, index) => ({
            id: `long-list-model-${index + 1}`,
            type: 'model',
            name: `Много шкафове ${index + 1}`,
            folderId: 'lower',
            requiresCatalog: true,
          })),
          catalogs: [
            {id: 'catalog-a', name: 'Материална база А'},
            {id: 'catalog-b', name: 'Материална база Б'},
            {id: 'catalog-c', name: 'Материална база В'},
          ],
        });
      });
      await page.setViewportSize({width: 320, height: 820});
      await libraryButton.click();
      await page.getByRole('button', {name: 'Документи v2.95…', exact: true}).click();
      await page.getByRole('button', {name: 'Моята библиотека v2.95 · Собственик', exact: true}).click();
      await page.getByRole('button', {name: 'Мигрирай всички мои документи в v3…', exact: true}).click();
      const longMigration = page.getByRole('dialog', {name: 'Подготовка на миграция'});
      await longMigration.waitFor();
      const longList = longMigration.locator('.migrationCatalogList');
      await longList.evaluate(node => { node.scrollTop = node.scrollHeight; });
      await longMigration.getByLabel('Целева папка във v3', {exact: true}).waitFor();
      await longMigration.getByRole('button', {name: 'Създай папка „Импорт от v2.95“', exact: true}).waitFor();
      await longMigration.getByRole('button', {name: 'Провери съвместимостта', exact: true}).waitFor();
      assert.ok(await longMigration.evaluate(node => {
        const bounds = node.getBoundingClientRect();
        return bounds.x >= 0 && bounds.x + bounds.width <= 321;
      }));
      const catalogScroll = await longList.evaluate(node => ({
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
        childCount: node.querySelectorAll('label').length,
      }));
      assert.ok(catalogScroll.scrollHeight > catalogScroll.clientHeight,
        `Catalog list must scroll: ${JSON.stringify(catalogScroll)}`);
      await page.keyboard.press('Escape');
      await page.evaluate(() => {
        window.__integration.store.legacyList = window.__migrationLegacyList;
      });
      await page.setViewportSize({width: 1400, height: 1000});

      await libraryButton.click();
      const importedLibrary = page.getByRole('dialog', {name: 'Обща библиотека'});
      await importedLibrary.getByLabel('Папка').selectOption('system:projects');
      await importedLibrary.getByRole('button', {name: 'Отвори проект · Стара кухня', exact: true}).click();
      await partCount(2);
      await settled();
      const migratedProject = await state();
      assert.match(migratedProject.workspace.document.id, /^legacy:v1:/);
      assert.equal(migratedProject.workspace.document.name, 'Стара кухня');
      await libraryButton.click();
      const modelLibrary = page.getByRole('dialog', {name: 'Обща библиотека'});
      await modelLibrary.getByLabel('Папка').selectOption('shelves');
      await modelLibrary.getByRole('button', {name: 'Добави модел · Контролен шкаф', exact: true}).click();
      await page.waitForFunction(() => window.__test.parts().length === 3 ||
        window.__integration.bridge.state.error);
      assert.equal((await state()).error?.message ?? null, null);
      await settled();
      await page.locator('#undoStep').evaluate(button => button.click());
      await partCount(2);
      await settled();
      assert.equal((await state()).workspace.document.id, migratedProject.workspace.document.id);
      assert.equal((await state()).workspace.dirty, false);
      await libraryButton.click();
      const importedLibraryAgain = page.getByRole('dialog', {name: 'Обща библиотека'});
      await importedLibraryAgain.getByLabel('Папка').selectOption('system:projects');
      await importedLibraryAgain.getByRole('button', {name: 'Отвори проект · Стара кухня', exact: true}).waitFor();
      await page.keyboard.press('Escape');
    }
    if (e2e) {
      await libraryButton.click();
      await page.getByRole('button', {name: 'Документи v2.95…', exact: true}).click();
      await page.getByRole('button', {name: 'Моята библиотека v2.95 · Собственик', exact: true}).waitFor();
      assert.equal(await page.getByRole('button', {name: /Споделена стара база/}).count(), 0);
      await page.keyboard.press('Escape');
    }
    await page.evaluate(() => { window.__integration.connection.offline = 'beta'; });
    await page.getByLabel('Тестов профил').selectOption('beta');
    await page.waitForFunction(() => window.__integration.bridge.state.gate === 'journal-blocked');
    assert.equal((await state()).scope.ownerUid, 'alpha');
    await page.evaluate(() => { window.__integration.connection.offline = null; });
    await page.getByRole('button', {name: 'Провери журнала'}).click();
    await settled();
    await partCount(0);
    assert.equal((await state()).scope.ownerUid, 'beta');
    if (e2e) {
      const beforeRendererFailure = await state();
      await page.evaluate(() => { window.__failRendererOnce = true; });
      await open('Отвори проект · Контролна кухня');
      await page.waitForFunction(() => window.__integration.bridge.state.error?.message.includes('Injected renderer failure'));
      const afterFailure = (await state()).workspace;
      for (const key of ['document', 'dirty', 'canUndo', 'canRedo']) {
        assert.deepEqual(afterFailure[key], beforeRendererFailure.workspace[key]);
      }
      await partCount(0);
      await libraryButton.click();
      await page.getByRole('button', {name: 'Нова папка', exact: true}).click();
      await page.getByRole('textbox', {name: 'Име на папката'}).fill('Емулаторна папка');
      await page.getByRole('dialog', {name: 'Наименование'}).getByRole('button', {name: 'Запази'}).click();
      const openDialog = page.getByRole('dialog', {name: 'Обща библиотека'});
      await openDialog.locator('option', {hasText: 'Емулаторна папка'}).waitFor({state: 'attached'});
      await page.keyboard.press('Escape');
      await openDialog.waitFor({state: 'detached'});
    }
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
    await page.getByRole('dialog', {name: 'Име и папка'}).getByLabel('Папка', {exact: true}).selectOption({label: 'Проекти'});
    await page.getByRole('dialog').getByRole('button', {name: 'Запази', exact: true}).click();
    await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.name === 'Първи запис');
    assert.equal((await state()).workspace.document.revision, 1);
    if (e2e) {
      await libraryButton.click();
      await page.getByRole('button', {name: 'Документи v2.95…', exact: true}).click();
      await page.getByRole('button', {name: 'Моята библиотека v2.95 · Собственик', exact: true}).waitFor();
      await page.getByRole('button', {name: 'Споделена стара база · Редактор', exact: true}).click();
      const legacyFolder = page.getByLabel('Папка v2.95', {exact: true});
      await legacyFolder.selectOption({label: 'Гардероби'});
      assert.equal(await page.getByRole('button', {name: 'Добави модел · Контролен шкаф'}).count(), 0);
      await legacyFolder.selectOption({label: 'Долен шкаф'});
      await page.getByRole('button', {name: 'Добави модел · Контролен шкаф'}).waitFor();
      await legacyFolder.selectOption('');
      await page.getByRole('button', {name: 'Отвори проект · Стара кухня', exact: true}).click();
      await partCount(2);
      await settled();
      assert.equal((await state()).workspace.document.id, null);
      await page.keyboard.press('Control+s');
      await page.getByRole('textbox', {name: 'Име на документа'}).fill('Лично v3 копие');
      await page.getByRole('dialog', {name: 'Име и папка'}).getByLabel('Папка', {exact: true}).selectOption({label: 'Проекти'});
      await page.getByRole('dialog', {name: 'Име и папка'}).getByRole('button', {name: 'Запази', exact: true}).click();
      await page.waitForFunction(() => window.__integration.bridge.state.workspace.document.name === 'Лично v3 копие');
      const copied = (await state()).workspace.document;
      assert.ok(copied.id && copied.id !== 'v2-project');
      assert.equal(copied.revision, 1);
    }
    assert.deepEqual(errors, []);
    console.log('PASS real renderer with schema 1, reports, 750 parts and profile journal' +
      (e2e ? ' using Auth and Firestore Emulators' : ' using a fixture port'));
  } finally {
    await browser.close();
    await backend?.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
