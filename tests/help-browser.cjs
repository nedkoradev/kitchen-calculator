const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,parts,errors}=await openKitchen();
 const welcome=page.locator('#welcomeDialog');
 const help=page.locator('#helpDialog');
 const menu=page.locator('#helpMenu');
 const titles=['Кратко ръководство','Създаване на проект','Създаване на шкаф','Създаване на параметричен шкаф','Въвеждане на материали','Работа с библиотеката','Бутони и управление','Пълно ръководство'];
 const open=async title=>{
  await menu.locator('summary').click();
  await menu.getByRole('menuitem',{name:title,exact:true}).click();
  await help.waitFor();
 };
 try{
  // The shared harness clicks Constructor. Verify fresh startup in a new page.
  const fresh=await browser.newContext();
  const first=await fresh.newPage();
  await first.route('**/cloud.js',r=>r.fulfill({contentType:'application/javascript',body:''}));
  if(process.env.KITCHEN_CDN_CACHE){
   const fs=require('node:fs'),path=require('node:path');
   await first.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:fs.readFileSync(path.join(process.env.KITCHEN_CDN_CACHE,path.basename(new URL(r.request().url()).pathname)))}));
  }
  await first.goto(process.env.KITCHEN_TEST_URL||'http://127.0.0.1:8000/');
  const initial=first.locator('#welcomeDialog');
  await initial.waitFor();
  assert.equal(await initial.evaluate(d=>d.matches(':modal')),false);
  assert.equal(await initial.getByRole('checkbox').isChecked(),true);
  await initial.getByRole('button',{name:'Започни работа'}).click();
  await initial.waitFor({state:'hidden'});
  await first.reload();
  await initial.waitFor();
  await initial.getByRole('checkbox').uncheck();
  await initial.getByRole('button',{name:'Затваряне на прозореца'}).click();
  await first.reload();
  await first.locator('#helpMenu').waitFor();
  assert.equal(await initial.isVisible(),false);
  assert.equal(await first.evaluate(()=>localStorage.getItem('nedIQ.help.showAtStartup')),'off');
  await fresh.close();

  const snapshot=await parts();
  assert.equal(await welcome.isVisible(),false);
  assert.deepEqual(await menu.locator('[role=menuitem]').allTextContents(),titles);
  for(const title of titles){
   await open(title);
   assert.equal(await help.getByRole('heading',{level:2}).innerText(),title);
   await page.keyboard.press('Escape');
   await help.waitFor({state:'hidden'});
  }
  await open(titles[0]);
  assert.equal(await help.getByRole('button',{name:'Предишна'}).isDisabled(),true);
  await help.getByRole('button',{name:'Следваща'}).click();
  assert.equal(await help.getByRole('heading',{level:2}).innerText(),titles[1]);
  await help.getByRole('button',{name:'Затваряне на прозореца'}).click();
  for(const width of [320,390,900,1400]){
   await page.setViewportSize({width,height:680});
   await open(titles[7]);
   const picker=help.getByRole('combobox',{name:'Раздел от пълното ръководство'});
   assert.equal(await picker.locator('option').count(),6);
   await help.getByRole('button',{name:'Следваща'}).click();
   assert.equal(await picker.inputValue(),'1');
   await picker.selectOption('5');
   assert.equal(await help.getByRole('button',{name:'Следваща'}).isDisabled(),true);
   const box=await help.boundingBox();
   assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=680);
   assert.ok(await help.locator('.nedHelpIcons svg').count()>10);
   await help.getByRole('button',{name:'Затваряне на прозореца'}).click();
  }
  assert.deepEqual(await parts(),snapshot);
  await page.locator('#modeProject').click();
  await open(titles[1]);
  assert.ok(await help.getByText(/Размери на стаята/).isVisible());
  await page.keyboard.press('Escape');
  await help.waitFor({state:'hidden'});
  assert.deepEqual(errors,[]);
  console.log('PASS startup, refresh, persisted preference, eight help entries, navigation, responsive dialog and both modes');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
