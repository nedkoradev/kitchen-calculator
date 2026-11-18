const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,errors}=await openKitchen({firebaseDouble:true});
 const menu=async(id,label)=>{
  const list=page.locator('#'+id);
  await list.locator('summary').click();
  await list.getByRole('menuitem',{name:label,exact:true}).click();
 };
 const handle=dialog=>dialog.locator('.nedDialogHandle').first();
 async function check(dialog,close=true){
  await handle(dialog).waitFor();
  const before=await dialog.boundingBox();
  const view=page.viewportSize();
  assert.ok(Math.abs(before.x+(before.width-view.width)/2)<2);
  assert.ok(Math.abs(before.y+(before.height-view.height)/2)<2);
  const heading=await handle(dialog).boundingBox();
  await page.mouse.move(heading.x+12,heading.y+15);
  await page.mouse.down();
  await page.mouse.move(1,1,{steps:8});
  await page.mouse.up();
  const after=await dialog.boundingBox();
  assert.ok(after.x<before.x||after.y<before.y);
  assert.ok(after.x>=-.1&&after.y>=-.1&&after.x+after.width<=view.width+.1&&after.y+after.height<=view.height+.1);
  assert.equal(after.width,before.width);
  assert.equal(after.height,before.height);
  if(close){
   await handle(dialog).locator('.nedDialogClose').click();
   await dialog.waitFor({state:'hidden'});
  }
 }
 try{
  await page.reload();
  await check(page.locator('#welcomeDialog'));
  await page.locator('#settingsButton').click();
  await check(page.locator('#settingsDialog'),false);
  await page.keyboard.press('Escape');
  await page.locator('#settingsDialog').waitFor({state:'hidden'});
  await page.locator('#settingsButton').click();
  await check(page.locator('#settingsDialog'));
  await menu('helpMenu','Кратко ръководство');
  await check(page.locator('#helpDialog'));
  await menu('libraryMenu','Всички модели');
  await check(page.locator('#libraryDialog'));
  await page.locator('#modeConstructor').click();
  await page.locator('#newCabinet').click();
  await check(page.locator('#newCabinetDialog'));
  await page.locator('#modeProject').click();
  await menu('fileMenu','Отвори проект…');
  await check(page.locator('#projectCloudDialog'));
  await menu('shellSettings','Материали');
  await page.getByRole('button',{name:'Нов материал',exact:true}).first().click();
  await check(page.locator('dialog.materialEditDialog[open]'));

  const cdp=await page.context().newCDPSession(page);
  await page.setViewportSize({width:390,height:680});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  await page.locator('#settingsButton').click();
  const dialog=page.locator('#settingsDialog');
  await handle(dialog).waitFor();
  const initial=await dialog.boundingBox();
  const header=await handle(dialog).boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:header.x+15,y:header.y+16}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:389,y:679}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const moved=await dialog.boundingBox();
  assert.ok(moved.y>initial.y);
  assert.ok(moved.x+moved.width<=390.1&&moved.y+moved.height<=680.1);
  assert.equal(moved.width,initial.width);
  assert.equal(moved.height,initial.height);
  await handle(dialog).locator('.nedDialogClose').click();
  await dialog.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  console.log('PASS centered welcome and six dialog types, mouse/touch movement, bounds, fixed dimensions, reopen, Escape and close buttons');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
