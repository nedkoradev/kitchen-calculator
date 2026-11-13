import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateCabinet,cabinetPresets} from '../cabinet-generator.mjs';
import {cabinetMeasurements} from '../cabinet-dimensions.mjs';
const catalog=JSON.parse(readFileSync(new URL('../materials/default.json',import.meta.url)));
function cabinet(type,overrides={}){
 const items=generateCabinet({...cabinetPresets[type],shelves:0,...overrides},catalog);
 return {parts:items.map(i=>i.part),labels:Object.fromEntries(items.map(i=>[i.part.key,i.name])),finishes:Object.fromEntries(items.map(i=>[i.part.key,i.finish]))};
}
test('individual base height includes real legs and worktop, wall height excludes mounting elevation',()=>{
 for(const type of ['base','wall','tall'])for(const legs of [false,true])for(const worktop of [false,true]){
  const {parts,labels,finishes}=cabinet(type,{legs,worktop,h:900});parts.forEach(p=>p.y+=1300);
  const before=structuredClone(parts),[m]=cabinetMeasurements(parts,labels,finishes);
  assert.equal(m.width,600);assert.equal(m.height,900);assert.equal(m.heightLines[0][0].y,1300);assert.equal(m.heightLines[0][1].y,2200);assert.deepEqual(parts,before);
 }
});
test('outside width follows the front through four rotations, never cabinet depth',()=>{
 const {parts,labels,finishes}=cabinet('base',{w:800,d:500});
 for(let turn=0;turn<4;turn++){
  const [m]=cabinetMeasurements(parts,labels,finishes);assert.equal(m.width,800);assert.equal(m.height,858);
  const [a,b]=m.widthLine;assert.equal(Math.hypot(a.x-b.x,a.z-b.z),800);
  if(turn%2)assert.equal(a.x,b.x);else assert.equal(a.z,b.z);
  parts.forEach(p=>{const x=p.x;p.x=-p.z;p.z=x;[p.w,p.d]=[p.d,p.w]});
 }
});
test('nested composition retains each cabinet and excludes loose parts/appliances',()=>{
 const a=cabinet('base'),b=cabinet('wall',{w:900});
 a.parts.forEach(p=>{p.assemblyStack=['base','wrapper'];p.assembly='kitchen'});
 b.parts.forEach(p=>{const old=p.key;p.key+='wall';b.labels[p.key]=b.labels[old];b.finishes[p.key]=b.finishes[old];p.assemblyStack=['wall','wrapper2'];p.assembly='kitchen';p.x+=900;p.y+=1400});
 const loose={key:'loose',w:1000,h:1000,d:500,x:0,y:500,z:0,assemblyStack:[null],assembly:'kitchen'};
 const results=cabinetMeasurements([...a.parts,...b.parts,loose,{...loose,key:'oven',appliance:{}}],{...a.labels,...b.labels},{...a.finishes,...b.finishes});
 assert.equal(results.length,2);assert.deepEqual(results.map(m=>[m.width,m.height]),[[600,858],[900,720]]);
});
test('current geometry changes dimensions and anchors, not assembly identity',()=>{
 const {parts,labels,finishes}=cabinet('wall');const [before]=cabinetMeasurements(parts,labels,finishes);
 parts.forEach(p=>{p.x=p.x*1.5+150;p.w*=1.5;p.y+=75;p.z-=200});
 const [after]=cabinetMeasurements(parts,labels,finishes);assert.equal(after.id,before.id);assert.equal(after.width,900);assert.equal(after.height,720);assert.equal(after.widthLine[0].z,before.widthLine[0].z-200);assert.equal(after.widthLine[0].y,before.widthLine[0].y+75);
});
test('worktop overhang changes overall height but not outside cabinet width',()=>{
 const {parts,labels,finishes}=cabinet('base');const top=parts.find(p=>labels[p.key]==='Плот');top.w=700;const [m]=cabinetMeasurements(parts,labels,finishes);assert.equal(m.width,600);assert.equal(m.height,858);
});

