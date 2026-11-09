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
  // Use actual intersection length, not distance between centres. A contained
  // interval may slide across the containing interval without increasing overlap.
  // min(upper faces) - max(lower faces) is concave along a linear transition;
  // a non-positive initial right derivative guarantees no later increase.
  for(const k of axes){
   const aHi=face(a,k,1),bHi=face(b,k,1),aLo=face(a,k,-1),bLo=face(b,k,-1);
   const aUp=face(next,k,1)-aHi,bUp=face(bNext,k,1)-bHi;
   const aDown=face(next,k,-1)-aLo,bDown=face(bNext,k,-1)-bLo;
   const upper=aHi<bHi-EPS?aUp:aHi>bHi+EPS?bUp:Math.min(aUp,bUp);
   const lower=aLo>bLo+EPS?aDown:aLo<bLo-EPS?bDown:Math.max(aDown,bDown);
   if(upper-lower>EPS)return 0;
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
// Only pairs sharing the unchanged two axes can collide during this resize.
// Compile once, rather than rediscovering the same separations for every mm.
function resizePlan(parts,obstacles,axis){
 const otherAxes=axes.filter(k=>k!==axis),internal=[],external=[];
 const relevant=(a,b)=>otherAxes.every(k=>face(a,k,1)>face(b,k,-1)+EPS&&face(b,k,1)>face(a,k,-1)+EPS);
 for(let i=0;i<parts.length;i++){
  for(let j=0;j<i;j++)if(relevant(parts[i],parts[j]))internal.push([i,j]);
  for(const b of obstacles)if(relevant(parts[i],b))external.push([i,b]);
 }
 return {axis,internal,external};
}
function fraction(before,after,obstacles,room,plan){
 let result=1;
 for(let i=0;i<before.length;i++){
  const p=before[i],q=after[i];
  for(const k of plan?[plan.axis]:axes){
   const d=dimensions[k],lo=k==='y'?0:-room[d]/2,hi=k==='y'?room.h:room[d]/2;
   for(const [start,end,limit] of [[-face(p,k,-1),-face(q,k,-1),-lo],[face(p,k,1),face(q,k,1),hi]]){
    // Imported out-of-room parts can move back in without jumping on selection.
    const bound=Math.max(start,limit);
    if(end>bound+EPS)result=Math.min(result,Math.max(0,(bound-start)/(end-start)));
   }
  }
  if(!plan){
   for(const obstacle of obstacles)result=Math.min(result,firstContact(p,q,obstacle));
   for(let j=0;j<i;j++)result=Math.min(result,firstContact(p,q,before[j],after[j]));
  }
 }
 if(plan){
  for(const [i,j] of plan.internal)result=Math.min(result,firstContact(before[i],after[i],before[j],after[j]));
  for(const [i,b] of plan.external)result=Math.min(result,firstContact(before[i],after[i],b));
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
function preservesContacts(before,after,axis,pairs){
 for(const [i,j] of pairs){
  const a=before[i],b=before[j];
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
 const plan=resizePlan(original,obstacles,axis),direction=Math.sign(target-oldSize);
 const candidateAt=(size,affineOnly=false)=>{
  const candidate=copy(original);
  if(parts.length===1){
   if(parts[0].locks?.[dim])return null;
   candidate[0][dim]=size;candidate[0][axis]=b.min+size/2;
  }else if(!resizeStructure(candidate,dim,size,undefined,affineOnly))return null;
  if(candidate.some((p,i)=>!Number.isInteger(p[dim])||p[dim]<1||(p.locks?.[dim]&&p[dim]!==original[i][dim])))return null;
  return candidate;
 };
 // Certify that every face has an integral, constant slope per mm of requested
 // size. Then the whole operation is one exact swept transition, including all
 // intermediate positions. Rounded interior mappings use the fallback below.
 const affine=Number.isInteger(oldSize)?candidateAt(target,true):null;
 if(affine&&preservesContacts(original,affine,axis,plan.internal)){
  const t=fraction(original,affine,obstacles,room,plan);
  const steps=Math.floor(Math.abs(target-oldSize)*t+EPS);
  return steps?candidateAt(oldSize+direction*steps):original;
 }
 // For a flat growing cabinet, rounded faces stay within 2 mm of the line
 // joining their exact endpoints (two rounding errors). Prove every pair stays
 // separated, or a rigid interval remains contained. This bypasses iteration
 // for ordinary cabinets with sliding locked interior partitions as well.
 if(target>oldSize&&Number.isInteger(oldSize)&&!original.every(p=>p.locks?.[dim])&&!original.some(p=>p.assemblyStack?.some(Boolean))){
  const rounded=copy(original),affineKeys=new Set(original.map(p=>p.key));
  if(resizeCandidate(rounded,dim,target,false,affineKeys)&&rounded.every(p=>Number.isInteger(p[dim])&&p[dim]>0)&&
    safeRoundedGrowth(original,rounded,room,plan,affineKeys))return rounded;
 }
 let result=original;
 // Piecewise/rounded mappings retain swept one-mm steps. Pair filtering keeps
 // unrelated shelves out of the inner loop, without skipping thin obstacles.
 let size=direction>0?Math.floor(oldSize)+1:Math.ceil(oldSize)-1;
 for(;direction*(target-size)>=0;size+=direction){
  const candidate=candidateAt(size);
  if(!candidate||!preservesContacts(original,candidate,axis,plan.internal)||fraction(result,candidate,obstacles,room,plan)<1-EPS)break;
  result=candidate;
 }
 return result;
}
// A conservative enclosure certificate: no spatial sampling or endpoint-only
// collision test. Non-affine cases close to an obstacle retain the swept fallback.
function safeRoundedGrowth(before,after,room,plan,affineKeys){
 const axis=plan.axis,dim=dimensions[axis];
 const error=i=>affineKeys.has(before[i].key)?0:2;
 const separated=(a,b,an,bn,margin)=>
  (face(b,axis,-1)-face(a,axis,1)>margin+EPS&&face(bn,axis,-1)-face(an,axis,1)>margin+EPS)||
  (face(a,axis,-1)-face(b,axis,1)>margin+EPS&&face(an,axis,-1)-face(bn,axis,1)>margin+EPS);
 const containsRigid=(outer,inner,outerNext,innerNext,margin)=>inner[dim]===innerNext[dim]&&
  [face(inner,axis,-1)-face(outer,axis,-1),face(outer,axis,1)-face(inner,axis,1),
   face(innerNext,axis,-1)-face(outerNext,axis,-1),face(outerNext,axis,1)-face(innerNext,axis,1)].every(gap=>gap>margin+EPS);
 const pairSafe=(a,b,an,bn,margin)=>separated(a,b,an,bn,margin)||containsRigid(a,b,an,bn,margin)||containsRigid(b,a,bn,an,margin);
 for(let i=0;i<before.length;i++){
  const lo=axis==='y'?0:-room[dim]/2,hi=axis==='y'?room.h:room[dim]/2;
  if(error(i)){
   if([before[i],after[i]].some(p=>face(p,axis,-1)<lo+2||face(p,axis,1)>hi-2))return false;
  }else if(fraction([before[i]],[after[i]],[],room)<1-EPS)return false;
 }
 for(const [i,j] of plan.internal){
  const margin=error(i)+error(j);
  if(margin){if(!pairSafe(before[i],before[j],after[i],after[j],margin))return false}
  else if(!preservesContacts(before,after,axis,[[i,j]])||firstContact(before[i],after[i],before[j],after[j])<1-EPS)return false;
 }
 for(const [i,b] of plan.external){
  if(error(i)){if(!pairSafe(before[i],b,after[i],b,error(i)))return false}
  else if(firstContact(before[i],after[i],b)<1-EPS)return false;
 }
 return true;
}
// Locked sizes make each connected profile rigid, not the free space between
// separate profiles. Derive components from actual contacts, including library
// groups that were flattened or wrapped in additional assembly levels.
function rigidComponents(parts){
 const groups=[];
 const touches=(a,b)=>axes.every(axis=>face(a,axis,1)>=face(b,axis,-1)-EPS&&face(b,axis,1)>=face(a,axis,-1)-EPS);
 for(const p of parts){
  const connected=[];
  for(let i=0;i<groups.length;i++)if(groups[i].some(q=>touches(p,q)))connected.push(i);
  if(!connected.length){groups.push([p]);continue}
  const first=groups[connected[0]];first.push(p);
  for(let i=connected.length-1;i>0;i--)first.push(...groups.splice(connected[i],1)[0]);
 }
 return groups;
}
function resizeRigidSpacing(members,dim,size,affineOnly){
 const axis={w:'x',h:'y',d:'z'}[dim];
 const groups=rigidComponents(members).map(parts=>({parts,...bounds(parts,axis)})).sort((a,b)=>a.min-b.min);
 if(groups.length<2)return false;
 // Overlapping envelopes have no unambiguous gap along this axis. Keep them
 // rigid rather than detach a joined construction or squeeze parts through it.
 for(let i=1;i<groups.length;i++)if(groups[i].min<groups[i-1].max-EPS)return false;
 const originalSize=groups.at(-1).max-groups[0].min;
 const widths=groups.reduce((total,g)=>total+g.max-g.min,0),gap=originalSize-widths;
 if(gap<=EPS||size<widths-EPS)return false;
 let precedingWidth=0;
 for(let i=0;i<groups.length;i++){
  const g=groups[i],gapBefore=g.min-groups[0].min-precedingWidth,slope=gapBefore/gap;
  if(affineOnly&&Math.abs(slope-Math.round(slope))>EPS)return false;
  const shift=i===groups.length-1?size-originalSize:Math.round(slope*(size-originalSize));
  for(const p of g.parts)p[axis]+=shift;
  precedingWidth+=g.max-g.min;
 }
 return true;
}
// Resize nested cabinets as units before applying each cabinet's own rules.
// The stack describes saved grouping levels; geometry edits never mutate it.
function resizeStructure(members,dim,size,stacks=members.map(p=>p.assemblyStack||[]),affineOnly=false){
 const extent=bounds(members,{w:'x',h:'y',d:'z'}[dim]);
 if(Math.abs(extent.max-extent.min-size)<EPS)return true;
 if(members.every(p=>p.locks?.[dim]))return resizeRigidSpacing(members,dim,size,affineOnly);
 if(!stacks.some(stack=>stack.at(-1)))return resizeCandidate(members,dim,size,affineOnly);
 const axis={w:'x',h:'y',d:'z'}[dim],children=new Map();
 for(let i=0;i<members.length;i++){
  const id=stacks[i].at(-1),key=id?'assembly:'+id:'part:'+i;
  if(!children.has(key))children.set(key,{parts:[],stacks:[]});
  children.get(key).parts.push(members[i]);children.get(key).stacks.push(stacks[i].slice(0,-1));
 }
 const groups=[...children.values()];
 if(groups.length===1)return resizeStructure(members,dim,size,groups[0].stacks,affineOnly);
 // An attached shelf may have joined a pre-grouped cabinet later. If child
 // envelopes overlap and their physical parts are joined along this axis,
 // resize that connected construction together, retaining its saved history.
 const otherAxes=axes.filter(k=>k!==axis);
 const joined=(a,b)=>otherAxes.every(k=>face(a,k,1)>face(b,k,-1)+EPS&&face(b,k,1)>face(a,k,-1)+EPS)&&
  (Math.abs(face(a,axis,1)-face(b,axis,-1))<EPS||Math.abs(face(b,axis,1)-face(a,axis,-1))<EPS);
 for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
  const a=bounds(groups[i].parts,axis),b=bounds(groups[j].parts,axis);
  if(Math.min(a.max,b.max)-Math.max(a.min,b.min)<=EPS)continue;
  if(!groups[i].parts.some(p=>groups[j].parts.some(q=>joined(p,q))))continue;
  groups[i].parts.push(...groups[j].parts);groups[i].stacks=groups[i].parts.map(()=>[]);
  groups.splice(j,1);i=-1;break;
 }
 if(groups.length===1)return resizeStructure(members,dim,size,groups[0].stacks,affineOnly);
 const units=groups.map(({parts},i)=>{
  const unit={key:String(i),locks:parts.length===1?parts[0].locks:{[dim]:parts.every(p=>p.locks?.[dim])&&rigidComponents(parts).length===1}};
  for(const k of axes){const b=bounds(parts,k);unit[k]=(b.min+b.max)/2;unit[dimensions[k]]=b.max-b.min}
  return unit;
 });
 if(!resizeCandidate(units,dim,size,affineOnly))return false;
 for(let i=0;i<groups.length;i++){
  const {parts,stacks:childStacks}=groups[i];
  if(parts.length===1){
   const p=parts[0];
   if(!p.locks?.[dim]){p[axis]+= (units[i][dim]-p[dim])/2;p[dim]=units[i][dim]}
  }else if(!resizeStructure(parts,dim,units[i][dim],childStacks,affineOnly))return false;
  const actual=bounds(parts,axis);
  // An incompatible child makes the entire resize inadmissible.
  if(Math.abs(actual.max-actual.min-units[i][dim])>EPS)return false;
  const delta=units[i][axis]-units[i][dim]/2-actual.min;
  for(const p of parts)p[axis]+=delta;
 }
 return true;
}
function resizeCandidate(members,dim,newSize,affineOnly=false,affineKeys){
 if(!members.length||!Number.isFinite(newSize)||newSize<=0)return;
 const axis={w:'x',h:'y',d:'z'}[dim],extent=bounds(members,axis);
 const oldSize=extent.max-extent.min;
 if(oldSize<=0)return false;
 if(affineOnly&&!Number.isInteger(oldSize))return false;
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
   if(p.h+delta<1){affineKeys?.delete(p.key);if(affineOnly)return false}
   p.h=Math.max(1,Math.round(p.h+delta));
   p.y=left+bottomGap+p.h/2;
  }
  return true;
 }
 // End walls with locked thickness remain rigid. The usable opening,
 // rather than the thickness of the walls, changes when the cabinet grows.
 const locked=members.filter(p=>p.locks?.[dim]);
 const leftPanels=locked.filter(p=>Math.abs(p[axis]-p[dim]/2-left)<tolerance);
 const rightPanels=locked.filter(p=>Math.abs(p[axis]+p[dim]/2-right)<tolerance);
 const leftInset=leftPanels.length?Math.max(...leftPanels.map(p=>p[dim])):0;
 const rightInset=rightPanels.length?Math.max(...rightPanels.map(p=>p[dim])):0;
 const oldInner=oldSize-leftInset-rightInset,newInner=newSize-leftInset-rightInset;
 if(newInner<=0||oldInner<=0)return false;
 const innerLeft=left+leftInset,innerRight=right-rightInset;
 const mapFace=value=>{
  if(value<=innerLeft+tolerance&&leftInset>0)return value;
  if(value>=innerRight-tolerance&&rightInset>0)return value+delta;
  return innerLeft+(value-innerLeft)*newInner/oldInner;
 };
 const slope=value=>{
  if(value<=innerLeft+tolerance&&leftInset>0)return 0;
  if(value>=innerRight-tolerance&&rightInset>0)return 1;
  return (value-innerLeft)/oldInner;
 };
 const integral=Number.isInteger,lockedFaces=[];
 // Move rigid panels first. Attached shelf endpoints must follow their actual
 // faces, rather than independently scaling through the panel's thickness.
 for(const p of locked){
  const a=face(p,axis,-1),b=face(p,axis,1),center=p[axis];let rate=0;
  if(leftPanels.includes(p)||rightPanels.includes(p)){
   if(rightPanels.includes(p)&&!leftPanels.includes(p)){p[axis]+=delta;rate=1}
  }else{
   const distanceLeft=a-left,distanceRight=right-b;
   if(distanceRight<distanceLeft&&distanceRight<=Math.max(30,p[dim]*2)){p[axis]+=delta;rate=1}
   else if(distanceLeft>Math.max(30,p[dim]*2)){
    rate=slope(center);
    if(!integral(rate)){affineKeys?.delete(p.key);if(affineOnly)return false}
    p[axis]+=Math.round(mapFace(center)-center);
   }
  }
  lockedFaces.push({p,a,b,shift:p[axis]-center,rate});
 }
 const otherAxes=axes.filter(k=>k!==axis);
 const attachedFace=(p,value,sign)=>{
  const matches=lockedFaces.filter(q=>Math.abs(value-(sign<0?q.b:q.a))<EPS&&
   otherAxes.every(k=>face(p,k,1)>face(q.p,k,-1)+EPS&&face(q.p,k,1)>face(p,k,-1)+EPS));
  if(!matches.length)return undefined;
  if(matches.some(q=>Math.abs(q.shift-matches[0].shift)>EPS))return null;
  return {value:value+matches[0].shift,rate:matches[0].rate};
 };
 for(const p of members){
  if(p.locks?.[dim])continue;
  const a=face(p,axis,-1),b=face(p,axis,1);
  let na=mapFace(a),nb=mapFace(b),sa=slope(a),sb=slope(b);
  // Preserve the original edge offsets of spanning shelves and bottoms.
  // Never snap outer-to-outer panels inward by 18 mm per side on the
  // first mouse movement. A panel reaching the outside faces remains
  // outside-to-outside; an inset panel remains inset by the same amount.
  if(dim==='w'&&leftInset>0&&rightInset>0){
   const spansOpening=b-a>=oldInner*.65;
   if(spansOpening){
    const offsetLeft=a-left,offsetRight=right-b;
    if(Math.abs(offsetLeft)<=Math.max(40,leftInset*2)&&Math.abs(offsetRight)<=Math.max(40,rightInset*2)){
     na=a;nb=b+delta;sa=0;sb=1;
    }
   }
  }
  const attachedLeft=attachedFace(p,a,-1),attachedRight=attachedFace(p,b,1);
  if(attachedLeft===null||attachedRight===null)return false;
  if(attachedLeft){na=attachedLeft.value;sa=attachedLeft.rate}
  if(attachedRight){nb=attachedRight.value;sb=attachedRight.rate}
  if(!integral(sa)||!integral(sb)||nb-na<1){affineKeys?.delete(p.key);if(affineOnly)return false}
  p[dim]=Math.max(1,Math.round(nb-na));
  p[axis]=a+Math.round(na-a)+p[dim]/2;
 }
 return true;
}
