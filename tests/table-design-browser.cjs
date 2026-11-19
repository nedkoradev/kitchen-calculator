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
   const cells=await table.locator('tbody td,tfoot td').evaluateAll(elements=>elements.map(el=>{
    const css=getComputedStyle(el);
    return [css.backgroundColor,css.borderBottomColor];
   }));
   for(const [background,border] of cells){
    assert.equal(background,colors.body);
    assert.equal(border,colors.line);
   }
  }
 };
 try{
  await page.locator('#modeProject').click();
  await setup([
   {key:'customTABLE1',w:600,h:18,d:400,x:-350,y:9,z:0,assembly:'cab1',locks:{}},
   {key:'customTABLE2',w:800,h:18,d:400,x:450,y:9,z:0,assembly:'cab2',locks:{}}
  ]);
  for(const width of [1400,900,390,320]){
   await page.setViewportSize({width,height:900});
   await open('reportsMenu','navCut');
   const cut=page.locator('#projectCutList table');
   await check(cut);
   assert.equal((await style(cut.locator('tbody tr').first().locator('td').nth(2))).align,'right');
   if(screenshots)await page.screenshot({path:path.join(screenshots,'cut-'+width+'.png')});
   if(width===1400){
    const row=cut.locator('tbody tr').first(),first=row.locator('td').first();
    await first.hover();
    assert.equal((await style(first)).background,colors.hover);
    await row.evaluate(el=>el.setAttribute('aria-selected','true'));
    assert.equal((await style(first)).background,colors.selected);
    assert.notEqual(await first.evaluate(el=>getComputedStyle(el).boxShadow),'none');
    await row.evaluate(el=>el.removeAttribute('aria-selected'));
   }
   await open('reportsMenu','navCosts');
   await check(page.locator('#projectCosts table'));
   if(screenshots)await page.screenshot({path:path.join(screenshots,'costs-'+width+'.png')});
   await open('shellSettings','navMaterials');
   await check(page.locator('#projectExtraPane table'));
   if(screenshots)await page.screenshot({path:path.join(screenshots,'materials-'+width+'.png')});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#modeProject').click();
  }
  await page.locator('#modeConstructor').click();
  await setup([{key:'customTABLE3',w:500,h:18,d:300,x:0,y:9,z:0,locks:{}}]);
  await open('reportsMenu','navCut');
  await check(page.locator('#projectCutList table'));
  assert.deepEqual(errors,[]);
  console.log('PASS shared table colors, hover and selection; report and material screens at 1400/900/390/320 px');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
