const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,parts,field,errors}=await openKitchen({firebaseDouble:true,extraHooks:'window.__constructorSnapshot=snapshotParts;'});
 const rows=()=>page.evaluate(()=>window.__firebaseDouble.rows());
 const snapshot=()=>page.evaluate(()=>window.__constructorSnapshot());
 const library=page.locator('#libraryDialog'),dialog=page.locator('#fileDialog');
 const panel=(name,w,x=0,assembly)=>({
  part:{key:'part-'+name,w,h:18,d:400,x,y:9,z:0,locks:{h:true},...(assembly?{assembly}: {})},
  name,finish:{material:1,edges:[0,null,null,null]}
 });
 const a={name:'Алфа',category:'Горни шкафове',parts:[panel('A',450)]};
 const b={name:'Бета',parts:[panel('B1',300,-150,'g'),panel('B2',300,150,'g')]};
 const c={name:'Гама',parts:[panel('C',400)]};
 async function open(name){
  await page.locator('#constructorLibraryAdd').click();
  const card=library.locator('.libraryCard').filter({has:page.getByText(name,{exact:true})});
  assert.equal(await card.getByRole('button',{name:'Отвори за редакция'}).count(),0);
  await card.getByRole('button',{name:'Отвори в конструктора'}).click();
  await library.waitFor({state:'detached'});
 }
 const save=()=>page.keyboard.press('Control+s');
 const confirm=()=>page.locator('#fileDialogConfirm').click();
 const waitSaved=()=>dialog.waitFor({state:'hidden'});
 function record(list,base,id){return list.find(row=>row.path==='users/'+base+'/v2_cabinets/'+id).value}
 async function waitOverwrite(name){
  await dialog.locator('#fileOverwritePrompt').waitFor();
  assert.equal(await dialog.locator('#fileDialogName').inputValue(),name);
  assert.equal(await dialog.locator('#fileDialogConfirm').innerText(),'Презапиши');
 }
 try{
  await page.evaluate(({a,b,c})=>{
   const mock=window.__firebaseDouble;
   for(const [id,model] of Object.entries({a,b,c}))mock.seed('users/alice/v2_cabinets/cab_'+id,model);
  },{a,b,c});
  await open('Алфа');
  const opened=(await parts())[0];
  assert.equal(opened.assembly,undefined);
  assert.deepEqual([opened.x,opened.y,opened.z],[0,9,0]);
  await open('Бета');
  let working=await parts();
  assert.deepEqual(working[0],opened);
  assert.equal(working.length,3);
  assert.ok(working[1].assembly);
  assert.equal(working[1].assembly,working[2].assembly);
  assert.equal(working[1].assemblyStack,undefined);
  assert.equal(working[2].x-working[1].x,300);
  await page.locator('#addVertical').click();
  assert.equal((await parts()).at(-1).assembly,undefined);
  for(const [key,width] of [[working[0].key,440],[working[1].key,280]]){
   await page.evaluate(key=>window.__test.select(key,true),key);
   await field('partW',width);
  }
  await open('Гама');
  await open('Гама');
  working=await parts();
  assert.equal(working.length,6);
  assert.equal(new Set(working.map(p=>p.key)).size,6);
  assert.equal(working[0].w,440);
  assert.equal(working[1].w,280);
  assert.equal(working[3].assembly,undefined);
  await page.keyboard.press('Escape');
  const expected=await snapshot();
  await save();
  await waitOverwrite('Алфа');
  await dialog.getByRole('button',{name:'Отказ',exact:true}).click();
  assert.deepEqual(await snapshot(),expected);
  assert.deepEqual(record(await rows(),'alice','cab_a'),a);

  await page.evaluate(()=>window.dispatchEvent(new Event('kitchen-project-auth-request')));
  await save();
  await waitOverwrite('Алфа');
  await confirm();
  await waitSaved();
  let all=await rows();
  assert.equal(record(all,'alice','cab_a').name,'Алфа');
  assert.equal(record(all,'alice','cab_a').category,a.category);
  assert.deepEqual(record(all,'alice','cab_a').parts,expected);
  assert.deepEqual(record(all,'alice','cab_b'),b);
  assert.deepEqual(record(all,'alice','cab_c'),c);

  await save();
  await waitOverwrite('Алфа');
  await dialog.getByRole('button',{name:'Запази с ново име'}).click();
  await page.locator('#fileDialogName').fill('Комбиниран модел');
  await confirm();
  await waitSaved();
  all=await rows();
  const copy=all.find(row=>row.value.name==='Комбиниран модел');
  assert.notEqual(copy.path,'users/alice/v2_cabinets/cab_a');
  assert.deepEqual(copy.value.parts,expected);
  assert.deepEqual(record(all,'alice','cab_a').parts,expected);

  await page.keyboard.press('Control+n');
  await page.waitForFunction(()=>window.__test.parts().length===0);
  await page.locator('#addHorizontal').click();
  await open('Гама');
  await save();
  await page.waitForFunction(()=>!document.querySelector('#fileDialogConfirm').disabled);
  assert.equal(await page.locator('#fileOverwritePrompt').isVisible(),false);
  await page.locator('#fileDialogName').fill('Модел без оригинал');
  await confirm();
  await waitSaved();
  all=await rows();
  assert.deepEqual(record(all,'alice','cab_c'),c);
  assert.equal(all.find(row=>row.value.name==='Модел без оригинал').value.parts.length,2);

  await page.evaluate(model=>{
   const mock=window.__firebaseDouble;
   mock.seed('users/bob/v2_cabinets/cab_shared',model);
   mock.seed('nediq_access/alice@example.test/bases/bob',{ownerUid:'bob',ownerName:'Боб',role:'editor'});
  },{name:'Споделен шкаф',parts:a.parts});
  await page.locator('#sharedBaseStatus').click();
  await page.getByLabel('Избрана база').selectOption('bob');
  await page.getByRole('button',{name:'Отвори база'}).click();
  await page.locator('#sharingDialog').waitFor({state:'detached'});
  assert.deepEqual(await parts(),[]);
  await open('Споделен шкаф');
  await page.locator('#addHorizontal').click();
  assert.equal((await parts()).at(-1).assembly,undefined);
  await save();
  await waitOverwrite('Споделен шкаф');
  await confirm();
  await waitSaved();
  assert.equal(record(await rows(),'bob','cab_shared').parts.length,2);
  assert.deepEqual((await rows()).filter(row=>row.path.startsWith('users/alice/v2_cabinets/')),
   all.filter(row=>row.path.startsWith('users/alice/v2_cabinets/')));

  await save();
  await waitOverwrite('Споделен шкаф');
  await page.evaluate(()=>window.__firebaseDouble.seed('nediq_access/alice@example.test/bases/bob',{ownerUid:'bob',ownerName:'Боб',role:'viewer'}));
  await page.waitForFunction(()=>document.querySelector('#sharedBaseStatus').textContent.includes('Наблюдател'));
  const beforeDenied=await rows();
  await confirm();
  assert.match(await page.locator('#fileDialogStatus').innerText(),/само за преглед/);
  assert.deepEqual(await rows(),beforeDenied);
  assert.deepEqual(errors,[]);
  console.log('PASS append without wrappers, retained grouping and finishes, edits, whole-scene overwrite/save-as/cancel, isolated shared roles');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
