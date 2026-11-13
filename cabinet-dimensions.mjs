// View-only dimensions, derived from the live model (including nested cabinets).
const extent=(parts,axis,dim)=>({min:Math.min(...parts.map(p=>p[axis]-p[dim]/2)),max:Math.max(...parts.map(p=>p[axis]+p[dim]/2))});
export function cabinetMeasurements(parts,labels={},finishes={}){
 const groups=new Map();
 for(const p of parts){
  if(p.appliance)continue;
  // The oldest surviving assembly is the cabinet, later levels are compositions.
  const id=[...(p.assemblyStack||[]),p.assembly].find(Boolean);
  if(!id)continue;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(p);
 }
 return [...groups].flatMap(([id,members])=>{
  if(members.length<2)return [];
  const x=extent(members,'x','w'),y=extent(members,'y','h'),z=extent(members,'z','d');
  const center={x:(x.min+x.max)/2,y:(y.min+y.max)/2,z:(z.min+z.max)/2};
  const named=pattern=>members.find(p=>pattern.test(labels[p.key]||''));
  const left=named(/лява страница/i),right=named(/дясна страница/i);
  const back=named(/гръб/i)||members.find(p=>finishes[p.key]?.materialType==='back');
  const door=named(/врата/i);
  let widthAxis='x',widthSign=1,frontSign=1;
  if(left&&right){widthAxis=Math.abs(right.x-left.x)>=Math.abs(right.z-left.z)?'x':'z';widthSign=Math.sign(right[widthAxis]-left[widthAxis])||1;frontSign=widthAxis==='x'?widthSign:-widthSign;}
  else if(back||door){const face=back||door;const depthAxis=face.w<face.d?'x':'z';widthAxis=depthAxis==='x'?'z':'x';frontSign=(Math.sign(face[depthAxis]-center[depthAxis])||1)*(back?-1:1);widthSign=widthAxis==='x'?frontSign:-frontSign;}
  else {
   // Legacy unnamed cabinets: broad vertical faces determine the front plane.
   const face=members.filter(p=>p.h>Math.min(p.w,p.d)*3).sort((a,b)=>b.h*Math.max(b.w,b.d)-a.h*Math.max(a.w,a.d))[0];
   if(face)widthAxis=face.w>=face.d?'x':'z';
  }
  const depthAxis=widthAxis==='x'?'z':'x',depth=depthAxis==='x'?x:z;
  // A worktop overhang does not increase the cabinet's outside width.
  const body=members.filter(p=>finishes[p.key]?.materialType!=='worktop'&&!/^плот(?:\s|$)/iu.test(labels[p.key]||''));
  const widthBounds=extent(body.length?body:members,widthAxis,widthAxis==='x'?'w':'d');
  const front=frontSign>0?depth.max:depth.min;
  const point=(u,v)=>({[widthAxis]:u,y:v,[depthAxis]:front});
  const a=widthSign>0?widthBounds.min:widthBounds.max,b=widthSign>0?widthBounds.max:widthBounds.min;
  return [{id,center,width:widthBounds.max-widthBounds.min,height:y.max-y.min,
   widthLine:[point(a,y.min),point(b,y.min)],heightLines:[[point(a,y.min),point(a,y.max)],[point(b,y.min),point(b,y.max)]]}];
 });
}

const NS='http://www.w3.org/2000/svg';
export function renderCabinetDimensions(svg,measurements,project,width,height,obstacles=[]){
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.replaceChildren();
 const occupied=[...obstacles],fragment=document.createDocumentFragment();
 const node=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e};
 const overlaps=(a,b)=>a.x<b.x+b.w+4&&a.x+a.w+4>b.x&&a.y<b.y+b.h+4&&a.y+a.h+4>b.y;
 for(const cabinet of measurements){
  const center=project(cabinet.center);
  for(const kind of ['width','height']){
   const value=cabinet[kind];if(value<1)continue;
   const text=Math.round(value)+' мм',labelWidth=text.length*7.4+12,labelHeight=22,candidates=[];
   for(const endpoints of kind==='width'?[cabinet.widthLine]:cabinet.heightLines){
    const [a,b]=endpoints.map(project);if(![a.x,a.y,b.x,b.y].every(Number.isFinite)||a.z<-1||a.z>1||b.z<-1||b.z>1)continue;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<8)continue;
    let nx=-dy/len,ny=dx/len;const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    if(nx*(mx-center.x)+ny*(my-center.y)<0){nx=-nx;ny=-ny;}
    let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;
    const rad=angle*Math.PI/180,bw=Math.abs(Math.cos(rad))*labelWidth+Math.abs(Math.sin(rad))*labelHeight,bh=Math.abs(Math.sin(rad))*labelWidth+Math.abs(Math.cos(rad))*labelHeight;
    for(const offset of [20,36,52,68,84,104,128,156,188,224]){
     const cx=mx+nx*offset,cy=my+ny*offset,box={x:cx-bw/2,y:cy-bh/2,w:bw,h:bh};
     if(box.x<3||box.y<3||box.x+box.w>width-3||box.y+box.h>height-3)continue;
     candidates.push({a,b,nx,ny,offset,cx,cy,angle,box,score:offset+occupied.filter(o=>overlaps(box,o)).length*10000});
    }
   }
   candidates.sort((a,b)=>a.score-b.score);const c=candidates[0];if(!c)continue;occupied.push(c.box);
   const g=node('g',{'data-cabinet-dimension':cabinet.id,'data-dimension':kind,'data-value':Math.round(value)},fragment);
   const line=(x1,y1,x2,y2)=>node('line',{x1,y1,x2,y2,stroke:'#3988ff','stroke-width':1.5,'vector-effect':'non-scaling-stroke'},g);
   const {a,b,nx,ny,offset}=c,x1=a.x+nx*offset,y1=a.y+ny*offset,x2=b.x+nx*offset,y2=b.y+ny*offset;
   line(a.x,a.y,x1+nx*3,y1+ny*3);line(b.x,b.y,x2+nx*3,y2+ny*3);line(x1,y1,x2,y2);
   for(const [x,y] of [[x1,y1],[x2,y2]])line(x-nx*3,y-ny*3,x+nx*3,y+ny*3);
   const label=node('g',{'data-dimension-label':kind,transform:`translate(${c.cx} ${c.cy}) rotate(${c.angle})`},g);
   node('rect',{x:-labelWidth/2,y:-labelHeight/2,width:labelWidth,height:labelHeight,rx:4,fill:'#f0f6ff'},label);
   node('text',{'text-anchor':'middle','dominant-baseline':'central','font-family':'Arial, sans-serif','font-size':12,'font-weight':700,fill:'#153b67'},label).textContent=text;
  }
 }
 svg.append(fragment);
}
