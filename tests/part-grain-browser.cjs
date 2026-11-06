const assert=require('node:assert/strict');const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__partGrain={capture:captureProjectSnapshot,restore:applyProjectSnapshot,cut:()=>cutLayout(customParts[0],finishes[customParts[0].key],selectedBoard(finishes[customParts[0].key])),mesh:()=>({map:!!boards[0]?.material.map,uv:Array.from(boards[0]?.geometry.attributes.uv.array||[])}),panelKeys:()=>customParts.map(p=>p.key)};`});
 async function props(){const p=await page.evaluate(k=>window.__test.face(k),(await parts())[0].key);await page.mouse.click(p.x,p.y,{button:'right'});await page.getByRole('button',{name:'Свойства…',exact:true}).click();await page.locator('[data-tab="material"]').click()}
 try{
  await page.locator('#navMaterials').click();
  for(const heading of ['ПДЧ материали','Кантове','Плотове','Гръб HDF']){
   const s=page.locator('.materialGroup').filter({has:page.getByRole('heading',{name:heading,exact:true})});await s.locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();
   assert.equal(await page.locator('#materialGrainRequired').count(),0);assert.equal(await page.locator('#chooseMaterialColor').isVisible(),true);assert.equal(await page.locator('#chooseMaterialPhoto').isVisible(),true);
   for(const id of ['materialTextureUrl','verifyMaterialPhoto','removeMaterialPhoto','uploadMaterialPhoto','copyMaterialPhotoPath'])assert.equal(await page.locator('#'+id).isVisible(),false);
   assert.equal(await page.getByLabel('Линк към сайта',{exact:true}).isVisible(),true);assert.equal(await page.locator('#materialTextureWidth').count(),0);await page.keyboard.press('Escape');
  }
  const s=page.locator('.materialGroup').first();await s.locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();
  const chooser=page.waitForEvent('filechooser');await page.locator('#chooseMaterialPhoto').click();await (await chooser).setFiles(path.join(__dirname,'../materials/textures/Screenshot 2026-11-06 135831.png'));
  await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('Снимката е проверена'));
  await page.locator('.photoWizard button').click();assert.equal(await page.locator('.materialPhotoPreview').isVisible(),true);if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'part-grain-decor.png')});await page.getByRole('button',{name:'Запази',exact:true}).click();
  const decor=(await page.evaluate(()=>window.__partGrain.capture())).materials;
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await page.evaluate(materials=>{const s=window.__partGrain.capture();s.materials=materials;window.__partGrain.restore(s)},decor);await setup([{key:'custom990',w:500,h:3000,d:18,x:0,y:1500,z:0,locks:{d:true}}]);await page.locator('#fit').click();
   await page.waitForFunction(()=>window.__partGrain.mesh().map);const before=await parts();if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`part-grain-${mode}-texture.png`)});
   await props();await page.locator('#partGrainRequired').check();await page.locator('#grainDirection').selectOption('y');assert.equal(await page.evaluate(()=>window.__partGrain.cut().A),3000);
   const uv=await page.evaluate(()=>window.__partGrain.mesh().uv);await page.locator('#grainDirection').selectOption('x');assert.equal(await page.evaluate(()=>window.__partGrain.cut().A),500);assert.notDeepEqual(await page.evaluate(()=>window.__partGrain.mesh().uv),uv);await page.locator('#grainDirection').selectOption('y');await page.locator('#dialogDone').click();assert.deepEqual(await parts(),before);
   // Inspect this design's cut view without switching its workspace.
   await page.locator('#navCut').click();await page.waitForFunction(()=>document.querySelector('#projectCutList').textContent.includes('3000 × 500'));
   const style=await page.locator('#projectCutList td').first().evaluate(el=>({border:getComputedStyle(el).borderLeftStyle,width:el.closest('table').offsetWidth,parent:el.closest('#projectCutList').clientWidth}));assert.equal(style.border,'solid');assert.ok(Math.abs(style.width-style.parent)<3);
   await page.evaluate(()=>{XLSX.writeFile=book=>window.__partXlsx=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:''})});await page.locator('#exportProjectCut').click();const row=await page.evaluate(()=>window.__partXlsx[1]);assert.equal(row[3],3000);assert.equal(row[4],500);assert.equal(row[8],0);
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`part-grain-${mode}-cut.png`)});
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();
   const snap=await page.evaluate(()=>window.__partGrain.capture());
   if(mode==='project'){await page.locator('#projectQuickSaveAs').click();await page.locator('#projectCloudName').fill('Per panel grain 3000');await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));await setup([]);await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudOpen').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'))}
   else{await setup([]);await page.evaluate(s=>window.__partGrain.restore(s),snap)}await page.waitForFunction(()=>window.__partGrain.mesh().map);await props();assert.equal(await page.locator('#partGrainRequired').isChecked(),true);assert.equal(await page.locator('#grainDirection').inputValue(),'y');await page.locator('#partGrainRequired').uncheck();assert.equal(await page.locator('#grainDirection').isVisible(),false);await page.locator('#dialogDone').click();
  }
  // Explicit color selection replaces the photo link only at Save.
  await page.locator('#navMaterials').click();await page.locator('.materialGroup').first().locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();await page.locator('#chooseMaterialColor').click();await page.evaluate(()=>{const input=document.querySelector('.materialEditDialog input[type=color]');input.value='#33aa66';input.dispatchEvent(new Event('input',{bubbles:true}))});await page.getByRole('button',{name:'Запази',exact:true}).click();assert.equal((await page.evaluate(()=>window.__partGrain.capture())).materials.pdcMaterials[0].textureUrl,'');assert.deepEqual(errors,[]);
  console.log('PASS two-button decor UI for all categories, automatic existing-file verification, visible real texture, per-part 500x3000 grain/cut/XLSX and reopen, color replaces photo');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
