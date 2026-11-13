const assert=require('node:assert/strict');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors,consoleErrors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`
 window.__rails={
  seed(){libraryEdges=[0,1,2,3].map(i=>({name:'Rail band '+i,color:['#ee4444','#44aa44','#4444ee','#eeee44'][i],price:i+1}));refreshMaterials()},
  inspect(){return snapshotParts().filter(i=>i.name.endsWith('горна царга')).map(i=>({...i,label:partLabelIndex(customParts).get(i.part.key),layout:cutLayout(i.part,i.finish,selectedBoard(i.finish)),strips:boards.find(b=>b.userData.key===i.part.key).children.filter(c=>c.isMesh).length}))},
  capture:captureProjectSnapshot,restore:applyProjectSnapshot,
  edit(){const p=customParts.find(p=>labels[p.key]==='Предна горна царга');selected=p.key;singleMemberSelection=true;updateSelection();openProperties();selectTab('material')},
  rotate(){selected=customParts[0].key;singleMemberSelection=false;rotateSelectedPart(1)}
 };`});
 const section=async text=>{const d=page.locator('.cabinetSection').filter({has:page.locator('summary').filter({hasText:text})});if(!await d.evaluate(e=>e.open))await d.locator('summary').click()};
 const inspect=()=>page.evaluate(()=>window.__rails.inspect());
 const values=[0,1,2,3],button=page.locator('#newCabinetEdges-bodyRails');
 async function checkRails(edges=values){const rails=await inspect();assert.equal(rails.length,2);for(const r of rails){assert.deepEqual(r.finish.edges,edges);assert.equal(r.strips,edges.filter(e=>e!==null).length);assert.equal(r.finish.includeInCut,true)}return rails}
 try{
  await setup([]);await page.evaluate(()=>window.__rails.seed());await page.locator('#newCabinet').click();await section('Конструкция');await page.locator('#newCabinet-shelves').fill('0');await section('Материали');
  assert.equal(await button.isVisible(),true);assert.equal(await page.locator('[data-edge-group=bodyRails]').innerText(),'Царги\nМатериалът на страниците\nКантове');assert.equal(await page.locator('[data-edge-group=bodyRails] select').count(),0);
  await button.click();assert.match(await page.locator('.visualEdgeDialog').innerText(),/Двете горни царги/);await page.locator('[data-edge-slot="0"]').selectOption('2');await page.locator('#visualEdgeCancel').click();await button.click();assert.equal(await page.locator('[data-edge-slot="0"]').inputValue(),'');
  for(let slot=0;slot<4;slot++)await page.locator('[data-edge-slot="'+slot+'"]').selectOption(String(values[slot]));await page.locator('#visualEdgeApply').click();assert.deepEqual(await parts(),[]);
  await section('Конструкция');for(const top of ['panel','none']){await page.locator('#newCabinet-top').selectOption(top);await section('Материали');assert.equal(await button.isVisible(),false);await section('Конструкция')}await page.locator('#newCabinet-top').selectOption('rails');await section('Материали');await button.click();for(let slot=0;slot<4;slot++)assert.equal(await page.locator('[data-edge-slot="'+slot+'"]').inputValue(),String(values[slot]));await page.locator('#visualEdgeCancel').click();
  await page.locator('#newCabinetCreate').click();await page.locator('#newCabinetDialog').waitFor({state:'detached'});const original=await parts();let rails=await checkRails();
  await page.evaluate(()=>window.__test.undoStep());assert.deepEqual(await parts(),[]);await page.evaluate(()=>window.__test.redoStep());assert.deepEqual(await parts(),original);await checkRails();
  // Manufacturing export must use each rail's actual physical slot mapping.
  await page.locator('#navCut').click();await page.evaluate(()=>{XLSX.writeFile=b=>window.__railXlsx=XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]],{header:1,defval:''})});await page.locator('#exportProjectCut').click();const rows=await page.evaluate(()=>window.__railXlsx);
  for(const rail of rails){const row=rows.find(r=>String(r[9]).split(', ').includes(rail.label));assert.ok(row,'Salex rail row '+rail.label);assert.deepEqual(row.slice(10,14),rail.layout.edgeIndices.map(slot=>'Rail band '+rail.finish.edges[slot]))}
  await page.locator('#modeConstructor').click();await page.evaluate(()=>window.__rails.rotate());await checkRails([2,3,1,0]);await page.evaluate(()=>window.__test.undoStep());await checkRails();
  // Existing per-part editor still works independently after generation.
  await page.evaluate(()=>window.__rails.edit());await page.locator('#openEdgeEditor').click();await page.locator('[data-edge-slot="0"]').selectOption('3');await page.locator('#visualEdgeApply').click();await page.locator('#dialogDone').click();rails=await inspect();assert.deepEqual(rails.find(r=>r.name==='Предна горна царга').finish.edges,[3,1,2,3]);assert.deepEqual(rails.find(r=>r.name==='Задна горна царга').finish.edges,values);await page.evaluate(()=>window.__test.undoStep());await checkRails();
  await page.evaluate(()=>{const snapshot=window.__rails.capture();window.__rails.restore(snapshot)});await checkRails();
  // Real cabinet-library save and reopen through the isolated Firebase service.
  await page.locator('#quickSave').click();await page.locator('#fileDialogName').fill('Rails with four bands');await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);await setup([]);await page.locator('#quickOpen').click();await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);await checkRails();
  for(const width of [390,320]){await page.setViewportSize({width,height:850});await page.locator('#newCabinet').click();await section('Материали');assert.equal(await button.isVisible(),true);assert.ok(await button.evaluate(b=>{const r=b.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth}));await button.click();assert.ok(await page.locator('.visualEdgeDialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth}));if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:process.env.KITCHEN_SCREENSHOTS+'/rails-editor-'+width+'.png'});await page.locator('#visualEdgeCancel').click();await page.locator('#newCabinetCancel').click()}
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors.filter(e=>!e.url?.endsWith('/favicon.ico')),[]);console.log('PASS rail shared editor visibility, draft cancel/apply, independent profile on both rails, actual 3D bands and Salex slots, Undo/Redo, rotation, per-part edit, snapshot and cabinet reopen, desktop/390/320px');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
