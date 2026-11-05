// Run with Playwright installed and a static server at KITCHEN_TEST_URL.
// Test hooks are injected into the HTTP response, never shipped in the app.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const hooks=`
window.__test={
 parts:()=>structuredClone(customParts),
 setup(parts){clearWorkspace();customParts.push(...structuredClone(parts));selected=parts[0]?.key;groupSelections.clear();singleMemberSelection=false;build(false);setView('front')},
 select(key,single=false){selected=key;singleMemberSelection=single;updateSelection()},
 face(key){const p=customParts.find(p=>p.key===key);return screenPos(new THREE.Vector3(p.x,p.y,p.z+p.d/2))},
 handle(axis,sign){const p=customParts.find(p=>p.key===selected),m=customParts.filter(q=>q.assembly===p.assembly);const b=groupBounds(m,axis),x=groupBounds(m,'x'),z=groupBounds(m,'z');const v=new THREE.Vector3(axis==='x'?(sign<0?b.min:b.max)-ROOM.w/2:(x.min+x.max)/2-ROOM.w/2,axis==='y'?(sign<0?b.min:b.max):Math.max(...m.map(p=>p.y+p.h/2))+3,axis==='z'?(sign<0?b.min:b.max)-ROOM.d/2:(z.min+z.max)/2-ROOM.d/2);const a=screenPos(v),c=screenPos(v.clone().add(new THREE.Vector3(axis==='x'?100:0,axis==='y'?100:0,axis==='z'?100:0)));return {...a,dx:(c.x-a.x)/100,dy:(c.y-a.y)/100}},
 snapshotParts,restoreParts,createAssembly,ungroupAssembly,duplicateCustom,
 rotateSelectedPart,undoStep:()=>$('undoStep').click(),redoStep:()=>$('redoStep').click(),
 selectAll(){groupSelections.clear();customParts.forEach(p=>groupSelections.add(p.key))},
 build:()=>build(false),view:setView,
 finish:()=>structuredClone(finishes),labels:()=>structuredClone(labels)
};
`;
const part=(key,extra={})=>({key,x:0,y:200,z:0,w:100,h:100,d:100,locks:{},...extra});
const cabinet=()=>[
 part('custom101',{x:9,y:360,w:18,h:720,d:500,locks:{w:true},assembly:'cab'}),
 part('custom102',{x:591,y:360,w:18,h:720,d:500,locks:{w:true},assembly:'cab'}),
 part('custom103',{x:300,y:9,w:564,h:18,d:500,locks:{h:true},assembly:'cab'}),
 part('custom104',{x:300,y:711,w:564,h:18,d:500,locks:{h:true},assembly:'cab'})
];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message)});
  page.on('requestfailed',r=>console.error('REQUESTFAILED',r.url(),r.failure().errorText));
  if(process.env.KITCHEN_CDN_CACHE)await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(process.env.KITCHEN_CDN_CACHE,path.basename(new URL(r.request().url()).pathname)))}));
  await page.route('**/cloud.js',r=>r.fulfill({contentType:'application/javascript',body:'// Isolated test: no Firebase access.'}));
  await page.route(/\/($|index\.html$)/,async r=>{
   if(new URL(r.request().url()).pathname!=='/'&& !r.request().url().endsWith('/index.html'))return r.continue();
   await r.fulfill({contentType:'text/html',body:source.replace('}build();frame();','}build();frame();'+hooks)});
  });
  await page.goto(process.env.KITCHEN_TEST_URL||'http://127.0.0.1:8000/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__test&&document.querySelector('#materialSelect').options.length>1);
  await page.locator('#modeConstructor').click();
  const setup=parts=>page.evaluate(parts=>window.__test.setup(parts),parts);
  const parts=()=>page.evaluate(()=>window.__test.parts());
  const field=(id,value)=>page.evaluate(({id,value})=>{const el=document.getElementById(id);el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))},{id,value:String(value)});
  const clickJitter=async point=>{await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+2,point.y+2);await page.mouse.up()};
  await setup([part('custom100')]);
  let before=await parts();
  await clickJitter(await page.evaluate(()=>window.__test.face('custom100')));
  assert.deepEqual(await parts(),before);
  await page.evaluate(()=>window.__test.view('perspective'));
  await page.evaluate(()=>window.__test.view('front'));
  assert.deepEqual(await parts(),before);
  console.log('PASS selection jitter and 2D/3D preserve geometry');
  await field('partW',101);
  assert.equal((await parts())[0].x,.5);
  await page.evaluate(()=>window.__test.undoStep());assert.equal((await parts())[0].w,100);
  await page.evaluate(()=>window.__test.redoStep());assert.equal((await parts())[0].w,101);
  console.log('PASS integer numeric resize, fixed left, undo/redo');
  const fixture=[part('custom100'),part('custom200',{x:300,w:1})];
  await setup(fixture);await field('partX',2500);
  assert.equal((await parts())[0].x,249.5);
  await setup(fixture);
  let point=await page.evaluate(()=>window.__test.face('custom100'));
  await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+7,point.y);await page.mouse.move(point.x+700,point.y);await page.mouse.up();
  assert.equal((await parts())[0].x,249.5);
  assert.equal(await page.locator('#partX').inputValue(),'1699.5');
  console.log('PASS numeric and pointer moves stop at the same thin obstacle');
  await setup(cabinet());before=await parts();
  await clickJitter(await page.evaluate(()=>window.__test.face('custom102')));
  assert.deepEqual(await parts(),before);
  const handle=await page.evaluate(()=>window.__test.handle('x',1));
  await clickJitter(handle);assert.deepEqual(await parts(),before);
  await field('partW',800);const numeric=await parts();
  for(const sign of [-1,1]){
   await setup(cabinet());
   point=await page.evaluate(sign=>window.__test.handle('x',sign),sign);
   await page.mouse.move(point.x,point.y);await page.mouse.down();
   await page.mouse.move(point.x+7*sign,point.y);
   await page.mouse.move(point.x+7*sign+point.dx*200*sign,point.y+point.dy*200*sign);await page.mouse.up();
   assert.deepEqual(await parts(),numeric);
  }
  assert.equal(numeric[0].w,18);assert.equal(numeric[1].w,18);
  console.log('PASS group click/handle jitter, identical pointer and numeric resize, locks');
  await page.evaluate(()=>window.__test.select('custom103',true));
  await field('materialSelect',1);
  for(const [i,id] of ['edgeLeft','edgeRight','edgeTop','edgeBottom'].entries())await field(id,i);
  await page.evaluate(()=>window.__test.select('custom101'));
  await page.evaluate(()=>{window.__test.selectAll();window.__test.createAssembly()});
  before=await parts();await page.evaluate(()=>window.__test.duplicateCustom());
  const duplicated=await parts();
  assert.notEqual(duplicated[4].assemblyStack[0],before[0].assemblyStack[0]);
  await page.evaluate(()=>window.__test.ungroupAssembly(window.__test.parts().at(-1).assembly));
  assert.deepEqual((await parts()).slice(0,4),before);
  const saved=await page.evaluate(()=>window.__test.snapshotParts());
  await setup([]);await page.evaluate(items=>{window.__test.restoreParts(items);window.__test.build()},saved);
  const loaded=await parts();assert.equal(loaded.length,saved.length);
  for(let i=0;i<loaded.length;i++)for(const k of ['w','h','d','x','y','z'])assert.equal(loaded[i][k],saved[i].part[k]);
  const finishes=await page.evaluate(()=>window.__test.finish());
  for(let i=0;i<loaded.length;i++)assert.deepEqual(finishes[loaded[i].key],saved[i].finish);
  console.log('PASS nested copy, one-level ungroup, reload, materials and four edges');
  await page.locator('#modeProject').click();await page.locator('[data-v="top"]').click();await page.locator('[data-v="perspective"]').click();await page.locator('#modeConstructor').click();
  assert.equal((await parts()).length,saved.length);
  await setup([part('custom100',{w:101,d:99,locks:{w:true}})]);
  before=await parts();
  await page.evaluate(()=>window.__test.rotateSelectedPart(1));
  assert.equal((await parts())[0].locks.d,true);
  await page.evaluate(()=>window.__test.rotateSelectedPart(-1));
  for(const k of ['w','h','d','x','y','z'])assert.equal((await parts())[0][k],before[0][k]);
  assert.equal((await parts())[0].locks.w,true);
  assert.deepEqual(errors,[]);
  console.log('PASS constructor/project smoke and no uncaught browser errors; Firebase isolated');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
