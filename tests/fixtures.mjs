// A 600-mm cabinet with two locked 18-mm side panels and separated shelves.
// Tall fixtures isolate resize cost without introducing initial shelf overlaps.
export function manyPartCabinet(count=5){
 const height=Math.max(720,(count-4)*24+60),left=-2000;
 const p=(key,x,y,w,h)=>({key,x:left+x,y,z:0,w,h,d:500,locks:w===18?{w:true}:{h:true},assembly:'cab'});
 return [p('left',9,height/2,18,height),p('right',591,height/2,18,height),
  p('bottom',300,9,564,18),p('top',300,height-9,564,18),
  ...Array.from({length:count-4},(_,i)=>p('shelf'+i,300,36+i*24,564,18))];
}
export const largeRoom={w:10000,h:10000,d:10000};

// Two multi-part runner profiles; all physical dimensions are locked.
export function lockedRunners(nested=true){
 const runner=(id,left)=>[
  {key:id+'base',x:left+25,y:101,z:0,w:50,h:2,d:500},
  {key:id+'lip',x:left+49,y:115,z:0,w:2,h:30,d:500}
 ].map(p=>({...p,locks:{w:true,h:true,d:true},assembly:'runners',...(nested?{assemblyStack:[id]}:{})}));
 return [...runner('left',-256),...runner('right',206)];
}

// Existing K1-style cabinet, then an interior side and a shelf, grouped again.
// Reproduces the reported edit without reading a private library document.
export function cabinetWithAddedPanels({nested=true,partitionX=500,shelfSide='left'}={}){
 const common={z:0,d:500,assembly:'outer'},old={...common,assemblyStack:['K1']},added={...common,assemblyStack:[null]};
 const a=shelfSide==='left'?18:partitionX+9,b=shelfSide==='left'?partitionX-9:582;
 const parts=[{...old,key:'left',x:9,y:360,w:18,h:720,locks:{w:true}},
  {...old,key:'right',x:591,y:360,w:18,h:720,locks:{w:true}},
  {...old,key:'bottom',x:300,y:9,w:564,h:18,locks:{h:true}},
  {...old,key:'top',x:300,y:711,w:564,h:18,locks:{h:true}},
  {...added,key:'partition',x:partitionX,y:360,w:18,h:684,locks:{w:true}},
  {...added,key:'added-shelf',x:(a+b)/2,y:200,w:b-a,h:18,locks:{h:true}}];
 return nested?parts:parts.map(({assemblyStack,...part})=>part);
}
