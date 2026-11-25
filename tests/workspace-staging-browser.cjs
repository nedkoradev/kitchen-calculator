const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const {createEmulatorBackend} = await import('./emulator/workspace-rc-backend.mjs');
  const {startLocalStaging} = await import('../rollout-preflight/stage-server.mjs');
  const {fixtureDocuments} = await import('./fixtures/workspace-real-editor.mjs');
  const backend = await createEmulatorBackend();
  let stage, browser;
  try {
    await backend.identity('stage-pilot');
    const [fixture, model] = fixtureDocuments();
    const {folders} = await import('./fixtures/workspace-real-store.mjs');
    await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).set(fixture);
    await backend.db.doc('workspace_v3/stage-pilot/names/' + fixture.nameKey).set({id: fixture.id});
    await Promise.all([
      backend.db.doc('users/stage-pilot/materials/base_a').set({
        name: 'База A',
        pdcMaterials: [{name: 'A плоскост', color: '#aabbcc', fullW: 2800, fullH: 2070, fullPrice: 42}],
        edgeMaterials: [{name: 'A кант', color: '#333333', price: 1.5}],
        backMaterials: [{name: 'A HDF', thick: 3, fullW: 2800, fullH: 2070, fullPrice: 20}],
        worktops: [{name: 'A плот', fullW: 3000, depth: 600, fullPrice: 90}],
        servicePrices: {cutStart: 2},
      }),
      backend.db.doc('users/stage-pilot/materials/base_b').set({
        name: 'База B',
        pdcMaterials: [{name: 'B плоскост', color: '#ddeeff', url: 'https://supplier.example.test/b-board',
          textureUrl: 'materials/textures/staging-decor.png', fullW: 2500, fullH: 1830, fullPrice: 55}],
        edgeMaterials: [{name: 'B кант', color: '#ffffff', price: 2}],
        backMaterials: [{name: 'B HDF', thick: 4, fullW: 2500, fullH: 1830, fullPrice: 28}],
        worktops: [{name: 'B плот', fullW: 3100, depth: 620, fullPrice: 110}],
        servicePrices: {cutStart: 3},
      }),
      backend.db.doc('users/stage-pilot/materials/_app_preferences').set({
        schemaVersion: 1,
        defaultMaterialBaseId: 'base_a',
      }),
    ]);
    stage = await startLocalStaging({enabled: true});
    assert.equal((await fetch(stage.origin + '/release-candidate/google-account-choice.mjs')).status, 200,
      'The v3 Google account choice module must be served by the existing safe asset allowlist');
    assert.equal((await fetch(stage.origin + '/cloud.js')).status, 404);
    assert.equal((await fetch(stage.origin + '/sw.js')).status, 404);
    const disabled = await startLocalStaging();
    try {
      assert.doesNotMatch(await (await fetch(disabled.origin)).text(), /staging-auth\.mjs|src="\.\/cloud\.js"/);
      assert.equal((await fetch(disabled.origin + '/staging-api', {method: 'POST'})).status, 404);
    } finally { await disabled.close(); }
    browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
      proxy: process.env.HTTPS_PROXY ? {server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost'} : undefined});
    const page = await browser.newPage({viewport: {width: 390, height: 820}});
    const sheetJsRequests = [];
    page.on('request', request => {
      if (request.url().includes('xlsx')) sheetJsRequests.push(request.url());
    });
    const outside = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.hostname === 'cdn.jsdelivr.net') {
        if (!process.env.KITCHEN_CDN_CACHE) return route.continue();
        const filename = path.join(process.env.KITCHEN_CDN_CACHE, path.basename(url.pathname));
        return route.fulfill({contentType: 'application/javascript', body: fs.readFileSync(filename)});
      }
      outside.push(url.host);
      return route.abort();
    });
    let releaseCatalog;
    const catalogGate = new Promise(resolve => { releaseCatalog = resolve; });
    await page.route('**/materials/default.json', async route => {
      await catalogGate;
      await route.continue();
    });
    const photoBytes = fs.readFileSync(path.join(__dirname, 'fixtures/grain.png'));
    await page.route('**/materials/textures/staging-decor.png*', route =>
      route.fulfill({status: 200, contentType: 'image/png', body: photoBytes}));
    await page.route('https://api.github.com/repos/nedkoradev/kitchen-calculator/contents/materials/textures', route =>
      route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify([{
        type: 'file', name: 'staging-decor.png',
        download_url: stage.origin + '/materials/textures/staging-decor.png',
      }])}));
    await page.goto(stage.origin + '/', {waitUntil: 'domcontentloaded'});
    const panel = page.getByRole('region', {name: 'Вход в локалния преглед'});
    await panel.getByText('Локален тестов вход').waitFor();
    await page.waitForFunction(() => !document.documentElement.classList.contains('ned-booting'));
    for (const selector of ['#modeProject', '#modeConstructor', '#mainNavigation',
      '#shellModes', '#shellMenus', '#shellTools', '#headerRight', 'main']) {
      const legacy = page.locator(selector);
      if (await legacy.count()) assert.equal(await legacy.isVisible(), false,
        'Signed-out v3 must not show the legacy UI: ' + selector);
    }
    assert.equal(await panel.getByRole('button', {name: 'Вход с Google'}).isVisible(), true);
    assert.equal(await page.locator('header strong').first().isVisible(), true,
      'The NED-IQ brand remains visible before sign-in');
    assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
    assert.equal(await page.getByLabel('Тестов профил').count(), 0);
    await panel.getByLabel('Имейл').fill('stage-pilot@fixture.invalid');
    await panel.getByLabel('Парола').fill('fixture-password');
    const signIn = page.waitForResponse(response => response.url().includes('accounts:signInWithPassword'));
    try {
      await panel.getByLabel('Парола').press('Enter');
      assert.ok((await signIn).ok());
      await page.waitForFunction(() => window.firebase.auth(window.firebase.app('workspace-pilot')).currentUser !== null);
      assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
      assert.equal(await page.locator('#integration-status').count(), 0);
    } finally {
      releaseCatalog();
    }
    await panel.getByText('Профилът е удостоверен').waitFor();
    assert.equal(await page.locator('#shellTools').isVisible(), true,
      'The authenticated v3 tool shell must become visible');

    const library = page.locator('#libraryMenu summary');
    const openLibrary = async () => {
      await library.click();
      await page.getByRole('menuitem', {name: 'Проекти', exact: true}).click();
    };
    const operations = [];
    page.on('request', request => {
      if (request.url().endsWith('/staging-api')) operations.push(request.postDataJSON()?.operation);
    });
    const draftDocument = async partCount => {
      const handle = await page.waitForFunction(async count => {
        const {createWorkspaceDraftAdapter} = await import('/workspace-persistence/drafts.mjs');
        const draft = createWorkspaceDraftAdapter(localStorage).read({ownerUid: 'stage-pilot', actorUid: 'stage-pilot'});
        const document = draft && JSON.parse(draft).document;
        return document?.parts.length === count && document;
      }, partCount, {timeout: 5000});
      try { return await handle.jsonValue(); }
      finally { await handle.dispose(); }
    };
    const status = page.locator('#integration-status');
    await library.waitFor({state: 'visible'});
    assert.equal(await page.locator('header #staging-auth [role="status"]').count(), 1);
    await page.setViewportSize({width: 1400, height: 900});
    const stageTop = (await page.locator('main').boundingBox()).y;
    const tools = await page.locator('#shellTools').boundingBox();
    assert.ok(Math.abs(stageTop - (tools.y + tools.height)) <= 2, 'The desktop scene starts directly below the tools');
    assert.equal(await page.locator('#projectNewCabinet').getAttribute('title'), 'Нов шкаф');
    await page.locator('#projectAddHorizontal').click();
    await status.getByText(/Незаписани промени/).waitFor({timeout: 5000});
    const single = await draftDocument(1);
    assert.equal(single.parts.length, 1);
    assert.equal(single.parts[0].finish.material, 0);
    assert.equal(single.parts[0].part.assembly, undefined);
    assert.ok(single.materials.pdcMaterials[0]);
    assert.match(await page.locator('#groupList').textContent(), /Хоризонтален детайл/);

    await page.locator('#projectNewCabinet').click();
    const cabinet = page.getByRole('dialog', {name: 'Нов шкаф', exact: true});
    await cabinet.getByText('Конструкция и рафтове', {exact: true}).click();
    await cabinet.getByLabel('Брой вътрешни рафтове').fill('0');
    await cabinet.getByRole('button', {name: 'Създай шкаф', exact: true}).click();
    await cabinet.waitFor({state: 'detached', timeout: 5000});
    await page.waitForFunction(() => document.querySelector('#groupList').textContent.includes('Долен шкаф'));
    const combined = await draftDocument(14);
    assert.equal(combined.parts.length, 14);
    assert.deepEqual(combined.parts[0], single.parts[0]);
    const groupId = combined.parts[1].part.assembly;
    assert.equal(combined.groups[groupId], 'Долен шкаф');
    assert.ok(combined.parts.slice(1).every(({part}) => part.assembly === groupId));
    assert.ok(operations.every(operation => ['pending', 'list', 'materialBases', 'materialBaseRead', 'readModel', 'readProject'].includes(operation)),
      'Object creation must commit locally before any Firestore write');

    const scene = page.locator('#view canvas');
    const canvas = await scene.elementHandle();
    const initialSelection = await page.locator('#groupList').innerHTML();
    const initialUndo = await page.locator('#undoStep').isEnabled();
    const initialRedo = await page.locator('#redoStep').isEnabled();
    const assertScene = async () => {
      assert.equal(await canvas.evaluate(node => node === document.querySelector('#view canvas')), true);
      assert.equal(await scene.isVisible(), true);
      assert.equal(await page.locator('#groupList').innerHTML(), initialSelection);
      assert.deepEqual(await draftDocument(14), combined);
      assert.equal(await page.locator('#undoStep').isEnabled(), initialUndo);
      assert.equal(await page.locator('#redoStep').isEnabled(), initialRedo);
      assert.match(await status.innerText(), /Незаписани промени/);
    };
    const touch = await page.context().newCDPSession(page);
    const tap = async locator => {
      const box = await locator.boundingBox();
      assert.ok(box);
      await touch.send('Input.dispatchTouchEvent', {type: 'touchStart',
        touchPoints: [{x: box.x + box.width / 2, y: box.y + box.height / 2}]});
      await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    };
    const drag = async (target, dx, dy, inset = 4) => {
      const box = await target.boundingBox();
      assert.ok(box);
      await page.mouse.move(box.x + inset, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + inset + dx, box.y + box.height / 2 + dy, {steps: 8});
      await page.mouse.up();
    };
    const materialsMenu = page.locator('#shellSettings summary');
    const openMaterials = async () => {
      await materialsMenu.click();
      await page.locator('#navMaterials').click();
    };
    const materials = page.getByRole('dialog', {name: 'Материали', exact: true});
    await openMaterials();
    await materials.locator('.pilotMaterialPreviewSection tbody tr').first().waitFor();
    await assertScene();
    const centered = await materials.boundingBox();
    await drag(materials.locator('.dialogHead'), 36, 24, 110);
    const moved = await materials.boundingBox();
    assert.ok(moved.x > centered.x + 20 && moved.y > centered.y + 12);
    await drag(materials.locator('[data-edge="se"]'), 32, 22);
    const resized = await materials.boundingBox();
    assert.ok(resized.width > moved.width + 20 && resized.height > moved.height + 12);
    const keyboardMove = materials.getByRole('button', {name: 'Премести или преоразмери прозореца'});
    await keyboardMove.focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowUp');
    const adjusted = await materials.boundingBox();
    assert.equal(adjusted.x, resized.x - 24);
    assert.equal(adjusted.height, resized.height - 24);
    await materials.getByRole('button', {name: 'Разгъни прозореца'}).click();
    assert.ok((await materials.boundingBox()).width > adjusted.width);
    await materials.getByRole('button', {name: 'Възстанови прозореца'}).click();
    assert.deepEqual(await materials.boundingBox(), adjusted);
    await page.keyboard.press('Escape');
    await materials.waitFor({state: 'hidden'});
    assert.equal(await materialsMenu.evaluate(summary => document.activeElement === summary), true);
    await openMaterials();
    assert.deepEqual(await materials.boundingBox(), adjusted);
    await materials.getByRole('button', {name: 'Промени', exact: true}).first().click();
    const materialEditor = page.getByRole('dialog', {name: 'Промени материал'});
    await materialEditor.getByRole('textbox', {name: 'Материал'}).fill('Временно име');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', {name: 'Потвърждение', exact: true}).getByRole('button', {name: 'Отказ', exact: true}).click();
    assert.equal(await materialEditor.isVisible(), true);
    await materialEditor.getByRole('button', {name: 'Отказ', exact: true}).click();
    await page.getByRole('dialog', {name: 'Потвърждение', exact: true}).getByRole('button', {name: 'Потвърди', exact: true}).click();
    await materialEditor.waitFor({state: 'hidden'});
    await materials.getByRole('button', {name: 'Затваряне на прозореца', exact: true}).click();
    await assertScene();

    const reports = page.getByRole('dialog', {name: 'Справки', exact: true});
    await page.locator('#reportsMenu summary').click();
    await page.locator('#navCut').click();
    await reports.locator('#projectCutList tbody tr').first().waitFor();
    assert.deepEqual(sheetJsRequests, [stage.origin + '/staging-sdk/xlsx-0.20.3.min.js']);
    assert.equal(await page.evaluate(() => XLSX.version), '0.20.3');
    const download = page.waitForEvent('download');
    await reports.locator('#exportProjectCut').click();
    const workbookFile = await download;
    assert.equal(workbookFile.suggestedFilename(), 'Salex_RIK_order.xlsx');
    const encoded = fs.readFileSync(await workbookFile.path()).toString('base64');
    const rows = await page.evaluate(bytes => {
      const workbook = XLSX.read(bytes, {type: 'base64'});
      return XLSX.utils.sheet_to_json(workbook.Sheets.RIK_order, {header: 1, defval: ''});
    }, encoded);
    assert.equal(rows[0].length, 17);
    assert.equal(rows[0][6], 'забележка');
    assert.ok(rows.slice(1).some(row => Number.isInteger(row[3]) && Number.isInteger(row[4])));

    await assertScene();
    await reports.getByRole('button', {name: 'Себестойност', exact: true}).click();
    await reports.locator('#projectCosts tbody tr').first().waitFor();
    await page.keyboard.press('Escape');
    await reports.waitFor({state: 'hidden'});
    await backend.db.doc('workspace_v3/stage-pilot/settings/folders').set({folders, revision: 1});
    await backend.db.doc('workspace_v3/stage-pilot/documents/' + model.id).set(model);
    await openLibrary();
    const libraryWindow = page.getByRole('dialog', {name: 'Обща библиотека', exact: true});
    await libraryWindow.getByRole('navigation', {name: 'Папки на библиотеката'}).waitFor({state: 'visible'});
    assert.equal(await libraryWindow.locator('.pilotLibraryFolderTab').count(), 2);
    await libraryWindow.getByRole('button', {name: 'Модели', exact: true}).click();
    await libraryWindow.getByRole('button', {name: 'Рафтове', exact: true}).click();
    const insert = libraryWindow.getByRole('button', {name: 'Добави модел · ' + model.name});
    await insert.waitFor();
    await insert.locator('.pilotLibraryThumbnail svg').waitFor();
    assert.ok(await insert.locator('.pilotLibraryThumbnail polygon').count() > 0,
      'Library should show the actual saved model panels, not a generic cabinet icon');
    assert.equal(await insert.locator('svg.actionSvg').count(), 0);
    assert.equal(await libraryWindow.getByRole('button', {name: 'Действия за ' + model.name}).isVisible(), true);
    await insert.click({button: 'right'});
    const modelActions = libraryWindow.getByRole('menu', {name: 'Действия за ' + model.name});
    for (const name of ['Преименувай', 'Премести в папка', 'Копирай в папка', 'Изтрий']) {
      assert.equal(await modelActions.getByRole('menuitem', {name, exact: true}).isVisible(), true);
    }
    assert.equal(await modelActions.getByRole('menuitem', {name: 'Копирай в папка'}).isEnabled(), true);
    await page.keyboard.press('Escape');
    assert.equal(await modelActions.count(), 0, 'Escape closes the context menu without closing the library');
    assert.equal(await libraryWindow.isVisible(), true);
    await libraryWindow.getByRole('button', {name: 'Проекти', exact: true}).click();
    const projectTile = libraryWindow.getByRole('button', {name: 'Отвори проект · Контролна кухня'});
    await projectTile.waitFor();
    await projectTile.locator('.pilotLibraryThumbnail svg').waitFor();
    assert.ok(await projectTile.locator('.pilotLibraryThumbnail polygon').count() > 0,
      'Project thumbnail should render the saved scene geometry');
    await projectTile.click({button: 'right'});
    const projectActions = libraryWindow.getByRole('menu', {name: 'Действия за Контролна кухня'});
    for (const name of ['Преименувай', 'Премести в папка', 'Копирай в папка', 'Изтрий']) {
      assert.equal(await projectActions.getByRole('menuitem', {name, exact: true}).isVisible(), true);
    }
    assert.equal(await projectActions.getByRole('menuitem', {name: 'Премести в папка'}).isDisabled(), true);
    assert.equal(await projectActions.getByRole('menuitem', {name: 'Копирай в папка'}).isEnabled(), true);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await libraryWindow.waitFor({state: 'hidden'});
    await backend.db.doc('workspace_v3/stage-pilot/documents/' + model.id).delete();
    await backend.db.doc('workspace_v3/stage-pilot/settings/folders').delete();
    await assertScene();
    assert.ok(operations.every(operation => ['pending', 'list', 'materialBases', 'materialBaseRead', 'readModel', 'readProject'].includes(operation)));

    const settingsButton = page.locator('#settingsButton');
    const settings = page.getByRole('dialog', {name: 'Настройки', exact: true});
    await settingsButton.click();
    await settings.getByRole('button', {name: 'Изход', exact: true}).waitFor();
    const journalCheck = page.waitForResponse(response => response.url().endsWith('/staging-api') &&
      response.request().postDataJSON()?.operation === 'pending');
    await settings.getByRole('button', {name: 'Провери журнала', exact: true}).click();
    assert.deepEqual(await (await journalCheck).json(), {result: null});
    await settings.getByRole('button', {name: /Снимки за фладер/}).click();
    const photos = page.getByRole('dialog', {name: 'Снимки за фладер', exact: true});
    await photos.waitFor();
    await assertScene();
    await page.keyboard.press('Escape');
    await photos.waitFor({state: 'hidden'});
    await page.keyboard.press('Escape');
    await settings.waitFor({state: 'hidden'});
    await assertScene();
    assert.ok(operations.every(operation => ['pending', 'list', 'materialBases', 'materialBaseRead', 'readModel', 'readProject'].includes(operation)));

    for (const width of [900, 390, 320]) {
      await page.setViewportSize({width, height: 820});
      await openMaterials();
      await materials.waitFor();
      const box = await materials.boundingBox();
      assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.height <= 820);
      if (width < 620) {
        assert.ok(box.width >= width - 16);
        assert.ok(await materials.locator('.pilotWindowBody').evaluate(body => body.scrollHeight > body.clientHeight));
      }
      const close = materials.getByRole('button', {name: 'Затваряне на прозореца', exact: true});
      if (width < 620) await tap(close);
      else await close.click();
      await materials.waitFor({state: 'hidden'});
    }
    await touch.detach();
    await page.setViewportSize({width: 1400, height: 900});
    await assertScene();
    await page.keyboard.press('Control+z');
    await draftDocument(1);
    await page.keyboard.press('Control+Shift+z');
    assert.deepEqual(await draftDocument(14), combined);

    const savedName = 'Обекти от пилота';
    const awaitOperation = operation => page.waitForResponse(response => response.url().endsWith('/staging-api') &&
      response.request().postDataJSON()?.operation === operation);
    const saveDialog = page.getByRole('dialog', {name: 'Име и папка'});
    const destination = saveDialog.getByLabel('Папка', {exact: true});
    await page.keyboard.press('Control+s');
    await saveDialog.getByText('„Проекти“ е единствената налична папка.').waitFor();
    assert.equal(await destination.inputValue(), '');
    assert.deepEqual(await destination.locator('option').allTextContents(), ['Избери папка…', 'Проекти']);
    await saveDialog.getByRole('button', {name: 'Отказ'}).click();
    assert.ok(!operations.includes('write') && !operations.includes('changeFolder'));
    const write = awaitOperation('write');
    const savedJournal = awaitOperation('acknowledge');
    await page.keyboard.press('Control+s');
    await page.getByRole('textbox', {name: 'Име на документа'}).fill(savedName);
    await page.getByRole('dialog', {name: 'Име и папка'}).getByLabel('Папка', {exact: true}).selectOption({label: 'Проекти'});
    await page.getByRole('dialog').getByRole('button', {name: 'Запази', exact: true}).click();
    const {result: saved} = await (await write).json();
    assert.equal(saved.revision, 1);
    assert.deepEqual(await (await savedJournal).json(), {result: null});
    await status.getByText(/Готово.*Обекти от пилота/).waitFor();
    const persisted = (await backend.db.doc('workspace_v3/stage-pilot/documents/' + saved.id).get()).data();
    assert.deepEqual(persisted.parts, combined.parts);
    assert.deepEqual(persisted.groups, combined.groups);
    assert.deepEqual(persisted.materials, combined.materials);

    await page.keyboard.press('Control+n');
    await status.getByText(/Готово.*Нов проект/).waitFor();
    assert.equal((await draftDocument(0)).parts.length, 0);
    await openLibrary();
    const read = awaitOperation('readProject');
    await page.getByRole('button', {name: 'Отвори проект · ' + savedName, exact: true}).click();
    assert.deepEqual((await (await read).json()).result, persisted);
    await status.getByText(/Готово.*Обекти от пилота/).waitFor();
    assert.deepEqual(await draftDocument(14), persisted);
    const reopenedList = await page.locator('#groupList').textContent();
    assert.match(reopenedList, /Долен шкаф/);
    assert.match(reopenedList, /Хоризонтален детайл/);

    await page.setViewportSize({width: 390, height: 820});
    await openLibrary();
    await page.getByRole('button', {name: 'Отвори проект · Контролна кухня', exact: true}).click();
    await page.locator('#integration-status').getByText(/Контролна кухня/).waitFor();
    await page.keyboard.press('Control+Shift+s');
    await saveDialog.getByLabel('Име на документа').fill('Пилотно копие');
    const createFolder = async name => {
      await saveDialog.getByRole('button', {name: 'Нова папка'}).click();
      const folderDialog = page.getByRole('dialog', {name: 'Наименование'});
      await folderDialog.getByRole('textbox').fill(name);
      const response = awaitOperation('changeFolder');
      await folderDialog.getByRole('button', {name: 'Запази'}).click();
      assert.ok((await (await response).json()).result);
      await destination.locator('option').filter({hasText: name}).last().waitFor({state: 'attached'});
    };
    await createFolder('Потребителска');
    await createFolder('Вложена');
    assert.deepEqual(await destination.locator('option').allTextContents(),
      ['Избери папка…', 'Проекти', 'Потребителска', 'Потребителска / Вложена']);
    const nestedId = await destination.inputValue();
    assert.notEqual(nestedId, '');
    const copyWrite = awaitOperation('write');
    await saveDialog.getByRole('button', {name: 'Запази', exact: true}).click();
    const {result: copy} = await (await copyWrite).json();
    assert.notEqual(copy.id, fixture.id);
    await status.getByText(/Готово.*Пилотно копие/).waitFor();
    const copyRef = backend.db.doc('workspace_v3/stage-pilot/documents/' + copy.id);
    const copyDocument = (await copyRef.get()).data();
    assert.equal(copyDocument.folderId, nestedId);
    assert.equal(copyDocument.type, 'model');
    assert.deepEqual((await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).get()).data(), fixture);
    const overwrite = awaitOperation('acknowledge');
    await page.keyboard.press('Control+s');
    await overwrite;
    assert.equal(await saveDialog.isVisible(), false);
    assert.equal((await copyRef.get()).data().revision, 2);
    assert.equal((await copyRef.get()).data().folderId, nestedId);

    await page.reload();
    await panel.getByText('Профилът е удостоверен').waitFor();
    await status.getByText(/Възстановена чернова/).waitFor();
    assert.equal((await draftDocument(fixture.parts.length)).id, copy.id);
    await page.keyboard.press('Control+n');
    await status.getByText(/Готово.*Нов проект/).waitFor();
    await page.keyboard.press('Control+s');
    await saveDialog.getByLabel('Име на документа').fill('Първи запис в папка');
    await destination.selectOption({label: 'Потребителска / Вложена'});
    const firstWrite = awaitOperation('write');
    await saveDialog.getByRole('button', {name: 'Запази', exact: true}).click();
    const {result: first} = await (await firstWrite).json();
    await status.getByText(/Готово.*Първи запис в папка/).waitFor();
    assert.notEqual(first.id, copy.id);
    const firstDocument = (await backend.db.doc('workspace_v3/stage-pilot/documents/' + first.id).get()).data();
    assert.equal(firstDocument.folderId, nestedId);
    assert.equal(firstDocument.type, 'model');
    await openLibrary();
    await page.getByRole('button', {name: 'Отвори проект · Контролна кухня', exact: true}).click();
    await status.getByText(/Готово.*Контролна кухня/).waitFor();
    const acknowledgement = page.waitForResponse(response => response.url().endsWith('/staging-api') &&
      response.request().method() === 'POST' && response.request().postDataJSON()?.operation === 'acknowledge');
    await page.keyboard.press('Control+s');
    assert.deepEqual(await (await acknowledgement).json(), {result: null});
    await library.waitFor({state: 'visible'});
    const stored = await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).get();
    assert.equal(stored.data().revision, 2);
    await page.reload();
    await panel.getByText('Профилът е удостоверен').waitFor();
    await page.locator('#integration-status').getByText(/Възстановена чернова/).waitFor();

    await openMaterials();
    await materials.getByLabel('Активна материална база').waitFor();
    assert.deepEqual(await materials.locator('#pilotActiveMaterialBase option').allTextContents(),
      ['Избери база…', 'База A', 'База B']);
    await materials.getByLabel('Активна материална база').selectOption('base_b');
    // The status text can already contain the document-snapshot warning from
    // Base A. Wait for the selected catalog to finish loading, not stale status.
    await page.waitForFunction(() => document.querySelector('.pilotMaterialPreviewTitle')?.textContent === 'База B' &&
      document.querySelector('#pilotActiveMaterialBase')?.value === 'base_b');
    assert.match(await materials.locator('.pilotMaterialPreviewTitle').textContent(), /База B/);
    assert.match(await materials.locator('.pilotMaterialPreviewSection').first().textContent(), /B плоскост/);
    assert.equal(await materials.locator('#projectExtraPane').isVisible(), false,
      'The current document must not be shown as a second editable material catalog');
    assert.equal(await materials.locator('.pilotMaterialBasePreview').locator('table').count(), 4);
    const selectedBaseTable = materials.locator('.pilotMaterialPreviewSection').first();
    assert.equal(await selectedBaseTable.getByRole('button', {name: 'Промени'}).count(), 1);
    const supplier = selectedBaseTable.locator('a.pilotMaterialSupplierLink');
    assert.equal(await supplier.getAttribute('href'), 'https://supplier.example.test/b-board');
    assert.equal(await supplier.getAttribute('target'), '_blank');
    assert.equal(await supplier.getAttribute('rel'), 'noopener noreferrer');
    const preview = selectedBaseTable.locator('img.pilotMaterialTextureThumb');
    await preview.waitFor();
    await page.waitForFunction(() => document.querySelector('.pilotMaterialTextureThumb')?.naturalWidth > 0);
    await selectedBaseTable.getByRole('button', {name: 'Промени'}).click();
    const baseEditorDialog = page.getByRole('dialog', {name: 'Промени материал'});
    const colorPicker = baseEditorDialog.locator('input[type="color"][aria-label="Цвят"]');
    assert.equal(await colorPicker.isVisible(), true);
    assert.equal(await baseEditorDialog.getByRole('button', {name: 'Избери цвят'}).isVisible(), true);
    assert.equal(await baseEditorDialog.getByRole('button', {name: 'Избери снимка'}).isVisible(), true);
    assert.equal(await baseEditorDialog.getByRole('button', {name: 'Снимка от компютъра'}).isVisible(), true);
    assert.equal(await baseEditorDialog.locator('#materialPhotoUpload').getAttribute('type'), 'file');
    await colorPicker.fill('#2468ac');
    await baseEditorDialog.getByRole('textbox', {name: 'Материал'}).fill('B плоскост редакция');
    await baseEditorDialog.getByRole('button', {name: 'Запази', exact: true}).click();
    await baseEditorDialog.waitFor({state: 'hidden'});
    assert.match(await selectedBaseTable.textContent(), /B плоскост редакция/);
    assert.equal(await selectedBaseTable.locator('img.pilotMaterialTextureThumb').count(), 0,
      'Choosing a color replaces the photo preview with the color swatch');
    assert.equal(await selectedBaseTable.locator('.pilotMaterialSwatch').count(), 1);
    const beforeSave = (await backend.db.doc('users/stage-pilot/materials/base_b').get()).data().pdcMaterials[0];
    assert.equal(beforeSave.name, 'B плоскост', 'Cloud base is unchanged until explicit save');
    assert.equal(beforeSave.color, '#ddeeff');
    assert.equal(beforeSave.textureUrl, 'materials/textures/staging-decor.png');
    assert.deepEqual((await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).get()).data().materials,
      fixture.materials, 'Editing a base must not change the saved document');
    await materials.getByRole('button', {name: 'Запази базата'}).click();
    await page.waitForFunction(() => document.querySelector('.pilotMaterialBaseStatus')?.textContent.includes('е записана'));
    let savedMaterial = (await backend.db.doc('users/stage-pilot/materials/base_b').get()).data().pdcMaterials[0];
    assert.equal(savedMaterial.name, 'B плоскост редакция');
    assert.equal(savedMaterial.color, '#2468ac');
    assert.equal(savedMaterial.textureUrl, undefined);
    assert.equal(savedMaterial.url, 'https://supplier.example.test/b-board');
    assert.deepEqual((await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).get()).data().materials,
      fixture.materials);
    // Choose an existing GitHub photo through the shared v2 photo picker.
    await selectedBaseTable.getByRole('button', {name: 'Промени'}).click();
    const photoDialog = page.getByRole('dialog', {name: 'Промени материал'});
    await photoDialog.getByRole('button', {name: 'Избери снимка'}).click();
    const gallery = page.locator('dialog.materialEditDialog').filter({hasText: 'Избери снимка за фладер'});
    await gallery.getByRole('button', {name: 'staging-decor.png'}).click();
    await page.waitForFunction(() => document.querySelector('#materialPhotoStatus')?.textContent.includes('Снимката е проверена'));
    await photoDialog.getByRole('button', {name: 'Запази', exact: true}).click();
    await photoDialog.waitFor({state: 'hidden'});
    await selectedBaseTable.locator('img.pilotMaterialTextureThumb').waitFor();
    assert.equal((await backend.db.doc('users/stage-pilot/materials/base_b').get()).data().pdcMaterials[0].textureUrl,
      undefined, 'Choosing a photo does not save the cloud catalog until explicitly requested');
    await materials.getByRole('button', {name: 'Запази базата'}).click();
    await page.waitForFunction(() => document.querySelector('.pilotMaterialBaseStatus')?.textContent.includes('е записана'));
    savedMaterial = (await backend.db.doc('users/stage-pilot/materials/base_b').get()).data().pdcMaterials[0];
    assert.equal(savedMaterial.textureUrl, 'materials/textures/staging-decor.png');
    assert.equal(savedMaterial.color, '#2468ac');
    assert.ok(!JSON.stringify(savedMaterial).includes('blob:'));
    assert.deepEqual((await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).get()).data().materials,
      fixture.materials);
    await materials.getByLabel('Активна материална база').selectOption('base_a');
    await page.waitForFunction(() => document.querySelector('.pilotMaterialPreviewSection')?.textContent.includes('A плоскост'));
    assert.equal(await materials.locator('.pilotMaterialPreviewSection').first().textContent().then(v => v.includes('B плоскост редакция')), false);
    await materials.getByLabel('Активна материална база').selectOption('base_b');
    await page.waitForFunction(() => document.querySelector('.pilotMaterialPreviewSection')?.textContent.includes('B плоскост редакция'));
    for (let attempt = 0; attempt < 20; attempt++) {
      const preference = (await backend.db.doc('users/stage-pilot/materials/_app_preferences').get()).data();
      if (preference?.defaultMaterialBaseId === 'base_b') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal((await backend.db.doc('users/stage-pilot/materials/_app_preferences').get()).data().defaultMaterialBaseId, 'base_b');
    assert.deepEqual((await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).get()).data().materials,
      fixture.materials);
    await materials.getByRole('button', {name: 'Преименувай', exact: true}).click();
    const renameDialog = page.getByRole('dialog', {name: 'Преименуване', exact: true});
    await renameDialog.getByRole('textbox').fill('База Beta');
    await renameDialog.getByRole('button', {name: 'Преименувай', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('.pilotMaterialBaseStatus')?.textContent.includes('преименувана'));
    await materials.getByRole('button', {name: 'Нова база', exact: true}).click();
    const createDialog = page.getByRole('dialog', {name: 'Нова материална база', exact: true});
    await createDialog.getByRole('textbox').fill('База C');
    await createDialog.getByRole('button', {name: 'Създай', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('.pilotMaterialBaseStatus')?.textContent.includes('Създадена е база'));
    await materials.getByRole('button', {name: 'Запази базата', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('.pilotMaterialBaseStatus')?.textContent.includes('е записана'));
    const cRows = await Promise.all((await backend.db.collection('users/stage-pilot/materials').listDocuments()).map(ref => ref.get()));
    assert.equal(cRows.some(row => row.exists && row.data().name === 'База C'), true);
    await materials.getByRole('button', {name: 'Изтрий базата', exact: true}).click();
    const deleteDialog = page.getByRole('dialog', {name: 'Потвърждение за изтриване', exact: true});
    await deleteDialog.getByRole('button', {name: 'Изтрий', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('.pilotMaterialBaseStatus')?.textContent.includes('е изтрита'));
    await materials.getByLabel('Активна материална база').selectOption('base_b');
    await page.waitForFunction(() => document.querySelector('.pilotMaterialBaseStatus')?.textContent.includes('Активна база'));
    assert.equal((await backend.db.doc('users/stage-pilot/materials/base_b').get()).data().name, 'База Beta');
    await materials.getByRole('button', {name: 'Затваряне на прозореца', exact: true}).click();
    await materials.waitFor({state: 'hidden'});

    // Recreate the isolated folder manifest removed by the earlier test section.
    // The real library list is driven by this manifest, not by the documents.
    await backend.db.doc('workspace_v3/stage-pilot/settings/folders').set({folders, revision: 1});
    // Model tile primary click reuses insertModel and preserves the current document.
    await backend.db.doc('workspace_v3/stage-pilot/documents/' + model.id).set(model);
    const beforeInsert = await draftDocument(2);
    await openLibrary();
    const insertWindow = page.getByRole('dialog', {name: 'Обща библиотека', exact: true});
    await insertWindow.getByRole('button', {name: 'Модели', exact: true}).click();
    await insertWindow.getByRole('button', {name: 'Рафтове', exact: true}).click();
    const insertRequest = awaitOperation('readModel');
    await insertWindow.getByRole('button', {name: 'Добави модел · ' + model.name}).click();
    assert.equal((await (await insertRequest).json()).result.id, model.id);
    await insertWindow.waitFor({state: 'hidden'});
    const inserted = await draftDocument(3);
    assert.equal(inserted.id, beforeInsert.id);
    assert.equal(inserted.parts.length, beforeInsert.parts.length + model.parts.length);
    await backend.db.doc('workspace_v3/stage-pilot/documents/' + model.id).delete();

    await settingsButton.click();
    await settings.getByRole('button', {name: 'Изход', exact: true}).click();
    await panel.getByText('Локален тестов вход').waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
    assert.equal(await page.locator('#mainNavigation').isVisible(), false,
      'Signing out must restore the same v3 pre-login shield');
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    console.log('PASS staged Auth, persistent 3D scene, pilot windows, Firestore save/reopen and mobile reload');
  } finally {
    await browser?.close();
    await stage?.close();
    await backend.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
