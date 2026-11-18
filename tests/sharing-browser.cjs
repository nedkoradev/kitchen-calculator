const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({
  firebaseDouble:true,
  extraHooks:'window.__sharingDraft={scope:()=>draftRecovery.owner,settled:()=>draftRecovery.settled,read:()=>draftRecovery.read()};'
 });
 try{
  const settings=async()=>{
   await page.locator('#shellSettings summary').click();
   await page.locator('#sharingOpen').click();
  };
  const dialog=page.locator('#sharingDialog');
  const indicator=page.locator('#sharedBaseStatus');
  await page.waitForFunction(()=>window.__sharingDraft.settled()&&window.__sharingDraft.scope()==='alice');
  assert.equal(await indicator.textContent(),'Моята база — Собственик');
  assert.equal(await dialog.count(),0);
  await settings();
  await dialog.getByLabel('Google имейл').fill('guest@example.test');
  await dialog.getByLabel('Роля',{exact:true}).selectOption('editor');
  await dialog.getByRole('button',{name:'Добави',exact:true}).click();
  await dialog.getByText('Достъпът е предоставен.').waitFor();
  const readRows=()=>page.evaluate(()=>window.__firebaseDouble.rows());
  assert.deepEqual((await readRows()).find(r=>r.path==='nediq_access/guest@example.test/bases/alice').value,
   {ownerUid:'alice',role:'editor',ownerName:'alice'});
  await dialog.getByLabel('Роля за guest@example.test').selectOption('viewer');
  await dialog.getByRole('button',{name:'Запази роля'}).click();
  await dialog.getByText('Ролята е обновена.').waitFor();
  assert.equal((await readRows()).find(r=>r.path==='nediq_access/guest@example.test/bases/alice').value.role,'viewer');
  await dialog.getByRole('button',{name:'Отнеми достъп'}).click();
  await dialog.getByText('Достъпът е отнет.').waitFor();
  assert.equal((await readRows()).some(r=>r.path.includes('guest@example.test')),false);
  await dialog.getByRole('button',{name:'Затвори'}).click();

  await page.evaluate(()=>{
   window.__firebaseDouble.seed('nediq_access/guest@example.test/bases/alice',{ownerUid:'alice',role:'editor',ownerName:'Недко'});
   window.__firebaseDouble.seed('users/alice/v2_cabinets/cab_test',{name:'Споделен шкаф',parts:[]});
   window.__firebaseDouble.setUser('guest');
  });
  await dialog.getByRole('heading',{name:'Избор на база данни'}).waitFor();
  await dialog.locator('option').filter({hasText:'Базата на Недко — Редактор'}).waitFor({state:'attached'});
  await dialog.getByRole('button',{name:'Затвори'}).click();
  await page.waitForFunction(()=>window.__sharingDraft.settled()&&window.__sharingDraft.scope()==='guest');
  await setup([{key:'custom001',w:600,h:18,d:400,x:0,y:9,z:0}]);
  await indicator.click();
  await dialog.getByLabel('Избрана база').selectOption('alice');
  await dialog.getByRole('button',{name:'Отвори база'}).click();
  await dialog.waitFor({state:'detached'});
  await page.waitForFunction(()=>window.__sharingDraft.settled()&&window.__sharingDraft.scope()==='["guest","alice"]');
  assert.equal((await parts()).length,0);
  assert.equal(await indicator.textContent(),'Базата на Недко — Редактор');
  await page.setViewportSize({width:320,height:850});
  assert.equal(await indicator.isVisible(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1400,height:1000});

  await page.locator('#libraryMenu summary').click();
  await page.locator('#navLibrary').click();
  await page.locator('#libraryDialog').getByText('Споделен шкаф').waitFor();
  await page.evaluate(()=>window.__firebaseDouble.seed('nediq_access/guest@example.test/bases/alice',{ownerUid:'alice',role:'viewer',ownerName:'Недко'}));
  await page.waitForFunction(()=>document.querySelector('#sharedBaseStatus').textContent.includes('Наблюдател'));
  const denied=await page.evaluate(()=>new Promise(resolve=>{
   window.addEventListener('kitchen-v2-cloud-error',event=>resolve(event.detail.message),{once:true});
   window.dispatchEvent(new CustomEvent('kitchen-v2-cloud-save-request',{detail:{name:'Отказан',parts:[{}]}}));
  }));
  assert.match(denied,/само за преглед/);
  await page.evaluate(()=>window.__firebaseDouble.remove('nediq_access/guest@example.test/bases/alice'));
  await page.waitForFunction(()=>window.__sharingDraft.settled()&&window.__sharingDraft.scope()==='guest');
  await page.locator('#libraryDialog').waitFor({state:'detached'});
  assert.equal(await indicator.textContent(),'Моята база — Собственик');
  const own=await page.evaluate(()=>window.__sharingDraft.read());
  assert.equal(own.records.find(r=>r.kind==='constructor').snapshot.parts[0].part.w,600);
  assert.deepEqual(errors,[]);
  console.log('PASS direct grant, first sign-in chooser, switching, live read-only role, revocation and isolated drafts');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
