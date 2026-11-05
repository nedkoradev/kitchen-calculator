import test from 'node:test';
import assert from 'node:assert/strict';
import {translate,resize,bounds} from '../geometry.mjs';
import {manyPartCabinet,largeRoom} from './fixtures.mjs';
const room={w:3000,h:2600,d:3000};
const part=(key,extra={})=>({key,x:0,y:50,z:0,w:100,h:100,d:100,...extra});
const cabinet=()=>[
 part('left',{x:9,y:360,w:18,h:720,d:500,locks:{w:true}}),
 part('right',{x:591,y:360,w:18,h:720,d:500,locks:{w:true}}),
 part('bottom',{x:300,y:9,w:564,h:18,d:500,locks:{h:true}}),
 part('top',{x:300,y:711,w:564,h:18,d:500,locks:{h:true}}),
 part('shelf',{x:300,y:300,w:564,h:18,d:500,locks:{h:true}})
];
for(const [axis,dim] of [['x','w'],['y','h'],['z','d']]){
 test(`large ${axis} move stops at a thin obstacle`,()=>{
  const p=part('p',{y:200}),o=part('o',{y:200,[axis]:400,[dim]:1});
  const next=translate([p],[o],room,{[axis]:1000})[0];
  assert.equal(next[axis]+next[dim]/2,o[axis]-o[dim]/2);
  for(const k of ['w','h','d'])assert.equal(next[k],p[k]);
 });
 test(`${dim} resize stops at first obstacle with integer size`,()=>{
  const p=part('p',{y:200}),o=part('o',{y:200,[axis]:400,[dim]:1});
  const next=resize([p],[o],room,dim,1200)[0];
  assert.equal(next[dim],axis==='y'?249:449); // contact is at 449.5; largest valid integer
  assert.equal(next[axis]-next[dim]/2,p[axis]-p[dim]/2);
  for(const k of ['w','h','d'].filter(k=>k!==dim))assert.equal(next[k],p[k]);
 });
 test(`locked ${dim} is invariant`,()=>{
  const p=part('p',{locks:{[dim]:true}});
  assert.deepEqual(resize([p],[],room,dim,200),[p]);
 });
}
test('touching blocks inward movement and permits moving away',()=>{
 const p=part('p'),o=part('o',{x:100});
 assert.equal(translate([p],[o],room,{x:900})[0].x,0);
 assert.equal(translate([p],[o],room,{x:-200})[0].x,-200);
});
test('existing intersections can be released but cannot deepen or tunnel into a new part',()=>{
 const p=part('p'),o=part('o',{x:30}),thin=part('thin',{x:-300,w:1});
 assert.equal(translate([p],[o,thin],room,{x:-1000})[0].x,-249.5);
 assert.equal(translate([p],[o],room,{x:10})[0].x,0);
 assert.equal(translate([p],[o],room,{x:1000})[0].x,0);
 assert.equal(translate([p],[part('same')],room,{x:200})[0].x,200);
});
test('room walls, floor and odd sizes retain exact anchors',()=>{
 const p=part('p');
 assert.equal(translate([p],[],room,{y:-1000})[0].y,50);
 const next=resize([p],[],room,'h',101)[0];
 assert.equal(next.y,50.5);assert.equal(next.y-next.h/2,0);
 assert.equal(resize([p],[],room,'w',9999)[0].w,1550);
 assert.equal(resize([p],[],room,'d',100.7)[0].d,101);
 assert.deepEqual(resize([p],[],room,'w',NaN),[p]);
 assert.deepEqual(resize([p],[],room,'w',0),[p]);
});
test('cabinet resize preserves locked thickness, contacts, floor and shelf elevation',()=>{
 for(const [dim,size] of [['w',800],['h',900],['d',600],['w',400],['h',500]]){
  const source=cabinet(),next=resize(source,[],room,dim,size);
  const axis={w:'x',h:'y',d:'z'}[dim];
  assert.equal(bounds(next,axis).max-bounds(next,axis).min,size);
  assert.equal(bounds(next,axis).min,bounds(source,axis).min);
  assert.equal(next[4].y,source[4].y);
  for(let i=0;i<next.length;i++)for(const k of ['w','h','d']){
   assert.ok(Number.isInteger(next[i][k])&&next[i][k]>0);
   if(k!==dim||source[i].locks?.[k])assert.equal(next[i][k],source[i][k]);
  }
 }
});
test('group translation uses every member and retains internal distances',()=>{
 const source=cabinet(),obstacle=part('o',{x:900,w:1,y:500});
 const next=translate(source,[obstacle],room,{x:1000});
 assert.equal(bounds(next,'x').max,899.5);
 source.forEach((p,i)=>assert.equal(next[i].x-p.x,next[0].x-source[0].x));
});
test('locked spanning member stops an incompatible group resize',()=>{
 const source=cabinet();source[2].locks.w=true;
 assert.deepEqual(resize(source,[],room,'w',900),source);
});
test('group shrink stops before an internal shelf collision',()=>{
 const source=cabinet(),next=resize(source,[],room,'h',20);
 assert.equal(next[3].y-next[3].h/2,next[4].y+next[4].h/2);
});
test('group resize sweeps moving thin locked panels during growth AND shrink',()=>{
 const source=cabinet(),obstacle=part('o',{x:750,w:1,y:600});
 assert.equal(bounds(resize(source,[obstacle],room,'w',1000),'x').max,749);
 const inside=part('inside',{x:450,w:1,y:600});
 const next=resize(source,[inside],room,'w',200);
 assert.equal(next[1].x-next[1].w/2,451);
});
test('nested metadata survives operations without shared mutations',()=>{
 const source=cabinet().map(p=>({...p,assembly:'outer',assemblyStack:['inner']}));
 const snapshot=structuredClone(source);
 const next=resize(source,[],room,'w',800);
 assert.deepEqual(source,snapshot);
 for(const p of next){assert.equal(p.assembly,'outer');assert.deepEqual(p.assemblyStack,['inner'])}
});

