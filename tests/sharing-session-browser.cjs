const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,errors}=await openKitchen({firebaseDouble:true});
 try{
  const dialog=page.locator('#sharingDialog');
  async function settings(){
   await page.locator('#shellSettings summary').click();
   await page.locator('#sharingOpen').click();
  }
  async function close(){await dialog.getByRole('button',{name:'Затвори'}).click();await dialog.waitFor({state:'detached'})}
  for(const options of [{emailVerified:false},{signInProvider:'password'}]){
   await page.evaluate(options=>window.__firebaseDouble.setUser('alice',options),options);
   await settings();
   await dialog.getByText(/Google вход с потвърден имейл/).waitFor();
   assert.equal(await dialog.getByRole('button',{name:'Добави',exact:true}).count(),0);
   await close();
  }
  await page.evaluate(()=>{window.__firebaseDouble.denyCollection('access_grants');window.__firebaseDouble.setUser('alice')});
  await settings();
  await dialog.getByRole('status').filter({hasText:/Firestore отказа достъп до access_grants/}).waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Добави',exact:true}).isEnabled(),false);
  await close();
  await page.evaluate(()=>window.__firebaseDouble.denyCollection('nediq_access'));
  await page.locator('#sharedBaseStatus').click();
  await dialog.getByRole('status').filter({hasText:/Firestore отказа достъп до nediq_access/}).waitFor();
  await dialog.getByRole('button',{name:'Моята база — Собственик'}).click();
  await dialog.waitFor({state:'detached'});

  // A previously cached installer initialized the panel and returned undefined.
  await page.route('**/sharing-ui.mjs',route=>route.fulfill({contentType:'application/javascript',body:'export function installSharingUI() {}'}));
  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('alice@example.test'));
  await page.evaluate(()=>window.__firebaseDouble.setUser('bob'));
  await page.waitForFunction(()=>document.querySelector('#cloudStatus').textContent.includes('bob@example.test'));
  assert.deepEqual(errors,[]);
  console.log('PASS stale installer return value, token claim checks, and permission-denied diagnostics for both collections');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
