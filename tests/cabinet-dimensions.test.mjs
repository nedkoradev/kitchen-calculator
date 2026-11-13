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
