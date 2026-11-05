const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__projectTest={capture:captureProjectSnapshot,apply:applyProjectSnapshot,opened:()=>projectCloudUI.opened};`});
 try{
  await page.waitForFunction(()=>window.__firebaseDouble&&document.querySelector('#cloudStatus').textContent.includes('alice'));
  const constructorPart={key:'custom900',x:0,y:150,z:0,w:18,h:300,d:400,locks:{w:true}};
  await setup([constructorPart]);const constructorCatalog=await page.evaluate(()=>window.__projectTest.capture().materials);
  await page.locator('#modeProject').click();
  const payload={parts:[{part:{key:'custom101',w:101,h:18,d:400,x:.5,y:9,z:0,locks:{h:true},assembly:'outer',assemblyStack:[null,'inner']},name:'Рафт',finish:{material:1,edges:[0,null,2,3]},allEdges:false}],room:{w:6000,h:3000,d:5000},assemblyNames:{outer:'Моя група',inner:'Вътрешен шкаф'},materials:{pdcMaterials:[{name:'A',color:'#aabbcc'},{name:'B',color:'#112233'}],edgeMaterials:[{name:'a'},{name:'b'},{name:'c'},{name:'d'}],backMaterials:[],worktops:[],servicePrices:{cut:123},activeBase:'Тестова база'},settings:{viewMode:'top',projectTab:'3d'}};
  await page.evaluate(data=>window.__projectTest.apply(data),payload);
  const normalized=()=>page.evaluate(()=>{
   const p=window.__projectTest.capture();
   return {room:p.room,materials:p.materials,settings:{viewMode:p.settings.viewMode,projectTab:p.settings.projectTab},parts:p.parts.map(({part,name,finish,allEdges})=>({part:{...part,key:'ignored',assembly:!!part.assembly,assemblyStack:part.assemblyStack.map(v=>v===null?null:true)},name,finish,allEdges})),names:Object.values(p.assemblyNames).sort()};
  });
  await page.waitForTimeout(80);const before=await normalized();
  const cloudRows=()=>page.evaluate(()=>window.__firebaseDouble.rows().filter(r=>r.path.includes('/v2_projects/')));
  const saveDialog=async name=>{await page.locator('#projectQuickSave').click();if(name!==undefined)await page.locator('#projectCloudName').fill(name);await page.locator('#projectCloudSave').click()};
  const close=async()=>page.locator('#projectCloudCancel').click();
  const waitClosed=()=>page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
  await page.evaluate(()=>window.__firebaseDouble.holdWrites());
  await saveDialog('Моя кухня');await page.waitForFunction(()=>window.__releaseProjectWrite);
  assert.equal((await cloudRows()).length,0);assert.equal(await page.locator('#projectCloudDialog').count(),1);
  await page.evaluate(()=>window.__firebaseDouble.release());await waitClosed();
  let rows=await cloudRows();assert.equal(rows.length,1);const id=rows[0].path.split('/').at(-1);
  assert.deepEqual(rows[0].value.data.materials,payload.materials);
  await saveDialog();await waitClosed();rows=await cloudRows();assert.equal(rows.length,1);assert.equal(rows[0].value.revision,2);assert.ok(rows[0].path.endsWith('/'+id));
  console.log('PASS cloud save waits for commit; overwrite keeps ID and all project data');

  await page.locator('#projectQuickSave').click();await page.locator('#projectCloudName').fill('Преименувана');
  page.once('dialog',d=>d.dismiss());await page.locator('#projectCloudSave').click();
  await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('отказан'));assert.equal((await cloudRows())[0].value.name,'Моя кухня');
  page.once('dialog',d=>d.accept());await page.locator('#projectCloudSave').click();await waitClosed();
  assert.equal((await cloudRows())[0].value.name,'Преименувана');
  await page.locator('#projectQuickSaveAs').click();await page.locator('#projectCloudName').fill('Преименувана');await page.locator('#projectCloudSave').click();
  await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('Вече има проект'));assert.equal((await cloudRows()).length,1);
  await page.locator('#projectCloudName').fill('Копие');await page.locator('#projectCloudSave').click();await waitClosed();assert.equal((await cloudRows()).length,2);
  console.log('PASS rename confirmation/cancel, Save As and duplicate rejection');

  const savedCamera=(await cloudRows()).find(row=>row.path.endsWith('/'+id)).value.data.settings.camera;
  await setup([]);await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudList').selectOption(id);await page.locator('#projectCloudOpen').click();await waitClosed();await page.waitForTimeout(80);
  assert.deepEqual(await normalized(),before);
  const loadedCamera=await page.evaluate(()=>window.__projectTest.capture().settings.camera);
  for(const key of ['position','target'])loadedCamera[key].forEach((value,i)=>assert.ok(Math.abs(value-savedCamera[key][i])<1e-6));
  assert.equal(loadedCamera.zoom,savedCamera.zoom);
  await page.locator('#modeConstructor').click();
  assert.deepEqual((await parts()).map(({key,...p})=>p),[{...constructorPart,key:undefined}].map(({key,...p})=>p));
  assert.deepEqual(await page.evaluate(()=>window.__projectTest.capture().materials),constructorCatalog);await page.locator('#modeProject').click();await page.waitForTimeout(80);assert.deepEqual(await normalized(),before);
  console.log('PASS full reload and mode switch: room, nested names/null history, geometry, locks, materials, edges, settings');

  const local=[{id:'local-old',name:'Локален стар',room:payload.room,parts:payload.parts}];
  await page.evaluate(items=>localStorage.setItem('kitchenV2Projects',JSON.stringify(items)),local);
  // The existing app loads local records at startup, so reload to exercise migration.
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__projectTest&&window.__firebaseDouble);
  await page.locator('#modeProject').click();await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudLocal').click();await page.locator('#projectLocalOpen').click();await waitClosed();
  await saveDialog('Мигриран');await waitClosed();assert.equal((await cloudRows()).length,1);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('kitchenV2Projects'))),local);
  console.log('PASS explicit migration leaves legacy local records unchanged');

  await page.evaluate(()=>window.__firebaseDouble.failWrites(true));await saveDialog();
  await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('не е потвърден'));
  assert.equal(await page.locator('#projectCloudDialog').count(),1);await close();await page.evaluate(()=>window.__firebaseDouble.failWrites(false));
  await page.locator('#projectQuickOpen').click();await page.waitForFunction(()=>document.querySelector('#projectCloudList').options.length===1);
  page.once('dialog',d=>d.dismiss());await page.locator('#projectCloudDelete').click();assert.equal((await cloudRows()).length,1);
  await page.evaluate(()=>window.__firebaseDouble.failWrites(true));page.once('dialog',d=>d.accept());await page.locator('#projectCloudDelete').click();
  await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('не е потвърден'));assert.equal((await cloudRows()).length,1);await page.evaluate(()=>window.__firebaseDouble.failWrites(false));
  page.once('dialog',d=>d.accept());await page.locator('#projectCloudDelete').click();await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('изтрит'));assert.equal((await cloudRows()).length,0);await close();
  console.log('PASS failed write has no success; delete cancellation and confirmed delete');

  await saveDialog('Само за Alice');await waitClosed();
  await page.locator('#projectQuickOpen').click();await page.waitForFunction(()=>document.querySelector('#projectCloudList').options.length===1);
  await page.evaluate(()=>window.__firebaseDouble.setUser('bob'));await waitClosed();assert.equal((await parts()).length,0);
  await page.locator('#projectQuickOpen').click();await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('Няма запазени'));
  assert.equal(await page.locator('#projectCloudList option').count(),0);await close();
  assert.equal(await page.evaluate(()=>window.__projectTest.opened()),null);
  await saveDialog('Само за Alice');await waitClosed();
  rows=await cloudRows();assert.equal(rows.length,2);assert.ok(rows.some(r=>r.path.startsWith('users/alice/')));assert.ok(rows.some(r=>r.path.startsWith('users/bob/')));
  await page.evaluate(()=>window.__firebaseDouble.setUser('alice'));assert.equal((await parts()).length,1);
  await page.evaluate(()=>window.__firebaseDouble.setUser('bob'));assert.equal((await parts()).length,0);
  await page.evaluate(()=>window.__firebaseDouble.failReads(true));await page.locator('#projectQuickOpen').click();
  await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('не е потвърден'));assert.equal(await page.locator('#projectCloudList option').count(),0);await close();await page.evaluate(()=>window.__firebaseDouble.failReads(false));
  await page.evaluate(()=>window.__firebaseDouble.setUser(null));await page.locator('#projectQuickSave').click();await page.locator('#projectCloudSave').click();
  await page.waitForFunction(()=>document.querySelector('#projectCloudStatus').textContent.includes('Първо влез'));await close();
  await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudLocal').click();await page.locator('#projectLocalOpen').click();await waitClosed();
  await page.evaluate(()=>window.__firebaseDouble.setUser('alice'));assert.equal(await page.locator('#projectTitle').inputValue(),'Локален стар');
  assert.equal(await page.evaluate(()=>window.__projectTest.opened()),null);assert.equal((await cloudRows()).length,2);
  assert.deepEqual(errors,[]);
  console.log('PASS account list isolation, cleared identity and signed-out errors; real Firebase is never contacted');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
