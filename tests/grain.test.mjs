import test from 'node:test';
import assert from 'node:assert/strict';
import {panelAxes,physicalGrainAxis,rotatedGrainAxis,cutLayout,textureCoordinates,validTextureUrl} from '../grain.mjs';
const horizontal={w:720,h:18,d:550},vertical={w:550,h:720,d:18},side={w:18,h:720,d:550};
test('grain-free legacy dimensions and Salex edges stay unchanged for all planes',()=>{
 for(const p of [horizontal,vertical,side]){const cut=cutLayout(p);assert.equal(cut.A,720);assert.equal(cut.B,550);assert.equal(cut.thickness,18);assert.equal(cut.grainRequired,false)}
 assert.deepEqual(cutLayout(side).edgeIndices,[0,1,2,3]);assert.deepEqual(cutLayout(horizontal).edgeIndices,[2,3,1,0]);
});
test('grain is first on horizontal panels, with matching physical edge lengths',()=>{
 const p={...horizontal},before=structuredClone(p);
 assert.deepEqual(cutLayout(p,{grainAxis:'x'},{grainRequired:true}),{A:720,B:550,thickness:18,grainRequired:true,axis:'x',edgeIndices:[2,3,1,0]});
 assert.deepEqual(cutLayout(p,{grainAxis:'z'},{grainRequired:true}),{A:550,B:720,thickness:18,grainRequired:true,axis:'z',edgeIndices:[0,1,2,3]});
 assert.deepEqual(p,before);
});
test('vertical panels use either broad axis; thickness is never offered as grain',()=>{
 assert.deepEqual(panelAxes(side),{thickness:'x',axes:['z','y']});
 assert.equal(cutLayout(side,{grainAxis:'z'},{grainRequired:true}).A,550);
 assert.equal(cutLayout(vertical,{grainAxis:'x'},{grainRequired:true}).A,550);
 assert.equal(physicalGrainAxis(side,{grainAxis:'x'}),'y');
 assert.deepEqual(cutLayout(vertical,{grainAxis:'y'},{grainRequired:true}).edgeIndices,[0,1,2,3]);
});
test('rotating grain preserves the physical axis through four quarter-turns',()=>{
 for(const initial of ['x','y','z']){let axis=initial;for(let i=0;i<4;i++)axis=rotatedGrainAxis(axis);assert.equal(axis,initial)}
 assert.equal(rotatedGrainAxis('y'),'y');assert.equal(rotatedGrainAxis('x'),'z');
});
test('texture UV scales use millimetres and original image aspect when height is unspecified',()=>{
 assert.deepEqual(textureCoordinates(horizontal,{grainAxis:'x'},{textureWidthMm:1000},2),{uAxis:'z',vAxis:'x',width:1000,height:500});
 assert.equal(textureCoordinates(side,{grainAxis:'y'},{textureWidthMm:500,textureHeightMm:1200},2).height,1200);
 for(const url of ['data:image/png;base64,AAAA','javascript:alert(1)','http://example.test/a.png','https://user:password@example.test/a.png'])assert.equal(validTextureUrl(url),null);
 assert.equal(validTextureUrl('https://example.test/a.webp'),'https://example.test/a.webp');
});
test('every grain-first Salex edge pair follows its physical dimension in all orientations',()=>{
 for(const p of [horizontal,vertical,side]){
  const {thickness,axes}=panelAxes(p),lengths=thickness==='x'?[p.h,p.h,p.d,p.d]:thickness==='z'?[p.h,p.h,p.w,p.w]:[p.d,p.d,p.w,p.w];
  for(const grainAxis of axes){const layout=cutLayout(p,{grainAxis},{grainRequired:true});assert.deepEqual(layout.edgeIndices.map(i=>lengths[i]),[layout.A,layout.A,layout.B,layout.B])}
 }
});
test('repository texture paths are portable Pages URLs with strict directory boundaries',()=>{
 assert.equal(validTextureUrl('materials/textures/decor.webp'),'materials/textures/decor.webp');
 assert.equal(validTextureUrl('./materials/textures/Дъб светъл.PNG'),'materials/textures/%D0%94%D1%8A%D0%B1%20%D1%81%D0%B2%D0%B5%D1%82%D1%8A%D0%BB.PNG');
 assert.equal(validTextureUrl('materials/textures/decor.jpg?v=2'),'materials/textures/decor.jpg?v=2');
 for(const input of ['/materials/textures/a.png','../materials/textures/a.png','materials/textures/../secret.png','materials/textures/%2e%2e/secret.png','materials/textures/a%2f..%2fsecret.png','materials/textures/a%255c..png','materials/textures/decor.html','//external.test/a.jpg'])assert.equal(validTextureUrl(input),null,input);
});

test('per-panel grain overrides legacy material defaults and puts the 3000 mm side first',()=>{
 const p={w:500,h:3000,d:18};
 assert.equal(cutLayout(p,{grainRequired:true,grainAxis:'y'},{}).A,3000);
 assert.equal(cutLayout(p,{grainRequired:true,grainAxis:'x'},{}).A,500);
 assert.equal(cutLayout(p,{grainRequired:false,grainAxis:'x'},{grainRequired:true}).grainRequired,false);
 assert.equal(cutLayout(p,{grainAxis:'x'},{grainRequired:true}).A,500);
 assert.deepEqual(cutLayout(p,{grainRequired:true,grainAxis:'y'}).edgeIndices,[0,1,2,3]);
});
