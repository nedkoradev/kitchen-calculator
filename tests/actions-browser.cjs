const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');
const keys=['kitchenV2Cabinets','kitchenV2Projects','kitchenPdcMaterials','kitchenEdgeMaterials','kitchenV2ExtraMaterials','kitchenActiveMaterialBase'];
const panel=(key,x=0)=>({key,x,y:150,z:0,w:101,h:18,d:300,locks:{w:false,h:true,d:false}});
(async()=>{
 const initialStorage=Object.fromEntries(keys.map(key=>[key,'old local record']));initialStorage['firebase:authUser:test']='auth fixture';initialStorage.otherApplication='keep';
 const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,initialStorage});
 try{
  await page.waitForFunction(()=>window.__firebaseDouble);
  for(const key of keys)assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('firebase:authUser:test')),'auth fixture');assert.equal(await page.evaluate(()=>localStorage.getItem('otherApplication')),'keep');
  await page.evaluate(()=>localStorage.setItem('kitchenActiveMaterialBase','New preference'));
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>window.__test&&window.__firebaseDouble);
  assert.equal(await page.evaluate(()=>localStorage.getItem('kitchenActiveMaterialBase')),'New preference');
  console.log('PASS one-time local cleanup before app reads, auth/other apps retained, new settings survive reload');
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();
   const rail=mode==='constructor'?'#toolsPanel':'#projectTools';
   const icons=await page.locator(`${rail} button.iconOnly:visible`).evaluateAll(buttons=>buttons.map(button=>{
    const icon=button.querySelector('svg'),r=button.getBoundingClientRect(),s=icon.getBoundingClientRect();
    return {id:button.id,title:button.title,label:button.getAttribute('aria-label'),stroke:icon.getAttribute('stroke-width'),w:s.width,h:s.height,bw:r.width,bh:r.height,content:button.textContent.trim()};
   }));
   assert.ok(icons.length>=6);
   for(const icon of icons){assert.equal(icon.w,24,icon.id);assert.equal(icon.h,24,icon.id);assert.equal(icon.stroke,'2');assert.ok(icon.bw>=44&&icon.bh>=44,icon.id);assert.ok(icon.title&&icon.label);assert.equal(icon.content,'')}
   await setup([]);
   const horizontal=mode==='constructor'?'#addHorizontal':'#projectAddHorizontal',vertical=mode==='constructor'?'#addVertical':'#projectAddVertical';
   await page.locator(horizontal).click();assert.equal((await parts()).at(-1).h,18);
   await page.locator(vertical).click();assert.equal((await parts()).at(-1).w,18);assert.equal((await parts()).length,2);
   const original=[panel('custom701',-300),panel('custom702',300)];await setup(original);
   await page.evaluate(()=>window.__test.selectAll());
   assert.equal(await page.locator('#groupParts:visible,#projectGroupParts:visible').count(),0);await page.keyboard.press('Control+g');
   const grouped=await parts();assert.ok(grouped.every(p=>p.assembly===grouped[0].assembly));assert.deepEqual(grouped.map(p=>p.assemblyStack),[[null],[null]]);
   await page.keyboard.press('Control+u');assert.deepEqual(await parts(),original);
   await setup([panel('custom703')]);
   await page.locator(mode==='constructor'?'#rotateRight':'#projectRotateRight').click();assert.equal((await parts())[0].w,300);assert.equal((await parts())[0].d,101);
   await page.locator(mode==='constructor'?'#rotateLeft':'#projectRotateLeft').click();assert.deepEqual(await parts(),[panel('custom703')]);
   await page.locator('#helpButton').click();await page.locator('#helpClose').click();assert.equal(await page.locator('#helpDialog').evaluate(el=>el.open),false);
   if(mode==='constructor'){
    await page.locator('#quickSave').click();await page.locator('#fileDialogName').fill('Icon cabinet');await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);
    await setup([]);await page.locator('#quickOpen').click();await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);assert.equal((await parts()).length,1);
   }else{
    await page.locator('#projectQuickSave').click();await page.locator('#projectCloudName').fill('Icon project');await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
    await page.locator('#projectQuickSave').click();await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
    await setup([]);await page.locator('#projectQuickOpen').click();assert.equal(await page.locator('#projectCloudLocal').count(),0);await page.locator('#projectCloudOpen').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));assert.equal((await parts()).length,1);
    await page.locator('#projectQuickAdd').click();await page.locator('#projectAddDialogConfirm').click();await page.waitForFunction(()=>window.__test.parts().length===2);
    await page.locator('#projectRoomSettings').click();await page.getByRole('button',{name:'Отказ',exact:true}).click();
   }
   console.log(`PASS ${mode}: uniform icons/tooltips/touch targets, add, group/ungroup, rotations, save/open and dialogs`);
  }
  await page.locator('#navLibrary').click();
  await page.getByRole('button',{name:'Отвори в конструктора',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#modeConstructor').classList.contains('mainNavActive'));
  await page.locator('#navLibrary').click();page.once('dialog',dialog=>dialog.accept('Icon cabinet copy'));
  await page.getByRole('button',{name:'Дублирай',exact:true}).first().click();
  await page.waitForFunction(()=>window.__firebaseDouble.rows().filter(row=>row.path.includes('/v2_cabinets/')).length===2);
  await page.locator('#navLibrary').click();page.once('dialog',dialog=>dialog.accept());
  await page.locator('.libraryCard').filter({hasText:'Icon cabinet copy'}).getByRole('button',{name:'Изтрий',exact:true}).click();
  await page.waitForFunction(()=>window.__firebaseDouble.rows().filter(row=>row.path.includes('/v2_cabinets/')).length===1);
  await page.getByRole('button',{name:'Запази текущия шкаф',exact:true}).click();await page.locator('#fileDialogClose').click();
  await page.locator('#navMaterials').click();page.once('dialog',dialog=>dialog.accept('Icon materials'));
  await page.getByRole('button',{name:'Запази база',exact:true}).click();
  await page.waitForFunction(()=>window.__firebaseDouble.rows().some(row=>row.path.includes('/materials/')));
  await page.waitForFunction(()=>document.querySelector('#v2MaterialCloudSelect').options.length>1);
  await page.locator('#v2MaterialCloudSelect').selectOption({index:1});await page.evaluate(()=>localStorage.setItem('kitchenActiveMaterialBase','Before load'));await page.getByRole('button',{name:'Зареди база',exact:true}).click();
  await page.waitForFunction(()=>localStorage.getItem('kitchenActiveMaterialBase')==='Icon materials');
  await page.getByRole('button',{name:'Нов материал',exact:true}).first().click();
  await page.keyboard.press('Escape');
  await page.locator('.materialSection').filter({has:page.getByRole('heading',{name:'Услуги',exact:true})}).getByRole('button',{name:'Промени',exact:true}).click();
  await page.getByRole('button',{name:'Добави услуга',exact:true}).click();assert.equal(await page.locator('.extraServiceRows > div').count(),1);await page.keyboard.press('Escape');
  console.log('PASS library open/duplicate/delete/save and material save/load/new dialog SVG actions');
  await page.setViewportSize({width:390,height:844});await page.locator('#modeConstructor').click();
  assert.ok(await page.locator('#toolsPanel').isVisible());
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
