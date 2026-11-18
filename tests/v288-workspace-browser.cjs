const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,parts,errors}=await openKitchen({firebaseDouble:true});
 const element=id=>page.locator('#'+id);
 const close=async id=>{
  const dialog=element(id);
  await dialog.locator('.nedDialogClose').click();
  await dialog.waitFor({state:'hidden'});
 };
 const rows=collection=>page.evaluate(collection=>window.__firebaseDouble.rows().filter(row=>row.path.includes('/'+collection+'/')),collection);
 const command=async name=>{
  await page.locator('#fileMenu>summary').click();
  await element('commandFile'+name).click();
 };
 try{
  await element('addHorizontal').click();
  const before=await parts();
  await command('Save');
  await element('fileDialogFolder').selectOption('default-0');
  await element('fileDialogName').fill('Модел');
  await close('fileDialog');
  assert.deepEqual(await parts(),before);
  assert.equal((await rows('v2_cabinets')).length,0);
  await command('Save');
  assert.equal(await element('fileDialogFolder').inputValue(),'default-1');
  await element('fileDialogFolder').selectOption('default-0');
  await element('fileDialogName').fill('Модел');
  await element('fileDialogConfirm').click();
  await element('fileDialog').waitFor({state:'hidden'});
  const [created]=await rows('v2_cabinets');
  assert.equal(created.value.folderId,'default-0');
  await command('Save');
  await element('fileOverwritePrompt').waitFor();
  assert.equal(await element('fileDialogFolder').inputValue(),'default-0');
  await element('fileDialogFolder').selectOption('default-1');
  await element('fileDialogConfirm').click();
  await element('fileDialog').waitFor({state:'hidden'});
  const [updated]=await rows('v2_cabinets');
  assert.equal(updated.path,created.path);
  assert.equal(updated.value.folderId,'default-1');
  assert.deepEqual(updated.value.parts,created.value.parts);

  await element('modeProject').click();
  for(const width of [1400,390,320]){
   await page.setViewportSize({width,height:900});
   const [brand,title]=await Promise.all([page.locator('header>strong').boundingBox(),element('documentHeading').boundingBox()]);
   assert.ok(Math.abs(brand.y+brand.height/2-title.y-title.height/2)<3);
   assert.ok(title.width>30);
  }
  await page.setViewportSize({width:1400,height:900});
  const projectBefore=await parts();
  await element('projectNewCabinet').click();
  await close('newCabinetDialog');
  await element('projectNewAppliance').click();
  await close('applianceDialog');
  assert.deepEqual(await parts(),projectBefore);
  await element('projectNewCabinet').click();
  await element('newCabinetCreate').click();
  await element('newCabinetDialog').waitFor({state:'hidden'});
  assert.ok((await parts()).length>projectBefore.length);

  await command('Save');
  await element('projectCloudName').fill('Ива Гардероб');
  await element('projectCloudSave').click();
  await element('projectCloudDialog').waitFor({state:'hidden'});
  const [project]=await rows('v2_projects');
  await command('SaveAs');
  await element('projectCloudName').fill('ИВА ГАРДЕРОБ');
  await element('projectCloudSave').click();
  await element('projectOverwritePrompt').waitFor();
  await element('projectOverwriteCancel').click();
  assert.equal(await element('projectOverwritePrompt').isVisible(),false);
  assert.deepEqual(await rows('v2_projects'),[project]);
  await element('projectCloudSave').click();
  await element('projectOverwritePrompt').waitFor();
  await element('projectCloudSave').click();
  await element('projectCloudDialog').waitFor({state:'hidden'});
  const [overwrite]=await rows('v2_projects');
  assert.equal(overwrite.path,project.path);
  assert.equal(overwrite.value.revision,2);
  assert.deepEqual(errors,[]);
  console.log('PASS cabinet folder defaults and overwrite, modal cancellation, compact title, project tools and Save As confirmation');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
