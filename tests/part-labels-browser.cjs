const assert=require('node:assert/strict');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__labelCase={prepare(){customParts.forEach(p=>{labels[p.key]='Еднакъв рафт';finishes[p.key]={material:0,edges:[null,null,null,null],grainRequired:false,includeInCut:p.key!=='skip'}});build(false)},ids:()=>Object.fromEntries(partLabelIndex(customParts)),snapshot:captureProjectSnapshot};`});
 const model=[{key:'a',assembly:'cabA',x:-700},{key:'b',assembly:'cabA',x:-400},{key:'skip',x:-100},{key:'c',assembly:'cabB',x:200},{key:'d',assembly:'cabB',x:500}].map(p=>({...p,y:300,z:0,w:200,h:300,d:18,locks:{d:true}}));
 async function check(){
  await page.locator('#navCut').click();const rows=await page.locator('#projectCutList tbody tr').evaluateAll(rows=>rows.map(r=>[...r.cells].map(c=>c.textContent)));assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r[0]),['Д1-1, Д1-2','Д3-1, Д3-2']);assert.deepEqual(rows.map(r=>r[2]),['2','2']);
  await page.evaluate(()=>{XLSX.writeFile=b=>window.__labelExport=XLSX.utils.sheet_to_json(b.Sheets[b.SheetNames[0]],{header:1,defval:''})});await page.locator('#exportProjectCut').click();const exported=await page.evaluate(()=>window.__labelExport.slice(1));assert.deepEqual(exported.map(r=>r[9]),rows.map(r=>r[0]));assert.deepEqual(exported.map(r=>r[5]),[2,2]);return rows;
 }
 try{
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await setup(model);await page.evaluate(()=>window.__labelCase.prepare());const before=await parts();
   await page.getByRole('button',{name:'Етикети на детайлите',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-part-label]').length===5);const shown=await page.locator('[data-part-label]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.partLabel,n.textContent])));assert.deepEqual(shown,await page.evaluate(()=>window.__labelCase.ids()));const rows=await check();assert.deepEqual(await parts(),before);
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await page.evaluate(()=>{window.__test.selectAll();window.__test.createAssembly();window.__test.undoStep()});assert.deepEqual(await page.evaluate(()=>window.__labelCase.ids()),shown);assert.deepEqual(await check(),rows);
   if(mode==='project'){
    await page.locator('#modeProject').click();await page.locator('#projectQuickSave').click();await page.locator('#projectCloudName').fill('Labels fixture');await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));await setup([]);await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudOpen').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));assert.deepEqual(await check(),rows);
   }
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();if(await page.getByRole('button',{name:'Етикети на детайлите',exact:true}).getAttribute('aria-pressed')==='true')await page.getByRole('button',{name:'Етикети на детайлите',exact:true}).click();
   console.log('PASS '+mode+': physical 3D labels equal aggregated cut and Salex labels despite excluded middle group; no geometry/count changes, Undo and project save/open');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