test('two nested cabinets resize through their own construction rules',()=>{
 const source=[...cabinet().map(p=>({...p,key:'a'+p.key,assembly:'outer',assemblyStack:['a']})),...cabinet().map(p=>({...p,key:'b'+p.key,x:p.x+650,assembly:'outer',assemblyStack:['b']}))];
 const next=resize(source,[],room,'w',1350);
 assert.equal(bounds(next,'x').max-bounds(next,'x').min,1350);
 for(const prefix of ['a','b']){
  const c=next.filter(p=>p.key.startsWith(prefix));
  assert.equal(c[0].w,18);assert.equal(c[1].w,18);
  assert.equal(c[2].x-c[2].w/2,c[0].x+c[0].w/2);
  assert.equal(c[2].x+c[2].w/2,c[1].x-c[1].w/2);
 }
});
test('negative movement stops at contact and a blocked axis permits sliding',()=>{
 const p=part('p'),o=part('o',{x:-300,w:1});
 const next=translate([p],[o],room,{x:-2000,z:200})[0];
 assert.equal(next.x,-249.5);assert.equal(next.z,200);
});
test('resizing a floating shelf preserves its elevation',()=>{
 const p=part('shelf',{y:509,h:18});
 const next=resize([p],[],room,'h',19)[0];
 assert.equal(next.y-next.h/2,500);
});
test('resize releases an existing external intersection by shrinking',()=>{
 const p=part('p'),o=part('o',{x:70});
 assert.equal(resize([p],[o],room,'w',20)[0].w,20);
 assert.equal(resize([p],[o],room,'w',200)[0].w,100);
});
test('legacy cabinets wrapped with null stack entries still resize',()=>{
 const source=cabinet().map(p=>({...p,assembly:'wrapper',assemblyStack:[null]}));
 assert.equal(bounds(resize(source,[],room,'w',800),'x').max,800);
});
test('multiple nested levels keep locked child dimensions and contacts',()=>{
 const source=cabinet().map(p=>({...p,assembly:'outer',assemblyStack:['inner','middle']}));
 const next=resize(source,[],room,'w',800);
 assert.equal(bounds(next,'x').max,800);
 assert.deepEqual(next[0].assemblyStack,['inner','middle']);
 assert.equal(next[0].w,18);
});
for(const [axis,dim] of [['x','w'],['y','h'],['z','d']]){
 test(`contained overlap can escape in either ${axis} direction without deepening`,()=>{
  const p=part('p',{y:500,[axis]:axis==='y'?510:10,[dim]:40});
  const o=part('o',{y:500});
  const volume=p=>['x','y','z'].reduce((v,k)=>{
   const d={x:'w',y:'h',z:'d'}[k];
   return v*Math.max(0,Math.min(p[k]+p[d]/2,o[k]+o[d]/2)-Math.max(p[k]-p[d]/2,o[k]-o[d]/2));
  },1);
  for(const sign of [-1,1]){
   let previous=volume(p);
   for(let i=1;i<=20;i++){
    const next=translate([p],[o],largeRoom,{[axis]:sign*i*5})[0];
    assert.equal(next[axis],p[axis]+sign*i*5);
    assert.ok(volume(next)<=previous);previous=volume(next);
   }
   assert.equal(previous,0);
  }
 });
 test(`partial overlap along ${axis} releases only away from the other part`,()=>{
  const p=part('p',{y:500}),o=part('o',{y:500,[axis]:axis==='y'?530:30});
  assert.equal(translate([p],[o],largeRoom,{[axis]:-100})[0][axis],p[axis]-100);
  assert.equal(translate([p],[o],largeRoom,{[axis]:100})[0][axis],p[axis]);
 });
}
test('sequential escape along different axes keeps intersection volume non-increasing',()=>{
 let p=part('p',{y:500,w:40,x:10});const o=part('o',{y:580});
 const volume=(a,b)=>['x','y','z'].reduce((v,k)=>{const d={x:'w',y:'h',z:'d'}[k];return v*Math.max(0,Math.min(a[k]+a[d]/2,b[k]+b[d]/2)-Math.max(a[k]-a[d]/2,b[k]-b[d]/2))},1);
 for(const delta of [{x:-20},{z:30},{y:-20},{x:110}]){
  const before=p;
  p=translate([p],[o],largeRoom,delta)[0];
  assert.ok(volume(p,o)<=volume(before,o));
  for(const axis of Object.keys(delta))assert.equal(p[axis],before[axis]+delta[axis]);
 }
});
test('escape from containment still stops at a new thin obstacle',()=>{
 const p=part('p',{w:40,x:10,y:500}),o=part('o',{y:500}),thin=part('thin',{x:-200,w:1,y:500});
 assert.equal(translate([p],[o,thin],largeRoom,{x:-1000})[0].x,-179.5);
});
for(const count of [5,50,100,200]){
 test(`600→4000 mm resize preserves construction with ${count} parts`,()=>{
  const parts=manyPartCabinet(count),before=structuredClone(parts),next=resize(parts,[],largeRoom,'w',4000);
  assert.equal(bounds(next,'x').max-bounds(next,'x').min,4000);
  assert.equal(bounds(next,'x').min,-2000);
  assert.equal(next[0].w,18);assert.equal(next[1].w,18);
  next.slice(2).forEach(p=>{assert.equal(p.w,3964);assert.equal(p.x-p.w/2,-1982);assert.equal(p.x+p.w/2,1982)});
  next.forEach((p,i)=>{assert.equal(p.y,parts[i].y);assert.equal(p.h,parts[i].h);assert.equal(p.d,parts[i].d)});
  assert.deepEqual(parts,before);
 });
}
test('affine large resize cannot tunnel through a thin obstacle',()=>{
 const p=manyPartCabinet(100),o=part('obstacle',{x:1000,w:1,y:600});
 const next=resize(p,[o],largeRoom,'w',4000);
 assert.equal(bounds(next,'x').max-bounds(next,'x').min,2999);
});
test('mixed-depth null histories resize the same child cabinet together',()=>{
 const source=manyPartCabinet(5).map((p,i)=>({...p,assembly:'outer',assemblyStack:i===4?[null,'middle']:[null,'inner','middle']}));
 const next=resize(source,[],largeRoom,'w',4000);
 assert.equal(bounds(next,'x').max-bounds(next,'x').min,4000);
 next.slice(2).forEach(p=>assert.equal(p.w,3964));
 next.forEach((p,i)=>assert.deepEqual(p.assemblyStack,source[i].assemblyStack));
});
test('rounded interior partitions retain their thickness and relative opening position',()=>{
 const source=manyPartCabinet(100);
 source.push({...source[0],key:'partition',x:-1750});
 const next=resize(source,[],largeRoom,'w',4000),partition=next.at(-1);
 assert.equal(partition.w,18);
 assert.equal(partition.x,-1750+Math.round(3400*232/564));
 assert.equal(bounds(next,'x').max-bounds(next,'x').min,4000);
});
test('rounded partition cannot skip a thin obstacle inside the opening',()=>{
 const source=manyPartCabinet(100);
 source.push({...source[0],key:'partition',x:-1700});
 const obstacle=part('thin',{x:-1650,w:1,y:600,h:1});
 const next=resize(source,[obstacle],largeRoom,'w',4000);
 assert.equal(bounds(next,'x').max-bounds(next,'x').min,680);
 assert.ok(next.at(-1).x+9<=obstacle.x-.5);
});
