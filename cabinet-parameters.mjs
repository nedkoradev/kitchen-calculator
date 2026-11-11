import {axes,dimensions,bounds,resize} from './geometry.mjs';
const EPS=1e-6;
export const dependencyModes={start:'Запази от началото',end:'Следвай края',stretch:'Променяй размера',relative:'Относителна позиция',proportional:'Пропорционален размер и позиция'};
export function panelThicknessAxis(p){
 const sorted=axes.map(axis=>({axis,size:p[dimensions[axis]]})).sort((a,b)=>a.size-b.size);
 return !p.appliance&&sorted[0].size<=60&&sorted[1].size>=Math.max(80,sorted[0].size*4)?sorted[0].axis:null;
}
export function inferCabinetDependencies(parts){
 const rules=Object.create(null),unknown=[],thickness=Object.fromEntries(parts.map(p=>[p.key,panelThicknessAxis(p)]));
 let histories=parts.map(p=>[...(p.assemblyStack||[])]),nested=false;
 while(histories.some(stack=>stack.length)){if(new Set(histories.map(stack=>stack.at(-1)).filter(Boolean)).size>1)nested=true;histories=histories.map(stack=>stack.slice(0,-1))}
 for(const p of parts)rules[p.key]={};
 for(const axis of axes){
  const dim=dimensions[axis],extent=bounds(parts,axis),near=(a,b)=>Math.abs(a-b)<EPS;
  const ends=parts.filter(p=>thickness[p.key]===axis),starts=[extent.min,...ends.filter(p=>near(p[axis]-p[dim]/2,extent.min)).map(p=>p[axis]+p[dim]/2)],finishes=[extent.max,...ends.filter(p=>near(p[axis]+p[dim]/2,extent.max)).map(p=>p[axis]-p[dim]/2)];
  for(const p of parts){
   let mode=null;const a=p[axis]-p[dim]/2,b=p[axis]+p[dim]/2,isStart=starts.some(v=>near(a,v)),isEnd=finishes.some(v=>near(b,v));
   if(!nested&&thickness[p.key]){
    if(thickness[p.key]===axis||p.locks?.[dim]||p.appliance){if(isStart&&!isEnd)mode='start';else if(isEnd&&!isStart)mode='end'}
    else if(isStart&&isEnd)mode='stretch';
   }
   rules[p.key][dim]=mode;if(!mode)unknown.push({key:p.key,dim});
  }
 }
 return {rules,unknown,thickness,nested};
}
// Dependency choices are operation-local, never new fields in Firestore.
// All geometry transitions still use resize()'s existing swept collision checks.
export function resizeCabinet(parts,obstacles,room,targets,rules){
 if(parts.length<2)throw Error('Избери цял шкаф или група с поне два детайла.');
 const thickness=Object.fromEntries(parts.map(p=>[p.key,panelThicknessAxis(p)]));
 let result=parts.map(p=>({...p}));
 for(const axis of axes){
  const dim=dimensions[axis],extent=bounds(result,axis),oldSize=extent.max-extent.min,wanted=targets[dim]??oldSize;
  if(Math.abs(wanted-oldSize)<EPS)continue;
  if(!Number.isInteger(wanted)||wanted<1||wanted>room[dim])throw Error('Въведи цели размери в границите на стаята.');
  if(!Number.isInteger(oldSize))throw Error('Корпусът е с дробен габарит. Използвай свободното редактиране за корекция преди параметрично оразмеряване.');
  for(const p of result){const mode=rules[p.key]?.[dim];if(!Object.hasOwn(dependencyModes,mode))throw Error('Задай връзката по '+({w:'ширина (X)',h:'височина (Y)',d:'дълбочина (Z)'})[dim]+' за всички детайли.');if((mode==='stretch'||mode==='proportional')&&(thickness[p.key]===axis||p.locks?.[dim]||p.appliance))throw Error('Не може да се променя дебелина или заключен размер.');}
  const next=resize(result,obstacles,room,dim,wanted,(original,size,affineOnly)=>{
   if(affineOnly&&original.some(p=>['relative','proportional'].includes(rules[p.key][dim])))return null;
   const delta=size-oldSize;
   return original.map(p=>{const mode=rules[p.key][dim];if(mode==='start')return p;if(mode==='end')return {...p,[axis]:p[axis]+delta};if(mode==='stretch')return {...p,[dim]:p[dim]+delta,[axis]:p[axis]+delta/2};if(mode==='proportional'){const a=extent.min+Math.round((p[axis]-p[dim]/2-extent.min)*size/oldSize),b=extent.min+Math.round((p[axis]+p[dim]/2-extent.min)*size/oldSize);return {...p,[dim]:b-a,[axis]:(a+b)/2}}
    const available=oldSize-p[dim],ratio=available>EPS?(p[axis]-p[dim]/2-extent.min)/available:.5;
    return {...p,[axis]:p[axis]+Math.round(delta*ratio)};
   });
  });
  const actual=bounds(next,axis);if(Math.abs(actual.max-actual.min-wanted)>EPS)throw Error('Размерът не е приложен: връзките, заключванията, контактите или препятствие ограничават шкафа.');
  result=next;
 }
 return result;
}
