const assert=require('node:assert/strict');
const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,setup,parts,field,errors}=await openKitchen({
  firebaseDouble:true,
  extraHooks:`window.__constructorTest={
   selected:()=>selected,snapshot:captureProjectSnapshot,flush:()=>draftRecovery.flush(),ready:()=>draftRecovery.settled,
   view:()=>viewMode,center:key=>{
    const part=customParts.find(p=>p.key===key);
    camera.updateMatrixWorld();
    return screenPos(new THREE.Vector3(part.x,part.y+part.h/2,part.z));
   },fits:()=>customParts.every(p=>[-1,1].every(x=>[-1,1].every(y=>[-1,1].every(z=>{
    const v=new THREE.Vector3(p.x+x*p.w/2,p.y+y*p.h/2,p.z+z*p.d/2).project(camera);
    return Math.abs(v.x)<1&&Math.abs(v.y)<1&&Math.abs(v.z)<1;
   }))))
  };`
 });
 const fixture=(name,w)=>({name,parts:[{
  part:{key:'legacy-panel',w,h:18,d:400,x:0,y:9,z:0,assembly:'inner',assemblyStack:['frame'],locks:{}},
  name:'Панел '+name,finish:{material:'0',edges:[0,null,null,null]},allEdges:false
 }]});
 const initial=[fixture('Алфа',600),fixture('Бета',500),fixture('Гама',700),fixture('Твърде широк',3400)];
 const rows=()=>page.evaluate(()=>window.__firebaseDouble.rows());
 const state=()=>page.evaluate(()=>window.__constructorTest.snapshot());
 const selected=()=>page.evaluate(()=>window.__constructorTest.selected());
 const file=async id=>{
  await page.locator('#fileMenu summary').click();
  await page.locator('#'+id).click();
 };
 const add=async(name,success=true)=>{
  await page.locator('#libraryMenu summary').click();
  await page.locator('#navLibrary').click();
  const library=page.locator('#libraryDialog');
  const card=library.locator('.libraryCard').filter({has:page.getByText(name,{exact:true})});
  await card.getByRole('button',{name:'Отвори в конструктора'}).click();
  if(success)await library.waitFor({state:'detached'});
  else{
   await library.getByRole('status').filter({hasText:'Няма свободно място'}).waitFor();
   await page.locator('#libraryCancel').click();
   await library.waitFor({state:'detached'});
  }
 };
 try{
  await page.waitForFunction(()=>window.__constructorTest.ready());
  await page.evaluate(initial=>initial.forEach((value,i)=>window.__firebaseDouble.seed('users/alice/v2_cabinets/cab_test_'+i,value)),initial);
  const originals=await rows();
  await page.evaluate(()=>window.__test.view('front'));
  const copies=[];
  for(const name of ['Алфа','Бета','Гама','Алфа']){
   const before=await parts();
   await add(name);
   const after=await parts();
   assert.deepEqual(after.slice(0,-1),before);
   const copy=after.at(-1);
   assert.equal(await selected(),copy.key);
   assert.equal(copy.assemblyStack.length,1);
   copies.push(copy);
   assert.equal(await page.evaluate(()=>window.__constructorTest.view()),'front');
  }
  assert.equal(new Set(copies.map(p=>p.assembly)).size,4);
  assert.equal(new Set(copies.map(p=>p.key)).size,4);
  for(const a of copies)for(const b of copies)if(a!==b){
   assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2-1e-6||Math.abs(a.z-b.z)>=(a.d+b.d)/2-1e-6);
  }
  await page.waitForFunction(()=>window.__constructorTest.fits());
  await add('Твърде широк',false);
  assert.deepEqual(await parts(),copies);
  await page.locator('#undoStep').click();
  assert.deepEqual(await parts(),copies.slice(0,3));
  await page.locator('#redoStep').click();
  assert.deepEqual(await parts(),copies);

  // Choose the first and second cabinet through the canvas and edit only the second.
  await page.evaluate(()=>window.__test.view('top'));
  for(const part of copies.slice(0,2)){
   const point=await page.evaluate(key=>window.__constructorTest.center(key),part.key);
   await page.mouse.click(point.x,point.y);
   assert.equal(await selected(),part.key);
  }
  await field('partW',465);
  await field('partY',36);
  const edited=await parts();
  assert.equal(edited[1].w,465);
  assert.notEqual(edited[1].y,copies[1].y);
  assert.deepEqual(edited.filter((_,i)=>i!==1),copies.filter((_,i)=>i!==1));
  assert.deepEqual((await state()).parts[1].finish.edges,[0,null,null,null]);
  await page.keyboard.press('Delete');
  assert.equal((await parts()).length,3);
  await page.locator('#undoStep').click();
  assert.deepEqual(await parts(),edited);
  await page.locator('#redoStep').click();
  assert.equal((await parts()).length,3);
  await page.locator('#undoStep').click();
  assert.deepEqual(await parts(),edited);
  await page.locator('#reportsMenu summary').click();
  await page.locator('#navCut').click();
  await page.locator('#projectCutList').getByText('465 × 400 мм').waitFor();
  await page.locator('#modeConstructor').click();

  await file('commandFileSave');
  await page.locator('#fileOverwritePrompt').waitFor();
  assert.equal(await page.locator('#fileDialogName').inputValue(),'Алфа');
  await page.getByRole('button',{name:'Запази с ново име'}).click();
  assert.deepEqual(await rows(),originals);
  await page.locator('#fileDialogName').fill('Копие на Бета');
  await page.locator('#fileDialogConfirm').click();
  await page.locator('#fileDialog').waitFor({state:'hidden'});
  const saved=(await rows()).find(r=>r.value.name==='Копие на Бета');
  assert.deepEqual(saved.value.parts.map(item=>item.part),edited);
  assert.equal(saved.value.parts[0].part.constructorCabinet,undefined);
  assert.deepEqual((await rows()).filter(r=>r.path.includes('cab_test_')),originals);
  assert.deepEqual(await parts(),edited);
  await page.evaluate(async()=>{await window.__constructorTest.flush()});
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#fileMenu summary').click();
  await page.locator('#draftRestore').click();
  await page.locator('#draftRecoverApply').click();
  assert.deepEqual(await parts(),edited);
  assert.equal(await selected(),copies[1].key);
  await page.evaluate(saved=>window.__firebaseDouble.seed(saved.path,saved.value),saved);
  await file('commandFileOpen');
  await page.locator('#fileDialogChoice').selectOption(saved.path.split('/').at(-1));
  await page.locator('#fileDialogConfirm').click();
  await page.locator('#fileDialog').waitFor({state:'hidden'});
  assert.equal((await parts()).length,edited.length*2);
  assert.deepEqual((await parts()).slice(0,edited.length),edited);
  if(process.env.KITCHEN_SCREENSHOTS){
   const {generateCabinet,cabinetPresets}=await import('../cabinet-generator.mjs');
   const catalog=require('../materials/default.json');
   const models=['Долен шкаф 600','Долен шкаф 500','Долен шкаф 700'].map((name,i)=>({
    name,parts:generateCabinet({...cabinetPresets.base,w:[600,500,700][i],materials:{body:'pdc:'+i,doors:'pdc:'+i,back:'back:0',worktop:'worktop:0'}},catalog)
   }));
   await setup([]);
   await page.evaluate(models=>models.forEach((model,i)=>window.__firebaseDouble.seed('users/alice/v2_cabinets/cab_capture_'+i,model)),models);
   await page.evaluate(()=>window.__test.view('perspective'));
   for(const model of models)await add(model.name);
   await page.waitForFunction(()=>window.__constructorTest.fits());
   await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'pr81-constructor.png')});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS four independent library cabinets, placement/refusal, camera, mouse selection, edit, edges, cut list, undo/redo/delete, whole-model save and append and draft restore');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
