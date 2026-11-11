const assert=require('node:assert/strict');const path=require('node:path');const {openKitchen}=require('./browser-harness.cjs');
(async()=>{const {browser,page,errors,setup}=await openKitchen({firebaseDouble:true});try{
 await page.setViewportSize({width:1400,height:1000});await page.locator('#navMaterials').click();
 const groups=page.locator('.materialGroup');assert.equal(await groups.count(),4);
 for(let i=0;i<4;i++){
  const result=await groups.nth(i).evaluate(section=>{const table=section.querySelector('table'),cell=table.querySelector('tbody td');return {first:cell.getBoundingClientRect().width,table:table.getBoundingClientRect().width,area:section.clientWidth-36,left:table.getBoundingClientRect().left-section.getBoundingClientRect().left,headers:table.querySelectorAll('thead th').length}});
  assert.ok(Math.abs(result.first-340)<3,JSON.stringify(result));assert.ok(result.table<result.area-30,JSON.stringify(result));assert.ok(result.left>=18&&result.left<21);assert.ok(result.headers>=3);
 }
 if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'compact-materials.png')});
 await page.setViewportSize({width:600,height:850});await groups.first().evaluate(el=>el.scrollIntoView());const mobile=await groups.first().evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(mobile.scroll>mobile.client);
 await page.setViewportSize({width:1400,height:1000});
 for(const mode of ['constructor','project']){await page.locator(mode==='constructor'?'#modeConstructor':'#modeProject').click();await setup([{key:'custom998',w:500,h:3000,d:18,x:0,y:1500,z:0,locks:{d:true}}]);await page.locator('#navCut').click();
  const cut=await page.locator('#projectCutList').evaluate(el=>{const table=el.querySelector('table'),cell=table.querySelector('td');return {width:table.offsetWidth,area:el.clientWidth,left:table.getBoundingClientRect().left-el.getBoundingClientRect().left,border:getComputedStyle(cell).borderLeftStyle,headers:table.querySelectorAll('th').length,text:table.textContent}});
  assert.ok(cut.width<cut.area-40,JSON.stringify(cut));assert.ok(Math.abs(cut.left)<2);assert.equal(cut.border,'solid');assert.equal(cut.headers,7);assert.match(cut.text,/3000 × 500/);
  if(process.env.KITCHEN_SCREENSHOTS)await page.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,`compact-cut-${mode}.png`)});
 }
 assert.deepEqual(errors,[]);console.log('PASS compact left-aligned cut tables in both modes, 340px material columns in all categories and mobile horizontal overflow');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
