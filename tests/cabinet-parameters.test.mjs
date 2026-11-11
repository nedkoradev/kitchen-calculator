import test from 'node:test';import assert from 'node:assert/strict';import {bounds,resize} from '../geometry.mjs';import {inferCabinetDependencies,resizeCabinet} from '../cabinet-parameters.mjs';
const room={w:5000,h:3000,d:5000};
const cabinet=()=>[{key:'left',x:-291,y:360,z:0,w:18,h:720,d:500},{key:'right',x:291,y:360,z:0,w:18,h:720,d:500},{key:'bottom',x:0,y:9,z:0,w:564,h:18,d:500},{key:'top',x:0,y:711,z:0,w:564,h:18,d:500},{key:'shelf',x:0,y:360,z:0,w:564,h:18,d:500}].map(p=>({...p,locks:{},assembly:'cab'}));
for(const [axis,dim,size] of [['x','w',800],['y','h',900],['z','d',650]])test('explicit cabinet dependencies resize '+dim+' while preserving unlocked thickness',()=>{
 const source=cabinet(),before=structuredClone(source),{rules}=inferCabinetDependencies(source);if(dim==='h'){assert.equal(rules.shelf.h,null);rules.shelf.h='relative'}const targets={w:600,h:720,d:500,[dim]:size},result=resizeCabinet(source,[],room,targets,rules);assert.equal(bounds(result,axis).max-bounds(result,axis).min,size);assert.equal(result[0].w,18);assert.equal(result[2].h,18);assert.deepEqual(source,before);for(let i=0;i<source.length;i++){assert.deepEqual(result[i].locks,source[i].locks);assert.equal(result[i].assembly,'cab')}
});
test('unknown shelf placement requires explicit choice only for the changed axis',()=>{const source=cabinet(),{rules}=inferCabinetDependencies(source);assert.throws(()=>resizeCabinet(source,[],room,{h:850},rules),/Задай връзката/);assert.equal(resizeCabinet(source,[],room,{w:750},rules)[2].w,714)});
test('unsafe shrink, locked span, room escape and thin-obstacle tunneling are rejected atomically',()=>{
 const source=cabinet(),{rules}=inferCabinetDependencies(source);rules.shelf.h='relative';const before=structuredClone(source);
 for(const targets of [{w:20},{h:30},{w:6000}])assert.throws(()=>resizeCabinet(source,[],room,targets,rules));
 const obstacle={key:'thin',x:400,y:200,z:0,w:1,h:1,d:1};assert.throws(()=>resizeCabinet(source,[obstacle],room,{w:1200},rules));assert.deepEqual(source,before);
 source[2].locks.w=true;assert.throws(()=>resizeCabinet(source,[],room,{w:800},rules),/заключен/);
});
test('explicit thickness stretching is forbidden and unrecognized parts are not guessed',()=>{const source=cabinet(),{rules}=inferCabinetDependencies(source);rules.left.w='stretch';assert.throws(()=>resizeCabinet(source,[],room,{w:700},rules),/дебелина/);source.push({key:'cube',x:0,y:100,z:0,w:100,h:100,d:100});assert.deepEqual(inferCabinetDependencies(source).rules.cube,{w:null,h:null,d:null});source.push({key:'uncertain-strip',x:0,y:100,z:0,w:4,h:18,d:500});assert.deepEqual(inferCabinetDependencies(source).rules['uncertain-strip'],{w:null,h:null,d:null})});
test('round trip in all axes restores the cabinet with start-anchored interior shelf',()=>{const source=cabinet(),{rules}=inferCabinetDependencies(source);rules.shelf.h='start';const changed=resizeCabinet(source,[],room,{w:800,h:1000,d:650},rules);assert.deepEqual(resizeCabinet(changed,[],room,{w:600,h:720,d:500},rules),source)});
test('legacy resize remains opt-in and preserves its existing output',()=>{const source=cabinet();const legacy=resize(source,[],room,'w',800);inferCabinetDependencies(source);assert.deepEqual(resize(source,[],room,'w',800),legacy)});
test('split fronts require explicit proportional size/position instead of automatic guessing',()=>{
 const source=cabinet();source.push(...[{key:'door1',x:-150},{key:'door2',x:150}].map(p=>({...p,y:360,z:270,w:296,h:716,d:18,locks:{},assembly:'cab'})));
 const {rules}=inferCabinetDependencies(source);assert.equal(rules.door1.w,null);assert.equal(rules.door2.w,null);assert.throws(()=>resizeCabinet(source,[],room,{w:800},rules),/Задай връзката/);
 rules.door1.w=rules.door2.w='proportional';const result=resizeCabinet(source,[],room,{w:800},rules);assert.equal(bounds(result,'x').max-bounds(result,'x').min,800);assert.equal(result.at(-1).d,18);assert.ok(result.at(-2).x+result.at(-2).w/2<=result.at(-1).x-result.at(-1).w/2);
});
test('multi-axis failure never leaks an earlier valid width change into the source',()=>{const source=cabinet(),before=structuredClone(source),{rules}=inferCabinetDependencies(source);rules.shelf.h='relative';assert.throws(()=>resizeCabinet(source,[],room,{w:800,h:20,d:600},rules));assert.deepEqual(source,before)});
test('explicit rigid bay keeps nested cabinet histories and a locked short shelf',async()=>{
 const {cabinetWithAddedPanels}=await import('./fixtures.mjs');const source=cabinetWithAddedPanels({partitionX:400});source[5].locks.w=true;
 const {rules}=inferCabinetDependencies(source);assert.equal(rules.partition.w,null);rules.partition.w='start';rules['added-shelf'].w='start';
 const result=resizeCabinet(source,[],room,{w:900},rules);assert.equal(bounds(result,'x').max-bounds(result,'x').min,900);assert.equal(result[5].w,source[5].w);assert.equal(result[4].x,source[4].x);
 for(let i=0;i<source.length;i++){assert.deepEqual(result[i].assemblyStack,source[i].assemblyStack);assert.deepEqual(result[i].locks,source[i].locks)}
});
test('cabinet offset near room wall rejects an otherwise valid target width',()=>{const source=cabinet().map(p=>({...p,x:p.x+2000})),before=structuredClone(source),{rules}=inferCabinetDependencies(source);assert.throws(()=>resizeCabinet(source,[],room,{w:900},rules),/не е приложен/);assert.deepEqual(source,before)});
test('wrapping several cabinets in a common outer history does not make dependencies reliable',()=>{const source=cabinet();source[0].assemblyStack=['cabA','shared'];source[1].assemblyStack=['cabB','shared'];const inferred=inferCabinetDependencies(source);assert.equal(inferred.nested,true);assert.equal(inferred.rules.left.w,null);assert.equal(inferred.rules.top.h,null)});
test('accepted growth/shrink/odd targets keep all panels positive, enclosed and non-overlapping',()=>{
 const source=cabinet(),{rules}=inferCabinetDependencies(source);rules.shelf.h='relative';const dims={x:'w',y:'h',z:'d'};
 for(const [w,h,d] of [[450,540,350],[900,1100,700],[601,721,501]]){const result=resizeCabinet(source,[],room,{w,h,d},rules);
  for(let i=0;i<result.length;i++){const p=result[i];for(const axis of Object.keys(dims)){const dim=dims[axis],extent={min:bounds(source,axis).min,max:bounds(source,axis).min+({w,h,d})[dim]};assert.ok(p[dim]>0&&Number.isInteger(p[dim]));assert.ok(p[axis]-p[dim]/2>=extent.min-1e-8&&p[axis]+p[dim]/2<=extent.max+1e-8)}for(let j=0;j<i;j++)assert.ok(!Object.keys(dims).every(axis=>Math.abs(p[axis]-result[j][axis])<(p[dims[axis]]+result[j][dims[axis]])/2-1e-8));}
 }
});
