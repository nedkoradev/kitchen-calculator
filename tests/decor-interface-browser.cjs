const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {page,browser,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__decorUI={prepare(){libraryBoards[0]={name:'Oak grain',color:'#ccaa77',grainRequired:true,textureUrl:'materials/textures/ui.png',textureWidthMm:1000,textureHeightMm:2000};refreshMaterials()},cut:()=>cutLayout(customParts.find(p=>p.key===selected),finishes[selected],selectedBoard(finishes[selected])),uv:()=>Array.from(boards.find(b=>b.userData.key===selected).geometry.attributes.uv.array)};`});
 try{
  await page.route('**/materials/textures/ui.png*',r=>r.fulfill({contentType:'image/png',path:path.join(__dirname,'fixtures/grain.png')}));
  await page.setViewportSize({width:1280,height:800});await page.locator('#navMaterials').click();
  for(const [i,name] of ['ПДЧ материали','Кантове','Плотове','Гръб HDF'].entries()){
   const section=page.locator('.materialSection').filter({has:page.getByRole('heading',{name,exact:true})});
   await section.locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();
   assert.equal(await page.getByLabel('Линк към сайта',{exact:true}).isVisible(),true);
   const siteBox=await page.getByLabel('Линк към сайта',{exact:true}).boundingBox();assert.ok(siteBox.y+siteBox.height<800);
   const link=page.getByLabel('Линк към снимката',{exact:true});assert.equal(await link.isVisible(),false);
   assert.equal(await page.locator('#copyMaterialPhotoPath').isVisible(),false);
   const upload=page.locator('#uploadMaterialPhoto');assert.equal(await upload.getAttribute('href'),'https://github.com/nedkoradev/kitchen-calculator/upload/main/materials/textures');assert.equal(await upload.getAttribute('rel'),'noopener noreferrer');
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`decor-category-${i}.png`)});
   await page.keyboard.press('Escape');
  }
  // Follow the real upload link into a new browser tab. Only stub the external destination.
  await page.locator('.materialGroup').first().locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();
  await page.context().route('https://github.com/nedkoradev/kitchen-calculator/upload/main/materials/textures',r=>r.fulfill({contentType:'text/html',body:'<title>GitHub textures upload</title>'}));
  await page.locator('.materialPhotoHelp summary').click();
  const popupPromise=page.waitForEvent('popup');await page.locator('#uploadMaterialPhoto').click();const popup=await popupPromise;await popup.waitForLoadState();assert.match(popup.url(),/\/upload\/main\/materials\/textures$/);await popup.close();
  const original=fs.readFileSync(path.join(__dirname,'fixtures/grain.png'));
  await page.locator('#materialPhotoUpload').setInputFiles({name:'oak<script>.png',mimeType:'image/png',buffer:original});
  await page.waitForFunction(()=>!document.querySelector('#downloadMaterialPhoto').hidden);
  const downloadPromise=page.waitForEvent('download');await page.locator('#downloadMaterialPhoto').click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),decodeURIComponent((await linkValue()).split('/').at(-1)));assert.deepEqual(fs.readFileSync(await download.path()),original);
  await page.keyboard.press('Escape');
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();
   await setup([{key:'custom771',w:600,h:700,d:18,x:-350,y:500,z:0,assembly:'cab',locks:{d:true}},{key:'custom772',w:600,h:700,d:18,x:350,y:500,z:0,assembly:'cab',locks:{d:true}}]);
   await page.evaluate(()=>window.__decorUI.prepare());
   const before=await parts(),point=await page.evaluate(()=>window.__test.face('custom771'));
   await page.mouse.click(point.x,point.y,{button:'right'});await page.getByRole('button',{name:'Свойства на детайла…',exact:true}).click();
   assert.equal(await page.locator('#dialogTitle').innerText(),'Свойства на детайла');assert.equal(await page.locator('#grainDirection').isVisible(),true);
   await page.waitForFunction(()=>window.__decorUI.uv().some(x=>x!==.5));
   const initial=await page.evaluate(()=>({cut:window.__decorUI.cut(),uv:window.__decorUI.uv(),finish:window.__test.finish()}));
   await page.locator('#grainDirection').selectOption('x');
   const after=await page.evaluate(()=>({cut:window.__decorUI.cut(),uv:window.__decorUI.uv(),finish:window.__test.finish()}));
   assert.equal(after.cut.A,600);assert.equal(initial.cut.A,700);assert.notDeepEqual(after.uv,initial.uv);assert.equal(after.finish.custom772.grainAxis,initial.finish.custom772.grainAxis);assert.deepEqual(after.finish.custom771.edges,initial.finish.custom771.edges);assert.deepEqual(await parts(),before);
   if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`grain-ui-${mode}.png`)});
   await page.locator('#dialogDone').click();
  }
  assert.deepEqual(errors,[]);console.log('PASS real UI clicks: visible link in all 4 editors at 1280x800, GitHub popup, safe-name original-byte download, individual cabinet panel grain and cut/UV updates in both modes');
  async function linkValue(){return page.locator('#materialTextureUrl').inputValue()}
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
