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
    await page.goto(stage.origin + '/');
    const panel = page.getByRole('region', {name: 'Вход в локалния преглед'});
    await panel.getByText('Локален тестов вход').waitFor();
    assert.equal(await page.evaluate(() => document.querySelector('main').inert), true);
    assert.equal(await page.getByLabel('Тестов профил').count(), 0);
    await panel.getByLabel('Имейл').fill('stage-pilot@fixture.invalid');
    await panel.getByLabel('Парола').fill('fixture-password');
    await panel.getByLabel('Парола').press('Enter');
    await panel.getByText('Профилът е удостоверен').waitFor();
    const library = page.getByRole('button', {name: 'Обща библиотека', exact: true});
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
    console.log('PASS real Firebase Auth UX, mobile renderer, emulator save, session reload and isolated fallback');
  } finally {
    await browser?.close();
    await stage?.close();
    await backend.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
