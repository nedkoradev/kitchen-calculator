// Shared isolated HTTP harness. Hooks are injected into test responses only.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const hooks=`
window.__test={
 parts:()=>structuredClone(customParts),
 setup(parts){clearWorkspace();customParts.push(...structuredClone(parts));selected=parts[0]?.key;groupSelections.clear();singleMemberSelection=false;build(false);setView('front')},
 select(key,single=false){selected=key;singleMemberSelection=single;updateSelection()},
 face(key){const p=customParts.find(p=>p.key===key);return screenPos(new THREE.Vector3(p.x,p.y,p.z+p.d/2))},
 handle(axis,sign){const p=customParts.find(p=>p.key===selected),m=customParts.filter(q=>q.assembly===p.assembly);const b=groupBounds(m,axis),x=groupBounds(m,'x'),z=groupBounds(m,'z');const v=new THREE.Vector3(axis==='x'?(sign<0?b.min:b.max)-ROOM.w/2:(x.min+x.max)/2-ROOM.w/2,axis==='y'?(sign<0?b.min:b.max):Math.max(...m.map(p=>p.y+p.h/2))+3,axis==='z'?(sign<0?b.min:b.max)-ROOM.d/2:(z.min+z.max)/2-ROOM.d/2);const a=screenPos(v),c=screenPos(v.clone().add(new THREE.Vector3(axis==='x'?100:0,axis==='y'?100:0,axis==='z'?100:0)));return {...a,dx:(c.x-a.x)/100,dy:(c.y-a.y)/100}},
 snapshotParts,restoreParts,createAssembly,ungroupAssembly,duplicateCustom,room:applyRoomDimensions,
 selectKeys(keys){groupSelections.clear();keys.forEach(key=>groupSelections.add(key));selected=keys[0];updateSelection()},
 rotateSelectedPart,undoStep:()=>$('undoStep').click(),redoStep:()=>$('redoStep').click(),
 selectAll(){groupSelections.clear();customParts.forEach(p=>groupSelections.add(p.key))},
 build:()=>build(false),view:setView,
 finish:()=>structuredClone(finishes),labels:()=>structuredClone(labels)
};
`;
async function openKitchen({firebaseDouble=false,extraHooks='',initialStorage=null}={}){
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY,bypass:'127.0.0.1,localhost'}:undefined});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
  if(initialStorage)await page.addInitScript(values=>{
   if(!sessionStorage.getItem('kitchen-test-seeded')){
    for(const [key,value] of Object.entries(values))localStorage.setItem(key,value);
    sessionStorage.setItem('kitchen-test-seeded','yes');
   }
  },initialStorage);
  page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message)});
  page.on('requestfailed',r=>console.error('REQUESTFAILED',r.url(),r.failure().errorText));
  if(process.env.KITCHEN_CDN_CACHE)await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(process.env.KITCHEN_CDN_CACHE,path.basename(new URL(r.request().url()).pathname)))}));
  if(process.env.KITCHEN_GEOMETRY_FILE)await page.route('**/geometry.mjs',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(process.env.KITCHEN_GEOMETRY_FILE,'utf8')}));
  if(firebaseDouble){
   const origin=new URL(process.env.KITCHEN_TEST_URL||'http://127.0.0.1:8000/').origin;
   await page.route('https://www.gstatic.com/firebasejs/**',r=>r.fulfill({contentType:'application/javascript',body:`export * from '${origin}/tests/firebase-browser-double.mjs';`}));
  }else await page.route('**/cloud.js',r=>r.fulfill({contentType:'application/javascript',body:'// Isolated test: no Firebase access.'}));
  await page.route(/\/($|index\.html$)/,async r=>{
   if(new URL(r.request().url()).pathname!=='/'&& !r.request().url().endsWith('/index.html'))return r.continue();
   await r.fulfill({contentType:'text/html',body:source.replace('}build();frame();','}build();frame();'+hooks+extraHooks)});
  });
  await page.goto(process.env.KITCHEN_TEST_URL||'http://127.0.0.1:8000/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__test&&document.querySelector('#materialSelect').options.length>1);
  await page.locator('#modeConstructor').click();
  const setup=parts=>page.evaluate(parts=>window.__test.setup(parts),parts);
  const parts=()=>page.evaluate(()=>window.__test.parts());
  const field=(id,value)=>page.evaluate(({id,value})=>{const el=document.getElementById(id);el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}))},{id,value:String(value)});
  const clickJitter=async point=>{await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+2,point.y+2);await page.mouse.up()};
  return {browser,page,errors,setup,parts,field,clickJitter};
 }catch(error){await browser.close();throw error}
}
module.exports={openKitchen};
