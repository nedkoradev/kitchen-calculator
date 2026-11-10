const assert=require('node:assert/strict');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {cabinetWithAddedPanels}=await import('./fixtures.mjs');const {browser,page,errors,setup,parts,field}=await openKitchen({firebaseDouble:true});
 const width=rows=>Math.max(...rows.map(p=>p.x+p.w/2))-Math.min(...rows.map(p=>p.x-p.w/2));
 const geometry=rows=>rows.map(({key,assembly,assemblyStack,...p})=>p);
 const check=rows=>{const shelf=rows[5],side=rows[4];assert.equal(shelf.x+shelf.w/2,side.x-side.w/2);assert.equal(shelf.x-shelf.w/2,18);assert.equal(side.w,18);assert.equal(rows[0].w,18);assert.equal(rows[1].w,18)};
 try{
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();
   const source=cabinetWithAddedPanels({partitionX:250}).map((p,i)=>{const {assembly,assemblyStack,...part}=p;return i<4?{...part,assembly:'K1'}:part});await setup(source);
   // Select the existing whole cabinet and the two added loose panels, then
   // group through the same context-menu command used by the user.
   await page.evaluate(()=>window.__test.selectKeys(window.__test.parts().map(p=>p.key)));
   const point=await page.evaluate(()=>window.__test.face('left'));await page.mouse.click(point.x,point.y,{button:'right'});await page.locator('#assemblyContext').getByRole('button',{name:'Групирай',exact:true}).click();
   const grouped=await parts();assert.deepEqual(grouped.slice(0,4).map(p=>p.assemblyStack),[['K1'],['K1'],['K1'],['K1']]);assert.deepEqual(grouped[4].assemblyStack,[null]);assert.deepEqual(geometry(grouped),geometry(source));
   await page.mouse.click(point.x,point.y,{button:'right'});await page.locator('#assemblyContext').getByRole('button',{name:'Свойства…',exact:true}).click();await page.locator('[data-tab="sizes"]').click();await field('partW',800);
   let next=await parts();assert.equal(width(next),800);check(next);await page.locator('#dialogDone').click();
   // Lock only the added shelf width through the real individual properties UI.
   const shelfPoint=await page.evaluate(()=>window.__test.face('added-shelf'));await page.mouse.click(shelfPoint.x,shelfPoint.y,{button:'right'});await page.locator('#assemblyContext').getByRole('button',{name:'Свойства на детайла…',exact:true}).click();await page.locator('[data-tab="sizes"]').click();await page.locator('#lockW').check();await page.locator('#dialogDone').click();
   const fixed=(await parts())[5],partition=(await parts())[4];
   await page.evaluate(()=>window.__test.select('left'));const sidePoint=await page.evaluate(()=>window.__test.face('left'));await page.mouse.click(sidePoint.x,sidePoint.y,{button:'right'});await page.locator('#assemblyContext').getByRole('button',{name:'Свойства…',exact:true}).click();await page.locator('[data-tab="sizes"]').click();await field('partW',700);await page.locator('#dialogDone').click();
   assert.equal(width(await parts()),700);assert.equal((await parts())[5].w,fixed.w);assert.equal((await parts())[4].x,partition.x);check(await parts());
   await page.evaluate(()=>window.__test.undoStep());assert.equal(width(await parts()),800);assert.equal((await parts())[5].locks.w,true);await page.evaluate(()=>window.__test.redoStep());assert.equal(width(await parts()),700);
   const h=await page.evaluate(()=>window.__test.handle('x',1));await page.mouse.move(h.x,h.y);await page.mouse.down();await page.mouse.move(h.x+h.dx*70,h.y+h.dy*70,{steps:10});await page.mouse.up();next=await parts();assert.ok(width(next)>740);check(next);assert.equal(next[5].w,fixed.w);assert.equal(next[4].x,partition.x);
   const saved=geometry(next);
   // One-level ungroup restores K1 as a whole and the added loose panels.
   await page.evaluate(()=>window.__test.ungroupAssembly(window.__test.parts()[0].assembly));const restored=await parts();assert.ok(restored.slice(0,4).every(p=>p.assembly===restored[0].assembly));assert.ok(restored[0].assembly);assert.ok(!restored[4].assembly&&!restored[5].assembly);assert.deepEqual(geometry(restored),saved);
   await page.evaluate(()=>window.__test.undoStep());assert.deepEqual(geometry(await parts()),saved);
   if(mode==='constructor'){await page.locator('#quickSave').click();await page.locator('#fileDialogName').fill('K1 locked small shelf');await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);await setup([]);await page.locator('#quickOpen').click();await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open)}
   else{await page.locator('#projectQuickSave').click();await page.locator('#projectCloudName').fill('K1 fixed shelf');await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));await setup([]);await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudOpen').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'))}
   assert.deepEqual(geometry(await parts()),saved);check(await parts());
   console.log('PASS '+mode+': lock small shelf in properties after resizing; cabinet still shrinks/grows, rigid bay, Undo/Redo, cloud roundtrip and ungroup');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
