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
  return {id,center,bounds,width:span(wide),height:span(bounds.y),widthAxis,depthAxis,frontSign,front,bottom:bounds.y.min,top:bounds.y.max,wide,
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
// Share height only along a connected row with the same bottom AND top.
// Width labels retain the individual cabinet identity and full height in a title.
export function cabinetHeightGroups(measurements){
 const chains=cabinetWidthChains(measurements),groups=[];
 for(const m of [...measurements].sort((a,b)=>a.wide.min-b.wide.min)){
  const group=groups.find(g=>chains.get(g.members[0].id).id===chains.get(m.id).id&&Math.abs(g.members[0].bottom-m.bottom)<1&&Math.abs(g.members[0].top-m.top)<1&&m.wide.min<=Math.max(...g.members.map(n=>n.wide.max))+2);
  if(group)group.members.push(m);else groups.push({members:[m]});
 }
 return groups.map(({members})=>{
  const first=members.reduce((a,b)=>a.wide.min<b.wide.min?a:b),last=members.reduce((a,b)=>a.wide.max>b.wide.max?a:b);
  const ends=m=>m.heightLines.slice().sort((a,b)=>a[0][m.widthAxis]-b[0][m.widthAxis]);
  return {members,pairs:[ends(first)[0],ends(last)[1]]};
 });
}
const NS='http://www.w3.org/2000/svg';
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points){
 const sorted=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),lower=[],upper=[];
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p)}
 for(const p of sorted.reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p)}
 return lower.slice(0,-1).concat(upper.slice(0,-1));
}
const inside=(p,poly)=>poly.length>2&&poly.every((a,i)=>cross(a,poly[(i+1)%poly.length],p)>=-.01);
const segmentHit=(a,b,c,d)=>{
 const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
 return ab1*ab2<-.01&&cd1*cd2<-.01;
};
const lineHits=(a,b,poly)=>inside(a,poly)||inside(b,poly)||poly.some((p,i)=>segmentHit(a,b,p,poly[(i+1)%poly.length]));
const boxPoly=b=>[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
const polysHit=(a,b)=>a.some(p=>inside(p,b))||b.some(p=>inside(p,a))||a.some((p,i)=>lineHits(p,a[(i+1)%a.length],b));
export function renderCabinetDimensions(svg,measurements,project,width,height,obstacles=[]){
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.replaceChildren();
 const occupied=obstacles.map(boxPoly),drawnLines=[],fragment=document.createDocumentFragment(),chains=cabinetWidthChains(measurements);
 const node=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e};
 const silhouettes=new Map(measurements.map(m=>{
  const b=m.bounds,points=b?['min','max'].flatMap(x=>['min','max'].flatMap(y=>['min','max'].map(z=>project({x:b.x[x],y:b.y[y],z:b.z[z]})))):[...m.widthLine,...m.heightLines.flat()].map(project);
  return [m.id,hull(points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.z>=-1&&p.z<=1))];
 }));
 const furniture=[...silhouettes.values()].filter(p=>p.length>2);
 const heightGroups=cabinetHeightGroups(measurements),heightGroup=new Map(heightGroups.flatMap(g=>g.members.map(m=>[m.id,g.members.map(n=>n.id).join('|')])));
 const jobs=measurements.map(m=>({cabinet:m,members:[m],kind:'width',pairs:[chains.get(m.id).points],originals:[m.widthLine]}));
 for(const group of heightGroups){
  // Both front and back side corners are physical height anchors; the visible
  // exterior side changes as the user orbits the cabinet.
  const backs=group.pairs.map((pair,i)=>{const m=i?group.members.at(-1):group.members[0],back=m.bounds?.[m.depthAxis]?.[m.frontSign>0?'min':'max'];return pair.map(p=>({...p,[m.depthAxis]:back??p[m.depthAxis]}))}),pairs=[...group.pairs,...backs];
  jobs.push({cabinet:group.members[0],members:group.members,kind:'height',pairs,originals:pairs});
 }
 for(const {cabinet,members,kind,pairs,originals} of jobs){
  const value=cabinet[kind];if(value<1)continue;
  const text=Math.round(value)+' мм',labelWidth=text.length*6.5+4,labelHeight=15,candidates=[];
  const silhouette=members.flatMap(m=>silhouettes.get(m.id)||[]),center=project(cabinet.center);
  for(let side=0;side<pairs.length;side++){
   const [a,b]=pairs[side].map(project),original=originals[side].map(project);
   if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||a.z<-1||a.z>1||b.z<-1||b.z>1)continue;
   const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<8)continue;
   let nx=-dy/len,ny=dx/len;const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
   if(nx*(mx-center.x)+ny*(my-center.y)<0){nx=-nx;ny=-ny;}
   // Clear the whole projected silhouette, including the visible side face.
   const clearance=Math.max(0,...silhouette.map(p=>(p.x-mx)*nx+(p.y-my)*ny))+12;
   let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;
   const rad=angle*Math.PI/180,ux=Math.cos(rad),uy=Math.sin(rad);
   for(const extra of [0,12,26,44,68,100,140])for(const t of [.5,.35,.65,.2,.8])for(const labelDistance of [10,0]){
    const offset=clearance+extra,x1=a.x+nx*offset,y1=a.y+ny*offset,x2=b.x+nx*offset,y2=b.y+ny*offset;
    const cx=x1+dx*t+nx*labelDistance,cy=y1+dy*t+ny*labelDistance;
    const poly=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:cx+x*labelWidth/2*ux-y*labelHeight/2*uy,y:cy+x*labelWidth/2*uy+y*labelHeight/2*ux}));
    const start={x:x1,y:y1},end={x:x2,y:y2};
    if(poly.some(p=>p.x<3||p.y<3||p.x>width-3||p.y>height-3)||[start,end].some(p=>p.x<3||p.y<3||p.x>width-3||p.y>height-3))continue;
    if(furniture.some(p=>polysHit(poly,p)||lineHits(start,end,p))||occupied.some(p=>polysHit(poly,p)||lineHits(start,end,p)))continue;
    // Labels may move along a line, but never onto furniture, controls or labels.
    const crossings=drawnLines.filter(([a,b])=>segmentHit(a,b,start,end)||lineHits(a,b,poly)).length;
    candidates.push({original,nx,ny,x1,y1,x2,y2,cx,cy,angle,poly,t,labelDistance,score:(labelDistance===0?2:0)+extra+clearance*.15+Math.abs(t-.5)*30+crossings*1000});
   }
  }
  candidates.sort((a,b)=>a.score-b.score);const c=candidates[0];if(!c)continue;
  occupied.push(c.poly);drawnLines.push([{x:c.x1,y:c.y1},{x:c.x2,y:c.y2}]);
  const ids=members.map(m=>m.id),g=node('g',{'data-cabinet-dimension':cabinet.id,'data-cabinet-ids':JSON.stringify(ids),'data-dimension':kind,'data-value':Math.round(value),'data-height-value':Math.round(cabinet.height),'data-height-group':heightGroup.get(cabinet.id),...(kind==='width'?{'data-dimension-chain':chains.get(cabinet.id).id}:{})},fragment);
  node('title',{},g).textContent=kind==='width'?`широчина ${Math.round(cabinet.width)} мм, височина ${Math.round(cabinet.height)} мм`:`Височина ${text}${ids.length>1?' · '+ids.length+' съседни шкафа':''}`;
  const line=(x1,y1,x2,y2,role)=>node('line',{x1,y1,x2,y2,stroke:'#3988ff','stroke-width':1,'vector-effect':'non-scaling-stroke','data-dimension-line':role},g);
  const {x1,y1,x2,y2,nx,ny}=c;
  line(c.original[0].x,c.original[0].y,x1+nx*3,y1+ny*3,'extension');line(c.original[1].x,c.original[1].y,x2+nx*3,y2+ny*3,'extension');if(c.labelDistance){line(x1,y1,x2,y2,'baseline')}else{const gap=(labelWidth+6)/2/Math.hypot(x2-x1,y2-y1),lo=Math.max(0,c.t-gap),hi=Math.min(1,c.t+gap);line(x1,y1,x1+(x2-x1)*lo,y1+(y2-y1)*lo,'baseline');line(x1+(x2-x1)*hi,y1+(y2-y1)*hi,x2,y2,'baseline')}
  const len=Math.hypot(x2-x1,y2-y1),ux=(x2-x1)/len,uy=(y2-y1)/len,arrow=Math.min(5,len/4);
  for(const [x,y,sign] of [[x1,y1,1],[x2,y2,-1]])node('path',{d:`M ${x} ${y} L ${x+sign*ux*arrow-uy*2} ${y+sign*uy*arrow+ux*2} L ${x+sign*ux*arrow+uy*2} ${y+sign*uy*arrow-ux*2} Z`,fill:'#3988ff','data-dimension-arrow':''},g);
  const label=node('g',{'data-dimension-label':kind,'pointer-events':'auto',transform:`translate(${c.cx} ${c.cy}) rotate(${c.angle})`},g);
  node('text',{'text-anchor':'middle','dominant-baseline':'central','font-family':'Arial, sans-serif','font-size':11,'font-weight':700,fill:'#153b67'},label).textContent=text;
 }
 const order=new Map(measurements.map((m,i)=>[m.id,i]));
 [...fragment.children].sort((a,b)=>order.get(a.dataset.cabinetDimension)-order.get(b.dataset.cabinetDimension)||(a.dataset.dimension==='width'?-1:1)).forEach(g=>svg.append(g));
}
