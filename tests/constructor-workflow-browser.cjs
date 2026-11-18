const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,parts,field,errors}=await openKitchen({firebaseDouble:true});
 const rows=()=>page.evaluate(()=>window.__firebaseDouble.rows());
 const library=page.locator('#libraryDialog');
 const dialog=page.locator('#fileDialog');
 const cabinet=(name,w)=>({name,category:'Горни шкафове',parts:[{part:{key:'p',w,h:600,d:18,x:0,y:300,z:0,locks:{}},name:'Панел'}]});
 const add=async name=>{
  await page.locator('#constructorLibraryAdd').click();
  await library.locator('.libraryCard').filter({has:page.getByText(name,{exact:true})}).getByRole('button',{name:'Добави в конструктора'}).click();
  await library.waitFor({state:'detached'});
 };
 const save=()=>page.keyboard.press('Control+s');
 const confirm=()=>page.locator('#fileDialogConfirm').click();
 const ensureOverwrite=async()=>{
  await dialog.waitFor();
  await confirm();
  assert.equal(await page.locator('#fileDialogConfirm').innerText(),'Презапиши');
 };
 try{
  await page.evaluate(({one,two})=>{
   const mock=window.__firebaseDouble;
   mock.seed('users/alice/v2_cabinets/cab_one',one);
   mock.seed('users/alice/v2_cabinets/cab_two',two);
  },{one:cabinet('Алфа',500),two:cabinet('Бета',600)});

  for(const width of [1400,390,320]){
   await page.setViewportSize({width,height:850});
   for(const id of ['constructorLibraryAdd','newCabinet','addAppliance']){
    const control=page.locator('#shellTools #'+id);
    assert.equal(await control.isVisible(),true);
    assert.equal(await control.locator('svg').count(),1);
    await control.scrollIntoViewIfNeeded();
    const box=await control.boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=width+1);
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:1400,height:1000});
  await page.locator('#newCabinet').click();
  await page.locator('#newCabinetDialog').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#newCabinetDialog').waitFor({state:'detached'});
  await page.locator('#addAppliance').click();
  await page.locator('#applianceDialog').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#applianceDialog').waitFor({state:'detached'});

  await add('Алфа');
  await add('Бета');
  assert.equal((await parts()).length,2);
  const original=await parts();
  await field('partW',630);
  assert.deepEqual((await parts())[0],original[0]);
  assert.equal((await parts())[1].w,630);
  assert.equal((await rows()).find(row=>row.path.endsWith('/cab_two')).value.parts[0].part.w,600);

  await page.locator('#constructorLibraryAdd').click();
  await library.locator('.libraryCard').filter({has:page.getByText('Алфа',{exact:true})}).getByRole('button',{name:'Отвори за редакция'}).click();
  await page.locator('.nedConfirmActions button').last().click();
  await library.waitFor({state:'detached'});
  assert.equal((await parts()).length,1);
  await field('partW',550);
  await page.evaluate(duplicate=>{
   window.__firebaseDouble.seed('users/alice/v2_cabinets/cab_legacy_duplicate',duplicate);
   window.dispatchEvent(new Event('kitchen-project-auth-request'));
  },cabinet('Алфа',420));
  await save();
  await ensureOverwrite();
  await page.locator('#fileDialogCancel').click();
  assert.equal((await parts())[0].w,550);
  await save();
  await ensureOverwrite();
  await confirm();
  await dialog.waitFor({state:'hidden'});
  const ownRows=await rows();
  assert.equal(ownRows.find(row=>row.path.endsWith('/cab_one')).value.parts[0].part.w,550);
  assert.equal(ownRows.find(row=>row.path.endsWith('/cab_one')).value.name,'Алфа');
  assert.equal(ownRows.find(row=>row.path.endsWith('/cab_legacy_duplicate')).value.parts[0].part.w,420);
  await save();
  await ensureOverwrite();
  await dialog.getByRole('button',{name:'Запази като нов'}).click();
  await page.locator('#fileDialogName').fill('Ново копие');
  await confirm();
  await dialog.waitFor({state:'hidden'});
  assert.equal((await rows()).filter(row=>row.value.name==='Ново копие').length,1);

  await page.evaluate(model=>{
   const mock=window.__firebaseDouble;
   mock.seed('users/bob/v2_cabinets/cab_shared',model);
   mock.seed('nediq_access/alice@example.test/bases/bob',{ownerUid:'bob',ownerName:'Боб',role:'editor'});
  },cabinet('Споделен шкаф',560));
  await page.locator('#sharedBaseStatus').click();
  await page.getByLabel('Избрана база').selectOption('bob');
  await page.getByRole('button',{name:'Отвори база'}).click();
  await page.locator('#sharingDialog').waitFor({state:'detached'});
  await page.locator('#constructorLibraryAdd').click();
  await library.getByRole('button',{name:'Отвори за редакция'}).click();
  await library.waitFor({state:'detached'});
  await field('partW',590);
  await save();
  await ensureOverwrite();
  await page.evaluate(()=>{
   const mock=window.__firebaseDouble,path='users/bob/v2_cabinets/cab_shared';
   const latest=mock.rows().find(row=>row.path===path).value;
   mock.seed(path,{...latest,name:'Преименуван от Боб'});
  });
  await confirm();
  await dialog.waitFor({state:'hidden'});
  const shared=(await rows()).find(row=>row.path==='users/bob/v2_cabinets/cab_shared').value;
  assert.equal(shared.parts[0].part.w,590);
  assert.equal(shared.name,'Преименуван от Боб');
  assert.deepEqual((await rows()).filter(row=>row.path.startsWith('users/alice/')&&row.value.name!=='Ново копие'),ownRows.filter(row=>row.path.startsWith('users/alice/')));
  await save();
  await ensureOverwrite();
  await page.evaluate(()=>window.__firebaseDouble.seed('nediq_access/alice@example.test/bases/bob',{ownerUid:'bob',ownerName:'Боб',role:'viewer'}));
  await page.waitForFunction(()=>document.querySelector('#sharedBaseStatus').textContent.includes('Наблюдател'));
  const beforeDenied=await rows();
  await confirm();
  assert.match(await page.locator('#fileDialogStatus').innerText(),/само за преглед/);
  assert.deepEqual(await rows(),beforeDenied);
  assert.deepEqual(errors,[]);
  console.log('PASS toolbar and mobile width, independent additions, explicit edit, stable original ID/name, save as, cancel, shared editor and viewer');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
