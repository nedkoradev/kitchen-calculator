import test from 'node:test';import assert from 'node:assert/strict';import {bounds,resize} from '../geometry.mjs';import {inferCabinetDependencies,resizeCabinet} from '../cabinet-parameters.mjs';
const room={w:5000,h:3000,d:5000};
const cabinet=()=>[{key:'left',x:-291,y:360,z:0,w:18,h:720,d:500},{key:'right',x:291,y:360,z:0,w:18,h:720,d:500},{key:'bottom',x:0,y:9,z:0,w:564,h:18,d:500},{key:'top',x:0,y:711,z:0,w:564,h:18,d:500},{key:'shelf',x:0,y:360,z:0,w:564,h:18,d:500}].map(p=>({...p,locks:{},assembly:'cab'}));
for(const [axis,dim,size] of [['x','w',800],['y','h',900],['z','d',650]])test('explicit cabinet dependencies resize '+dim+' while preserving unlocked thickness',()=>{
 const source=cabinet(),before=structuredClone(source),{rules}=inferCabinetDependencies(source);if(dim==='h')assert.equal(rules.shelf.h,'evenShelf');const targets={w:600,h:720,d:500,[dim]:size},result=resizeCabinet(source,[],room,targets,rules);assert.equal(bounds(result,axis).max-bounds(result,axis).min,size);assert.equal(result[0].w,18);assert.equal(result[2].h,18);assert.deepEqual(source,before);for(let i=0;i<source.length;i++){assert.deepEqual(result[i].locks,source[i].locks);assert.equal(result[i].assembly,'cab')}
});
test('unknown shelf placement requires explicit choice only for the changed axis',()=>{const source=cabinet();source[4].y=300;const {rules}=inferCabinetDependencies(source);assert.throws(()=>resizeCabinet(source,[],room,{h:850},rules),/уточнение/);assert.equal(resizeCabinet(source,[],room,{w:750},rules)[2].w,714)});
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
 const {rules}=inferCabinetDependencies(source);assert.equal(rules.door1.w,null);assert.equal(rules.door2.w,null);assert.throws(()=>resizeCabinet(source,[],room,{w:800},rules),/уточнение/);
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
test('standard carcass and external back infer all dimensions from contacts, not names',()=>{
 const source=cabinet();source.push({key:'unrelated-name',name:'рафт',x:0,y:360,z:-252,w:600,h:720,d:4,locks:{},assembly:'cab'});
 const {rules,unknown}=inferCabinetDependencies(source);assert.deepEqual(unknown,[]);const result=resizeCabinet(source,[],room,{w:800,h:900,d:654},rules);
 assert.deepEqual(result.map(p=>[p.w,p.h,p.d]),[[18,900,650],[18,900,650],[764,18,650],[764,18,650],[764,18,650],[800,900,4]]);assert.equal(result.at(-1).z,-252);
});
test('multiple regular shelves preserve equal clear gaps including thickness and millimetre rounding',()=>{
 const source=cabinet();source[4].y=243;source.push({...source[4],key:'second',y:477,locks:{h:true}});
 const {rules}=inferCabinetDependencies(source);assert.equal(rules.shelf.h,'evenShelf');assert.equal(rules.second.h,'evenShelf');
 for(const h of [900,901,540]){const result=resizeCabinet(source,[],room,{h},rules),shelves=result.slice(4);const gaps=[shelves[0].y-9-18,shelves[1].y-shelves[0].y-18,h-18-shelves[1].y-9];assert.ok(Math.max(...gaps)-Math.min(...gaps)<=1);assert.equal(shelves[0].h,18);assert.equal(shelves[1].h,18)}
});
test('front and rear narrow rails keep their depths and follow exact attachments',()=>{
 const source=cabinet().filter(p=>!['top','shelf'].includes(p.key));source.push(...[{key:'rear',z:-206},{key:'front',z:206}].map(p=>({...p,x:0,y:711,w:564,h:18,d:88,locks:{},assembly:'cab'})));
 const {rules}=inferCabinetDependencies(source);assert.equal(rules.rear.d,'start');assert.equal(rules.front.d,'end');const result=resizeCabinet(source,[],room,{w:800,h:900,d:650},rules);
 assert.deepEqual(result.slice(-2).map(p=>[p.w,p.h,p.d,p.y,p.z]),[[764,18,88,891,-206],[764,18,88,891,356]]);
});
test('vertical stretcher follows its top attachment without becoming full height',()=>{
 const source=cabinet().filter(p=>!['top','shelf'].includes(p.key));source.push({key:'rail',x:0,y:676,z:241,w:564,h:88,d:18,locks:{},assembly:'cab'});
 const {rules}=inferCabinetDependencies(source);assert.equal(rules.rail.h,'end');const result=resizeCabinet(source,[],room,{w:800,h:900,d:650},rules);assert.deepEqual([result.at(-1).w,result.at(-1).h,result.at(-1).d,result.at(-1).y,result.at(-1).z],[764,88,18,856,391]);
});
test('small shelf setback is preserved, large unspecified setback stays unresolved',()=>{
 const source=cabinet();source[4].d=490;source[4].z=-5;let {rules}=inferCabinetDependencies(source);assert.equal(rules.shelf.d,'stretch');const result=resizeCabinet(source,[],room,{d:650},rules);assert.equal(result[4].d,640);assert.equal(result[4].z+result[4].d/2,390);
 source[4].d=450;source[4].z=-25;rules=inferCabinetDependencies(source).rules;assert.equal(rules.shelf.d,null);assert.throws(()=>resizeCabinet(source,[],room,{d:650},rules),error=>error.unresolved.some(item=>item.key==='shelf'&&item.dim==='d'));
});
test('nonuniform shelf reports only changed unresolved axes and preserves all original settings',()=>{
 const source=cabinet();source[4].y=300;source[4].finish={material:3,grainAxis:'z',edges:[1,null,2,null]};source[4].note='Нестандартен рафт';const before=structuredClone(source),{rules}=inferCabinetDependencies(source);
 assert.throws(()=>resizeCabinet(source,[],room,{w:800,h:900},rules),error=>{assert.deepEqual(error.unresolved,[{key:'shelf',dim:'h'}]);return true});assert.deepEqual(source,before);
 rules.shelf.h='start';const result=resizeCabinet(source,[],room,{w:800,h:900},rules);assert.equal(result[4].y,300);assert.deepEqual(result[4].finish,before[4].finish);assert.equal(result[4].note,before[4].note);
});
