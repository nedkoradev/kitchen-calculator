import test from 'node:test';
import assert from 'node:assert/strict';
test('photo direction is shared by URL, persists, preserves legacy and rejects failed writes',async()=>{
 const oldStorage=globalThis.localStorage,oldDispatch=globalThis.dispatchEvent;let saved=null,fail=false;const events=[];
 globalThis.localStorage={getItem:()=>saved,setItem:(key,value)=>{if(fail)throw Error('Storage blocked');saved=value}};globalThis.dispatchEvent=e=>events.push(e.detail);
 try{
  const moduleUrl=new URL('../photo-orientation.mjs',import.meta.url),m=await import(moduleUrl+'?first');
  const url='materials/textures/декор.png',canonical=m.photoKey(url);assert.equal(m.photoKey('data:image/png;base64,AA'),null);
  assert.equal(m.photoKey('https://nedkoradev.github.io/kitchen-calculator/'+canonical+'?v=1'),canonical);
  assert.equal(m.photoOrientation({textureUrl:url,textureGrainDirection:'horizontal'}),'horizontal');
  assert.equal(m.photoOrientation({textureUrl:url}),'vertical');m.rememberPhotoOrientations([{textureUrl:url,textureGrainDirection:'horizontal'}]);assert.equal(m.photoOrientation({textureUrl:url}),'horizontal');m.rememberPhotoOrientations([]);
  m.setPhotoOrientation(url,'horizontal');assert.equal(events.length,1);assert.equal(JSON.parse(saved)[canonical],'horizontal');
  const original={textureUrl:url,textureGrainDirection:'vertical',url:'https://salex.bg/product',color:'#aaa'};
  assert.equal(m.withPhotoOrientation(original).textureGrainDirection,'horizontal');assert.equal(original.textureGrainDirection,'vertical');assert.equal(m.withPhotoOrientation(original).url,original.url);
  const reopened=await import(moduleUrl+'?reopened');assert.equal(reopened.photoOrientation({textureUrl:url}),'horizontal');
  fail=true;assert.throws(()=>m.setPhotoOrientation(url,'vertical'),/Storage blocked/);assert.equal(m.photoOrientation({textureUrl:url}),'horizontal');
  assert.throws(()=>m.setPhotoOrientation(url,'diagonal'),/Невалидна/);
 }finally{if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;if(oldDispatch===undefined)delete globalThis.dispatchEvent;else globalThis.dispatchEvent=oldDispatch}
});
