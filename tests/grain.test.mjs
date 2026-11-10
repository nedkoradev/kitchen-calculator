import test from 'node:test';
import assert from 'node:assert/strict';
import {panelAxes,physicalGrainAxis,rotatedGrainAxis,cutLayout,textureCoordinates,edgeTextureCoordinates,validTextureUrl} from '../grain.mjs';
const horizontal={w:720,h:18,d:550},vertical={w:550,h:720,d:18},side={w:18,h:720,d:550};
test('grain-free dimensions keep their size order and horizontal/side edge mapping',()=>{
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

test('grain face labels describe vertical and horizontal faces, never longest-side aliases',async()=>{
 const {grainFaceOptions}=await import('../grain.mjs');
 assert.deepEqual(grainFaceOptions({w:588,h:142,d:18}),[{axis:'x',label:'По дължина',size:588},{axis:'y',label:'По височина',size:142}]);
 assert.deepEqual(grainFaceOptions({w:142,h:588,d:18}),[{axis:'x',label:'По дължина',size:142},{axis:'y',label:'По височина',size:588}]);
 assert.deepEqual(grainFaceOptions({w:18,h:588,d:142}),[{axis:'z',label:'По дължина',size:142},{axis:'y',label:'По височина',size:588}]);
});
test('source-photo grain orientation changes only UV axes, never cutting or physical edges',()=>{
 const p={w:588,h:142,d:18},f={grainRequired:true,grainAxis:'x',edges:[0,1,2,3]},before=structuredClone({p,f}),base={textureWidthMm:355,textureHeightMm:489};
 const vertical=textureCoordinates(p,f,base),horizontal=textureCoordinates(p,f,{...base,textureGrainDirection:'horizontal'});
 assert.deepEqual(edgeTextureCoordinates(p,'x',{...base,textureGrainDirection:'horizontal'}),{uAxis:'y',vAxis:'z',width:355,height:489});
 assert.deepEqual(vertical,{uAxis:'y',vAxis:'x',width:355,height:489});assert.deepEqual(horizontal,{uAxis:'x',vAxis:'y',width:355,height:489});
 assert.deepEqual(cutLayout(p,f,base),cutLayout(p,f,{...base,textureGrainDirection:'horizontal'}));assert.equal(cutLayout(p,f,base).A,588);assert.deepEqual({p,f},before);
});

test('edge editor swaps horizontal top/bottom and vertical left/right without reinterpreting storage',async()=>{
 const {edgeEditorSlots,edgeDirectionNames}=await import('../grain.mjs');
 for(const [p,expected,names] of [[horizontal,[0,1,3,2],['ляво','дясно','долу','горе']],[vertical,[1,0,2,3],['дясно','ляво','горе','долу']],[side,[1,0,2,3],['дясно','ляво','горе','долу']]]){
  const physical=['E0','E1','E2','E3'],before=structuredClone(p),slots=edgeEditorSlots(p),editor=slots.map(i=>physical[i]),stored=[];slots.forEach((slot,i)=>{stored[slot]=editor[i]});assert.deepEqual(slots,expected);assert.deepEqual(stored,physical);assert.deepEqual(edgeDirectionNames(p),names);assert.deepEqual(p,before);
 }
});

test('Salex edge diagram aligns A horizontally and letters with the exact XLSX slots',async()=>{
 const {edgeDiagramLayout}=await import('../grain.mjs');
 for(const p of [horizontal,vertical,side])for(const finish of [{grainRequired:false},...panelAxes(p).axes.map(grainAxis=>({grainRequired:true,grainAxis}))]){
  const cut=cutLayout(p,finish),diagram=edgeDiagramLayout(p,finish),physical=[];diagram.slots.forEach((slot,i)=>physical[slot]=['Л','Д','П','З'][i]);
  assert.deepEqual([diagram.width,diagram.height],[cut.A,cut.B]);assert.deepEqual(cut.edgeIndices.map(i=>physical[i]),['З','П','Д','Л']);
  if(finish.grainRequired)assert.equal(diagram.axes[0],finish.grainAxis);
 }
});

test('grain-free Salex sides match the actual long/short dimensions in every plane',()=>{
 for(const p of [horizontal,vertical,side,{w:550,h:18,d:720},{w:720,h:550,d:18},{w:18,h:550,d:720}]){
  const layout=cutLayout(p,{grainRequired:false}),thin=panelAxes(p).thickness,lengths=thin==='x'?[p.h,p.h,p.d,p.d]:thin==='z'?[p.h,p.h,p.w,p.w]:[p.d,p.d,p.w,p.w];
  assert.deepEqual(layout.edgeIndices.map(i=>lengths[i]),[layout.A,layout.A,layout.B,layout.B]);assert.equal(layout.A,720);assert.equal(layout.B,550);
 }
});
