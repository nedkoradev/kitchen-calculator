const assert=require('node:assert/strict');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{const {browser,page,errors,consoleErrors}=await openKitchen({extraHooks:`
 window.__complexDimensions={
  async seed(anonymous=false){const {dimensionKitchen}=await import('./tests/fixtures/dimension-kitchen.mjs');const model=dimensionKitchen({pdcMaterials:libraryBoards,edgeMaterials:libraryEdges,...catalogExtra},{anonymous});clearWorkspace();projectInstances.clear();customParts.push(...structuredClone(model.parts));Object.assign(labels,model.labels);Object.assign(finishes,model.finishes);for(const [id,name] of Object.entries(model.names))projectInstances.set(id,name);selected=null;groupSelections.clear();build(false);setView('perspective');return model.expected},
  measurements:()=>cabinetMeasurements(customParts,labels,finishes,projectInstances),
  reopen(){const snapshot=captureProjectSnapshot();applyProjectSnapshot(snapshot)},
  regroup(){groupSelections.clear();customParts.forEach(p=>groupSelections.add(p.key));createAssembly();selected=null;groupSelections.clear();updateSelection()},
  orbit(){camera.position.set(-3600,2600,4200);controls.target.set(0,1150,-350);controls.update()},
  snapshot:captureProjectSnapshot
 };`});
 const read=()=>page.locator('[data-cabinet-dimension]').evaluateAll(es=>es.map(e=>({id:e.dataset.cabinetDimension,kind:e.dataset.dimension,value:Number(e.dataset.value),chain:e.dataset.dimensionChain,transform:e.querySelector('[data-dimension-label]').getAttribute('transform')})));
 const waitAll=()=>page.waitForFunction(()=>document.querySelectorAll('[data-cabinet-dimension]').length===16);
 const overlaps=()=>page.locator('[data-dimension-label]').evaluateAll(es=>{const bs=es.map(e=>e.getBoundingClientRect());return bs.flatMap((a,i)=>bs.slice(i+1).map((b,j)=>({i,j:i+j+1,overlap:a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top}))).filter(x=>x.overlap)});
 try{
  for(const anonymous of [false,true]){
   const expected=await page.evaluate(anonymous=>window.__complexDimensions.seed(anonymous),anonymous);
   if(await page.locator('#nedDimensionsToggle').getAttribute('aria-pressed')!=='true')await page.locator('#nedDimensionsToggle').click();
   await waitAll();let dims=await read();assert.deepEqual(dims.map(d=>d.value),expected.flatMap(e=>[e.w,e.h]));assert.ok(dims.every(d=>d.value>=600));assert.equal(new Set(dims.filter(d=>d.kind==='width').map(d=>d.chain)).size,4);
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:process.env.KITCHEN_SCREENSHOTS+'/dimensions-complex-debug.png'});
   assert.deepEqual(await overlaps(),[],'compact labels must not collide on the full L kitchen');
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:process.env.KITCHEN_SCREENSHOTS+'/dimensions-complex-'+anonymous+'.png'});
   const before=await page.evaluate(()=>window.__test.parts());const transforms=dims.map(d=>d.transform);
   await page.evaluate(()=>window.__complexDimensions.orbit());await page.waitForTimeout(300);dims=await read();assert.deepEqual(dims.map(d=>d.value),expected.flatMap(e=>[e.w,e.h]));assert.notDeepEqual(dims.map(d=>d.transform),transforms);assert.deepEqual(await page.evaluate(()=>window.__test.parts()),before);
   await page.evaluate(()=>window.__test.view('perspective'));await waitAll();await page.evaluate(()=>window.__complexDimensions.regroup());await waitAll();assert.equal((await page.evaluate(()=>window.__complexDimensions.measurements())).length,8);
   await page.evaluate(()=>window.__complexDimensions.reopen());await waitAll();assert.deepEqual((await read()).map(d=>d.value),expected.flatMap(e=>[e.w,e.h]));
  }
  for(const width of [390,320]){await page.setViewportSize({width,height:850});await page.evaluate(()=>window.__test.view('perspective'));await page.waitForTimeout(150);const dims=await read();assert.ok(await page.locator('[data-dimension-label]').evaluateAll(es=>{const d=document.querySelector('#viewControlsDock').getBoundingClientRect();return es.every(e=>{const r=e.getBoundingClientRect();return !(r.left<d.right&&r.right>d.left&&r.top<d.bottom&&r.bottom>d.top)})}),'labels must never obscure controls');assert.ok(dims.length>8&&dims.length<=16);assert.ok(dims.every(d=>d.value>=600));assert.equal((await page.evaluate(()=>window.__complexDimensions.measurements())).length,8);if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:process.env.KITCHEN_SCREENSHOTS+'/dimensions-complex-mobile-'+width+'.png'});}
  await page.setViewportSize({width:1400,height:1000});await page.locator('#modeProject').click();await page.evaluate(()=>window.__complexDimensions.seed(true));await waitAll();assert.equal((await page.evaluate(()=>window.__complexDimensions.measurements())).length,8);
  await page.locator('#nedDimensionsToggle').click();assert.equal(await page.locator('#nedCabinetDimensions').isVisible(),false);assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors.filter(e=>!e.url?.endsWith('/favicon.ico')),[]);console.log('PASS eight nested anonymous/named L cabinets, no door/leg dimensions, four width chains, compact labels, orbit, regroup/reopen, mobile and Project/Constructor');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
