import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {createSharingStore} from '../sharing-store.mjs';
import {createProjectStore} from '../project-store.mjs';

if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local demo emulator required');
let env;
before(async()=>env=await initializeTestEnvironment({projectId:'demo-kitchen-projects',firestore:{rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}}));
after(async()=>env?.cleanup());
beforeEach(async()=>env.clearFirestore());

function client(uid,{email=uid+'@example.test',verified=true,provider='google.com'}={}){
 const db=env.authenticatedContext(uid,{email,email_verified:verified,firebase:{sign_in_provider:provider}}).firestore();
 const user={uid,email,emailVerified:verified,displayName:uid};
 return {db,uid,email,sharing:createSharingStore({db,sdk,getUser:()=>user}),ref:(owner,collection,id)=>sdk.doc(db,'users',owner,collection,id),directory:(email,owner)=>sdk.doc(db,'nediq_access',email,'bases',owner)};
}
const data={parts:[{part:{key:'p',w:600,h:18,d:400,x:0,y:9,z:0},name:'Детайл'}],room:{w:3000,h:2600,d:3000}};
const grant={ownerUid:'owner',role:'editor',ownerName:'owner'};

test('grants a normalized Google email before first login, with no recipient-side write',async()=>{
 const owner=client('owner');
 await owner.sharing.add('  NEW@EXAMPLE.TEST ', 'editor');
 assert.deepEqual(await owner.sharing.members(),[{email:'new@example.test',...grant}]);
 const first=client('new-firebase-uid',{email:'New@Example.Test'});
 assert.deepEqual(await first.sharing.bases(),[grant]);
 assert.deepEqual(await first.sharing.membership('owner'),grant);
 await assertSucceeds(sdk.setDoc(first.ref('owner','v2_cabinets','cab_test'),{name:'Шкаф'}));
 await assert.rejects(owner.sharing.add('new@example.test','viewer'),/вече има достъп/);
 await assert.rejects(owner.sharing.add(owner.email,'viewer'),/собственик/);
});

test('forbids enumeration, forged role changes, partial updates and other identities',async()=>{
 const owner=client('owner'),member=client('guest'),outsider=client('outsider');
 const canonical=owner.ref('owner','access_grants',member.email);
 const directory=member.directory(member.email,'owner');
 await assertFails(sdk.setDoc(canonical,grant));
 await assertFails(sdk.setDoc(directory,grant));
 await owner.sharing.add(member.email,'viewer');
 await assertFails(sdk.updateDoc(member.ref('owner','access_grants',member.email),{role:'editor'}));
 await assertFails(sdk.updateDoc(directory,{role:'editor'}));
 await assertFails(sdk.deleteDoc(directory));
 await assertFails(sdk.deleteDoc(canonical));
 await assertFails(sdk.updateDoc(canonical,{role:'editor'}));
 await assertFails(sdk.getDoc(outsider.directory(member.email,'owner')));
 await assertFails(sdk.getDocs(sdk.collection(outsider.db,'nediq_access',member.email,'bases')));
 await assertFails(sdk.getDocs(sdk.collection(member.db,'users','owner','access_grants')));
 await assertFails(sdk.getDocs(sdk.collectionGroup(member.db,'bases')));
 for(const options of [{verified:false},{provider:'password'},{email:'other@example.test'}]){
  const wrong=client(member.uid,options);
  await assertFails(sdk.getDoc(wrong.directory(member.email,'owner')));
  await assertFails(sdk.getDoc(wrong.ref('owner','materials','sample')));
 }
 const anonymous=env.unauthenticatedContext().firestore();
 await assertFails(sdk.getDoc(sdk.doc(anonymous,'nediq_access',member.email,'bases','owner')));
});

