import test from 'node:test';
import assert from 'node:assert/strict';
import {imageMime,checkPhotoFile,proposedTexturePath,MAX_PHOTO_BYTES} from '../material-photo-editor.mjs';
import {grainFaceOptions} from '../grain.mjs';
test('grain choices use the actual broad face, with finish.grainAxis values retained',()=>{
 assert.deepEqual(grainFaceOptions({w:550,h:720,d:18}),[{axis:'x',label:'По ширината',size:550},{axis:'y',label:'По височината',size:720}]);
 assert.deepEqual(grainFaceOptions({w:18,h:720,d:550}),[{axis:'z',label:'По ширината',size:550},{axis:'y',label:'По височината',size:720}]);
 assert.deepEqual(grainFaceOptions({w:720,h:18,d:550}),[{axis:'x',label:'По ширината',size:720},{axis:'z',label:'По дълбочината',size:550}]);
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
 assert.notEqual(proposedTexturePath('oak.png','image/png',hash),proposedTexturePath('oak.png','image/png','b'.repeat(64)));
});
