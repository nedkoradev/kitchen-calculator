const assert=require('node:assert/strict');const path=require('node:path');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{const {browser,page,errors,setup,parts}=await openKitchen({extraHooks:`window.__zoom={state:()=>({distance:camera.position.distanceTo(controls.target),zoom:camera.zoom,near:camera.near,position:camera.position.toArray(),target:controls.target.toArray()}),close(){const d=camera.position.clone().sub(controls.target).normalize();camera.position.copy(controls.target).addScaledVector(d,95);controls.update()}};`});
try{
 for(const mode of ['constructor','project']){
  await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await setup([{key:'custom980',w:30,h:40,d:18,x:0,y:200,z:0,locks:{d:true}}]);const before=await parts();
  const canvas=page.locator('#view canvas');const r=await canvas.boundingBox();const center={x:r.x+r.width/2,y:r.y+r.height/2};
  for(const view of ['front','top','perspective']){
   await page.locator('[data-v="'+view+'"]').click();await page.mouse.move(center.x,center.y);
   const a=await page.evaluate(()=>window.__zoom.state());for(let i=0;i<8;i++)await page.mouse.wheel(0,-120);await page.waitForTimeout(150);const b=await page.evaluate(()=>window.__zoom.state());
   const ratio=view==='perspective'?a.distance/b.distance:b.zoom/a.zoom;console.log(mode,view,'8-step ratio',ratio);assert.ok(ratio>2.5,'eight wheel notches give useful zoom');if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`zoom-${mode}-${view}.png`)});
   await page.mouse.wheel(0,120);const c=await page.evaluate(()=>window.__zoom.state());assert.ok(view==='perspective'?c.distance>b.distance:c.zoom<b.zoom);
  }
  await page.locator('[data-v="perspective"]').click();await page.evaluate(()=>window.__zoom.close());await page.mouse.move(center.x,center.y);for(let i=0;i<15;i++)await page.mouse.wheel(0,-120);const close=await page.evaluate(()=>window.__zoom.state());console.log('close distance',close.distance);assert.ok(close.distance<20,'no old 90mm zoom wall');assert.ok(close.near<1);
  await page.locator('[data-v="front"]').click();if(await page.locator('#nedPartNamesToggle').getAttribute('aria-pressed')!=='true')await page.locator('#nedPartNamesToggle').click();const label=page.locator('[data-part-label]').first();await label.waitFor();await label.hover();const a=await page.evaluate(()=>window.__zoom.state());await page.mouse.wheel(0,-120);const b=await page.evaluate(()=>window.__zoom.state());assert.ok(b.zoom>a.zoom,'wheel over part label reaches camera');
  await label.evaluate(el=>{const r=el.getBoundingClientRect();el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,deltaY:-3,deltaMode:1}))});assert.ok((await page.evaluate(()=>window.__zoom.state())).zoom>b.zoom,'line-mode wheel is preserved through overlay forwarding');
  assert.deepEqual(await parts(),before);assert.deepEqual(errors,[]);console.log('PASS '+mode+': wheel zoom, reversal, close detail, label overlay and unchanged geometry');
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
