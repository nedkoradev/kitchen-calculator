import {axes,dimensions,bounds,resize} from './geometry.mjs';
const EPS=1e-6;
export const dependencyModes={start:'Запази от началото',end:'Следвай края',stretch:'Променяй размера',relative:'Относителна позиция',proportional:'Пропорционален размер и позиция',evenShelf:'Равномерни вътрешни рафтове'};
export function panelThicknessAxis(p){
 const sorted=axes.map(axis=>({axis,size:p[dimensions[axis]]})).sort((a,b)=>a.size-b.size);
 return !p.appliance&&sorted[0].size<=60&&sorted[1].size>=Math.max(80,sorted[0].size*4)?sorted[0].axis:null;
}
function face(p,axis,sign){return p[axis]+sign*p[dimensions[axis]]/2}
const near=(a,b)=>Math.abs(a-b)<EPS;
function interiorOpening(parts,axis){
 const extent=bounds(parts,axis),ends=parts.filter(p=>panelThicknessAxis(p)===axis);
 const lower=ends.filter(p=>near(face(p,axis,-1),extent.min)).map(p=>face(p,axis,1)),upper=ends.filter(p=>near(face(p,axis,1),extent.max)).map(p=>face(p,axis,-1));
 if(!lower.length||!upper.length||lower.some(v=>!near(v,lower[0]))||upper.some(v=>!near(v,upper[0]))||upper[0]<=lower[0])return null;
 return {min:lower[0],max:upper[0]};
}
function cabinetFrame(parts,thickness){
 const extent=bounds(parts,'x'),left=parts.filter(p=>thickness[p.key]==='x'&&near(face(p,'x',-1),extent.min)),right=parts.filter(p=>thickness[p.key]==='x'&&near(face(p,'x',1),extent.max));
 const pairs=left.flatMap(l=>right.filter(r=>l!==r&&['y','z'].every(axis=>near(face(l,axis,-1),face(r,axis,-1))&&near(face(l,axis,1),face(r,axis,1)))).map(r=>({left:l,right:r})));
 if(pairs.length!==1)return null;const frame=pairs[0];
 frame.spans=p=>near(face(p,'x',-1),face(frame.left,'x',1))&&near(face(p,'x',1),face(frame.right,'x',-1))&&['y','z'].every(axis=>face(p,axis,1)>face(frame.left,axis,-1)+EPS&&face(p,axis,-1)<face(frame.left,axis,1)-EPS);
 return frame;
}
export function inferCabinetDependencies(parts){
 const rules=Object.create(null),unknown=[],thickness=Object.fromEntries(parts.map(p=>[p.key,panelThicknessAxis(p)]));
 let histories=parts.map(p=>[...(p.assemblyStack||[])]),nested=false;
 while(histories.some(stack=>stack.length)){if(new Set(histories.map(stack=>stack.at(-1)).filter(Boolean)).size>1)nested=true;histories=histories.map(stack=>stack.slice(0,-1))}
 const frame=!nested?cabinetFrame(parts,thickness):null;
 for(const p of parts)rules[p.key]={};
 for(const axis of axes){
  const dim=dimensions[axis],extent=bounds(parts,axis),near=(a,b)=>Math.abs(a-b)<EPS;
  const ends=parts.filter(p=>thickness[p.key]===axis),starts=[extent.min,...ends.filter(p=>near(p[axis]-p[dim]/2,extent.min)).map(p=>p[axis]+p[dim]/2)],finishes=[extent.max,...ends.filter(p=>near(p[axis]+p[dim]/2,extent.max)).map(p=>p[axis]-p[dim]/2)];
  if(axis==='z'&&frame){starts.push(face(frame.left,'z',-1));finishes.push(face(frame.left,'z',1))}
  for(const p of parts){
   let mode=null;const a=p[axis]-p[dim]/2,b=p[axis]+p[dim]/2,isStart=starts.some(v=>near(a,v)),isEnd=finishes.some(v=>near(b,v));
   if(!nested&&thickness[p.key]){
    if(thickness[p.key]===axis||p.locks?.[dim]||p.appliance){if(isStart&&!isEnd)mode='start';else if(isEnd&&!isStart)mode='end'}
    else if(isStart&&isEnd)mode='stretch';
   }
   rules[p.key][dim]=mode;
  }
 }
 if(frame){
  const depth=frame.left.d;
  for(const p of parts){
   if(!frame.spans(p))continue;
   // A narrow horizontal rail at a construction end keeps its depth, following
   // its actual front/rear attachment rather than stretching like a shelf.
   if(thickness[p.key]==='y'&&['start','end'].includes(rules[p.key].h)&&p.d<=depth*.35&&!rules[p.key].d){
    if(near(face(p,'z',-1),face(frame.left,'z',-1)))rules[p.key].d='start';
    else if(near(face(p,'z',1),face(frame.left,'z',1)))rules[p.key].d='end';
   }
   // Vertical stretchers are attached inside the side panels, unlike fronts
   // outside the carcass; only exact construction-end contacts are accepted.
   if(thickness[p.key]==='z'&&p.h<=frame.left.h*.35&&!rules[p.key].h){
    if(near(face(p,'y',-1),face(frame.left,'y',-1)))rules[p.key].h='start';
    else if(near(face(p,'y',1),face(frame.left,'y',1)))rules[p.key].h='end';
   }
   const frontGap=face(frame.left,'z',1)-face(p,'z',1);
   if(thickness[p.key]==='y'&&!p.locks?.d&&!rules[p.key].d&&p.d>=depth*.65&&near(face(p,'z',-1),face(frame.left,'z',-1))&&frontGap>=0&&frontGap<=2*Math.min(frame.left.w,frame.right.w))rules[p.key].d='stretch';
  }
  const opening=interiorOpening(parts,'y');
  if(opening){
   const shelves=parts.filter(p=>thickness[p.key]==='y'&&frame.spans(p)&&p.d>=depth*.65&&face(p,'y',-1)>opening.min+EPS&&face(p,'y',1)<opening.max-EPS).sort((a,b)=>a.y-b.y);
   const gaps=[];let end=opening.min;for(const p of shelves){gaps.push(face(p,'y',-1)-end);end=face(p,'y',1)}gaps.push(opening.max-end);
   if(shelves.length&&gaps.every(g=>g>=0)&&Math.max(...gaps)-Math.min(...gaps)<=1+EPS)for(const p of shelves)if(!rules[p.key].h)rules[p.key].h='evenShelf';
  }
 }
 for(const p of parts)for(const dim of Object.values(dimensions))if(!rules[p.key][dim])unknown.push({key:p.key,dim});
 return {rules,unknown,thickness,nested};
}
export function unresolvedCabinetDependencies(parts,targets,rules){
 const changed=Object.entries(dimensions).filter(([axis,dim])=>{const extent=bounds(parts,axis);return Math.abs((targets[dim]??(extent.max-extent.min))-(extent.max-extent.min))>EPS}).map(([,dim])=>dim);
 return parts.flatMap(p=>changed.filter(dim=>!Object.hasOwn(dependencyModes,rules[p.key]?.[dim])).map(dim=>({key:p.key,dim})));
}
// Dependency choices are operation-local, never new fields in Firestore.
// All geometry transitions still use resize()'s existing swept collision checks.
export function resizeCabinet(parts,obstacles,room,targets,rules){
 if(parts.length<2)throw Error('Избери цял шкаф или група с поне два детайла.');
 const missing=unresolvedCabinetDependencies(parts,targets,rules);if(missing.length){const error=Error('Някои детайли изискват уточнение.');error.unresolved=missing;throw error}
 const thickness=Object.fromEntries(parts.map(p=>[p.key,panelThicknessAxis(p)]));
 let result=parts.map(p=>({...p}));
 for(const axis of axes){
  const dim=dimensions[axis],extent=bounds(result,axis),oldSize=extent.max-extent.min,wanted=targets[dim]??oldSize;
  if(Math.abs(wanted-oldSize)<EPS)continue;
  if(!Number.isInteger(wanted)||wanted<1||wanted>room[dim])throw Error('Въведи цели размери в границите на стаята.');
  if(!Number.isInteger(oldSize))throw Error('Корпусът е с дробен габарит. Използвай свободното редактиране за корекция преди параметрично оразмеряване.');
  for(const p of result){const mode=rules[p.key]?.[dim];if(!Object.hasOwn(dependencyModes,mode))throw Error('Задай връзката по '+({w:'ширина (X)',h:'височина (Y)',d:'дълбочина (Z)'})[dim]+' за всички детайли.');if((mode==='stretch'||mode==='proportional')&&(thickness[p.key]===axis||p.locks?.[dim]||p.appliance))throw Error('Не може да се променя дебелина или заключен размер.');}
  const shelves=result.filter(p=>rules[p.key][dim]==='evenShelf').sort((a,b)=>a.y-b.y),opening=shelves.length?interiorOpening(result,axis):null;
  if(shelves.length&&(axis!=='y'||!opening||shelves.some(p=>thickness[p.key]!=='y')))throw Error('Няма надежден вътрешен отвор за равномерно разполагане на рафтовете.');
  const next=resize(result,obstacles,room,dim,wanted,(original,size,affineOnly)=>{
   if(affineOnly&&original.some(p=>['relative','proportional','evenShelf'].includes(rules[p.key][dim])))return null;
   const delta=size-oldSize;
   return original.map(p=>{const mode=rules[p.key][dim];if(mode==='evenShelf'){const index=shelves.findIndex(s=>s.key===p.key),used=shelves.reduce((n,s)=>n+s.h,0),before=shelves.slice(0,index).reduce((n,s)=>n+s.h,0),free=opening.max-opening.min+delta-used;return {...p,y:opening.min+before+Math.round((index+1)*free/(shelves.length+1))+p.h/2}}if(mode==='start')return p;if(mode==='end')return {...p,[axis]:p[axis]+delta};if(mode==='stretch')return {...p,[dim]:p[dim]+delta,[axis]:p[axis]+delta/2};if(mode==='proportional'){const a=extent.min+Math.round((p[axis]-p[dim]/2-extent.min)*size/oldSize),b=extent.min+Math.round((p[axis]+p[dim]/2-extent.min)*size/oldSize);return {...p,[dim]:b-a,[axis]:(a+b)/2}}
    const available=oldSize-p[dim],ratio=available>EPS?(p[axis]-p[dim]/2-extent.min)/available:.5;
    return {...p,[axis]:p[axis]+Math.round(delta*ratio)};
   });
  });
  const actual=bounds(next,axis);if(Math.abs(actual.max-actual.min-wanted)>EPS)throw Error('Размерът не е приложен: връзките, заключванията, контактите или препятствие ограничават шкафа.');
  result=next;
 }
 return result;
}
