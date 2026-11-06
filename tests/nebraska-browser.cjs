const assert=require('node:assert/strict');const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
const photo='materials/textures/Screenshot%202026-11-06%20135831.png';
(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__nebraska={mode:()=>currentDesignMode,mesh:()=>{const m=boards[0];return {map:!!m?.material.map,image:m?.material.map?.image?.width,uv:Array.from(m?.geometry.attributes.uv.array||[])}},cut:()=>cutLayout(customParts[0],finishes[customParts[0].key],selectedBoard(finishes[customParts[0].key])),catalog:()=>captureProjectSnapshot().materials};`});
 async function props(){const key=(await parts())[0].key;const p=await page.evaluate(k=>window.__test.face(k),key);await page.mouse.click(p.x,p.y,{button:'right'});await page.getByRole('button',{name:'Свойства…',exact:true}).click();await page.locator('[data-tab="material"]').click()}
 try{
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await setup([{key:'custom891',w:600,h:800,d:18,x:0,y:550,z:0,locks:{d:true}}]);
   await props();await page.locator('#materialSelect').selectOption({label:'Дъб Небраска н.H3331 ST10 EGGER'});await page.locator('#dialogDone').click();
   const before=await parts();await page.locator('#navMaterials').click();
   const row=page.locator('.materialGroup').first().locator('tbody tr').filter({hasText:'Дъб Небраска'});await row.getByRole('button',{name:'Промени',exact:true}).click();
   await page.locator('#materialTextureUrl').fill(photo);await page.locator('#materialGrainRequired').check();await page.locator('#materialTextureWidth').fill('355');await page.locator('#materialTextureHeight').fill('489');
   await page.locator('#verifyMaterialPhoto').click();await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('Снимката е проверена'));
   await page.getByRole('button',{name:'Запази',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.__nebraska.mode()),mode);
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();
   await props();
   assert.equal(await page.locator('#grainDirection').isVisible(),true);
   await page.waitForFunction(()=>window.__nebraska.mesh().map&&window.__nebraska.mesh().image===355);
   assert.deepEqual(await parts(),before);
   const first=await page.evaluate(()=>({mesh:window.__nebraska.mesh(),cut:window.__nebraska.cut()}));await page.locator('#grainDirection').selectOption('x');
   const next=await page.evaluate(()=>({mesh:window.__nebraska.mesh(),cut:window.__nebraska.cut()}));assert.equal(first.cut.A,800);assert.equal(next.cut.A,600);assert.notDeepEqual(first.mesh.uv,next.mesh.uv);
   await page.locator('#dialogDone').click();
   await page.locator('[data-v="front"]').click();await page.locator('#fit').click();await page.waitForTimeout(250);
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`nebraska-${mode}-2d.png`)});
   await page.locator('[data-v="perspective"]').click();await page.locator('#fit').click();await page.waitForTimeout(250);
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`nebraska-${mode}-3d.png`)});
   await props();if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`nebraska-${mode}-grain.png`)});await page.locator('#dialogDone').click();
  }
  assert.deepEqual(errors,[]);console.log('PASS Nebraska real repository image visible, material edit survives return, per-panel grain updates UV/cut, geometry unchanged in both modes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
