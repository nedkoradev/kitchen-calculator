// Pure model geometry, shared by numeric edits and pointer gestures. Millimetres.
export const axes=['x','y','z'];
export const dimensions={x:'w',y:'h',z:'d'};
const EPS=1e-7;
const copy=parts=>parts.map(p=>({...p}));
export function bounds(parts,axis){
 const d=dimensions[axis];
 return {min:Math.min(...parts.map(p=>p[axis]-p[d]/2)),max:Math.max(...parts.map(p=>p[axis]+p[d]/2))};
}
function face(p,axis,sign){return p[axis]+sign*p[dimensions[axis]]/2}
function intersects(a,b){return axes.every(k=>face(a,k,1)>face(b,k,-1)+EPS&&face(b,k,1)>face(a,k,-1)+EPS)}

// Continuous AABB test: every face is linear over the transition. Testing only
// the destination (or binary searching its validity) can miss thin obstacles.
function firstContact(a,next,b,bNext=b){
 if(intersects(a,b)){
  // An existing intersection may be released, but cannot be deepened along
  // any axis. Use distance to separation, including contained/coincident boxes.
  for(const k of axes){
   const d=dimensions[k],sep=a[k]-b[k],ds=next[k]-bNext[k]-sep;
   const dr=(next[d]+bNext[d]-a[d]-b[d])/2;
   if(dr-(Math.abs(sep)<EPS?Math.abs(ds):Math.sign(sep)*ds)>EPS)return 0;
  }
  return 1;
 }
 let enter=0,leave=1;
 for(const k of axes)for(const [p,q,pNext,qNext] of [[a,b,next,bNext],[b,a,bNext,next]]){
  const gap=face(p,k,1)-face(q,k,-1);
  const velocity=face(pNext,k,1)-face(qNext,k,-1)-gap;
  if(Math.abs(velocity)<EPS){if(gap<=EPS)return 1;continue}
  const t=-gap/velocity;
  if(velocity>0)enter=Math.max(enter,t);else leave=Math.min(leave,t);
 }
 return enter<leave-EPS&&leave>EPS&&enter<1?Math.max(0,enter):1;
}
function fraction(before,after,obstacles,room){
 let result=1;
 for(let i=0;i<before.length;i++){
  const p=before[i],q=after[i];
  for(const k of axes){
   const d=dimensions[k],lo=k==='y'?0:-room[d]/2,hi=k==='y'?room.h:room[d]/2;
   for(const [start,end,limit] of [[-face(p,k,-1),-face(q,k,-1),-lo],[face(p,k,1),face(q,k,1),hi]]){
    // Imported out-of-room parts can move back in without jumping on selection.
    const bound=Math.max(start,limit);
    if(end>bound+EPS)result=Math.min(result,Math.max(0,(bound-start)/(end-start)));
   }
  }
  for(const obstacle of obstacles)result=Math.min(result,firstContact(p,q,obstacle));
  for(let j=0;j<i;j++)result=Math.min(result,firstContact(p,q,before[j],after[j]));
 }
 return result;
}
export function translate(parts,obstacles,room,requested){
 let result=copy(parts);
 // Resolve each axis identically for groups and single parts, allowing sliding.
 for(const axis of axes){
  const delta=requested[axis]||0;
  if(!Number.isFinite(delta)||Math.abs(delta)<EPS)continue;
  const target=result.map(p=>({...p,[axis]:p[axis]+Math.round(delta*2)/2}));
  const t=fraction(result,target,obstacles,room);
  result=target.map((p,i)=>{
   const value=result[i][axis]+(p[axis]-result[i][axis])*t,half=Math.round(value*2)/2;
   return {...p,[axis]:Math.abs(value-half)<EPS?half:value};
  });
 }
 return result;
}
function preservesContacts(before,after,axis){
 const others=axes.filter(k=>k!==axis);
 for(let i=0;i<before.length;i++)for(let j=0;j<i;j++){
  const a=before[i],b=before[j];
  if(!others.every(k=>face(a,k,1)>face(b,k,-1)+EPS&&face(b,k,1)>face(a,k,-1)+EPS))continue;
  const overlap=Math.min(face(a,axis,1),face(b,axis,1))-Math.max(face(a,axis,-1),face(b,axis,-1));
  if(overlap>EPS){
   const nextOverlap=Math.min(face(after[i],axis,1),face(after[j],axis,1))-Math.max(face(after[i],axis,-1),face(after[j],axis,-1));
   if(nextOverlap<overlap-EPS)return false;
  }
  for(const sign of [-1,1])if(Math.abs(face(a,axis,sign)-face(b,axis,-sign))<EPS){
   if(Math.abs(face(after[i],axis,sign)-face(after[j],axis,-sign))>EPS)return false;
  }
 }
 return true;
}
export function resize(parts,obstacles,room,dim,wanted){
 const axis={w:'x',h:'y',d:'z'}[dim];
 if(!axis||!Number.isFinite(wanted)||wanted<=0||!parts.length)return copy(parts);
 const original=copy(parts),b=bounds(parts,axis),oldSize=b.max-b.min;
 const limit=room[dim];
 const target=Math.max(1,Math.min(Math.round(wanted),Math.max(Math.round(oldSize),Math.floor(limit))));
 if(Math.abs(target-oldSize)<EPS)return original;
 let result=original;
 const direction=Math.sign(target-oldSize);
 // One-mm size steps retain integer dimensions even for piecewise cabinet
 // rules. Every step is swept continuously; there is no spatial sampling gap.
 let size=direction>0?Math.floor(oldSize)+1:Math.ceil(oldSize)-1;
 for(;direction*(target-size)>=0;size+=direction){
  const candidate=copy(original);
  if(parts.length===1){
   if(parts[0].locks?.[dim])return original;
   candidate[0][dim]=size;candidate[0][axis]=b.min+size/2;
  }else if(!resizeStructure(candidate,dim,size))break;
  if(candidate.some((p,i)=>!Number.isInteger(p[dim])||p[dim]<1||(p.locks?.[dim]&&p[dim]!==original[i][dim])))break;
  if(!preservesContacts(original,candidate,axis)||fraction(result,candidate,obstacles,room)<1-EPS)break;
  result=candidate;
 }
 return result;
}
// Resize nested cabinets as units before applying each cabinet's own rules.
// The stack describes saved grouping levels; geometry edits never mutate it.
function resizeStructure(members,dim,size,level=Math.max(...members.map(p=>(p.assemblyStack?.length||0)-1))){
 if(level<0){resizeCandidate(members,dim,size);return true}
 if(!members.some(p=>p.assemblyStack?.[level]))return resizeStructure(members,dim,size,level-1);
 const axis={w:'x',h:'y',d:'z'}[dim],children=new Map();
 for(const p of members){
  const id=p.assemblyStack?.[level]||p.key;
  if(!children.has(id))children.set(id,[]);
  children.get(id).push(p);
 }
 if(children.size===1)return resizeStructure(members,dim,size,level-1);
 const groups=[...children.values()];
 const units=groups.map((parts,i)=>{
  const unit={key:String(i),locks:parts.length===1?parts[0].locks:undefined};
  for(const k of axes){const b=bounds(parts,k);unit[k]=(b.min+b.max)/2;unit[dimensions[k]]=b.max-b.min}
  return unit;
 });
 resizeCandidate(units,dim,size);
 for(let i=0;i<groups.length;i++){
  const parts=groups[i];
  if(parts.length===1){
   const p=parts[0];
   if(!p.locks?.[dim]){p[axis]+= (units[i][dim]-p[dim])/2;p[dim]=units[i][dim]}
  }else if(!resizeStructure(parts,dim,units[i][dim],level-1))return false;
  const actual=bounds(parts,axis);
  // An incompatible child makes the entire resize inadmissible.
  if(Math.abs(actual.max-actual.min-units[i][dim])>EPS)return false;
  const delta=units[i][axis]-units[i][dim]/2-actual.min;
  for(const p of parts)p[axis]+=delta;
 }
 return true;
}
function resizeCandidate(members,dim,newSize){
 if(!members.length||!Number.isFinite(newSize)||newSize<=0)return;
 const axis={w:'x',h:'y',d:'z'}[dim],extent=bounds(members,axis);
 const oldSize=extent.max-extent.min;
 if(oldSize<=0)return;
 const left=extent.min,right=extent.max,delta=newSize-oldSize;
 const tolerance=2;
 // Vertical cabinet resizing: preserve the thickness and the original
 // top/bottom offsets of worktops, rails and bottoms. Side panels grow.
 if(dim==='h'){
  for(const p of members){
   const a=p.y-p.h/2,b=p.y+p.h/2;
   const isHorizontal=p.h<=100&&p.w>p.h*2&&p.d>p.h*1.2;
   if(isHorizontal||p.locks?.h){
    const topGap=right-b,bottomGap=a-left;
    if(topGap<bottomGap)p.y+=delta;
    continue;
   }
   const bottomGap=a-left;
   p.h=Math.max(1,Math.round(p.h+delta));
   p.y=left+bottomGap+p.h/2;
  }
  return;
 }
 // End walls with locked thickness remain rigid. The usable opening,
 // rather than the thickness of the walls, changes when the cabinet grows.
 const locked=members.filter(p=>p.locks?.[dim]);
 const leftPanels=locked.filter(p=>Math.abs(p[axis]-p[dim]/2-left)<tolerance);
 const rightPanels=locked.filter(p=>Math.abs(p[axis]+p[dim]/2-right)<tolerance);
 const leftInset=leftPanels.length?Math.max(...leftPanels.map(p=>p[dim])):0;
 const rightInset=rightPanels.length?Math.max(...rightPanels.map(p=>p[dim])):0;
 const oldInner=oldSize-leftInset-rightInset,newInner=newSize-leftInset-rightInset;
 if(newInner<=0||oldInner<=0)return;
 const innerLeft=left+leftInset,innerRight=right-rightInset;
 const mapFace=value=>{
  if(value<=innerLeft+tolerance&&leftInset>0)return value;
  if(value>=innerRight-tolerance&&rightInset>0)return value+delta;
  return innerLeft+(value-innerLeft)*newInner/oldInner;
 };
 for(const p of members){
  const a=p[axis]-p[dim]/2,b=p[axis]+p[dim]/2;
  if(p.locks?.[dim]){
   if(leftPanels.includes(p)||rightPanels.includes(p)){
    if(rightPanels.includes(p)&&!leftPanels.includes(p))p[axis]+=delta;
    continue;
   }
   const distanceLeft=a-left,distanceRight=right-b;
   if(distanceRight<distanceLeft&&distanceRight<=Math.max(30,p[dim]*2))p[axis]+=delta;
   else if(distanceLeft>Math.max(30,p[dim]*2))p[axis]+=Math.round(mapFace(p[axis])-p[axis]);
   continue;
  }
  let na=mapFace(a),nb=mapFace(b);
  // Preserve the original edge offsets of spanning shelves and bottoms.
  // Never snap outer-to-outer panels inward by 18 mm per side on the
  // first mouse movement. A panel reaching the outside faces remains
  // outside-to-outside; an inset panel remains inset by the same amount.
  if(dim==='w'&&leftInset>0&&rightInset>0){
   const spansOpening=b-a>=oldInner*.65;
   if(spansOpening){
    const offsetLeft=a-left,offsetRight=right-b;
    if(Math.abs(offsetLeft)<=Math.max(40,leftInset*2)&&Math.abs(offsetRight)<=Math.max(40,rightInset*2)){
     na=a;nb=b+delta;
    }
   }
  }
  p[dim]=Math.max(1,Math.round(nb-na));
  p[axis]=a+Math.round(na-a)+p[dim]/2;
 }
}
