// Raster assertions on the actual preview and a rendered browser screenshot.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const errors=[];
 try{
  for(const [viewport,dpr] of [[1400,1],[390,2],[320,3]]){
   const context=await browser.newContext({viewport:{width:viewport,height:1000},deviceScaleFactor:dpr,isMobile:viewport<640});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   const url=process.env.KITCHEN_TEST_URL||'http://127.0.0.1:8000/';
   // Real application CSS and real editor module, isolated from WebGL/Firebase.
   await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}));await page.goto(url);
   await page.evaluate('window.__measureEdge = '+measure.toString());
   for(const [w,h,d] of [[600,18,400],[600,400,18],[18,400,600],[3000,18,1],[1,3000,18]]){
    await page.evaluate(async({w,h,d})=>{
     const {openEdgeEditor}=await import('/edge-editor.mjs');
     window.__edgeVisualResult=null;
     openEdgeEditor({part:{w,h,d},finish:{edges:[null,null,null,null],grainRequired:false},material:{color:'#cdbc9a'},edgeMaterials:[{name:'Бял',color:'#ffffff'}],onApply:r=>{window.__edgeVisualResult=r}});
    },{w,h,d});
    const preview=page.locator('.edgePreview canvas');
    await preview.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('.edgePreview canvas').width>0);
    let bounds;
    for(let mask=0;mask<16;mask++){
     for(let side=0;side<4;side++)await page.locator('[data-edge-side="'+side+'"]').selectOption(mask&(1<<side)?'0':'');
     // No delay: onchange must have painted synchronously, without Apply.
     const raw=await preview.evaluate(c=>window.__measureEdge(c.getContext('2d').getImageData(0,0,c.width,c.height)));
     check(raw,mask,dpr,0);if(bounds)assert.deepEqual(raw.bounds,bounds,'bands remain entirely within the original neutral outline');else bounds=raw.bounds;
     const png=await preview.screenshot();
     const shot=await page.evaluate(async base64=>{
      const img=new Image();img.src='data:image/png;base64,'+base64;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      return window.__measureEdge(ctx.getImageData(0,0,c.width,c.height));
     },png.toString('base64'));
     check(shot,mask,dpr,1);
     assert.equal(await page.evaluate(()=>window.__edgeVisualResult),null,'preview edits must remain a draft');
    }
    // Check removing all four sides together as well as individual dropdowns.
    await page.locator('#visualEdgeAll').selectOption('');await page.locator('#visualEdgeUseAll').click();
    check(await preview.evaluate(c=>window.__measureEdge(c.getContext('2d').getImageData(0,0,c.width,c.height))),0,dpr,0);
    const appliedSlots=await page.locator('[data-edge-side]').evaluateAll(es=>es.map(e=>Number(e.dataset.edgeSlot)));
    assert.equal(new Set(appliedSlots).size,4,'each menu addresses a distinct physical edge');
    await page.locator('#visualEdgeCancel').click();
    console.log(`PASS ${viewport}px DPR ${dpr}, ${w}×${h}×${d}: all 16 masks, 4 CSS px, inset bounds, neutral edges, immediate updates and screenshot`);
   }
   await context.close();
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
function measure({data,width,height}){
 const color=(x,y)=>data.subarray((y*width+x)*4,(y*width+x)*4+3);
 const eq=(a,b)=>a.every((v,i)=>v===b[i]);
 const red=c=>c[0]>210&&c[1]<110&&c[2]<110;
 const board=c=>eq(c,[205,188,154])||eq(c,[139,160,182])||red(c);
 let left=width,right=-1,top=height,bottom=-1,grayInside=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(board(color(x,y))){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
 const cx=Math.floor((left+right)/2),cy=Math.floor((top+bottom)/2);
 const rays=[Array.from({length:right-left+1},(_,i)=>color(left+i,cy)),Array.from({length:right-left+1},(_,i)=>color(right-i,cy)),Array.from({length:bottom-top+1},(_,i)=>color(cx,top+i)),Array.from({length:bottom-top+1},(_,i)=>color(cx,bottom-i))];
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(eq(color(x,y),[169,185,202]))grayInside++;
 return {bounds:[left,right,top,bottom],width,height,grayInside,rays:rays.map(ray=>{let redCount=0,neutralCount=0;for(const c of ray){if(!red(c))break;redCount++}for(const c of ray){if(!eq(c,[139,160,182]))break;neutralCount++}return {redCount,neutralCount}})};
}
function check({bounds:[left,right,top,bottom],width,height,grayInside,rays},mask,dpr,tolerance){
 assert.ok(left>0&&top>0&&right<width-1&&bottom<height-1,'all bands must fit inside the canvas');
 assert.equal(grayInside,0,'dimension lines must not overlap the detail');
 rays.forEach(({redCount,neutralCount},side)=>{
  if(mask&(1<<side))assert.ok(Math.abs(redCount-4*dpr)<=tolerance,`side ${side}, mask ${mask}: red thickness ${redCount}/${dpr}, expected 4 CSS px`);
  else{assert.equal(redCount,0,`side ${side}, mask ${mask}: unbanded edge stays neutral`);if(!tolerance)assert.equal(neutralCount,dpr,'neutral outline is 1 CSS px')}
 });
}