test('legacy L kitchen resolves whole cabinets through door, leg, carcass, wrapper and row groups',async()=>{
 const {dimensionKitchen}=await import('./fixtures/dimension-kitchen.mjs');
 for(const anonymous of [false,true])for(const sharedWorktop of [false,true]){
  const model=dimensionKitchen(catalog,{anonymous,sharedWorktop}),before=structuredClone(model);
  for(const names of [{},model.names,new Map(Object.entries(model.names))]){
   const m=cabinetMeasurements(model.parts,model.labels,model.finishes,names);
   assert.equal(m.length,8,'eight complete cabinets, never component groups or a kitchen envelope');
   assert.deepEqual(m.map(c=>[c.width,c.height,c.widthAxis]),model.expected.map(c=>[c.w,c.h,c.axis]));
   assert.ok(m.every(c=>c.width>=600&&c.height>=720),'no 90mm legs or 297mm doors');
  }
  assert.deepEqual(model,before,'recognition is view-only');
 }
});
test('width chains share a near-geometry baseline per L arm and elevation',async()=>{
 const {dimensionKitchen}=await import('./fixtures/dimension-kitchen.mjs');
 const {cabinetWidthChains}=await import('../cabinet-dimensions.mjs');
 const model=dimensionKitchen(catalog),measurements=cabinetMeasurements(model.parts,model.labels,model.finishes),chains=cabinetWidthChains(measurements);
 assert.equal(new Set([...chains.values()].map(c=>c.id)).size,4);
 for(let i=0;i<measurements.length;i+=2){const a=measurements[i],b=measurements[i+1],ca=chains.get(a.id),cb=chains.get(b.id);assert.equal(ca.id,cb.id);assert.equal(ca.points[0].y,cb.points[0].y);assert.equal(ca.points[0][a.depthAxis],cb.points[0][a.depthAxis]);assert.equal(a.bottom-ca.points[0].y,60);assert.equal(Math.abs(a.front-ca.points[0][a.depthAxis]),30)}
});
test('L kitchen quarter turns preserve eight physical widths and heights with anonymous labels',async()=>{
 const {dimensionKitchen}=await import('./fixtures/dimension-kitchen.mjs');const m=dimensionKitchen(catalog,{anonymous:true});
 for(let turn=0;turn<4;turn++){
  const result=cabinetMeasurements(m.parts,m.labels,m.finishes);assert.equal(result.length,8);assert.deepEqual(result.map(c=>[c.width,c.height]),m.expected.map(c=>[c.w,c.h]));
  m.parts.forEach(p=>{const x=p.x;p.x=-p.z;p.z=x;[p.w,p.d]=[p.d,p.w]});
 }
});
test('zero, one and two doors never become a perpendicular cabinet',()=>{
 for(const doors of [0,1,2])for(const anonymous of [false,true]){
  const m=cabinet('base',{w:800,d:500,doors});if(anonymous)for(const k of Object.keys(m.labels))m.labels[k]='Плоскост '+k;
  for(let turn=0;turn<4;turn++){
   const result=cabinetMeasurements(m.parts,m.labels,m.finishes);assert.equal(result.length,1);assert.equal(result[0].width,800);assert.equal(result[0].height,858);
   m.parts.forEach(p=>{const x=p.x;p.x=-p.z;p.z=x;[p.w,p.d]=[p.d,p.w]});
  }
 }
});
test('a resting shared worktop raises each cabinet height without borrowing its horizontal bounds',()=>{
 const a=cabinet('base',{worktop:false,h:860}),b=cabinet('base',{worktop:false,h:860});
 a.parts.forEach(p=>{p.assemblyStack=['a'];p.assembly='kitchen'});
 b.parts.forEach(p=>{const old=p.key;p.key+='b';b.labels[p.key]=b.labels[old];b.finishes[p.key]=b.finishes[old];p.x+=600;p.assemblyStack=['b'];p.assembly='kitchen'});
 const parts=[...a.parts,...b.parts],labels={...a.labels,...b.labels},finishes={...a.finishes,...b.finishes},before=cabinetMeasurements(parts,labels,finishes);
 const top={key:'common',x:300,y:879,z:0,w:1240,h:38,d:640,assembly:'kitchen'};
 labels.common='Общ плот';finishes.common={materialType:'pdc'};
 const resting=cabinetMeasurements([...parts,top],labels,finishes);
 assert.equal(resting.length,2);assert.deepEqual(resting.map(m=>[m.width,m.height]),[[600,898],[600,898]]);
 assert.deepEqual(resting.map(m=>m.widthLine),before.map(m=>m.widthLine),'shared slab never shifts width/front anchors');
 assert.deepEqual(resting.map(m=>m.heightLines.map(line=>line[0])),before.map(m=>m.heightLines.map(line=>line[0])));
 const floating=cabinetMeasurements([...parts,{...top,y:1000}],labels,finishes);assert.deepEqual(floating.map(m=>m.height),[860,860]);
 const far=cabinetMeasurements([...parts,{...top,z:1800}],labels,finishes);assert.deepEqual(far.map(m=>m.height),[860,860]);
});
