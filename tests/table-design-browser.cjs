const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');

const colors={
 header:'rgb(220, 231, 244)',body:'rgb(255, 255, 255)',line:'rgb(211, 218, 227)',
 hover:'rgb(245, 249, 255)',selected:'rgb(206, 227, 255)',text:'rgb(25, 51, 78)'
};

(async()=>{
 const {browser,page,errors,setup}=await openKitchen();
 const screenshots=process.env.KITCHEN_SCREENSHOTS;
 if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
 const open=async(menu,item)=>{
  await page.locator('#'+menu+' summary').click();
  await page.locator('#'+item).click();
  await page.mouse.move(0,0);
 };
 const style=cell=>cell.evaluate(el=>{
  const css=getComputedStyle(el);
  return {background:css.backgroundColor,border:css.borderBottomColor,text:css.color,align:css.textAlign};
 });
 const check=async tables=>{
  await tables.first().waitFor();
  for(const table of await tables.all()){
   const header=await style(table.locator('thead th').first());
   assert.equal(header.background,colors.header);
   assert.equal(header.border,colors.line);
   assert.equal(header.text,colors.text);
   const rows=await table.locator('tbody tr,tfoot tr').evaluateAll(elements=>elements.map(row=>({
    hovered:row.matches(':hover'),selected:row.getAttribute('aria-selected')==='true',
    cells:[...row.cells].map(el=>{
     const css=getComputedStyle(el);
     return [css.backgroundColor,css.borderBottomColor];
    })
   })));
   for(const [index,row] of rows.entries()){
    assert.equal(row.hovered,false);
    assert.equal(row.selected,false);
    for(const [background,border] of row.cells){
     assert.equal(background,colors.body,'row '+(index+1)+' must be white in its normal state');
     assert.equal(border,colors.line);
    }
   }
  }
 };
 try{
  for(const mode of ['Project','Constructor']){
   await page.locator('#mode'+mode).click();
   await setup(Array.from({length:12},(_,i)=>({
    key:'customTABLE'+i,w:500+i*10,h:18,d:300,x:(i%4-1.5)*650,y:9,z:(Math.floor(i/4)-1)*450,
    assembly:'cab'+i,locks:{}
   })));
   // Reproduce the v2.93 stylesheet winning against v2.94 HTML/CSS,
   // regardless of whether it arrives from an HTTP or service-worker cache.
   const legacy=await page.addStyleTag({content:`
    body.ned-shell main.catalogMode #projectResults table td{background:#fff!important}
    body.ned-shell main.catalogMode #projectResults table tr:nth-child(even) td{background:#f0f5fb!important}
   `});
   for(const width of [1400,900,390,320]){
    await page.setViewportSize({width,height:900});
    await open('reportsMenu','navCut');
    const cut=page.locator('#projectCutList table');
    assert.ok(await cut.locator('tbody tr').count()>=10);
    await check(cut);
    assert.equal((await style(cut.locator('tbody tr').first().locator('td').nth(2))).align,'right');
    if(screenshots)await page.screenshot({path:path.join(screenshots,mode+'-cut-'+width+'.png')});
    if(width===1400){
     const row=cut.locator('tbody tr').nth(1),first=row.locator('td').first();
     await first.hover();
     assert.equal((await style(first)).background,colors.hover);
     await row.evaluate(el=>el.setAttribute('aria-selected','true'));
     assert.equal((await style(first)).background,colors.selected);
     assert.notEqual(await first.evaluate(el=>getComputedStyle(el).boxShadow),'none');
     await row.evaluate(el=>el.removeAttribute('aria-selected'));
     await page.mouse.move(0,0);
     await check(cut);
    }
    await open('reportsMenu','navCosts');
    await check(page.locator('#projectCosts table'));
    if(screenshots)await page.screenshot({path:path.join(screenshots,mode+'-costs-'+width+'.png')});
    await open('shellSettings','navMaterials');
    await check(page.locator('#projectExtraPane table'));
    if(screenshots)await page.screenshot({path:path.join(screenshots,mode+'-materials-'+width+'.png')});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.locator('#mode'+mode).click();
   }
   await legacy.evaluate(el=>el.remove());
  }
  assert.deepEqual(errors,[]);
  console.log('PASS shared table colors, hover and selection; report and material screens at 1400/900/390/320 px');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
