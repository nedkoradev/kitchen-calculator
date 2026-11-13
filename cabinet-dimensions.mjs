// View-only measurements: assembly history is a hierarchy, not a list of cabinets.
const dim={x:'w',y:'h',z:'d'};
const extent=(parts,axis)=>({min:Math.min(...parts.map(p=>p[axis]-p[dim[axis]]/2)),max:Math.max(...parts.map(p=>p[axis]+p[dim[axis]]/2))});
const envelope=parts=>Object.fromEntries(['x','y','z'].map(a=>[a,extent(parts,a)]));
const span=b=>b.max-b.min;
const isTop=(p,labels,finishes)=>finishes[p.key]?.materialType==='worktop'||/(?:^|\s)плот(?:\s|$)/iu.test(labels[p.key]||'');
function carcasses(parts,labels,finishes){
 const frames=[];
 for(const axis of ['x','z']){
  const depth=axis==='x'?'z':'x',side=parts.filter(p=>!/(врата|гръб)/iu.test(labels[p.key]||'')&&finishes[p.key]?.materialType!=='back'&&p.h>=240&&p[dim[axis]]<=80&&p[dim[axis]]<p.h/3&&p[dim[depth]]>=120);
  for(let i=0;i<side.length;i++)for(let j=i+1;j<side.length;j++){
   const a=side[i],b=side[j],low=extent([a,b],'y'),deep=extent([a,b],depth),wide=extent([a,b],axis),size=span(wide);
   if(Math.abs(a[dim[axis]]-b[dim[axis]])>2||Math.abs(a[axis]-b[axis])<120||Math.abs(a[depth]-b[depth])>40||Math.abs(a.y-a.h/2-b.y+b.h/2)>40||Math.abs(a.y+a.h/2-b.y-b.h/2)>60)continue;
   // A pair of doors or legs is not a carcass. Require a connecting cap/shelf/back.
   const support=parts.some(p=>!isTop(p,labels,finishes)&&p!==a&&p!==b&&Math.abs(p[axis]-(wide.min+wide.max)/2)<35&&Math.abs(p[dim[axis]]-size)<=2*Math.max(a[dim[axis]],b[dim[axis]])+8&&p.y>=low.min-40&&p.y<=low.max+40&&Math.abs(p[depth]-(deep.min+deep.max)/2)<=span(deep)/2+30&&((p.h<=80&&p[dim[depth]]>=60)||(p[dim[depth]]<=40&&p.h>=240)));
   if(support)frames.push({axis,depth,wide,low,deep,a,b});
  }
 }
 // Interior bays can have their own sides; keep the enclosing physical carcass.
 return frames.filter((f,i)=>!frames.some((g,j)=>i!==j&&g.axis===f.axis&&g.wide.min<=f.wide.min+.1&&g.wide.max>=f.wide.max-.1&&g.low.min<=f.low.min+40&&g.low.max>=f.low.max-40&&(span(g.wide)>span(f.wide)+1||j<i&&Math.abs(span(g.wide)-span(f.wide))<1)));
}
function fitsFrame(parts,f,labels,finishes){
 const body=parts.filter(p=>!isTop(p,labels,finishes)),b=envelope(body.length?body:parts);
 return b[f.axis].min>=f.wide.min-40&&b[f.axis].max<=f.wide.max+40&&span(b[f.depth])<=span(f.deep)+140&&b.y.min>=f.low.min-600&&b.y.max<=f.low.max+160;
}
function cabinetGroups(parts,labels,finishes,assemblyNames){
 const nodes=new Map(),roots=new Set();
 const get=id=>{if(!nodes.has(id))nodes.set(id,{id,parts:new Set(),children:new Set()});return nodes.get(id)};
 for(const p of parts){
  if(p.appliance)continue;
  const path=[...(p.assemblyStack||[]),p.assembly].filter(Boolean).filter((id,i,all)=>all.indexOf(id)===i);
  if(!path.length)continue;
  path.forEach(id=>get(id).parts.add(p));roots.add(path.at(-1));
  for(let i=1;i<path.length;i++)get(path[i]).children.add(get(path[i-1]));
 }
 const seen=new Set();
 function visit(node){
  if(seen.has(node))return [];seen.add(node);
  const members=[...node.parts],children=[...node.children].flatMap(visit);
  if(children.length>1)return children;
  const frames=carcasses(members,labels,finishes);
  if(frames.length===1&&fitsFrame(members,frames[0],labels,finishes))return [{id:node.id,members,frame:frames[0]}];
  if(children.length)return children;
  // Flattened legacy projects may retain component groups but lose cabinet wrappers.
  // Partition by real connected carcasses instead of measuring the whole kitchen.
  if(frames.length>1)return frames.flatMap((f,i)=>{
   const membersInFrame=members.filter(p=>{
    if(isTop(p,labels,finishes))return p.y-p.h/2>=f.low.max-45&&p.y-p.h/2<=f.low.max+100&&p[f.axis]+p[dim[f.axis]]/2>f.wide.min&&p[f.axis]-p[dim[f.axis]]/2<f.wide.max&&Math.abs(p[f.depth]-(f.deep.min+f.deep.max)/2)<=span(f.deep)/2+50;
    return p[f.axis]-p[dim[f.axis]]/2>=f.wide.min-4&&p[f.axis]+p[dim[f.axis]]/2<=f.wide.max+4&&p.y-p.h/2>=f.low.min-600&&p.y+p.h/2<=f.low.max+50&&Math.abs(p[f.depth]-(f.deep.min+f.deep.max)/2)<=span(f.deep)/2+80;
   });
   return membersInFrame.length>=3?[{id:node.id+':carcass:'+i,members:membersInFrame,frame:f}]:[];
  });
  // Explicit imported cabinet names help open constructions with a single side.
  const name=assemblyNames instanceof Map?assemblyNames.get(node.id):assemblyNames?.[node.id];
  if(name&&members.length>=3&&members.some(p=>p.h>=240)&&members.some(p=>p.h<=80&&p.w>=120&&p.d>=120))return [{id:node.id,members,frame:null}];
  return [];
 }
 const children=new Set([...nodes.values()].flatMap(n=>[...n.children]));
 return [...roots].map(id=>get(id)).filter(n=>!children.has(n)).flatMap(visit);
}
export function cabinetMeasurements(parts,labels={},finishes={},assemblyNames={}){
 return cabinetGroups(parts,labels,finishes,assemblyNames).map(({id,members,frame})=>{
  const bounds=envelope(members);
  // A common worktop may belong to the kitchen wrapper. It changes height
  // only when it actually rests on this cabinet; never borrow its X/Z envelope.
  for(const top of parts){
   if(members.includes(top)||!isTop(top,labels,finishes)||Math.abs(top.y-top.h/2-bounds.y.max)>2)continue;
   const overlap=axis=>Math.max(0,Math.min(bounds[axis].max,top[axis]+top[dim[axis]]/2)-Math.max(bounds[axis].min,top[axis]-top[dim[axis]]/2))/Math.max(1,span(bounds[axis]));
   if(overlap('x')>=.5&&overlap('z')>=.5)bounds.y.max=Math.max(bounds.y.max,top.y+top.h/2);
  }
  const center={x:(bounds.x.min+bounds.x.max)/2,y:(bounds.y.min+bounds.y.max)/2,z:(bounds.z.min+bounds.z.max)/2};
  const named=pattern=>members.find(p=>pattern.test(labels[p.key]||'')),left=named(/лява страница/i),right=named(/дясна страница/i),back=named(/гръб/i)||members.find(p=>finishes[p.key]?.materialType==='back'),door=named(/врата/i);
  let widthAxis=frame?.axis||'x',widthSign=1,frontSign=1;
  if(left&&right){widthAxis=Math.abs(right.x-left.x)>=Math.abs(right.z-left.z)?'x':'z';widthSign=Math.sign(right[widthAxis]-left[widthAxis])||1;frontSign=widthAxis==='x'?widthSign:-widthSign;}
  else if(back||door){const face=back||door,depthAxis=face.w<face.d?'x':'z';widthAxis=depthAxis==='x'?'z':'x';frontSign=(Math.sign(face[depthAxis]-center[depthAxis])||1)*(back?-1:1);widthSign=widthAxis==='x'?frontSign:-frontSign;}
  const depthAxis=widthAxis==='x'?'z':'x',body=members.filter(p=>!isTop(p,labels,finishes)),wide=extent(body.length?body:members,widthAxis),front=frontSign>0?bounds[depthAxis].max:bounds[depthAxis].min;
  // The visual center follows the cabinet, even with a shared worktop overhang.
  center[widthAxis]=(wide.min+wide.max)/2;
  const point=(u,y)=>({[widthAxis]:u,y,[depthAxis]:front}),a=widthSign>0?wide.min:wide.max,b=widthSign>0?wide.max:wide.min;
  return {id,center,width:span(wide),height:span(bounds.y),widthAxis,depthAxis,frontSign,front,bottom:bounds.y.min,top:bounds.y.max,wide,
   widthLine:[point(a,bounds.y.min),point(b,bounds.y.min)],heightLines:[[point(a,bounds.y.min),point(a,bounds.y.max)],[point(b,bounds.y.min),point(b,bounds.y.max)]]};
 });
}
// One baseline per adjacent row and front plane, separately for each L-shaped arm.
export function cabinetWidthChains(measurements){
 const rows=[];
 for(const m of measurements){
  let row=rows.find(r=>r[0].widthAxis===m.widthAxis&&r[0].frontSign===m.frontSign&&Math.abs(r[0].front-m.front)<65&&Math.abs(r[0].bottom-m.bottom)<65);
  if(!row)rows.push(row=[]);row.push(m);
 }
 const lines=new Map();let chain=0;
 for(const row of rows){
  row.sort((a,b)=>a.wide.min-b.wide.min);const runs=[];
  for(const m of row){const run=runs.at(-1);if(!run||m.wide.min>Math.max(...run.map(n=>n.wide.max))+100)runs.push([m]);else run.push(m)}
  for(const run of runs){const y=Math.min(...run.map(m=>m.bottom))-60,front=run[0].frontSign>0?Math.max(...run.map(m=>m.front))+30:Math.min(...run.map(m=>m.front))-30,id='row-'+(++chain);
   for(const m of run)lines.set(m.id,{id,points:m.widthLine.map(p=>({...p,y,[m.depthAxis]:front}))});
  }
 }
 return lines;
}
const NS='http://www.w3.org/2000/svg';
export function renderCabinetDimensions(svg,measurements,project,width,height,obstacles=[]){
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.replaceChildren();
 const occupied=[...obstacles],fragment=document.createDocumentFragment(),chains=cabinetWidthChains(measurements);
 const node=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e};
 const overlaps=(a,b)=>a.x<b.x+b.w+3&&a.x+a.w+3>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;
 for(const cabinet of measurements){
  const center=project(cabinet.center);
  for(const kind of ['width','height']){
   const value=cabinet[kind];if(value<1)continue;
   const text=Math.round(value)+' мм',labelWidth=text.length*6.5+10,labelHeight=19,candidates=[];
   const pairs=kind==='width'?[chains.get(cabinet.id).points]:cabinet.heightLines;
   for(let side=0;side<pairs.length;side++){
    const [a,b]=pairs[side].map(project),original=(kind==='width'?cabinet.widthLine:cabinet.heightLines[side]).map(project);
    if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||a.z<-1||a.z>1||b.z<-1||b.z>1)continue;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<8)continue;
    let nx=-dy/len,ny=dx/len;const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(nx*(mx-center.x)+ny*(my-center.y)<0){nx=-nx;ny=-ny;}
    let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;
    const rad=angle*Math.PI/180,bw=Math.abs(Math.cos(rad))*labelWidth+Math.abs(Math.sin(rad))*labelHeight,bh=Math.abs(Math.sin(rad))*labelWidth+Math.abs(Math.cos(rad))*labelHeight;
    for(const labelOffset of kind==='width'?[0,13,26]:[12,18,24])for(const t of kind==='width'?[.5,.35,.65,.2,.8]:[.5,.38,.62,.26,.74]){
     const offset=kind==='width'?0:labelOffset,cx=a.x+dx*t+nx*labelOffset,cy=a.y+dy*t+ny*labelOffset,box={x:cx-bw/2,y:cy-bh/2,w:bw,h:bh};
     if(box.x<3||box.y<3||box.x+box.w>width-3||box.y+box.h>height-3||obstacles.some(o=>overlaps(box,o)))continue;
     candidates.push({a,b,original,nx,ny,offset,labelOffset,t,cx,cy,angle,box,score:labelOffset+Math.abs(t-.5)*20+occupied.filter(o=>overlaps(box,o)).length*10000});
    }
   }
   candidates.sort((a,b)=>a.score-b.score);const c=candidates[0];if(!c)continue;occupied.push(c.box);
   const g=node('g',{'data-cabinet-dimension':cabinet.id,'data-dimension':kind,'data-value':Math.round(value),...(kind==='width'?{'data-dimension-chain':chains.get(cabinet.id).id}:{})},fragment);
   const line=(x1,y1,x2,y2)=>node('line',{x1,y1,x2,y2,stroke:'#3988ff','stroke-width':1.5,'vector-effect':'non-scaling-stroke'},g);
   const {a,b,nx,ny,offset}=c,x1=a.x+nx*offset,y1=a.y+ny*offset,x2=b.x+nx*offset,y2=b.y+ny*offset;
   if(kind==='width'&&c.labelOffset>0)line(a.x+(b.x-a.x)*c.t,a.y+(b.y-a.y)*c.t,c.cx,c.cy);
   line(c.original[0].x,c.original[0].y,x1+nx*3,y1+ny*3);line(c.original[1].x,c.original[1].y,x2+nx*3,y2+ny*3);line(x1,y1,x2,y2);
   for(const [x,y] of [[x1,y1],[x2,y2]])line(x-nx*3,y-ny*3,x+nx*3,y+ny*3);
   const label=node('g',{'data-dimension-label':kind,transform:`translate(${c.cx} ${c.cy}) rotate(${c.angle})`},g);
   node('rect',{x:-labelWidth/2,y:-labelHeight/2,width:labelWidth,height:labelHeight,rx:4,fill:'#f0f6ff'},label);
   node('text',{'text-anchor':'middle','dominant-baseline':'central','font-family':'Arial, sans-serif','font-size':11,'font-weight':700,fill:'#153b67'},label).textContent=text;
  }
 }
 svg.append(fragment);
}
