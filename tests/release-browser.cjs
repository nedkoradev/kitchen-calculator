const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),scope='/kitchen-calculator/';
const first='a'.repeat(40),second='b'.repeat(40);let revision=first;
const render=source=>source.replace(/^---\n[\s\S]*?\n---\n/,'').replaceAll('{{ site.github.build_revision | slice: 0, 8 }}',revision.slice(0,8)).replaceAll('{{ site.github.build_revision }}',revision);
const html='<!doctype html><span id="appVersion">v1.65-dev</span><script type="module" src="./app-release.js"></script>';
const server=http.createServer((req,res)=>{
 const file=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(scope.length)||'index.html';
 if(!req.url.startsWith(scope)||file.includes('..')){res.writeHead(404).end();return}
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
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#appVersion').textContent==='v1.65+aaaaaaaa');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.evaluate(async()=>{localStorage.setItem('unsaved-draft','keep');await caches.open('another-app');window.unsavedDraft='keep'});
  console.log('PASS initial release version and scoped worker/cache on a Pages subpath');
  revision=second;
  await page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update()});
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.evaluate(()=>window.unsavedDraft),'keep');
  assert.equal(await page.evaluate(()=>document.querySelector('#appVersion').textContent),'v1.65+aaaaaaaa');
  const during=await page.evaluate(()=>caches.keys());assert.ok(during.some(key=>key.endsWith('a'.repeat(40))));assert.ok(during.some(key=>key.endsWith('b'.repeat(40))));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#appVersion').textContent==='v1.65+bbbbbbbb');
  await page.evaluate(()=>fetch('./users/alice'));
  assert.equal(await page.evaluate(async()=>{for(const name of await caches.keys()){for(const request of await (await caches.open(name)).keys())if(request.url.includes('/users/'))return true}return false}),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('unsaved-draft')),'keep');
  console.log('PASS release update keeps unsaved work, fetches new version and excludes user data from caches');
  await page.close();
  const next=await context.newPage();await next.goto(url);
  await next.waitForFunction(async()=>!(await caches.keys()).some(key=>key.endsWith('a'.repeat(40))));
  assert.ok((await next.evaluate(()=>caches.keys())).includes('another-app'));
  await context.setOffline(true);await next.reload();
  await next.waitForFunction(()=>document.querySelector('#appVersion').textContent==='v1.65+bbbbbbbb');
  assert.equal(await next.evaluate(()=>localStorage.getItem('unsaved-draft')),'keep');
  console.log('PASS activation removes only old app cache; public shell/version work offline');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
