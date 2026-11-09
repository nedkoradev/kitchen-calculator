const assert=require('node:assert/strict');
const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
const photo='https://storage.googleapis.com/grain-test-fixture/decor.png';
const part={key:'custom881',w:720,h:18,d:550,x:0,y:200,z:0,locks:{w:false,h:true,d:false}};
(async()=>{
 const {browser,page,errors,setup,parts,field}=await openKitchen({firebaseDouble:true,extraHooks:`window.__grainTest={
 catalog(value){libraryBoards[0]={...libraryBoards[0],...value};libraryBoards[1]={name:'No grain',color:'#cdddaa',grainRequired:false};libraryEdges=Array.from({length:4},(_,i)=>({name:'E'+i,color:'#aabbcc',price:i+1}));refreshMaterials()},
 finish(value){finishes[selected]={...finishes[selected],...value};build(false);updateSelection()},
 meshes:()=>boards.map(mesh=>({key:mesh.userData.key,map:!!mesh.material.map,color:mesh.material.color.getHexString(),uv:Array.from(mesh.geometry.attributes.uv.array)})),
 indicator:()=>selectionOverlay.children.find(child=>child.userData.grainAxis)?.userData.grainAxis,
 capture:captureProjectSnapshot,cut:key=>{const p=customParts.find(p=>p.key===key);return cutLayout(p,finishes[key],selectedBoard(finishes[key]))},
 properties:()=>{openProperties('detail');selectTab('material')}
 };`});
 try{
  await page.route(photo+'*',route=>route.fulfill({contentType:'image/png',path:path.join(__dirname,'fixtures/grain.png'),headers:{'access-control-allow-origin':'*'}}));
  assert.match(await page.locator('header strong').innerText(),/^NED-IQ v\d+\.\d+$/);
  await page.locator('#navMaterials').click();
  const section=page.locator('.materialSection').filter({has:page.getByRole('heading',{name:'ПДЧ материали',exact:true})});
  await section.getByRole('button',{name:'Нов материал',exact:true}).click();
  await page.getByLabel('Наименование',{exact:true}).fill('Photo and grain');
  await page.locator('.materialPhotoHelp summary').click();await page.locator('#materialTextureUrl').fill(photo);
  await page.waitForFunction(()=>document.querySelector('.materialPhotoPreview').naturalWidth===32);
  assert.equal(await page.locator('#materialPhotoUpload').isDisabled(),false);assert.equal(await page.locator('#materialPhotoUpload').getAttribute('accept'),'image/jpeg,image/png,image/webp');
  await page.getByRole('button',{name:'Запази',exact:true}).click();
  assert.equal(await section.locator('.materialTextureThumb').count(),1);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('kitchenPdcMaterials')).at(-1));assert.equal(stored.textureUrl,photo);assert.equal(stored.grainRequired,undefined);assert.ok(!JSON.stringify(stored).includes('base64'));
  const row=section.locator('tbody tr').filter({hasText:'Photo and grain'});await row.getByRole('button',{name:'Промени',exact:true}).click();await page.locator('.materialPhotoHelp summary').click();
  await page.route(photo+'?replacement=1*',route=>route.fulfill({contentType:'image/png',path:path.join(__dirname,'fixtures/grain.png'),headers:{'access-control-allow-origin':'*'}}));
  await page.locator('#materialTextureUrl').fill(photo+'?replacement=1');await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('Снимката е проверена'));await page.getByRole('button',{name:'Запази',exact:true}).click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kitchenPdcMaterials')).at(-1).textureUrl),photo+'?replacement=1');
  await row.getByRole('button',{name:'Промени',exact:true}).click();await page.locator('.materialPhotoHelp summary').click();
  await page.getByRole('button',{name:'Премахни снимката',exact:true}).click();assert.equal(await page.locator('#materialTextureUrl').inputValue(),'');await page.getByRole('button',{name:'Запази',exact:true}).click();assert.equal(await section.locator('.materialTextureThumb').count(),0);
  console.log('PASS material photo metadata/thumbnail/removal, grain checkbox; local picker enabled without automatic upload');
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await setup([part]);
   await page.evaluate(photo=>{window.__grainTest.catalog({name:'Decor',grainRequired:true,textureUrl:photo,textureWidthMm:1000,textureHeightMm:0});window.__grainTest.finish({material:0,edges:[0,1,2,3],grainAxis:'x'})},photo);
   const before=await parts();await page.evaluate(()=>window.__grainTest.properties());
   assert.deepEqual(await page.locator('#grainDirection option').allTextContents(),['По дължина — 720 мм','По ширина — 550 мм']);
   await page.locator('#grainDirection').selectOption('z');
   assert.equal(await page.evaluate(()=>window.__grainTest.indicator()),'z');
   await page.locator('#materialSelect').selectOption('1');assert.equal(await page.locator('#grainEditor').isVisible(),false);
   await page.locator('#materialSelect').selectOption('0');assert.equal(await page.locator('#grainDirection').inputValue(),'z');
   assert.deepEqual(await page.evaluate(()=>window.__test.finish()[window.__test.parts()[0].key].edges),[0,1,2,3]);
   assert.equal(await page.locator('#grainDirectionHint').innerText(),'↔ По ширина · разкрой 550 × 720 мм');await page.locator('#dialogDone').click();assert.deepEqual(await parts(),before);
   await page.waitForFunction(()=>window.__grainTest.meshes()[0].map);let mesh=await page.evaluate(()=>window.__grainTest.meshes()[0]);assert.equal(mesh.color,'ffffff');assert.ok(Math.max(...mesh.uv)-Math.min(...mesh.uv)<.99,'physical scales are not stretched to a unit square');
   for(const view of ['top','front','perspective']){await page.evaluate(view=>window.__test.view(view),view);assert.equal((await page.evaluate(()=>window.__grainTest.meshes()[0])).map,true)}
   const right=mode==='constructor'?'#rotateRight':'#projectRotateRight',left=mode==='constructor'?'#rotateLeft':'#projectRotateLeft';
   await page.locator(right).click();assert.equal(await page.evaluate(()=>window.__test.finish()[window.__test.parts()[0].key].grainAxis),'x');assert.equal(await page.evaluate(()=>window.__grainTest.indicator()),'x');assert.equal(await page.evaluate(()=>window.__grainTest.cut(window.__test.parts()[0].key).A),550);
   await page.locator(left).click();assert.deepEqual(await parts(),before);assert.equal(await page.evaluate(()=>window.__test.finish()[window.__test.parts()[0].key].grainAxis),'z');
   const displayX=Number(await page.locator('#partX').inputValue());await field('partX',displayX+100);assert.equal(await page.evaluate(()=>window.__test.finish()[window.__test.parts()[0].key].grainAxis),'z');await field('partX',displayX);assert.deepEqual(await parts(),before);
   await page.evaluate(()=>window.__test.duplicateCustom());assert.equal(Object.values(await page.evaluate(()=>window.__test.finish())).filter(f=>f.grainAxis==='z').length,2);
   const copied=await parts();await page.evaluate(()=>{window.__test.selectAll();window.__test.createAssembly()});await page.evaluate(()=>window.__test.ungroupAssembly(window.__test.parts()[0].assembly));assert.deepEqual(JSON.parse(JSON.stringify(await parts())),JSON.parse(JSON.stringify(copied)));
   await page.evaluate(()=>window.__test.undoStep());await page.evaluate(()=>window.__test.redoStep());assert.deepEqual(JSON.parse(JSON.stringify(await parts())),JSON.parse(JSON.stringify(copied)));
   if(mode==='constructor'){
    await page.locator('#quickSave').click();await page.locator('#fileDialogName').fill('Grain cabinet');await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);
    await setup([]);await page.locator('#quickOpen').click();await page.locator('#fileDialogConfirm').click();await page.waitForFunction(()=>!document.querySelector('#fileDialog').open);
   }else{
    await page.locator('#projectQuickSaveAs').click();await page.locator('#projectCloudName').fill('Grain project');await page.locator('#projectCloudSave').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
    const payload=await page.evaluate(()=>window.__firebaseDouble.rows().find(row=>row.path.includes('/v2_projects/')).value.data);assert.equal(payload.materials.pdcMaterials[0].textureUrl,photo);assert.ok(!JSON.stringify(payload).includes('base64'));
    await setup([]);await page.locator('#projectQuickOpen').click();await page.locator('#projectCloudOpen').click();await page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
   }
   assert.equal((await parts()).length,2);assert.ok(Object.values(await page.evaluate(()=>window.__test.finish())).every(f=>f.grainAxis==='z'));
   assert.equal(await page.locator('#groupParts:visible,#ungroupParts:visible,#projectGroupParts:visible,#projectUngroupParts:visible').count(),0);
   await setup([{...part,w:18,h:720,d:550,locks:{w:true,h:false,d:false}}]);
   await page.evaluate(()=>window.__grainTest.finish({material:0,grainAxis:'z'}));
   await page.locator(right).click();assert.equal(await page.evaluate(()=>window.__grainTest.cut(window.__test.parts()[0].key).A),550);
   assert.equal(await page.evaluate(()=>window.__test.finish()[window.__test.parts()[0].key].grainAxis),'x');
   await page.locator(left).click();assert.equal((await parts())[0].w,18);assert.equal((await parts())[0].locks.w,true);
   console.log(`PASS ${mode}: physical grain and textures in 2D/3D, rotation, copy, grouping, Undo/Redo and cloud roundtrip`);
  }
  await setup([part]);await page.evaluate(()=>window.__grainTest.finish({material:0,edges:[0,1,2,3],grainAxis:'z'}));
  await page.locator('#navCut').click();const dimension=await page.locator('#projectCutList tbody tr td').nth(4).innerText();assert.match(dimension,/550 × 720/);
  const tableStyle=await page.locator('#projectCutList tbody tr td').first().evaluate(cell=>({padding:parseFloat(getComputedStyle(cell).paddingTop),line:parseFloat(getComputedStyle(cell).lineHeight)}));assert.ok(tableStyle.padding<=4);assert.ok(tableStyle.line<16);
  const widths=await page.locator('#projectCutList table').evaluate(table=>[table.getBoundingClientRect().width,table.parentElement.getBoundingClientRect().width]);assert.ok(widths[0]<widths[1]-40,'short cut rows use compact content width');
  const exportRows=async()=>{await page.evaluate(()=>{XLSX.writeFile=book=>window.__grainExport=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,defval:''})});await page.locator('#exportProjectCut').click();return page.evaluate(()=>window.__grainExport)};
  let exported=await exportRows();assert.equal(exported[1][3],550);assert.equal(exported[1][4],720);assert.equal(exported[1][8],0);assert.deepEqual(exported[1].slice(10,14),['E0','E1','E2','E3']);assert.equal(exported[0].length,17);
  await page.locator('#navCosts').click();const costBefore=await page.locator('#projectCosts table').innerText();
  const backgrounds=await page.locator('#projectCosts tbody tr:not(.costGrandTotal) td').evaluateAll(cells=>cells.map(cell=>getComputedStyle(cell).backgroundColor));assert.equal(new Set(backgrounds).size,1);assert.equal(backgrounds[0],'rgb(255, 255, 255)');
  await page.evaluate(()=>{window.__grainTest.catalog({grainRequired:false});});assert.equal(await page.locator('#projectCosts table').innerText(),costBefore);
  await page.locator('#navCut').click();exported=await exportRows();assert.equal(exported[1][3],720);assert.equal(exported[1][4],550);assert.equal(exported[1][8],1);assert.deepEqual(exported[1].slice(10,14),['E2','E3','E1','E0']);
  await page.evaluate(()=>window.__grainTest.catalog({textureUrl:''}));assert.equal((await page.evaluate(()=>window.__grainTest.meshes()[0])).map,false);
  console.log('PASS compact cut table, grain-first XLSX/physical edges, legacy export and unchanged costs/uniform row backgrounds');
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
