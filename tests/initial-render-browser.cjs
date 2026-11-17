const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
 try{
  for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:{width:mobile?390:1400,height:900},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:mobile?2:1});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{
    window.__initialFrames={count:0,violations:[]};
    function visible(el){return el&&getComputedStyle(el).visibility==='visible'&&el.getClientRects().length>0}
    function sample(){const stats=window.__initialFrames;stats.count++;const body=document.body;if(body){const pending=document.documentElement.classList.contains('ned-booting');if(pending){for(const el of body.children)if(el.id!=='nedBoot'&&visible(el))stats.violations.push('exposed '+el.tagName)}else if(!document.querySelector('#shellTools')||!document.body.classList.contains('ned-shell'))stats.violations.push('incomplete shell');for(const img of document.querySelectorAll('img.nedPictureIcon'))if(visible(img))stats.violations.push('legacy icon')}requestAnimationFrame(sample)}requestAnimationFrame(sample);
   });
   await page.route('**/cloud.js',r=>r.fulfill({contentType:'application/javascript',body:'// no production cloud writes'}));
   let release,held;const waiting=()=>new Promise(resolve=>held=resolve);
   let gate;
   await page.route('https://cdn.jsdelivr.net/**',async r=>{if(r.request().url().includes('three.module.js')&&gate){held();await gate}const file=path.join(process.env.KITCHEN_CDN_CACHE,path.basename(new URL(r.request().url()).pathname));await r.fulfill({contentType:'application/javascript',body:fs.readFileSync(file)})});
   const url=process.env.KITCHEN_TEST_URL||'http://127.0.0.1:8014/';
   const cdp=await context.newCDPSession(page);
   for(const mode of ['open','F5','Ctrl+F5']){
    const blocked=waiting();gate=new Promise(resolve=>release=resolve);
    const navigation=mode==='open'?page.goto(url,{waitUntil:'load'}):mode==='F5'?page.reload({waitUntil:'load'}):page.waitForNavigation({waitUntil:'load'});
    if(mode==='Ctrl+F5'){await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});await cdp.send('Page.reload',{ignoreCache:true})}
    await blocked;
    await page.waitForFunction(()=>document.querySelector('#nedBoot')&&document.querySelector('header'));
    // Observe multiple actual frames while the external module is deliberately unavailable.
    await page.evaluate(()=>new Promise(resolve=>{let n=0;function frame(){if(++n===8)resolve();else requestAnimationFrame(frame)}requestAnimationFrame(frame)}));
    assert.equal(await page.locator('header').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    assert.ok(await page.locator('#nedBoot').isVisible());
    const out=process.env.KITCHEN_SCREENSHOTS||'/workspace/output/v283';fs.mkdirSync(out,{recursive:true});
    if(mode==='open')await page.screenshot({path:path.join(out,`initial-${mobile?'mobile':'desktop'}.png`)});
    release();gate=null;await navigation;
    await page.waitForFunction(()=>!document.documentElement.classList.contains('ned-booting'));
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await page.locator('#nedBoot').count(),0);
    assert.ok(await page.locator('#modeProject').isVisible());
    assert.ok(await page.locator('#modeProject svg').count());
    const frames=await page.evaluate(()=>window.__initialFrames);assert.ok(frames.count>=8);assert.deepEqual(frames.violations,[],JSON.stringify(frames));
    assert.deepEqual(errors,[]);
    if(mode==='open')await page.screenshot({path:path.join(out,`ready-${mobile?'mobile':'desktop'}.png`)});
    console.log(`PASS ${mobile?'mobile':'desktop'} ${mode}: blocked module, frame-by-frame no legacy paint, immediate ready shell`);
   }
   await context.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
