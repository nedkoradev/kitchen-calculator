const assert=require('node:assert/strict');
const fs=require('node:fs');
const {openKitchen}=require('./browser-harness.cjs');
const part=(key,extra={})=>({key,x:0,y:500,z:0,w:100,h:100,d:100,locks:{},...extra});
const volume=(a,b)=>['x','y','z'].reduce((v,k)=>{
 const d={x:'w',y:'h',z:'d'}[k];
 return v*Math.max(0,Math.min(a[k]+a[d]/2,b[k]+b[d]/2)-Math.max(a[k]-a[d]/2,b[k]-b[d]/2));
},1);
(async()=>{
 const {browser,page,errors,setup,parts,field}=await openKitchen();
 try{
  if(!process.argv.includes('--benchmark-only')){
   for(const axis of ['x','y','z'])for(const sign of [-1,1]){
    const dimension={x:'w',y:'h',z:'d'}[axis],start=axis==='y'?510:10;
    const p=part('custom101',{[axis]:start,[dimension]:40}),o=part('custom102');
    await setup([p,o]);
    let previous=volume(p,o);
    for(const distance of [20,50,100]){
     const nextCenter=start+sign*distance,offset=axis==='y'?0:1500;
     await field('part'+axis.toUpperCase(),nextCenter-p[dimension]/2+offset);
     const next=(await parts())[0];assert.equal(next[axis],nextCenter);
     assert.ok(volume(next,o)<=previous);previous=volume(next,o);
    }
    assert.equal(previous,0);
   }
   const overlap=[part('custom101',{x:10,w:40}),part('custom102',{y:580})];
   await setup(overlap);
   const point=await page.evaluate(()=>window.__test.face('custom101'));
   await page.mouse.move(point.x,point.y);await page.mouse.down();
   await page.mouse.move(point.x-7,point.y);await page.mouse.move(point.x-150,point.y);await page.mouse.up();
   const moved=(await parts())[0];assert.ok(moved.x<10);assert.ok(volume(moved,overlap[1])<=volume(overlap[0],overlap[1]));
   console.log('PASS overlap escape on X/Y/Z in both directions, plus actual pointer escape');

   await setup([part('custom101',{x:-500}),part('custom102',{x:-300}),part('custom103',{x:0})]);
   await page.evaluate(()=>{window.__test.selectKeys(['custom101','custom102']);window.__test.createAssembly();window.__test.selectAll();window.__test.createAssembly();window.__test.createAssembly()});
   const initial=await parts();
   assert.equal(initial[0].assemblyStack.length,3);assert.equal(initial[2].assemblyStack.length,2);
   assert.equal(initial[0].assemblyStack[0],null);assert.equal(initial[2].assemblyStack[0],null);
   await page.evaluate(()=>window.__test.duplicateCustom());
   const copied=await parts();assert.deepEqual(copied.slice(0,3),initial);
   assert.equal(copied[3].assemblyStack[0],null);assert.equal(copied[5].assemblyStack[0],null);
   // Exercise the actual serializer, JSON/localStorage and restore adapter.
   await page.evaluate(()=>localStorage.setItem('__kitchenReviewSnapshot',JSON.stringify(window.__test.snapshotParts())));
   await setup([]);
   await page.evaluate(()=>{window.__test.restoreParts(JSON.parse(localStorage.getItem('__kitchenReviewSnapshot')));window.__test.build()});
   const loaded=await parts();
   for(let i=0;i<loaded.length;i++)for(const k of ['x','y','z','w','h','d'])assert.equal(loaded[i][k],copied[i][k]);
   const ids=items=>new Set(items.flatMap(p=>[p.assembly,...(p.assemblyStack||[])].filter(Boolean)));
   const sourceIds=ids(loaded.slice(0,3)),copyIds=ids(loaded.slice(3));
   for(const id of sourceIds)assert.ok(!copyIds.has(id));
   const original=loaded.slice(0,3);
   const ungroupCopy=()=>page.evaluate(()=>{const p=window.__test.parts()[3];window.__test.ungroupAssembly(p.assembly)});
   await ungroupCopy();let current=await parts();
   assert.deepEqual(current.slice(0,3),original);
   assert.equal(current[3].assembly,current[5].assembly);
   assert.equal(current[3].assemblyStack.length,2);assert.deepEqual(current[5].assemblyStack,[null]);
   await ungroupCopy();current=await parts();
   assert.equal(current[3].assembly,current[4].assembly);assert.ok(!current[5].assembly);
   assert.deepEqual(current[3].assemblyStack,[null]);assert.ok(!current[5].assemblyStack);
   await ungroupCopy();current=await parts();
   current.slice(3).forEach(p=>{assert.ok(!p.assembly);assert.ok(!p.assemblyStack)});
   assert.deepEqual(current.slice(0,3),original);
   // Deletion can leave a group with one member; duplicating it must retain levels.
   await setup([part('custom101',{assembly:'outer',assemblyStack:[null,'inner','middle']})]);
   await page.evaluate(()=>window.__test.duplicateCustom());
   current=await parts();assert.ok(current[1].assembly);assert.equal(current[1].assemblyStack.length,3);
   for(let level=0;level<4;level++)await page.evaluate(()=>window.__test.ungroupAssembly(window.__test.parts()[1].assembly));
   assert.ok(!(await parts())[1].assembly);assert.ok(!(await parts())[1].assemblyStack);
   console.log('PASS mixed-depth null stacks: group, copy, JSON/localStorage reload, isolated IDs, sequential ungroup and single-member groups');
  }

  const {manyPartCabinet,largeRoom}=await import('./fixtures.mjs');
  await page.evaluate(room=>window.__test.room(room),largeRoom);
  const counts=(process.env.BENCH_COUNTS||'5,50,100,200').split(',').map(Number),runs=Number(process.env.BENCH_RUNS||3),results=[];
  const cases=counts.map(count=>({count,partition:false}));
  if(!process.env.KITCHEN_GEOMETRY_FILE)cases.push({count:100,partition:true});
  for(const {count,partition} of cases){
   const samples=[];
   for(let run=0;run<runs;run++){
    const fixture=manyPartCabinet(count);
    if(partition)fixture.push({...fixture[0],key:'partition',x:-1750});
    await setup(fixture);
    const sample=await page.evaluate(async()=>{
     await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
     const tasks=[],observer=new PerformanceObserver(list=>tasks.push(...list.getEntries()));
     observer.observe({type:'longtask'});
     let probeMs;
     const start=performance.now(),probe=new Promise(resolve=>setTimeout(()=>{probeMs=performance.now()-start;resolve()},0));
     const input=document.getElementById('partW');input.value='4000';
     input.dispatchEvent(new Event('change',{bubbles:true}));
     const handlerMs=performance.now()-start;
     await probe;
     await new Promise(requestAnimationFrame);
     const nextFrameMs=performance.now()-start;
     await new Promise(resolve=>setTimeout(resolve,50));
     tasks.push(...observer.takeRecords());observer.disconnect();
     const relevant=tasks.filter(task=>task.startTime<=start+nextFrameMs&&task.startTime+task.duration>=start);
     return {handlerMs,probeMs,nextFrameMs,longTasks:relevant.map(t=>t.duration),width:Number(input.value)};
    });
    assert.equal(sample.width,4000);
    if(!process.env.KITCHEN_GEOMETRY_FILE){
     assert.ok(sample.handlerMs<250,`resize blocked the main thread: ${sample.handlerMs} ms`);
     assert.ok(sample.probeMs<500,`event-loop timer delayed: ${sample.probeMs} ms`);
    }
    samples.push(sample);
   }
   const median=key=>+samples.map(s=>s[key]).sort((a,b)=>a-b)[Math.floor(samples.length/2)].toFixed(2);
   results.push({parts:count+(partition?1:0),partition,runs,handlerMedianMs:median('handlerMs'),timerMedianMs:median('probeMs'),nextFrameMedianMs:median('nextFrameMs'),samples});
   console.log('BROWSER RESIZE',JSON.stringify(results.at(-1)));
  }
  const report={browser:browser.version(),viewport:{width:1400,height:1000},renderer:'Chromium headless, SwiftShader',from:600,to:4000,room:largeRoom,results};
  if(process.env.BROWSER_BENCH_OUTPUT)fs.writeFileSync(process.env.BROWSER_BENCH_OUTPUT,JSON.stringify(report,null,2)+'\n');
  assert.deepEqual(errors,[]);
  console.log('PASS large resize handler, event-loop timer and next-frame measurements; Firebase isolated');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
