const assert=require('node:assert/strict');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{const {browser,page,errors}=await openKitchen({firebaseDouble:true});try{
 await page.waitForFunction(()=>window.__firebaseDouble&&document.querySelector('#cloudStatus').textContent.includes('alice'));
 for(const mode of ['Constructor','Project']){await page.locator('#mode'+mode).click();for(const v of ['perspective','front','top','left','right']){const b=page.locator('#viewControlsDock [data-v="'+v+'"]');await b.click();assert.equal(await b.innerText(),'');assert.ok(await b.getAttribute('title'));assert.match(await b.getAttribute('class'),/active/)}await page.locator('#nedPartNamesToggle').click();assert.equal(await page.locator('#nedPartNamesToggle').innerText(),'');}
 assert.equal(await page.locator('#projectQuickSaveAs').isVisible(),false);
 const rows=()=>page.evaluate(()=>window.__firebaseDouble.rows().filter(r=>r.path.includes('/v2_projects/')));
 const save=()=>page.locator('#projectCloudSave').click();const closed=()=>page.waitForFunction(()=>!document.querySelector('#projectCloudDialog'));
 await page.locator('#projectQuickSave').click();assert.equal(await page.locator('#projectCloudName').inputValue(),'');await save();assert.match(await page.locator('#projectCloudStatus').innerText(),/Въведи име/);
 await page.locator('#projectCloudName').fill('Проект А');await save();await closed();assert.equal((await rows()).length,1);const first=(await rows())[0].path;
 await page.locator('#projectQuickSave').click();await save();assert.equal(await page.locator('#projectOverwritePrompt').isVisible(),true);assert.equal(await page.locator('dialog:modal').count(),1);await page.locator('#projectOverwriteCancel').click();await save();await save();await closed();assert.equal((await rows()).length,1);assert.equal((await rows())[0].path,first);
 await page.locator('#projectQuickSave').click();await page.locator('#projectCloudName').fill('Проект Б');await save();await closed();assert.equal((await rows()).length,2);
 await page.locator('#projectQuickSave').click();await page.locator('#projectCloudName').fill('Проект А');await save();await page.waitForFunction(()=>!document.querySelector('#projectOverwritePrompt').hidden);await save();await closed();assert.equal((await rows()).length,2);
 await page.setViewportSize({width:360,height:800});const box=await page.locator('#viewControlsDock').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=360);assert.deepEqual(errors,[]);console.log('PASS common icon dock both modes/mobile, empty name, new save, inline overwrite/cancel, changed name copy and collision');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
