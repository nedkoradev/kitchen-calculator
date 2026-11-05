import test from 'node:test';
import assert from 'node:assert/strict';
import {createProjectStore} from '../project-store.mjs';
import {memoryFirestore} from './memory-firestore.mjs';
const data=()=>({parts:[],room:{w:3000,h:2600,d:3000},materials:{pdcMaterials:[],edgeMaterials:[],backMaterials:[],worktops:[]},assemblyNames:{},settings:{viewMode:'front'}});
function clients(){const {db,sdk}=memoryFirestore();return {db,sdk,client:uid=>createProjectStore({db,sdk,getUser:()=>({uid})})}}
const save=(store,name='Кухня')=>store.save({name,data:data()});
async function confirm(store,args){try{return await store.save(args)}catch(error){assert.equal(error.code,'confirmation-required');return store.save({...args,confirmation:error.details})}}
test('store creates, opens, lists and overwrites the same ID',async()=>{
 const {client}=clients(),s=client('a'),p=await save(s),updated=await s.save({...p,data:data()});
 assert.equal(updated.id,p.id);assert.equal(updated.revision,2);assert.deepEqual((await s.open(p.id)).data,data());assert.equal((await s.list()).items.length,1);
});
test('store rename and cancellation do not create duplicates or release names early',async()=>{
 const {client}=clients(),s=client('a'),p=await save(s);
 await assert.rejects(s.save({...p,name:'Ново',data:data()}),{code:'confirmation-required'});
 assert.equal((await s.open(p.id)).name,'Кухня');
 assert.equal((await confirm(s,{...p,name:'Ново',data:data()})).id,p.id);
 await save(s,'Кухня');assert.equal((await s.list()).items.length,2);
});
test('store duplicate names require explicit target confirmation',async()=>{
 const {client}=clients(),s=client('a'),p=await save(s);
 await assert.rejects(save(s,'  КУХНЯ '),{code:'confirmation-required'});
 const updated=await confirm(s,{name:'КУХНЯ',data:data()});assert.equal(updated.id,p.id);assert.equal((await s.list()).items.length,1);
});
test('store collision preserves the original opened project',async()=>{
 const {client}=clients(),s=client('a'),a=await save(s,'A'),b=await save(s,'B');
 assert.equal((await confirm(s,{...a,name:'B',data:data()})).id,b.id);assert.equal((await s.open(a.id)).revision,1);
});
test('store Save As uses a new ID and never overwrites',async()=>{
 const {client}=clients(),s=client('a'),a=await save(s),b=await s.save({...a,name:'Друго',data:data(),saveAs:true});
 assert.notEqual(a.id,b.id);await assert.rejects(s.save({...a,name:'ДРУГО',data:data(),saveAs:true}),{code:'duplicate-name'});
});
test('store delete removes the name claim and permits reuse',async()=>{
 const {client}=clients(),s=client('a'),a=await save(s);await s.remove(a);
 await assert.rejects(s.open(a.id),{code:'not-found'});assert.equal((await s.list()).items.length,0);await save(s);
});
test('store concurrent creates and stale writes/deletes are guarded',async()=>{
 const {client}=clients(),s=client('a'),result=await Promise.allSettled([save(s),save(s)]);
 assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const a=result.find(r=>r.status==='fulfilled').value;await s.save({...a,data:data()});
 await assert.rejects(s.save({...a,data:data()}),{code:'conflict'});await assert.rejects(s.remove(a),{code:'conflict'});
});
test('store scopes all paths to the captured uid and isolates identical names',async()=>{
 const {client,db}=clients(),a=client('a'),b=client('b'),p=await save(a);await save(b);
 assert.equal((await a.list()).items.length,1);assert.equal((await b.list()).items.length,1);
 await assert.rejects(b.open(p.id),{code:'not-found'});
 assert.ok([...db.rows.keys()].every(path=>/^users\/(a|b)\/v2_project/.test(path)));
});
test('store does not resolve success before commit and leaves no writes on failure',async()=>{
 const {db,client}=clients(),s=client('a');let release;
 db.beforeCommit=()=>new Promise(resolve=>release=resolve);let complete=false;
 const pending=save(s).then(()=>complete=true);
 for(let i=0;i<100&&!release;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(release,'Transaction reached commit');
 assert.equal(complete,false);assert.equal(db.rows.size,0);release();await pending;assert.equal(complete,true);
 db.beforeCommit=null;db.rejectWrites=true;
 await assert.rejects(save(s,'Failed'),{code:'unavailable'});assert.equal((await s.list()).items.length,1);
});
test('store prevents writes after auth changes while a transaction is reading',async()=>{
 const {db,sdk}=memoryFirestore();let uid='a';
 const get=sdk.runTransaction;sdk.runTransaction=async(db,run)=>{uid='b';return get(db,run)};
 const s=createProjectStore({db,sdk,getUser:()=>({uid})});await assert.rejects(save(s),{code:'auth-changed'});assert.equal(db.rows.size,0);
});
test('confirmation cannot overwrite a target changed after the prompt',async()=>{
 const {client}=clients(),s=client('a'),a=await save(s,'A'),b=await save(s,'B');
 const args={...a,name:'B',data:data()};let approval;
 try{await s.save(args)}catch(error){assert.equal(error.code,'confirmation-required');approval=error.details}
 await s.save({...b,data:data()});
 await assert.rejects(s.save({...args,confirmation:approval}),{code:'confirmation-required'});
 assert.equal((await s.open(b.id)).revision,2);assert.equal((await s.open(a.id)).revision,1);
});
