const assert=require('node:assert/strict');
const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
const {major,minor}=require('../_data/version.json');
const part={key:'custom901',x:0,y:100,z:0,w:720,h:18,d:550,locks:{h:true}};
(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({firebaseDouble:true,extraHooks:`window.__settingsTest={catalog(url){libraryBoards[0]={...libraryBoards[0],grainRequired:true,textureUrl:url};refreshMaterials();finishes[selected]={...finishes[selected],material:0,grainAxis:'z'};build(false);updateSelection()},mapped:()=>boards[0]?.material.map?.image?.width||0};`});
 let state='valid';const requests=[];page.on('request',request=>requests.push(request.url()));
 const stats={schemaVersion:1,inventoryReady:true,scope:'published-source-snapshot',includesGitHistory:false,version:`${major}.${minor}`,revision:'a'.repeat(40),measuredAt:'2026-11-06T12:00:00Z',totalBytes:50000,textureBytes:9000,fileCount:20,imageCount:2,referenceBytes:1024**3};
 try{
  await page.route('**/repository-space.json',route=>route.fulfill({status:state==='error'?503:200,contentType:'application/json',body:JSON.stringify(state==='invalid'?{...stats,totalBytes:-10}:stats)}));
  for(const mode of ['constructor','project']){
   await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await setup([part]);const before=await parts();
   const button=page.locator('#settingsButton');await button.scrollIntoViewIfNeeded();
   assert.equal(await button.getAttribute('title'),'Настройки');assert.equal(await button.locator('svg').getAttribute('viewBox'),'0 0 24 24');
   assert.ok(await button.evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('#helpButton').getBoundingClientRect().bottom));
   await button.click();assert.equal(await page.locator('#settingsDialog').evaluate(el=>el.matches(':modal')),true);
   await page.waitForFunction(()=>!document.querySelector('#spaceDetails').hidden);
   assert.equal(await page.locator('#settingsVersion').innerText(),`v${major}.${minor}`);assert.equal(await page.locator('#textureImageCount').innerText(),'2');
   assert.match(await page.locator('#repositoryBytes').innerText(),/KiB/);assert.match(await page.locator('#spaceMeasuredAt').innerText(),/14:00/);assert.match(await page.locator('#spaceReference').innerText(),/не е твърда квота/);
   assert.equal(await page.locator('#spaceProgress').evaluate(el=>el.max),1024**3);assert.equal(await page.locator('#spaceProgress').evaluate(el=>el.value),50000);
   await page.locator('#settingsDone').focus();await page.keyboard.press('Delete');assert.deepEqual(await parts(),before);
   await page.keyboard.press('Escape');assert.equal(await page.locator('#settingsDialog').evaluate(el=>el.open),false);
   await button.click();await page.waitForFunction(()=>!document.querySelector('#spaceDetails').hidden);
   if(process.env.KITCHEN_SCREENSHOT&&mode==='project')await page.screenshot({path:process.env.KITCHEN_SCREENSHOT});
   await page.locator('#settingsClose').click();assert.deepEqual(await parts(),before);
   console.log(`PASS ${mode}: shared bottom gear, modal settings/version/stats/date/progress, Escape/close and no model changes`);
  }
  state='error';await page.locator('#settingsButton').click();await page.waitForFunction(()=>document.querySelector('#spaceStatus').textContent.includes('не е налична'));assert.equal(await page.locator('#spaceDetails').isVisible(),false);
  state='invalid';await page.locator('#spaceRetry').click();await page.waitForFunction(()=>document.querySelector('#spaceStatus').textContent.includes('не е налична'));assert.equal(await page.locator('#spaceDetails').isVisible(),false);
  state='valid';stats.imageCount=0;stats.textureBytes=0;stats.totalBytes=2*1024**3;await page.locator('#spaceRetry').click();await page.waitForFunction(()=>!document.querySelector('#spaceDetails').hidden);
  assert.equal(await page.locator('#textureImageCount').innerText(),'0');assert.equal(await page.locator('#spaceProgress').evaluate(el=>el.value),1024**3);assert.match(await page.locator('#spaceProgressLabel').innerText(),/200%/);await page.locator('#settingsDone').click();
  assert.ok(!requests.some(url=>url.includes('api.github.com')));
  // Real same-origin repository image path feeds the existing Three.js loader.
  await page.route('**/materials/textures/test-decor.png',route=>route.fulfill({contentType:'image/png',path:path.join(__dirname,'fixtures/grain.png')}));
  await setup([part]);await page.evaluate(()=>window.__settingsTest.catalog('materials/textures/test-decor.png'));await page.waitForFunction(()=>window.__settingsTest.mapped()===32);
  assert.ok(requests.some(url=>url.endsWith('/materials/textures/test-decor.png')));assert.deepEqual(await parts(),[part]);
  assert.deepEqual(errors,[]);console.log('PASS missing/invalid stats, empty textures, advisory limit overflow, no browser GitHub API and relative texture render');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
