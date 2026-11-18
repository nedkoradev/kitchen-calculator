const assert=require('node:assert/strict');
const path=require('node:path');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,errors,setup,parts}=await openKitchen({
  firebaseDouble:true,
  extraHooks:'window.__sharingDraft={scope:()=>draftRecovery.owner,settled:()=>draftRecovery.settled,read:()=>draftRecovery.read()};'
 });
 try{
  const openSettings=async()=>{
   await page.locator('#shellSettings summary').click();
   await page.locator('#sharingOpen').click();
  };
  const dialog=page.locator('#sharingDialog');
  await page.waitForFunction(()=>window.__sharingDraft.settled()&&window.__sharingDraft.scope()==='alice');
  await openSettings();
  await dialog.getByLabel('Google имейл').fill('guest@example.test');
  await dialog.getByRole('button',{name:'Създай покана'}).click();
  const link=dialog.getByLabel('Връзка за guest@example.test');
  await link.waitFor();
  const invitation=new URL(await link.inputValue());
  assert.equal(invitation.origin,new URL(page.url()).origin);
  assert.equal(invitation.searchParams.get('inviteOwner'),'alice');
  if(process.env.KITCHEN_SCREENSHOTS)await dialog.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'pr78-invitations.png')});
  await dialog.getByRole('button',{name:'Отмени поканата'}).click();
  await dialog.getByText('Няма чакащи покани.').waitFor();
  await page.evaluate(()=>{
   window.__firebaseDouble.seed('users/alice/shared_bases/bob',{ownerUid:'bob'});
   window.__firebaseDouble.seed('users/bob/members/alice',{ownerUid:'bob',uid:'alice',role:'viewer',status:'active'});
   window.__firebaseDouble.seed('users/bob/v2_cabinets/cab_test',{name:'Споделен шкаф',parts:[]});
  });
  await dialog.getByRole('button',{name:'Затвори'}).click();
  await setup([{key:'custom001',w:600,h:18,d:400,x:0,y:9,z:0}]);
  await openSettings();
  await dialog.getByLabel('Избрана база').selectOption('bob');
  await dialog.getByRole('button',{name:'Отвори база'}).click();
  await page.waitForFunction(()=>window.__sharingDraft.settled()&&window.__sharingDraft.scope()==='["alice","bob"]');
  assert.equal((await parts()).length,0);
  await dialog.getByText('alice@example.test · Наблюдател').waitFor();
  assert.equal(await dialog.getByRole('button',{name:'Създай покана'}).count(),0);
  if(process.env.KITCHEN_SCREENSHOTS)await dialog.screenshot({path:path.join(process.env.KITCHEN_SCREENSHOTS,'pr78-viewer.png')});
  await dialog.getByRole('button',{name:'Затвори'}).click();
  await page.locator('#libraryMenu summary').click();
  await page.locator('#navLibrary').click();
  await page.locator('#libraryDialog').getByText('Споделен шкаф').waitFor();
  await page.keyboard.press('Escape');
  const save=()=>page.evaluate(()=>new Promise(resolve=>{
   window.addEventListener('kitchen-v2-cloud-error',event=>resolve(event.detail.message),{once:true});
   window.dispatchEvent(new CustomEvent('kitchen-v2-cloud-save-request',{detail:{name:'Непозволен запис',parts:[{}]}}));
  }));
  assert.match(await save(),/само за преглед/);
  await page.evaluate(()=>window.__firebaseDouble.seed('users/bob/members/alice',{uid:'alice',role:'editor',status:'active'}));
  await openSettings();
  await dialog.getByText('alice@example.test · Редактор').waitFor();
  await dialog.getByRole('button',{name:'Затвори'}).click();
  await page.locator('#libraryMenu summary').click();
  await page.locator('#navLibrary').click();
  await page.locator('#libraryDialog').getByText('Споделен шкаф').waitFor();
  await page.evaluate(()=>window.__firebaseDouble.seed('users/bob/members/alice',{uid:'alice',role:'editor',status:'revoked'}));
  await page.waitForFunction(()=>window.__sharingDraft.settled()&&window.__sharingDraft.scope()==='alice');
  await page.locator('#libraryDialog').waitFor({state:'detached'});
  await page.locator('#sharedBaseStatus').waitFor({state:'hidden'});
  await openSettings();
  await dialog.getByText('alice@example.test · Собственик').waitFor();
  const own=await page.evaluate(()=>window.__sharingDraft.read());
  assert.equal(own.records.find(r=>r.kind==='constructor').snapshot.parts[0].part.w,600);
  await dialog.getByRole('button',{name:'Затвори'}).click();
  const invitePage=new URL(page.url());
  invitePage.searchParams.set('inviteOwner','alice');
  invitePage.searchParams.set('invite','newLink');
  await page.goto(invitePage.href);
  await page.waitForFunction(()=>!!window.__firebaseDouble);
  await page.evaluate(()=>{
   window.__firebaseDouble.seed('users/alice/access_invites/newLink',{
    ownerUid:'alice',email:'bob@example.test',role:'editor',state:'pending',expiresAt:new Date(Date.now()+3600000)
   });
   window.__firebaseDouble.setUser('bob');
  });
  await dialog.getByRole('button',{name:'Приеми поканата'}).click();
  await dialog.getByText('bob@example.test · Редактор').waitFor();
  assert.equal(new URL(page.url()).searchParams.has('invite'),false);
  assert.equal(await page.evaluate(()=>window.__firebaseDouble.rows().find(row=>row.path==='users/alice/access_invites/newLink').value.state),'accepted');
  assert.deepEqual(errors,[]);
  console.log('PASS invitation management, shared viewer read, editor role update, revocation and separate drafts (browser double)');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
