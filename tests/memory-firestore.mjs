// Transactional test double for store behavior, NOT a security-rules emulator.
export function memoryFirestore(){
 const db={rows:new Map(),version:0,counter:0,rejectWrites:false,beforeCommit:null};
 const clone=value=>value===undefined?undefined:structuredClone(value);
 const snapshot=(path,rows)=>({id:path.split('/').at(-1),exists:()=>rows.has(path),data:()=>clone(rows.get(path))});
 const sdk={
  collection:(_db,...path)=>({path:path.join('/')}),
  doc:(base,...path)=>{const value=base.path?[base.path,...(path.length?path:['project'+(++db.counter)])].join('/'):path.join('/');return {path:value,id:value.split('/').at(-1)}},
  serverTimestamp:()=>123456,
  getDocFromServer:async ref=>snapshot(ref.path,db.rows),
  getDocsFromServer:async ref=>({docs:[...db.rows.keys()].filter(key=>key.startsWith(ref.path+'/')&&key.split('/').length===ref.path.split('/').length+1).map(key=>snapshot(key,db.rows))}),
  async runTransaction(_db,run){
   for(let attempt=0;attempt<10;attempt++){
    const version=db.version,rows=new Map([...db.rows].map(([k,v])=>[k,clone(v)])),writes=[];
    const result=await run({
     get:async ref=>{if(writes.length)throw Error('Read after write');return snapshot(ref.path,rows)},
     set:(ref,value)=>writes.push([ref.path,clone(value)]),delete:ref=>writes.push([ref.path,undefined])
    });
    if(db.beforeCommit)await db.beforeCommit();
    if(db.rejectWrites)throw Object.assign(Error('Network unavailable'),{code:'unavailable'});
    if(version!==db.version)continue;
    if(writes.length){for(const [key,value] of writes)if(value===undefined)db.rows.delete(key);else db.rows.set(key,value);db.version++}
    return result;
   }
   throw Error('Transaction retry budget exhausted');
  }
 };
 return {db,sdk};
}
