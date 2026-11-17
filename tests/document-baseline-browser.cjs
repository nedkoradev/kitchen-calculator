const assert=require('node:assert/strict');const path=require('node:path');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors,setup,field}=await openKitchen({firebaseDouble:true,extraHooks:"window.__baseline={initialMode:currentDesignMode,snapshot:captureProjectSnapshot,edit(){selected=customParts[0].key;singleMemberSelection=true;groupSelections.clear();updateSelection();openProperties();selectTab('material')},cut(){XLSX.writeFile=b=>window.__baseline.exported=XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]],{header:1,defval:''})}};"});
 const capture=()=>page.evaluate(()=>window.__baseline.snapshot());
 const normalized=data=>({room:data.room,materials:data.materials,parts:data.parts.map(({part,name,finish,allEdges})=>({part:{...part,key:'part',assembly:!!part.assembly,assemblyStack:(part.assemblyStack||[]).map(v=>!!v)},name,finish,allEdges}))});
 const rows=()=>page.evaluate(()=>window.__firebaseDouble.rows());
 try{
  assert.equal(await page.evaluate(()=>window.__baseline.initialMode),'project');
  await setup([{key:'customBASE',w:600,h:720,d:18,x:0,y:360,z:0,locks:{}}]);
  await (async()=>{await page.locator('#fileMenu>summary').click();await page.locator('#commandFileSave').click()})();await page.locator('#fileDialogName').fill('Базов модел');await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);
  const original=await rows(),constructor=normalized(await capture());
  await page.locator('#modeProject').click();
  for(let i=0;i<2;i++){await (async()=>{await page.locator('#toolsMenu>summary').click();await page.locator('#toolsMenu .documentMenuItems>button').filter({hasText:'Добави шкаф от библиотеката…'}).click()})();await page.waitForFunction(()=>!!document.querySelector('#projectCabinetList').value);await page.locator('#projectAddDialogConfirm').click();await page.waitForFunction(n=>window.__test.parts().length===n,i+1)}
  assert.equal((await capture()).parts.length,2);await page.evaluate(()=>window.__baseline.edit());await field('materialSelect','1');await page.locator('#dialogDone').click();
  assert.deepEqual(await rows(),original,'editing an inserted copy never writes its library record');
  await page.evaluate(()=>window.__test.view('perspective'));
  if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'project.png')});
  const project=normalized(await capture());
  await page.locator('#modeConstructor').click();assert.deepEqual(normalized(await capture()),constructor);
  await page.evaluate(()=>window.__test.view('perspective'));
  if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'constructor.png')});
  await page.locator('#reportsMenu>summary').click();await page.locator('#navCut').click();await page.evaluate(()=>window.__baseline.cut());await page.locator('#exportProjectCut').click();let exported=await page.evaluate(()=>window.__baseline.exported);assert.equal(exported.slice(1).reduce((n,r)=>n+Number(r[5]),0),1);
  await page.locator('#modeProject').click();assert.deepEqual(normalized(await capture()),project);await page.locator('#reportsMenu>summary').click();await page.locator('#navCosts').click();assert.match(await page.locator('#projectCosts').innerText(),/ОБЩА СУМА/);await page.locator('#reportsMenu>summary').click();await page.locator('#navCut').click();await page.locator('#exportProjectCut').click();exported=await page.evaluate(()=>window.__baseline.exported);assert.equal(exported.slice(1).reduce((n,r)=>n+Number(r[5]),0),2);
  assert.deepEqual(await rows(),original,'reports/navigation never write cloud documents');assert.deepEqual(errors,[]);
  console.log('PASS baseline: starts in Project; two independent library copies; material edit leaves library intact; both mode snapshots survive switches; cut/cost/XLSX use current work model; no cloud writes from navigation/reports');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
