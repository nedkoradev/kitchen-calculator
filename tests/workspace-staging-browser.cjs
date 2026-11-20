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

    const library = page.getByRole('button', {name: 'Обща библиотека', exact: true});
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
    await library.click();
    const read = awaitOperation('readProject');
    await page.getByRole('button', {name: 'Отвори проект · ' + savedName, exact: true}).click();
    assert.deepEqual((await (await read).json()).result, persisted);
    await status.getByText(/Готово.*Обекти от пилота/).waitFor();
    assert.deepEqual(await draftDocument(14), persisted);
    const reopenedList = await page.locator('#groupList').textContent();
    assert.match(reopenedList, /Долен шкаф/);
    assert.match(reopenedList, /Хоризонтален детайл/);
    await page.setViewportSize({width: 390, height: 820});
    await library.click();
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
    await panel.getByRole('button', {name: 'Изход', exact: true}).click();
    await panel.getByText('Локален тестов вход').waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
    assert.deepEqual(outside, []);
    assert.deepEqual(errors, []);
    console.log('PASS real Firebase Auth UX, cabinet and part creation, Firestore save/reopen, mobile reload and isolated fallback');
  } finally {
    await browser?.close();
    await stage?.close();
    await backend.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
