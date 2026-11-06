const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');
const panel=(key,x,y,assembly)=>({key,x,y,z:0,w:180,h:200,d:160,locks:{w:true,h:false,d:false},...(assembly?{assembly}: {})});
const cabinets=()=>[panel('custom201',-450,200,'cabA'),panel('custom202',-450,450,'cabA'),panel('custom203',100,200,'cabB'),panel('custom204',100,450,'cabB'),panel('custom205',650,200,'cabC'),panel('custom206',650,450,'cabC')];
const physical=rows=>rows.map(({assembly,assemblyStack,key,...p})=>p);
(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__groupTest={keys:()=>[...groupSelections],capture:captureProjectSnapshot,apply:applyProjectSnapshot,mode:()=>currentDesignMode};`});
 const click=async(key,{shift=false,button='left'}={})=>{
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  const point=await page.evaluate(key=>window.__test.face(key),key);
  if(shift)await page.keyboard.down('Shift');
  await page.mouse.click(point.x,point.y,{button});
  if(shift)await page.keyboard.up('Shift');
 };
 const command=async name=>page.locator('#assemblyContext').getByRole('button',{name,exact:true}).click();
 const group=async(a,b)=>{await click(a);await click(b,{shift:true});await click(b,{button:'right'});await command('Групирай')};
 const ungroup=async key=>{await click(key,{button:'right'});await command('Разгрупирай')};
 const assertSamePhysical=async before=>assert.deepEqual(physical(await parts()),physical(before));
 try{
  await page.waitForFunction(()=>window.__firebaseDouble);
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();
   await setup(cabinets());
   // Two whole cabinets, selected through the real canvas and context menu.
   const initial=await parts();
   await page.keyboard.down('Control');await click('custom201');await page.keyboard.up('Control');
   assert.deepEqual(await page.evaluate(()=>window.__groupTest.keys()),['custom201']);
   await assertSamePhysical(initial);
   // Leave the explicit panel selection before selecting whole units.
   await click('custom203');

   await click('custom201');assert.equal((await page.evaluate(()=>window.__groupTest.keys())).length,2);
   await click('custom203',{shift:true});assert.equal((await page.evaluate(()=>window.__groupTest.keys())).length,4);
   await click('custom204',{button:'right'});assert.equal((await page.evaluate(()=>window.__groupTest.keys())).length,4);
   await command('Групирай');
   let grouped=await parts(),outer=grouped[0].assembly;
   assert.ok(grouped.slice(0,4).every(p=>p.assembly===outer));assert.equal(grouped[4].assembly,'cabC');
   assert.deepEqual(grouped.slice(0,4).map(p=>p.assemblyStack),[['cabA'],['cabA'],['cabB'],['cabB']]);
   await assertSamePhysical(initial);
   await page.evaluate(()=>window.__test.undoStep());assert.deepEqual(await parts(),initial);
   await page.evaluate(()=>window.__test.redoStep());assert.deepEqual(await parts(),grouped);
   // Add a third cabinet to the group. Deselect/reselect must operate on whole units.
   await click('custom201');await click('custom205',{shift:true});
   assert.equal((await page.evaluate(()=>window.__groupTest.keys())).length,6);
   await click('custom206',{shift:true});assert.equal((await page.evaluate(()=>window.__groupTest.keys())).length,4);
   await click('custom205',{shift:true});await click('custom203',{button:'right'});await command('Групирай');
   let nested=await parts();assert.ok(nested.every(p=>p.assembly===nested[0].assembly));
   await assertSamePhysical(initial);
   await ungroup('custom202');assert.deepEqual(await parts(),grouped);
   await page.evaluate(()=>window.__test.undoStep());assert.deepEqual(await parts(),nested);
   await page.evaluate(()=>window.__test.redoStep());assert.deepEqual(await parts(),grouped);
   await ungroup('custom201');assert.deepEqual(await parts(),initial);
   console.log(`PASS ${mode}: whole cabinets, adding to nested group, one-level ungroup, geometry/locks, Undo/Redo`);
   // Separate panel grouping remains available, including a panel mixed with a cabinet.
   await setup([panel('custom301',-450,200),panel('custom302',100,200),panel('custom303',650,200)]);
   const loose=await parts();await group('custom301','custom302');
   assert.deepEqual((await parts()).slice(0,2).map(p=>p.assemblyStack),[[null],[null]]);
   await ungroup('custom301');assert.deepEqual(await parts(),loose);
   await setup([...cabinets().slice(0,2),panel('custom303',100,200)]);const mixed=await parts();
   await group('custom201','custom303');await ungroup('custom201');assert.deepEqual(await parts(),mixed);
   console.log(`PASS ${mode}: loose panels and cabinet + loose panel`);
   const four=[...cabinets(),panel('custom207',1100,200,'cabD'),panel('custom208',1100,450,'cabD')];
   await setup(four);await group('custom201','custom203');await group('custom205','custom207');
   const twoGroups=await parts();await group('custom201','custom205');await ungroup('custom201');
   assert.deepEqual(await parts(),twoGroups);await ungroup('custom201');await ungroup('custom205');
   assert.deepEqual(await parts(),four);
   console.log(`PASS ${mode}: group + existing group preserves both nested hierarchies`);

   // Load the same saved cabinet twice via the real cloud-open event handler.
   await setup([]);
   const saved=cabinets().slice(0,2).map((part,i)=>({part,name:'Panel '+i,finish:{material:1,edges:[0,null,1,2]},allEdges:i===0}));
   await page.evaluate(items=>{for(let i=0;i<2;i++)window.dispatchEvent(new CustomEvent('kitchen-v2-cloud-opened',{detail:{id:'fixture',name:'Cabinet',parts:items}}));window.__test.view('front')},saved);
   const loaded=await parts();assert.equal(loaded.length,4);assert.notEqual(loaded[0].assembly,loaded[2].assembly);
   const beforeFinish=await page.evaluate(()=>window.__test.finish());
   await group(loaded[0].key,loaded[2].key);await assertSamePhysical(loaded);
   const stored=await parts();
   // Snapshot serialization remaps IDs; compare relationships as well as panel data.
   const snapshot=await page.evaluate(()=>window.__groupTest.capture());
   if(mode==='project'){
    await page.locator('#projectQuickSaveAs').click();await page.locator('#projectCloudName').fill('Grouping roundtrip');
    await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
    const id=await page.evaluate(()=>window.__firebaseDouble.rows().find(r=>r.path.includes('/v2_projects/')).path.split('/').at(-1));
    await setup([]);await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudList').selectOption(id);
    await page.locator('#projectCloudOpen').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
   }else{
    await page.locator('#quickSave').click();await page.locator('#fileDialogName').fill('Grouping roundtrip');
    await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);
    const id=await page.evaluate(()=>window.__firebaseDouble.rows().find(r=>r.path.includes('/v2_cabinets/')).path.split('/').at(-1));
    await setup([]);await page.locator('#quickOpen').click();await page.locator('#fileDialogChoice').selectOption(id);
    await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);
    // Opening a saved cabinet wraps the full saved hierarchy as one cabinet.
    await page.evaluate(()=>window.__test.ungroupAssembly(window.__test.parts()[0].assembly));
   }
   const cloudLoaded=await parts();assert.deepEqual(physical(cloudLoaded),physical(stored));
   assert.ok(cloudLoaded.every(p=>p.assembly===cloudLoaded[0].assembly));
   assert.equal(new Set(cloudLoaded.map(p=>p.assemblyStack.at(-1))).size,2);
   assert.deepEqual(Object.values(await page.evaluate(()=>window.__test.finish())),Object.values(beforeFinish));
   console.log(`PASS ${mode}: cloud save/open retains nested cabinets and materials (isolated SDK double)`);

   await page.evaluate(data=>window.__groupTest.apply(JSON.parse(JSON.stringify(data))),snapshot);
   const reloaded=await parts();assert.ok(reloaded.every(p=>p.assembly===reloaded[0].assembly));
   assert.equal(new Set(reloaded.map(p=>p.assemblyStack.at(-1))).size,2);
   assert.deepEqual(physical(reloaded),physical(stored));
   assert.deepEqual(Object.values(await page.evaluate(()=>window.__test.finish())),Object.values(beforeFinish));
   await page.evaluate(id=>window.__test.ungroupAssembly(id),reloaded[0].assembly);
   const restored=await parts();assert.equal(new Set(restored.map(p=>p.assembly)).size,2);
   assert.deepEqual(physical(restored),physical(loaded));
   console.log(`PASS ${mode}: repeated library load, unique hierarchy IDs, JSON snapshot restore, materials/edges`);
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exit(1)});
