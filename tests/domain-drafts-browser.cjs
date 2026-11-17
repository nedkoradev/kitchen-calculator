const assert=require('node:assert/strict');
const fs=require('node:fs');
const {openKitchen}=require('./browser-harness.cjs');
const hooks="window.__domainDraft={snapshot:captureProjectSnapshot,pending:()=>draftRecovery.pending};";
(async()=>{
 const originalUrl=process.env.KITCHEN_TEST_URL||'http://127.0.0.1:8020/';
 const old=await openKitchen({firebaseDouble:true,extraHooks:hooks});let next;
 try{
  await old.page.waitForFunction(()=>!window.__domainDraft.pending());
  await old.setup([{key:'customOLD',w:600,h:18,d:400,x:0,y:9,z:0,locks:{h:true}}]);await old.field('partW',650);
  await old.page.locator('#modeProject').click();await old.setup([{key:'customPROJECT',w:900,h:18,d:500,x:0,y:9,z:0,locks:{h:true}}]);await old.field('partW',950);
  await old.page.locator('#fileMenu>summary').click();const event=old.page.waitForEvent('download');await old.page.locator('#draftDownload').click();const file=await event;const buffer=fs.readFileSync(await file.path());
  const expected=JSON.parse(buffer).records.find(r=>r.kind==='project').snapshot;
  const transferred=new URL(originalUrl);transferred.hostname='localhost';process.env.KITCHEN_TEST_URL=transferred.href;
  next=await openKitchen({firebaseDouble:true,extraHooks:hooks});
  assert.notEqual(new URL(next.page.url()).origin,new URL(old.page.url()).origin);
  await next.page.waitForFunction(()=>!window.__domainDraft.pending());assert.equal((await next.parts()).length,0);
  await next.page.locator('#draftImportFile').setInputFiles({name:'NED-IQ-local-drafts.json',mimeType:'application/json',buffer});
  await next.page.locator('#draftRecoverApply').click();
  await next.page.waitForFunction(expected=>{const actual=window.__domainDraft.snapshot().settings.camera;return ['position','target'].every(key=>actual[key].every((n,i)=>Math.abs(n-expected[key][i])<1e-6))},expected.settings.camera);
  const actual=await next.page.evaluate(()=>window.__domainDraft.snapshot());
  for(const key of ['position','target'])for(let i=0;i<3;i++)assert.ok(Math.abs(actual.settings.camera[key][i]-expected.settings.camera[key][i])<1e-6,JSON.stringify({key,actual:actual.settings.camera,expected:expected.settings.camera}));
  actual.settings.camera=expected.settings.camera;assert.deepEqual(actual,expected);
  await next.page.locator('#undoStep').click();assert.equal((await next.parts())[0].w,900);await next.page.locator('#redoStep').click();assert.equal((await next.parts())[0].w,950);
  await next.page.locator('#modeConstructor').click();assert.equal((await next.parts())[0].w,650);await next.page.locator('#undoStep').click();assert.equal((await next.parts())[0].w,600);
  const prior=await next.parts(),wrong=JSON.parse(buffer);wrong.owner='another-account';
  await next.page.locator('#draftImportFile').setInputFiles({name:'wrong-profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(wrong))});
  await next.page.waitForFunction(()=>document.querySelector('#draftStatus').textContent.includes('друг профил'));assert.deepEqual(await next.parts(),prior);
  assert.equal(await next.page.evaluate(()=>window.__firebaseDouble.rows().length),0);assert.equal(await old.page.evaluate(()=>window.__firebaseDouble.rows().length),0);
  assert.deepEqual(old.errors,[]);assert.deepEqual(next.errors,[]);
  console.log('PASS explicit draft transfer across origins, both documents/materials/camera/history, wrong-profile rejection, zero cloud writes');
 }finally{process.env.KITCHEN_TEST_URL=originalUrl;await old.browser.close();await next?.browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
