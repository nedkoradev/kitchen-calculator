import test from 'node:test';
import assert from 'node:assert/strict';
import {imageMime,checkPhotoFile,proposedTexturePath,MAX_PHOTO_BYTES} from '../material-photo-editor.mjs';
import {grainFaceOptions} from '../grain.mjs';
test('grain choices use the actual broad face, with finish.grainAxis values retained',()=>{
 assert.deepEqual(grainFaceOptions({w:550,h:720,d:18}),[{axis:'x',label:'По дължина',size:550},{axis:'y',label:'По височина',size:720}]);
 assert.deepEqual(grainFaceOptions({w:18,h:720,d:550}),[{axis:'z',label:'По дължина',size:550},{axis:'y',label:'По височина',size:720}]);
 assert.deepEqual(grainFaceOptions({w:720,h:18,d:550}),[{axis:'x',label:'По дължина',size:720},{axis:'z',label:'По ширина',size:550}]);
});
test('photo validation checks magic bytes, extension, MIME and the size limit',()=>{
 const png=new Uint8Array([137,80,78,71,13,10,26,10]),jpeg=new Uint8Array([255,216,255,0]),webp=new TextEncoder().encode('RIFFxxxxWEBP');
 assert.equal(imageMime(webp),'image/webp');assert.equal(imageMime(new TextEncoder().encode('<html>')) ,null);
 for(const [name,type,bytes] of [['a.png','image/png',png],['a.JPEG','image/jpeg',jpeg],['a.webp','image/webp',webp]])assert.equal(checkPhotoFile({name,type,size:100},bytes),type);
 for(const file of [{name:'fake.png',type:'image/png',size:100},{name:'wrong.jpg',type:'image/jpeg',size:100},{name:'empty.png',type:'image/png',size:0},{name:'large.png',type:'image/png',size:MAX_PHOTO_BYTES+1}])assert.throws(()=>checkPhotoFile(file,file.name==='fake.png'?new Uint8Array([1,2]):png));
});
test('suggested repo paths are safe, portable and bound to image contents',()=>{
 const hash='abc123def0'+'a'.repeat(54),path=proposedTexturePath('../Дъб светъл<script>.PNG','image/png',hash);
 assert.ok(path.startsWith('materials/textures/'));assert.ok(path.endsWith('-abc123def0.png'));assert.ok(!path.includes('..')&&!path.includes('<')&&!path.includes('>'));
 assert.equal(proposedTexturePath('Oak 01.PNG','image/png',hash),'materials/textures/Oak%2001.PNG');
 assert.notEqual(proposedTexturePath('oak<script>.png','image/png',hash),proposedTexturePath('oak<script>.png','image/png','b'.repeat(64)));
});

test('edge texture UV axes follow every physical band after panel rotation',async()=>{
 const {edgeTextureCoordinates,panelAxes}=await import('../grain.mjs');
 for(const p of [{w:18,h:700,d:550},{w:600,h:700,d:18},{w:600,h:18,d:550}]){
  const {thickness,axes}=panelAxes(p);
  for(const normal of axes){const uv=edgeTextureCoordinates(p,normal,{textureWidthMm:18,textureHeightMm:1000});assert.equal(uv.uAxis,thickness);assert.equal(uv.vAxis,axes.find(a=>a!==normal));assert.equal(uv.width,18);assert.equal(uv.height,1000)}
 }
});

test('saving a catalog retries a previously failed texture URL',async()=>{
 const {createMaterialTextures}=await import('../material-textures.mjs');let loads=0,success,fail;
 const THREE={TextureLoader:class{setCrossOrigin(){}load(url,onLoad,progress,onError){loads++;success=onLoad;fail=onError}},SRGBColorSpace:'srgb',RepeatWrapping:'repeat'};
 const textureCache=createMaterialTextures(THREE),mesh={geometry:{attributes:{position:{getX:()=>1,getY:()=>2,getZ:()=>3},uv:{count:1,setXY(){}}}},material:{color:{set(){}},needsUpdate:false}};
 const p={w:600,h:800,d:18},m={textureUrl:'materials/textures/nebraska.png'};
 textureCache.apply(mesh,p,{},m);fail();textureCache.apply(mesh,p,{},m);assert.equal(loads,1);
 textureCache.retryFailed();textureCache.apply(mesh,p,{},m);assert.equal(loads,2);
 const texture={image:{width:355,height:489}};success(texture);assert.equal(mesh.material.map,texture);assert.equal(mesh.material.needsUpdate,true);
});
