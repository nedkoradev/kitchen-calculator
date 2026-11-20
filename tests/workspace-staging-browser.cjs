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
    const [fixture] = fixtureDocuments();
    await backend.db.doc('workspace_v3/stage-pilot/documents/' + fixture.id).set(fixture);
    await backend.db.doc('workspace_v3/stage-pilot/names/' + fixture.nameKey).set({id: fixture.id});
    stage = await startLocalStaging({enabled: true});
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
    await page.goto(stage.origin + '/', {waitUntil: 'domcontentloaded'});
    const panel = page.getByRole('region', {name: 'Вход в локалния преглед'});
    await panel.getByText('Локален тестов вход').waitFor();
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

    const library = page.locator('#libraryMenu summary');
    const openLibrary = async () => {
      await library.click();
      await page.locator('#navLibrary').click();
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
    assert.equal(await page.locator('main').evaluate(main => main.previousElementSibling.id), 'shellTools');
    assert.equal(await page.locator('header #staging-auth [role="status"]').count(), 1);
    await page.setViewportSize({width: 1400, height: 900});
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
    assert.ok(operations.every(operation => operation === 'pending'), 'Object creation must commit locally before any Firestore write');

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
    await materials.locator('.materialGroup tbody tr').first().waitFor();
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
    const materialEditor = page.locator('dialog.materialEditDialog[open]');
    await materialEditor.getByLabel('Наименование', {exact: true}).fill('Временно име');
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', {name: 'Потвърждение', exact: true}).getByRole('button', {name: 'Отказ', exact: true}).click();
    assert.equal(await materialEditor.isVisible(), true);
    await materialEditor.getByRole('button', {name: 'Затваряне на прозореца'}).click();
    await page.getByRole('dialog', {name: 'Потвърждение', exact: true}).getByRole('button', {name: 'Потвърди', exact: true}).click();
    await materialEditor.waitFor({state: 'hidden'});
    await materials.getByRole('button', {name: 'Затваряне на прозореца', exact: true}).click();
    await assertScene();

    const reports = page.getByRole('dialog', {name: 'Справки', exact: true});
    await page.locator('#reportsMenu summary').click();
    await page.locator('#navCut').click();
    await reports.locator('#projectCutList tbody tr').first().waitFor();
    await assertScene();
    await reports.getByRole('button', {name: 'Себестойност', exact: true}).click();
    await reports.locator('#projectCosts tbody tr').first().waitFor();
    await page.keyboard.press('Escape');
    await reports.waitFor({state: 'hidden'});
    await openLibrary();
    const libraryWindow = page.getByRole('dialog', {name: 'Обща библиотека', exact: true});
    await libraryWindow.getByRole('button', {name: 'Отвори проект · Контролна кухня'}).waitFor();
    await page.keyboard.press('Escape');
    await libraryWindow.waitFor({state: 'hidden'});
    await assertScene();
    assert.ok(operations.every(operation => ['pending', 'list'].includes(operation)));

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
    assert.ok(operations.every(operation => ['pending', 'list'].includes(operation)));

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
    const write = awaitOperation('write');
    const savedJournal = awaitOperation('acknowledge');
    await page.keyboard.press('Control+s');
    await page.getByRole('textbox', {name: 'Име на документа'}).fill(savedName);
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
    await settingsButton.click();
    await settings.getByRole('button', {name: 'Изход', exact: true}).click();
    await panel.getByText('Локален тестов вход').waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    console.log('PASS staged Auth, persistent 3D scene, pilot windows, Firestore save/reopen and mobile reload');
  } finally {
    await browser?.close();
    await stage?.close();
    await backend.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
