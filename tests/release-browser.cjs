const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),scope='/kitchen-calculator/';
const version=JSON.parse(fs.readFileSync(path.join(root,'_data/version.json'),'utf8'));const visible=`${version.major}.${version.minor}`;
const first='a'.repeat(40),second='b'.repeat(40);let revision=first;
const render=source=>source.replace(/^---\n[\s\S]*?\n---\n/,'').replaceAll('{{ site.data.version.major }}',String(version.major)).replaceAll('{{ site.data.version.minor }}',String(version.minor)).replaceAll('{{ site.github.build_revision }}',revision);
const inventory=JSON.parse(fs.readFileSync(path.join(root,'_data/repository_space.json'),'utf8'));
const stats=()=>({schemaVersion:1,inventoryReady:true,scope:'published-source-snapshot',includesGitHistory:false,version:visible,revision,measuredAt:'2026-11-06T12:00:00Z',totalBytes:inventory.files.reduce((n,f)=>n+f.bytes,0),fileCount:inventory.files.length,textureBytes:inventory.files.filter(f=>f.texture).reduce((n,f)=>n+f.bytes,0),imageCount:inventory.files.filter(f=>f.image).length,referenceBytes:1024**3});
const html='<!doctype html><span id="appVersion">v0.0</span><script type="module" src="./app-release.js"></script>';
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(scope.length)||'index.html';
 if(!req.url.startsWith(scope)||file.includes('..')){res.writeHead(404).end();return}
 if(file==='repository-space.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(stats()));return}
 if(file==='materials/textures/test.png'){res.setHeader('Content-Type','image/png');res.end(fs.readFileSync(path.join(__dirname,'fixtures/grain.png')));return}
 if(file==='users/alice'){res.setHeader('Content-Type','application/json');res.end('{"private":true}');return}
 const location=path.join(root,file);if(!fs.existsSync(location)){res.writeHead(404).end();return}
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'text/plain');
 res.end(file==='index.html'?html:render(fs.readFileSync(location,'utf8')));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}${scope}`;
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(value=>document.querySelector('#appVersion').textContent==='v'+value,visible);
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(async()=>{localStorage.setItem('unsaved-draft','keep');await caches.open('another-app');window.unsavedDraft='keep'});
  console.log('PASS initial release version and scoped worker/cache on a Pages subpath');
  revision=second;
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.evaluate(()=>window.unsavedDraft),'keep');
  assert.equal(await page.evaluate(()=>document.querySelector('#appVersion').textContent),'v'+visible);
  const during=await page.evaluate(()=>caches.keys());assert.ok(during.some(key=>key.endsWith('a'.repeat(40))));assert.ok(during.some(key=>key.endsWith('b'.repeat(40))));
  await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.buildRevision==='b'.repeat(40));
  await page.evaluate(()=>fetch('./users/alice'));
  await page.evaluate(()=>fetch('./materials/textures/test.png'));
  assert.equal(await page.evaluate(async()=>(await(await fetch('./repository-space.json')).json()).revision),'b'.repeat(40));
  assert.equal(await page.evaluate(async()=>{for(const name of await caches.keys()){for(const request of await (await caches.open(name)).keys())if(request.url.includes('/users/'))return true}return false}),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('unsaved-draft')),'keep');
  console.log('PASS release update keeps unsaved work, fetches new version and excludes user data from caches');
  await page.close();
  const next=await context.newPage();await next.goto(url);
  await next.waitForFunction(async()=>!(await caches.keys()).some(key=>key.endsWith('a'.repeat(40))));
  assert.ok((await next.evaluate(()=>caches.keys())).includes('another-app'));
  await next.evaluate(()=>fetch('./materials/textures/test.png'));
  await context.setOffline(true);await next.reload();
  await next.waitForFunction(value=>document.querySelector('#appVersion').textContent==='v'+value,visible);
  assert.equal(await next.evaluate(()=>localStorage.getItem('unsaved-draft')),'keep');
  assert.equal(await next.evaluate(async()=>(await(await fetch('./repository-space.json')).json()).revision),'b'.repeat(40));
  assert.equal(await next.evaluate(async()=>(await fetch('./materials/textures/test.png')).ok),true);
  console.log('PASS activation removes only old app cache; public shell/version work offline');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
