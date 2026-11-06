const assert=require('node:assert/strict');
const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__textures={
 capture:captureProjectSnapshot,restore:applyProjectSnapshot,
 meshes:()=>boards.map(m=>({map:!!m.material.map,uv:Array.from(m.geometry.attributes.uv.array),edges:m.children.filter(c=>c.isMesh).map(c=>({map:!!c.material.map,uv:Array.from(c.geometry.attributes.uv.array)}))})),
 use(type){const p=customParts[0];finishes[p.key]={materialType:type,material:0,edges:[0,0,0,0],grainAxis:'y'};build(false);updateSelection()}
 };`});
 try{
  await page.route('**/materials/textures/category.png*',r=>r.fulfill({contentType:'image/png',path:path.join(__dirname,'fixtures/grain.png')}));
  await page.locator('#navMaterials').click();
  const names=['ПДЧ материали','Гръб HDF','Плотове','Кантове'];
  for(const name of names){
   const section=page.locator('.materialSection').filter({has:page.getByRole('heading',{name,exact:true})});
   await section.locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();
   assert.equal(await page.getByRole('heading',{name:'Декор и текстура',exact:true}).count(),1);
   assert.equal(await page.locator('#materialGrainRequired').count(),name==='Кантове'?0:1);
   await page.locator('#materialTextureUrl').fill('materials/textures/category.png');
   await page.locator('#materialTextureWidth').fill('40');await page.locator('#materialTextureHeight').fill('80');
   await page.getByRole('button',{name:'Провери снимката в GitHub',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('Снимката е достъпна'));
   if(name!=='Кантове')await page.locator('#materialGrainRequired').check();
   await page.getByRole('button',{name:'Запази',exact:true}).click();
   await section.locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();
   assert.equal(await page.locator('#materialTextureUrl').inputValue(),'materials/textures/category.png');
   assert.equal(await page.locator('#materialTextureWidth').inputValue(),'40');assert.equal(await page.locator('#materialTextureHeight').inputValue(),'80');
   await page.keyboard.press('Escape');
  }
  page.once('dialog',d=>d.accept('All textures'));await page.getByRole('button',{name:'Запази база',exact:true}).click();
  await page.waitForFunction(()=>window.__firebaseDouble.rows().some(r=>r.path.includes('/materials/')));
  const saved=await page.evaluate(()=>window.__firebaseDouble.rows().find(r=>r.path.includes('/materials/')).value);
  assert.ok(JSON.stringify(saved).includes('category.png'));
  await page.evaluate(()=>new Promise(resolve=>{window.addEventListener('kitchen-v2-cloud-material-loaded',()=>setTimeout(resolve,0),{once:true});const row=window.__firebaseDouble.rows().find(r=>r.path.includes('/materials/'));window.dispatchEvent(new CustomEvent('kitchen-v2-material-load-request',{detail:{id:row.path.split('/').at(-1)}}))}));
  const snapshot=await page.evaluate(()=>window.__textures.capture());
  for(const key of ['pdcMaterials','edgeMaterials','backMaterials','worktops'])assert.equal(snapshot.materials[key][0].textureUrl,'materials/textures/category.png');
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();
   await page.evaluate(s=>window.__textures.restore(s),snapshot);
   await setup([{key:'custom991',w:600,h:700,d:18,x:0,y:500,z:0,locks:{d:true}}]);
   for(const type of ['pdc','back','worktop']){
    await page.evaluate(type=>window.__textures.use(type),type);const before=await parts();console.log('Checking',mode,type);
    await page.waitForFunction(()=>window.__textures.meshes()[0].map&&window.__textures.meshes()[0].edges.every(e=>e.map));
    for(const view of ['front','top','perspective'])await page.evaluate(v=>window.__test.view(v),view);
    assert.deepEqual(await parts(),before);
    const meshes=await page.evaluate(()=>window.__textures.meshes());assert.equal(meshes[0].edges.length,4);
    assert.ok(meshes[0].edges.every(e=>new Set(e.uv).size>2));
   }
   const snap=await page.evaluate(()=>window.__textures.capture());await setup([]);
   await page.evaluate(s=>window.__textures.restore(s),snap);
   await page.waitForFunction(()=>window.__textures.meshes()[0].map&&window.__textures.meshes()[0].edges.every(e=>e.map));
  }
  assert.deepEqual(errors,[]);console.log('PASS all four material editors, verified URLs, cloud payload, reopening and face/edge textures in both modes');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
