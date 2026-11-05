import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {createProjectStore} from '../project-store.mjs';
const projectId='demo-kitchen-projects';
if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Use the local demo Firestore emulator; production and remote hosts are forbidden.');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(new URL('../firestore.projects.rules',import.meta.url),'utf8')}})});
after(async()=>env?.cleanup());
beforeEach(async()=>env.clearFirestore());
const data=()=>({room:{w:6000,h:2600,d:5000},parts:[{part:{key:'a',w:101,h:18,d:400,x:.5,y:9,z:0,locks:{h:true},assembly:'outer',assemblyStack:[null,'inner']},name:'Рафт',finish:{material:1,edges:[0,null,2,3]},allEdges:false}],assemblyNames:{inner:'Шкаф',outer:'Група'},materials:{pdcMaterials:[{name:'A'},{name:'B'}],edgeMaterials:[{name:'Кант'}],backMaterials:[],worktops:[],servicePrices:{cut:2}},settings:{viewMode:'top',projectTab:'3d'}});
function client(uid){const db=env.authenticatedContext(uid).firestore();return {db,store:createProjectStore({db,sdk,getUser:()=>({uid})})}}
const create=(store,name='Кухня')=>store.save({name,data:data()});
async function confirmed(store,args){try{return await store.save(args)}catch(error){assert.equal(error.code,'confirmation-required');return store.save({...args,confirmation:error.details})}}
test('create, server list and full open roundtrip',async()=>{
 const {store}=client('alice'),saved=await create(store);
 assert.equal(saved.revision,1);assert.equal((await store.list()).items.length,1);
 assert.deepEqual((await store.open(saved.id)).data,data());
});
test('ordinary overwrite keeps the ID, increments revision and creates no duplicate',async()=>{
 const {store}=client('alice'),saved=await create(store),next=data();next.parts[0].part.w=201;
 const update=await store.save({...saved,data:next});
 assert.equal(update.id,saved.id);assert.equal(update.revision,2);
 assert.equal((await store.list()).items.length,1);assert.equal((await store.open(saved.id)).data.parts[0].part.w,201);
});
test('rename requires confirmation and atomically releases the old name',async()=>{
 const {store}=client('alice'),saved=await create(store);
 await assert.rejects(store.save({...saved,name:'Ново име',data:data()}),{code:'confirmation-required'});
 assert.equal((await store.open(saved.id)).name,'Кухня');
 const updated=await confirmed(store,{...saved,name:'Ново име',data:data()});
 assert.equal(updated.id,saved.id);await create(store,'Кухня');assert.equal((await store.list()).items.length,2);
});
test('case-insensitive duplicate creation asks confirmation and replaces the chosen project',async()=>{
 const {store}=client('alice'),saved=await create(store);
 await assert.rejects(create(store,'  КУХНЯ  '),{code:'confirmation-required'});
 const updated=await confirmed(store,{name:'КУХНЯ',data:data()});assert.equal(updated.id,saved.id);
 assert.equal((await store.list()).items.length,1);
});
test('collision while editing preserves the source and updates the explicitly confirmed target',async()=>{
 const {store}=client('alice'),a=await create(store,'A'),b=await create(store,'B');
 const result=await confirmed(store,{...a,name:'B',data:data()});
 assert.equal(result.id,b.id);assert.equal((await store.open(a.id)).revision,1);
 assert.equal((await store.list()).items.length,2);
});
test('Save As creates a new ID and never overwrites on a duplicate name',async()=>{
 const {store}=client('alice'),a=await create(store,'A');
 const b=await store.save({...a,name:'B',data:data(),saveAs:true});assert.notEqual(a.id,b.id);
 await assert.rejects(store.save({...a,name:'B',data:data(),saveAs:true}),{code:'duplicate-name'});
 assert.equal((await store.open(a.id)).revision,1);
});
test('delete removes both project and name; name may be reused',async()=>{
 const {store}=client('alice'),a=await create(store);
 await store.remove(a);assert.equal((await store.list()).items.length,0);
 await assert.rejects(store.open(a.id),{code:'not-found'});await create(store);
});
test('stale writes/deletes cannot discard another window changes',async()=>{
 const {store}=client('alice'),a=await create(store);await store.save({...a,data:data()});
 await assert.rejects(store.save({...a,data:data()}),{code:'conflict'});
 await assert.rejects(store.remove(a),{code:'conflict'});
});
test('concurrent creates for the same name produce exactly one project',async()=>{
 const {store}=client('alice'),results=await Promise.allSettled([create(store),create(store)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal((await store.list()).items.length,1);
});
test('users have isolated lists and may use the same project name',async()=>{
 const a=client('alice'),b=client('bob'),saved=await create(a.store);await create(b.store);
 assert.equal((await a.store.list()).items.length,1);assert.equal((await b.store.list()).items.length,1);
 await assert.rejects(b.store.open(saved.id),{code:'not-found'});
 for(const action of [()=>sdk.getDoc(sdk.doc(b.db,'users','alice','v2_projects',saved.id)),()=>sdk.getDocs(sdk.collection(b.db,'users','alice','v2_projects')),()=>sdk.deleteDoc(sdk.doc(b.db,'users','alice','v2_projects',saved.id)),()=>sdk.updateDoc(sdk.doc(b.db,'users','alice','v2_projects',saved.id),{name:'Изменено'})])await assertFails(action());
});
test('rules deny anonymous access and writes bypassing the name registry',async()=>{
 const {db}=client('alice'),anonymous=env.unauthenticatedContext().firestore();
 await assertFails(sdk.getDocs(sdk.collection(anonymous,'users','alice','v2_projects')));
 await assertFails(sdk.setDoc(sdk.doc(db,'users','alice','v2_projects','illegal'),{schemaVersion:1,name:'X',nameKey:'x',data:data(),revision:1,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()}));
});
test('rules require paired deletion and forbid tampering with revision/name claims',async()=>{
 const {db,store}=client('alice'),a=await create(store);
 await assertFails(sdk.deleteDoc(sdk.doc(db,'users','alice','v2_projects',a.id)));
 await assertFails(sdk.deleteDoc(sdk.doc(db,'users','alice','v2_project_names','кухня')));
 await assertFails(sdk.updateDoc(sdk.doc(db,'users','alice','v2_projects',a.id),{name:'Друг',updatedAt:sdk.serverTimestamp()}));
 const forged=sdk.writeBatch(db);
 forged.set(sdk.doc(db,'users','alice','v2_projects','duplicate'),{schemaVersion:1,name:'Кухня',nameKey:'кухня',data:data(),revision:1,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()});
 forged.set(sdk.doc(db,'users','alice','v2_project_names','кухня'),{nameKey:'кухня',projectId:'duplicate'});
 await assertFails(forged.commit());
});
test('offline/signed-out operations do not report success or write',async()=>{
 const {db}=client('alice'),offline=createProjectStore({db,sdk,getUser:()=>({uid:'alice'}),isOnline:()=>false}),signedOut=createProjectStore({db,sdk,getUser:()=>null});
 await assert.rejects(create(offline),{code:'offline'});await assert.rejects(signedOut.list(),{code:'signed-out'});
 assert.equal((await sdk.getDocsFromServer(sdk.collection(db,'users','alice','v2_projects'))).size,0);
});
test('confirmation must be renewed when its target changed in another window',async()=>{
 const {store}=client('alice'),a=await create(store,'A'),b=await create(store,'B');
 const args={...a,name:'B',data:data()};let approval;
 try{await store.save(args)}catch(error){assert.equal(error.code,'confirmation-required');approval=error.details}
 await store.save({...b,data:data()});
 await assert.rejects(store.save({...args,confirmation:approval}),{code:'confirmation-required'});
 assert.equal((await store.open(b.id)).revision,2);
});

test('Bulgarian uppercase names share a claim and forged mixed-case keys are denied',async()=>{
 const {db,store}=client('alice'),name='АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯЍ';
 const saved=await create(store,name);
 await assert.rejects(create(store,name.toLowerCase()),{code:'confirmation-required'});
 assert.equal((await store.open(saved.id)).name,name);
 const forged=sdk.writeBatch(db),nameKey='Кухня';
 forged.set(sdk.doc(db,'users','alice','v2_projects','forged'),{schemaVersion:1,name:nameKey,nameKey,data:data(),revision:1,createdAt:sdk.serverTimestamp(),updatedAt:sdk.serverTimestamp()});
 forged.set(sdk.doc(db,'users','alice','v2_project_names',nameKey),{nameKey,projectId:'forged'});
 await assertFails(forged.commit());
});