test('protects all working collections, scopes two owners, and retains project invariants for editors',async()=>{
 const a=client('alpha'),b=client('beta'),member=client('guest');
 await a.sharing.add(member.email,'editor');
 await b.sharing.add(member.email,'viewer');
 assert.deepEqual((await member.sharing.bases()).map(x=>x.ownerUid).sort(),['alpha','beta']);
 for(const owner of [a,b]){
  for(const [collection,id] of [['materials','base'],['materials','_app_preferences'],['v2_cabinets','cab_x']]){
   await sdk.setDoc(owner.ref(owner.uid,collection,id),{name:owner.uid});
   const target=member.ref(owner.uid,collection,id);
   assert.equal((await sdk.getDocFromServer(target)).data().name,owner.uid);
   await (owner===a?assertSucceeds:assertFails)(sdk.setDoc(target,{name:'update'}));
  }
 }
 const store=createProjectStore({db:member.db,sdk,getUser:()=>({uid:'alpha'})});
 const created=await store.save({name:'Кухня',data});
 assert.equal(created.revision,1);
 assert.equal((await store.list()).items.length,1);
 await assertFails(sdk.updateDoc(member.ref('alpha','v2_projects',created.id),{revision:8}));
 await assertFails(sdk.deleteDoc(member.ref('alpha','v2_projects',created.id)));
 const betaStore=createProjectStore({db:b.db,sdk,getUser:()=>({uid:'beta'})});
 const betaProject=await betaStore.save({name:'Кухня',data});
 await assertSucceeds(sdk.getDoc(member.ref('beta','v2_projects',betaProject.id)));
 await assertSucceeds(sdk.getDoc(member.ref('beta','v2_project_names','кухня')));
 await assertFails(sdk.updateDoc(member.ref('beta','v2_projects',betaProject.id),{revision:2}));
 assert.deepEqual((await member.sharing.members()),[]);
});

test('open listener observes downgrade and removal, and rules enforce both immediately',async()=>{
 const owner=client('owner'),member=client('guest');
 await owner.sharing.add(member.email,'editor');
 const ref=member.directory(member.email,owner.uid);
 const material=member.ref('owner','materials','live');
 await sdk.setDoc(material,{name:'original'});
 let unsubscribe;
 const listeners=new Map();
 const observed=role=>new Promise(resolve=>listeners.set(role,resolve));
 try{
  const editor=observed('editor');
  unsubscribe=sdk.onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
   if(!snapshot.metadata.fromCache)listeners.get(snapshot.data()?.role)?.();
  });
  await editor;
  const viewer=observed('viewer');
  await owner.sharing.changeRole(member.email,'viewer');
  await assertFails(sdk.setDoc(material,{name:'denied'}));
  await viewer;
  await assertSucceeds(sdk.getDocFromServer(material));
  const removed=observed(undefined);
  await owner.sharing.revoke(member.email);
  await assertFails(sdk.getDocFromServer(material));
  await removed;
  assert.deepEqual(await member.sharing.bases(),[]);
  assert.deepEqual(await owner.sharing.members(),[]);
  await owner.sharing.add(member.email,'editor');
  await assertSucceeds(sdk.getDocFromServer(material));
 }finally{unsubscribe?.()}
});

test('verified owner can list an empty grants collection; an owner without Google token claims cannot',async()=>{
 const owner=client('owner');
 const collection=db=>sdk.collection(db,'users','owner','access_grants');
 assert.equal((await assertSucceeds(sdk.getDocsFromServer(collection(owner.db)))).empty,true);
 for(const db of [
  env.authenticatedContext('owner').firestore(),
  client('owner',{verified:false}).db,
  client('owner',{provider:'password'}).db
 ]){
  await assertFails(sdk.getDocsFromServer(collection(db)));
  // Retain the existing personal-data permission for signed-in owners.
  await assertSucceeds(sdk.setDoc(sdk.doc(db,'users','owner','materials','personal'),{name:'Личен материал'}));
 }
 await owner.sharing.add('guest@example.test','viewer');
 const guest=client('guest');
 assert.equal((await guest.sharing.bases()).length,1);
 await assertFails(sdk.getDocsFromServer(collection(guest.db)));
});

test('previous candidate denies the direct paths that the current candidate opens',async()=>{
 const legacyRules=readFileSync(new URL('./fixtures/sharing-legacy.rules',import.meta.url),'utf8');
 const legacy=await initializeTestEnvironment({projectId:'demo-kitchen-legacy-sharing',firestore:{rules:legacyRules}});
 try{
  const session={email:'owner@example.test',email_verified:true,firebase:{sign_in_provider:'google.com'}};
  const db=legacy.authenticatedContext('owner',session).firestore();
  await assertFails(sdk.getDocsFromServer(sdk.collection(db,'users','owner','access_grants')));
  await assertFails(sdk.getDocsFromServer(sdk.collection(db,'nediq_access','owner@example.test','bases')));
 }finally{await legacy.cleanup()}
});
