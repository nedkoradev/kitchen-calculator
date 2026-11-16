import {projectData} from './project-model.mjs';
import {appStorage} from './safe-storage.mjs';
export function validDraftBundle(value){return value?.schemaVersion===1&&Number.isFinite(value.updatedAt)&&Array.isArray(value.records)&&value.records.length===2&&['project','constructor'].every(kind=>value.records.filter(r=>r.kind===kind&&r.id==='working-'+kind&&r.snapshot&&Array.isArray(r.snapshot.parts)&&r.snapshot.room).length===1)}
export function createDraftStore({getDB=()=>globalThis.indexedDB,storage=appStorage}={}){
 let database;
 function open(){return database??=new Promise((resolve,reject)=>{let request;try{request=getDB().open('ned-iq-working-drafts-v1',1)}catch(e){reject(e);return}const timer=setTimeout(()=>reject(Error('Draft database timeout')),1800);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onerror=()=>{clearTimeout(timer);reject(request.error)};request.onblocked=()=>{clearTimeout(timer);reject(Error('Draft database blocked'))};request.onsuccess=()=>{clearTimeout(timer);const db=request.result;db.onversionchange=()=>db.close();resolve(db)}})}
 const key=owner=>'nedIQ.draft.emergency.v1.'+encodeURIComponent(owner||'anonymous');
 async function transact(owner,value){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',value?'readwrite':'readonly'),store=tx.objectStore('drafts'),request=value?store.put(value,owner||'anonymous'):store.get(owner||'anonymous');tx.oncomplete=()=>resolve(request.result);tx.onerror=tx.onabort=()=>reject(tx.error||Error('Draft transaction failed'))})}
 return {
  emergency(owner,bundle){try{return storage.setItem(key(owner),JSON.stringify(bundle))}catch{return false}},
  async read(owner){const candidates=[];let corrupt=null;try{const value=await transact(owner);if(value)candidates.push(value)}catch{}try{const raw=storage.getItem(key(owner));if(raw){try{candidates.push(JSON.parse(raw))}catch{corrupt={schemaVersion:-1,records:[],rawData:raw}}}}catch{}const valid=candidates.filter(v=>validDraftBundle(v)&&(v.owner||'')===(owner||'')).sort((a,b)=>b.updatedAt-a.updatedAt);return valid[0]||corrupt||(candidates.length?{schemaVersion:-1,records:[],rawData:candidates}:null)},
  async write(owner,bundle){if(!validDraftBundle(bundle))return false;try{await transact(owner,bundle);return true}catch{try{return storage.setItem(key(owner),JSON.stringify(bundle))}catch{return false}}}
 };
}

export function validateDraftForRestore(bundle){
 if(!validDraftBundle(bundle))throw Error('Invalid draft bundle');
 const dangerous=key=>['__proto__','prototype','constructor'].includes(key);
 for(const record of bundle.records){
  if(!record.snapshot.materials)throw Error('Missing materials');projectData(record.snapshot);for(const key of ['pdcMaterials','edgeMaterials','backMaterials','worktops'])for(const item of record.snapshot.materials[key])if(!item||typeof item!=='object'||Array.isArray(item)||['name','color','textureUrl'].some(k=>item[k]!==undefined&&typeof item[k]!=='string'))throw Error('Invalid material');for(const item of record.snapshot.parts){if(item.name!==undefined&&typeof item.name!=='string')throw Error('Invalid label');if(item.finish&&(typeof item.finish!=='object'||Array.isArray(item.finish)||item.finish.edges!==undefined&&!Array.isArray(item.finish.edges)))throw Error('Invalid finish')}
  if(record.snapshot.parts.some(e=>dangerous(e.part.key)))throw Error('Unsafe part key');
  const session=record.session||{};
  if(session.selected!==undefined&&session.selected!==null&&typeof session.selected!=='string')throw Error('Invalid selection');
  if(session.groupSelections!==undefined&&(!Array.isArray(session.groupSelections)||session.groupSelections.some(k=>typeof k!=='string')))throw Error('Invalid selection');
  for(const key of ['undo','redo']){
   if(session[key]!==undefined&&(!Array.isArray(session[key])||session[key].length>80))throw Error('Invalid history');
   for(const raw of session[key]||[]){
    if(typeof raw!=='string')throw Error('Invalid history');
    const entry=JSON.parse(raw);
    if(!Array.isArray(entry.parts)||!Array.isArray(entry.groupSelections)||entry.groupSelections.some(k=>typeof k!=='string')||!Number.isSafeInteger(entry.partCounter)||!Number.isSafeInteger(entry.assemblyId))throw Error('Invalid history');
    projectData({parts:entry.parts.map(part=>({part})),room:record.snapshot.room});if(entry.parts.some(p=>dangerous(p.key)))throw Error('Unsafe part key');
    for(const map of [entry.finishes,entry.labels,entry.allEdgeFlags])if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).some(dangerous))throw Error('Invalid history');
   }
  }
 }
 return bundle;
}

export function hasDraftWork(value){return value.records.some(r=>r.dirty||r.snapshot.parts.length||['w','h','d'].some((k,i)=>r.snapshot.room[k]!==[3000,2600,3000][i])||!['','Нов проект','Нов модел'].includes(r.name||''))}
