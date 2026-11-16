const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');
(async()=>{
 const {browser,page,errors}=await openKitchen({extraHooks:`window.__architecture={
  async seed(){const {generateCabinet,cabinetPresets}=await import('./cabinet-generator.mjs');clearWorkspace();const catalog={pdcMaterials:libraryBoards,edgeMaterials:libraryEdges,...catalogExtra};for(let i=0;i<3;i++){const entries=generateCabinet({...cabinetPresets.base,w:600,h:898,shelves:0},catalog);entries.forEach(e=>e.part.assembly='cabinet-'+i);restoreParts(entries,{x:(i-1)*600,y:0,z:0})}selected=null;groupSelections.clear();build(false);setView('perspective')},
  model:captureProjectSnapshot,measure:()=>cabinetMeasurements(customParts,labels,finishes),
  camera(angle,scale){const target=new THREE.Vector3(0,650,0);camera.position.copy(target).add(new THREE.Vector3(Math.sin(angle)*3000*scale,1800*scale,Math.cos(angle)*3000*scale));controls.target.copy(target);controls.update()},
  shapes(){const w=host.clientWidth,h=host.clientHeight;return cabinetMeasurements(customParts,labels,finishes).map(m=>{const b=m.bounds;return ['min','max'].flatMap(x=>['min','max'].flatMap(y=>['min','max'].map(z=>{const p=new THREE.Vector3(b.x[x],b.y[y],b.z[z]).project(camera);return {x:(p.x+1)*w/2,y:(1-p.y)*h/2}})))})}
 };`});
 async function check(){
  const data=await page.locator('[data-cabinet-dimension]').evaluateAll(es=>es.map(e=>({kind:e.dataset.dimension,value:+e.dataset.value,ids:JSON.parse(e.dataset.cabinetIds),height:+e.dataset.heightValue,group:e.dataset.heightGroup,title:e.querySelector('title').textContent,arrows:e.querySelectorAll('[data-dimension-arrow]').length,rects:e.querySelectorAll('rect').length,angle:e.querySelector('[data-dimension-label]').transform.baseVal.getItem(1).angle,lines:[...e.querySelectorAll('[data-dimension-line="baseline"]')].map(l=>({x1:+l.getAttribute('x1'),y1:+l.getAttribute('y1'),x2:+l.getAttribute('x2'),y2:+l.getAttribute('y2')}))})));
  assert.ok(data.length>=2,'visible row retains readable dimensions');
  for(const d of data){assert.equal(d.rects,0);assert.equal(d.arrows,2);assert.equal(d.height,898);assert.ok(d.title.includes('898'));for(const l of d.lines){const angle=Math.atan2(l.y2-l.y1,l.x2-l.x1)*180/Math.PI;const diff=((angle-d.angle)%180+180)%180;assert.ok(Math.min(diff,180-diff)<.01,'text follows projected baseline')}}
  const outside=await page.evaluate(()=>{
   const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
   const hull=ps=>{ps.sort((a,b)=>a.x-b.x||a.y-b.y);const lo=[],hi=[];for(const p of ps){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p)}for(const p of ps.reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p)}return lo.slice(0,-1).concat(hi.slice(0,-1))};
   const shapes=window.__architecture.shapes().map(hull);
   return [...document.querySelectorAll('[data-dimension-line="baseline"]')].every(l=>{
    for(const t of [0,.25,.5,.75,1]){const p={x:+l.getAttribute('x1')*(1-t)+ +l.getAttribute('x2')*t,y:+l.getAttribute('y1')*(1-t)+ +l.getAttribute('y2')*t};if(shapes.some(poly=>poly.every((a,i)=>cross(a,poly[(i+1)%poly.length],p)>=0)))return false}return true;
   });
  });assert.ok(outside,'baselines stay outside cabinet faces and visible side silhouettes');
  return data;
 }
 try{
  for(const mode of ['Constructor','Project']){
   await page.locator('#mode'+mode).click();await page.evaluate(()=>window.__architecture.seed());
   const before=await page.evaluate(()=>window.__architecture.model());
   if(await page.locator('#nedDimensionsToggle').getAttribute('aria-pressed')!=='true')await page.locator('#nedDimensionsToggle').click();
   await page.waitForFunction(()=>document.querySelectorAll('[data-dimension="width"]').length===3);
   let dims=await check();assert.equal(dims.filter(d=>d.kind==='height').length,1);assert.equal(dims.find(d=>d.kind==='height').ids.length,3);assert.equal(new Set(dims.filter(d=>d.kind==='width').map(d=>d.group)).size,1);
   assert.ok(dims.filter(d=>d.kind==='width').every(d=>d.title.includes('широчина 600')&&d.title.includes('височина 898')));
   for(const angle of [.6,-.6,2.5,-2.5])for(const scale of [.8,1.3]){
    await page.evaluate(({angle,scale})=>window.__architecture.camera(angle,scale),{angle,scale});await page.waitForTimeout(120);await check();
   }
   // View operations and the existing toggle do not write model or finish data.
   const after=await page.evaluate(()=>window.__architecture.model());assert.deepEqual(after.parts,before.parts);assert.deepEqual(after.materials,before.materials);
   await page.locator('#nedDimensionsToggle').click();assert.equal(await page.locator('#nedCabinetDimensions').isVisible(),false);await page.locator('#nedDimensionsToggle').click();await check();
   console.log('PASS '+mode+': shared equal-height row, individual height identification, background-free directional text, two small arrows, external baselines, front/rear orbit and zoom, unchanged parts/materials, existing toggle');
  }
  assert.deepEqual(errors,[]);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
