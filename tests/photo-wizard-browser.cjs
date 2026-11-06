const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors}=await openKitchen({firebaseDouble:true});let published=false,checks=0;
 const png=fs.readFileSync(path.join(__dirname,'fixtures/grain.png'));
 try{
  await page.route('**/materials/textures/guided.png*',r=>{checks++;return r.fulfill({status:published?200:404,contentType:published?'image/png':'text/html',body:published?png:'Not published'})});
  await page.locator('#navMaterials').click();await page.locator('.materialGroup').first().locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();
  const pick=async()=>{const chooser=page.waitForEvent('filechooser');await page.locator('#chooseMaterialPhoto').click();await (await chooser).setFiles({name:'guided.png',mimeType:'image/png',buffer:png});await page.locator('.photoWizard').waitFor()};
  await pick();assert.equal(await page.locator('.photoWizard').evaluate(el=>el.matches(':modal')),true);
  assert.ok(await page.locator('.photoWizard').innerText().then(t=>t.includes('guided.png')));
  await page.context().route('https://github.com/nedkoradev/kitchen-calculator/upload/main/materials/textures',r=>r.fulfill({contentType:'text/html',body:'<title>GitHub upload</title>'}));
  const popupPromise=page.waitForEvent('popup');await page.locator('.photoWizard').getByRole('link',{name:'Качи в GitHub',exact:true}).click();const popup=await popupPromise;await popup.waitForLoadState();assert.match(popup.url(),/upload\/main\/materials\/textures$/);await popup.close();
  if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'photo-wizard.png')});
  const initialChecks=checks;published=true;await page.waitForFunction(()=>document.querySelector('.photoWizard')?.textContent.includes('Снимката е намерена'),{},{timeout:25000});assert.ok(checks>initialChecks);
  await page.locator('.photoWizard button').click();await page.getByRole('button',{name:'Запази',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kitchenPdcMaterials'))[0].textureUrl),'materials/textures/guided.png');
  await page.locator('.materialGroup').first().locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();published=false;await pick();await page.keyboard.press('Escape');assert.equal(await page.locator('.photoWizard').count(),0);assert.equal(await page.locator('.materialEditDialog[open]').isVisible(),true);const afterClose=checks;await page.waitForTimeout(11000);assert.ok(checks<=afterClose+1,'no recurring checks after close');await page.keyboard.press('Escape');assert.deepEqual(errors,[]);
  console.log('PASS modal wizard is clickable, GitHub popup, automatic publication recheck/save, Escape and timer cleanup');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
