const assert=require('node:assert/strict');const path=require('node:path');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {lockedRunners}=await import('./fixtures.mjs');
 const {browser,page,errors,setup,parts,field}=await openKitchen({firebaseDouble:true});
 const width=items=>Math.max(...items.map(p=>p.x+p.w/2))-Math.min(...items.map(p=>p.x-p.w/2));
 const geometry=items=>items.map(({x,y,z,w,h,d,locks})=>({x,y,z,w,h,d,locks}));
 function checkProfiles(original,next){for(let i=0;i<original.length;i++)for(const k of ['w','h','d','y','z','locks'])assert.deepEqual(next[i][k],original[i][k]);assert.equal(next[1].x-next[0].x,original[1].x-original[0].x);assert.equal(next[3].x-next[2].x,original[3].x-original[2].x);assert.equal(next[0].x,original[0].x)}
 try{
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();const source=lockedRunners();await setup(source);
   const face=await page.evaluate(()=>window.__test.face('leftlip'));await page.mouse.click(face.x,face.y,{button:'right'});await page.getByRole('button',{name:'Свойства…',exact:true}).click();await page.locator('[data-tab="sizes"]').click();
   await field('partW',712);let next=await parts();assert.equal(width(next),712);checkProfiles(source,next);await page.locator('#dialogDone').click();
   await page.evaluate(()=>window.__test.undoStep());assert.equal(width(await parts()),512);await page.evaluate(()=>window.__test.redoStep());assert.equal(width(await parts()),712);
   const h=await page.evaluate(()=>window.__test.handle('x',1));await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+h.dx*40,h.y+h.dy*40,{steps:8});await page.mouse.up();next=await parts();assert.ok(width(next)>735);checkProfiles(source,next);
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`runner-spacing-${mode}.png`)});
   const saved=geometry(next);
   if(mode==='constructor'){
    await page.locator('#quickSave').click();await page.locator('#fileDialogName').fill('Locked runner pair');await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);await setup([]);await page.locator('#quickOpen').click();await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);
   }else{
    await page.locator('#projectQuickSaveAs').click();await page.locator('#projectCloudName').fill('Locked runner spacing');await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));await setup([]);await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudOpen').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
   }
   assert.deepEqual(geometry(await parts()),saved);console.log('PASS '+mode+': locked runner profiles, numeric and pointer spacing, Undo/Redo and isolated cloud save/open');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
