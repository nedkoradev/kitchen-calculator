const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors,consoleErrors,field}=await openKitchen({extraHooks:`
 window.__dimensions={
  async seed(){const {generateCabinet,cabinetPresets}=await import('./cabinet-generator.mjs');clearWorkspace();const catalog={pdcMaterials:libraryBoards,edgeMaterials:libraryEdges,...catalogExtra};for(const [type,w,x,y] of [['base',600,-450,0],['wall',900,450,1400]]){const items=generateCabinet({...cabinetPresets[type],w,shelves:0},catalog);items.forEach(i=>{i.part.assembly=type});restoreParts(items,{x,y,z:0})}build(false);setView('perspective')},
  capture:captureProjectSnapshot,restore:applyProjectSnapshot,
  edit(){selected=customParts[0].key;singleMemberSelection=false;updateSelection();openProperties();selectTab('sizes')},
  rotate(){selected=customParts[0].key;singleMemberSelection=false;rotateSelectedPart(1)},
  move(){const id=customParts[0].assembly;customParts.filter(p=>p.assembly===id).forEach(p=>p.x+=100);build(false)},
  orbit(){camera.position.set(-2600,2200,3600);controls.target.set(0,1000,0);controls.update()},
  nest(){groupSelections.clear();customParts.forEach(p=>groupSelections.add(p.key));createAssembly()},
  liveDrag(){assemblies.get(customParts[0].assembly).position.x+=60},
  measure:()=>cabinetMeasurements(customParts,labels,finishes)
 };`});
 const read=()=>page.locator('[data-cabinet-dimension]').evaluateAll(es=>es.map(e=>({id:e.dataset.cabinetDimension,kind:e.dataset.dimension,value:Number(e.dataset.value),text:e.querySelector('text').textContent,transform:e.querySelector('[data-dimension-label]').getAttribute('transform')})));
 const wait=async()=>{await page.waitForFunction(()=>document.querySelectorAll('[data-cabinet-dimension]').length===4)};
 try{
  await page.evaluate(()=>window.__dimensions.seed());const before=await page.evaluate(()=>window.__test.parts());
  const button=page.locator('#nedDimensionsToggle');assert.equal(await button.innerText(),'↔ мм');assert.equal(await button.evaluate(b=>b.previousElementSibling.id),'nedTransparencyToggle');
  await button.click();await wait();let items=await read();assert.deepEqual(items.map(i=>i.value),[600,858,900,720]);assert.ok(items.every(i=>/^\d+ мм$/.test(i.text)));
  assert.ok(await page.locator('#nedCabinetDimensions line').evaluateAll(es=>es.every(e=>e.getAttribute('stroke')==='#3988ff'&&e.getAttribute('stroke-width')==='1.5')));
  assert.ok(await page.locator('[data-dimension-label] rect').evaluateAll(es=>es.every(e=>e.getAttribute('fill')==='#f0f6ff'&&e.getAttribute('rx')==='4')));
  const overlap=()=>page.locator('[data-dimension-label]').evaluateAll(es=>{const bs=es.map(e=>e.getBoundingClientRect());return bs.some((a,i)=>bs.slice(i+1).some(b=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top))});
  assert.equal(await overlap(),false);
  assert.deepEqual(await page.evaluate(()=>window.__test.parts()),before);
  const old=items.map(i=>i.transform);await page.evaluate(()=>window.__dimensions.orbit());await page.waitForTimeout(500);items=await read();assert.notDeepEqual(items.map(i=>i.transform),old);assert.deepEqual(items.map(i=>i.value),[600,858,900,720]);
  assert.equal(await overlap(),false);
  for(const view of ['front','perspective']){await page.evaluate(v=>window.__test.view(v),view);await wait();assert.deepEqual((await read()).map(i=>i.value),[600,858,900,720])}
  await page.evaluate(()=>window.__dimensions.rotate());await wait();assert.deepEqual((await read()).map(i=>i.value),[600,858,900,720]);
  await page.evaluate(()=>window.__test.undoStep());await page.evaluate(()=>window.__dimensions.edit());await field('partW',700);await page.locator('#dialogDone').click();await page.waitForFunction(()=>[...document.querySelectorAll('[data-dimension="width"]')].some(e=>e.dataset.value==='700'));
  await page.evaluate(()=>window.__test.undoStep());await wait();assert.deepEqual((await read()).map(i=>i.value),[600,858,900,720]);await page.evaluate(()=>window.__test.redoStep());await page.waitForFunction(()=>document.querySelector('[data-dimension="width"]').dataset.value==='700');await page.evaluate(()=>window.__test.undoStep());
  const prior=(await read()).map(i=>i.transform);await page.evaluate(()=>window.__dimensions.move());await page.waitForTimeout(100);assert.notDeepEqual((await read()).map(i=>i.transform),prior);
  const dragBefore=(await read()).map(i=>i.transform);await page.evaluate(()=>window.__dimensions.liveDrag());await page.waitForTimeout(100);assert.notDeepEqual((await read()).map(i=>i.transform),dragBefore);await page.evaluate(()=>window.__test.build());
  await page.evaluate(()=>window.__dimensions.nest());await wait();assert.deepEqual((await read()).map(i=>i.value),[600,858,900,720]);
  await page.evaluate(()=>{const snap=window.__dimensions.capture();window.__dimensions.restore(snap)});await wait();assert.deepEqual((await read()).map(i=>i.value),[600,858,900,720]);
  await page.locator('#nedTransparencyToggle').click();await wait();assert.equal(await button.getAttribute('aria-pressed'),'true');await page.locator('#nedTransparencyToggle').click();
  for(const width of [1400,390,320]){await page.setViewportSize({width,height:width===1400?1000:850});await page.evaluate(()=>window.__test.view('perspective'));await wait();assert.equal(await overlap(),false);assert.ok(await button.isVisible());if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:process.env.KITCHEN_SCREENSHOTS+'/dimensions-'+width+'.png'})}
  await button.click();assert.equal(await page.locator('#nedCabinetDimensions').isVisible(),false);await button.click();await wait();
  await page.setViewportSize({width:1400,height:1000});await page.locator('#modeProject').click();await page.evaluate(()=>window.__dimensions.seed());await wait();assert.deepEqual((await read()).map(i=>i.value),[600,858,900,720]);
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors.filter(e=>!e.url?.endsWith('/favicon.ico')),[]);
  console.log('PASS individual cabinet width/height, 4 labels only, 1.5px blue styling, perspective/orbit, rotation, resize, Undo/Redo, move/live drag, nested groups, snapshot reopen, transparency, Project/Constructor, mobile, collision avoidance, toggle and clean console');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
