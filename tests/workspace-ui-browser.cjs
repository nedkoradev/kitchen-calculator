const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const html = require('./fixtures/workspace-ui-demo.cjs');

(async () => {
  const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox']});
  try {
    const page = await browser.newPage({viewport: {width: 1400, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = new URL('workspace-ui-fixture.html', process.env.KITCHEN_TEST_URL || 'http://127.0.0.1:8000/').href;
    await page.route(url, route => route.fulfill({contentType: 'text/html', body: html}));
    await page.goto(url);
    const button = name => page.getByRole('button', {name, exact: true});
    const status = page.getByRole('status');
    const rows = page.locator('#parts tbody tr');
    await button('Библиотека').focus();
    await page.keyboard.press('Enter');
    await button('Отвори проект').click();
    await rows.nth(749).waitFor();
    assert.equal(await rows.count(), 750);
    assert.match(await rows.first().innerText(), /20 × 40 × 20.*Корпус.*Дъб/s);
    const input = page.getByLabel('Ширина на помещението (mm)');
    assert.equal(await input.inputValue(), '3000');
    await button('Библиотека').click();
    await page.getByLabel('Папка').selectOption('models');
    await button('Добави модел').click();
    await rows.nth(750).waitFor();
    assert.equal(await input.inputValue(), '3000');
    await button('Отмени').click();
    await rows.nth(750).waitFor({state: 'detached'});
    await button('Повтори').click();
    await rows.nth(750).waitFor();
    await input.fill('3500');
    await button('Приложи').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Незаписани'));
    await button('Нов').click();
    await page.getByRole('dialog', {name: 'Незаписани промени'}).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.textContent === 'Нов');
    assert.equal(await rows.count(), 751);

    await page.evaluate(() => sessionStorage.setItem('drop-confirmation', 'yes'));
    await button('Запази').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('блокиран'));
    assert.equal(await button('Запази като нов').isDisabled(), true);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Сверен запис'));
    assert.match(await status.innerText(), /Възстановена чернова/);
    assert.equal(await rows.count(), 751);
    assert.equal(await input.inputValue(), '3500');

    await page.evaluate(() => sessionStorage.setItem('offline:beta', 'yes'));
    await page.getByLabel('Профил').selectOption('beta');
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('блокиран'));
    assert.equal(await button('Запази').isDisabled(), true);
    assert.equal(await rows.count(), 751);
    await page.evaluate(() => sessionStorage.removeItem('offline:beta'));
    await button('Провери журнала').click();
    await rows.first().waitFor({state: 'detached'});
    assert.equal(await rows.count(), 0);
    await page.getByLabel('Профил').selectOption('alpha');
    await rows.nth(750).waitFor();
    for (const width of [1400, 900, 390, 320]) {
      await page.setViewportSize({width, height: 800});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
      await button('Библиотека').click();
      const dialog = page.getByRole('dialog', {name: 'Библиотека'});
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      await page.keyboard.press('Escape');
      await dialog.waitFor({state: 'hidden'});
    }
    await button('Запази като нов').click();
    const nameDialog = page.getByRole('dialog', {name: 'Запис на документ'});
    await nameDialog.getByLabel('Име').fill('Копие');
    await nameDialog.getByRole('button', {name: 'Запази', exact: true}).click();
    await page.getByRole('heading', {name: 'Копие'}).waitFor();
    assert.equal(await rows.count(), 751);
    await button('Нов').click();
    await rows.first().waitFor({state: 'detached'});
    await button('Запази').click();
    await nameDialog.getByLabel('Име').fill('Първи запис');
    await nameDialog.getByRole('button', {name: 'Запази', exact: true}).click();
    await page.getByRole('heading', {name: 'Първи запис'}).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS isolated workspace UI: keyboard, 1400/900/390/320px, 750 parts, dirty confirmation, reload and profile journal');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
