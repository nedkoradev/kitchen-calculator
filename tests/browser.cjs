const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');
const part=(key,extra={})=>({key,x:0,y:200,z:0,w:100,h:100,d:100,locks:{},...extra});
const cabinet=()=>[
 part('custom101',{x:9,y:360,w:18,h:720,d:500,locks:{w:true},assembly:'cab'}),
 part('custom102',{x:591,y:360,w:18,h:720,d:500,locks:{w:true},assembly:'cab'}),
 part('custom103',{x:300,y:9,w:564,h:18,d:500,locks:{h:true},assembly:'cab'}),
 part('custom104',{x:300,y:711,w:564,h:18,d:500,locks:{h:true},assembly:'cab'})
];
(async()=>{
 const {browser,page,errors,setup,parts,field,clickJitter}=await openKitchen();
 try{
  await setup([part('custom100')]);
  let before=await parts();
  await clickJitter(await page.evaluate(()=>window.__test.face('custom100')));
  assert.deepEqual(await parts(),before);
  await page.evaluate(()=>window.__test.view('perspective'));
  await page.evaluate(()=>window.__test.view('front'));
  assert.deepEqual(await parts(),before);
  console.log('PASS selection jitter and 2D/3D preserve geometry');
  await field('partW',101);
  assert.equal((await parts())[0].x,.5);
  await page.evaluate(()=>window.__test.undoStep());assert.equal((await parts())[0].w,100);
  await page.evaluate(()=>window.__test.redoStep());assert.equal((await parts())[0].w,101);
  console.log('PASS integer numeric resize, fixed left, undo/redo');
  const fixture=[part('custom100'),part('custom200',{x:300,w:1})];
  await setup(fixture);await field('partX',2500);
  assert.equal((await parts())[0].x,249);
  await setup(fixture);
  let point=await page.evaluate(()=>window.__test.face('custom100'));
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+7,point.y);await page.mouse.move(point.x+700,point.y);await page.mouse.up();
  assert.equal((await parts())[0].x,249);
  assert.equal(await page.locator('#partX').inputValue(),'1699');
  console.log('PASS numeric and pointer moves stop at the same thin obstacle');
  await setup(cabinet());before=await parts();
  await clickJitter(await page.evaluate(()=>window.__test.face('custom102')));
  assert.deepEqual(await parts(),before);
  const handle=await page.evaluate(()=>window.__test.handle('x',1));
  await clickJitter(handle);assert.deepEqual(await parts(),before);
  await field('partW',800);const numeric=await parts();
  for(const sign of [-1,1]){
   await setup(cabinet());
   point=await page.evaluate(sign=>window.__test.handle('x',sign),sign);
   await page.mouse.move(point.x,point.y);await page.mouse.down();
   await page.mouse.move(point.x+7*sign,point.y);
   await page.mouse.move(point.x+7*sign+point.dx*200*sign,point.y+point.dy*200*sign);await page.mouse.up();
   assert.deepEqual(await parts(),numeric);
  }
  assert.equal(numeric[0].w,18);assert.equal(numeric[1].w,18);
  console.log('PASS group click/handle jitter, identical pointer and numeric resize, locks');
  await page.evaluate(()=>window.__test.select('custom103',true));
  await field('materialSelect',1);
  for(const [i,id] of ['edgeLeft','edgeRight','edgeTop','edgeBottom'].entries())await field(id,i);
  await page.evaluate(()=>window.__test.select('custom101'));
  await page.evaluate(()=>{window.__test.selectAll();window.__test.createAssembly()});
  before=await parts();await page.evaluate(()=>window.__test.duplicateCustom());
  const duplicated=await parts();
  assert.notEqual(duplicated[4].assemblyStack[0],before[0].assemblyStack[0]);
  await page.evaluate(()=>window.__test.ungroupAssembly(window.__test.parts().at(-1).assembly));
  assert.deepEqual((await parts()).slice(0,4),before);
  const saved=await page.evaluate(()=>window.__test.snapshotParts());
  await setup([]);await page.evaluate(items=>{window.__test.restoreParts(items);window.__test.build()},saved);
  const loaded=await parts();assert.equal(loaded.length,saved.length);
  for(let i=0;i<loaded.length;i++)for(const k of ['w','h','d','x','y','z'])assert.equal(loaded[i][k],saved[i].part[k]);
  const finishes=await page.evaluate(()=>window.__test.finish());
  for(let i=0;i<loaded.length;i++)assert.deepEqual(finishes[loaded[i].key],saved[i].finish);
  console.log('PASS nested copy, one-level ungroup, reload, materials and four edges');
  await page.locator('#modeProject').click();await page.locator('[data-v="top"]').click();await page.locator('[data-v="perspective"]').click();await page.locator('#modeConstructor').click();
  assert.equal((await parts()).length,saved.length);
  await setup([part('custom100',{w:101,d:99,x:.5,z:.5,locks:{w:true}})]);
  before=await parts();
  await page.evaluate(()=>window.__test.rotateSelectedPart(1));
  assert.equal((await parts())[0].locks.d,true);
  await page.evaluate(()=>window.__test.rotateSelectedPart(-1));
  for(const k of ['w','h','d','x','y','z'])assert.equal((await parts())[0][k],before[0][k]);
  assert.equal((await parts())[0].locks.w,true);
  assert.deepEqual(errors,[]);
  console.log('PASS constructor/project smoke and no uncaught browser errors; Firebase isolated');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
