const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');
const png=fs.readFileSync(path.join(__dirname,'fixtures/grain.png'));
const oldUrl='https://images.example.test/old.png';
(async()=>{
 const {browser,page,errors}=await openKitchen({firebaseDouble:true,extraHooks:`window.__photoTest={setup(){libraryBoards[0]={...libraryBoards[0],name:'Texture editor',textureUrl:'${oldUrl}',textureWidthMm:1234,textureHeightMm:678,grainRequired:true};storeCatalog();renderMaterialsPage()},material:()=>structuredClone(libraryBoards[0])};`});
 const published=new Map();const requests=[];page.on('request',request=>requests.push(request.url()));
 const material=()=>page.evaluate(()=>window.__photoTest.material());
 const editor=async()=>{await page.locator('.materialGroup').first().locator('tbody tr').first().getByRole('button',{name:'Промени',exact:true}).click();await page.locator('.materialPhotoHelp summary').click()};
 const save=async()=>{await page.getByRole('button',{name:'Запази',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#materialPhotoUpload'))};
 const close=async()=>{await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#materialPhotoUpload'));await page.waitForFunction(()=>window.__photoUrls.size===0)};
 const select=async(name='Декор нов.png',buffer=png,mimeType='image/png')=>{await page.locator('#materialPhotoUpload').setInputFiles({name,mimeType,buffer})};
 try{
  await page.route('https://images.example.test/**',route=>{
   const file=new URL(route.request().url()).pathname;
   if(file==='/html.png')return route.fulfill({status:200,contentType:'text/html',body:'<html>Not an image</html>',headers:{'access-control-allow-origin':'*'}});
   if(file==='/fake.png')return route.fulfill({status:200,contentType:'image/png',body:'<html>Error page</html>',headers:{'access-control-allow-origin':'*'}});
   if(file==='/broken.png')return route.fulfill({status:200,contentType:'image/png',body:png.subarray(0,8),headers:{'access-control-allow-origin':'*'}});
   return route.fulfill({status:200,contentType:'image/png',body:png,headers:{'access-control-allow-origin':'*'}});
  });
  await page.route('**/materials/textures/**',route=>{const file=new URL(route.request().url()).pathname.slice(1),body=published.get(file);return route.fulfill({status:body?200:404,contentType:body?'image/png':'text/html',body:body||'Not published'})});
  await page.evaluate(()=>{
   const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);window.__photoUrls=new Set();
   URL.createObjectURL=blob=>{const url=create(blob);window.__photoUrls.add(url);return url};URL.revokeObjectURL=url=>{window.__photoUrls.delete(url);return revoke(url)};
  });
  await page.locator('#navMaterials').click();await page.evaluate(()=>window.__photoTest.setup());
  await editor();await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('Снимката е проверена'));
  assert.equal(await page.locator('#chooseMaterialPhoto').innerText(),'Избери снимка');assert.equal(await page.locator('#materialPhotoUpload').isVisible(),false);
  await select();await page.waitForFunction(()=>document.querySelector('#materialPhotoFileInfo').textContent.includes('Декор нов.png'));
  assert.match(await page.locator('#materialPhotoFileInfo').innerText(),/120 B/);assert.match(await page.locator('.materialPhotoPreview').getAttribute('src'),/^blob:/);
  const proposed=await page.locator('#materialTextureUrl').inputValue();assert.equal(proposed,'materials/textures/'+encodeURIComponent('Декор нов.png'));
  await page.locator('#copyMaterialPhotoPath').click();await page.waitForFunction(()=>/копиран|Ctrl\+C/.test(document.querySelector('#materialPhotoStatus').textContent));assert.match(await page.locator('#materialPhotoStatus').innerText(),/копиран|Ctrl\+C/);
  await page.locator('.materialPhotoHelp summary').click();
  if(process.env.KITCHEN_SCREENSHOT)await page.screenshot({path:process.env.KITCHEN_SCREENSHOT});
  assert.equal((await material()).textureUrl,oldUrl);await close();assert.equal((await material()).textureUrl,oldUrl);
  console.log('PASS local preview/name/bytes/safe hash path/copy, no upload, close revokes blob and preserves existing photo');

  await editor();await select();await page.waitForFunction(()=>document.querySelector('#materialPhotoFileInfo').textContent.includes('Декор нов.png'));
  await page.getByLabel('Наименование',{exact:true}).fill('Other changes saved');await save();
  assert.equal((await material()).textureUrl,oldUrl);assert.equal((await material()).name,'Other changes saved');assert.equal((await material()).textureWidthMm,1234);assert.equal((await material()).textureHeightMm,678);
  assert.ok(!JSON.stringify(await material()).match(/blob:|data:|base64/));await page.waitForFunction(()=>window.__photoUrls.size===0);
  await editor();await select();await page.waitForFunction(()=>document.querySelector('#materialPhotoFileInfo').textContent.includes('Декор нов.png'));
  await page.locator('#verifyMaterialPhoto').click();await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('още не е достъпна'));assert.equal((await material()).textureUrl,oldUrl);
  const other=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=2;c.getContext('2d').fillRect(0,0,2,2);return c.toDataURL('image/png').split(',')[1]}),'base64');
  published.set(proposed,other);await page.locator('#verifyMaterialPhoto').click();await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('не съвпада'));
  published.set(proposed,png);await page.locator('#verifyMaterialPhoto').click();await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('Снимката е проверена'));
  assert.equal((await material()).textureUrl,oldUrl);await save();assert.equal((await material()).textureUrl,proposed);await page.waitForFunction(()=>window.__photoUrls.size===0);
  page.once('dialog',dialog=>dialog.accept('Verified decor base'));await page.getByRole('button',{name:'Запази база',exact:true}).click();
  await page.waitForFunction(()=>window.__firebaseDouble.rows().some(row=>row.path.includes('/materials/')));
  const payload=await page.evaluate(()=>window.__firebaseDouble.rows().find(row=>row.path.includes('/materials/')).value.pdcMaterials[0]);assert.equal(payload.textureUrl,proposed);assert.equal(payload.textureWidthMm,1234);assert.ok(!JSON.stringify(payload).match(/blob:|data:|base64/));
  console.log('PASS pending save retains old photo, 404/mismatch rejected, published bytes verified before save and Firebase metadata contains only public path');

  for(const [file,message] of [['html.png','не връща'],['fake.png','не е валидна'],['broken.png','декодира']]){
   await editor();await page.locator('#materialTextureUrl').fill('https://images.example.test/'+file);await page.waitForFunction(text=>document.querySelector('#materialPhotoStatus').textContent.includes(text),message);await save();assert.equal((await material()).textureUrl,proposed);
  }
  for(const mime of ['image/jpeg','image/webp']){
   const buffer=Buffer.from(await page.evaluate(type=>{const c=document.createElement('canvas');c.width=c.height=2;return c.toDataURL(type).split(',')[1]},mime),'base64');
   await editor();await select('local.'+(mime==='image/jpeg'?'jpg':'webp'),buffer,mime);await page.waitForFunction(()=>document.querySelector('#materialPhotoFileInfo').textContent.includes('local.'));await close();assert.equal((await material()).textureUrl,proposed);
  }
  for(const candidate of [{name:'fake.png',mimeType:'image/png',buffer:Buffer.from('<html>bad</html>')},{name:'huge.png',mimeType:'image/png',buffer:Buffer.alloc(10*1024*1024+1)}]){
   await editor();await page.locator('#materialPhotoUpload').setInputFiles(candidate);await page.waitForFunction(()=>document.querySelector('#materialPhotoStatus').textContent.includes('не е променена'));await close();assert.equal((await material()).textureUrl,proposed);
  }
  await editor();await page.locator('#removeMaterialPhoto').click();assert.equal((await material()).textureUrl,proposed);await save();assert.equal((await material()).textureUrl,'');assert.equal((await material()).textureWidthMm,1234);assert.equal((await material()).textureHeightMm,678);
  await page.waitForFunction(()=>window.__photoUrls.size===0);assert.ok(!requests.some(url=>url.includes('api.github.com')||url.includes('firebasestorage.googleapis.com')));assert.deepEqual(errors,[]);
  console.log('PASS HTML/decode failures, valid JPG/WebP, bad/oversized files, cleanup and explicit removal preserve texture dimensions');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
