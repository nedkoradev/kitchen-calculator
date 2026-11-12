import {axes,dimensions,bounds,canPlace,snapPositionToMillimetres} from './geometry.mjs';
import {panelAxes,physicalGrainAxis} from './grain.mjs';
export const cabinetPresets={
 base:{type:'base',title:'Долен шкаф',w:600,h:858,d:600,t:18,sides:true,bottom:true,top:'rails',railDepth:80,shelves:1,back:true,backT:4,legs:true,legH:100,worktop:true,worktopT:38,doors:2,doorT:18,gap:2},
 wall:{type:'wall',title:'Горен шкаф',w:600,h:720,d:320,t:18,sides:true,bottom:true,top:'panel',railDepth:80,shelves:2,back:true,backT:4,legs:false,legH:100,worktop:false,worktopT:38,doors:2,doorT:18,gap:2},
 tall:{type:'tall',title:'Висок шкаф',w:600,h:2100,d:600,t:18,sides:true,bottom:true,top:'panel',railDepth:80,shelves:4,back:true,backT:4,legs:true,legH:100,worktop:false,worktopT:38,doors:2,doorT:18,gap:2}
};
export function materialAt(catalog,value){
 const [type,index]=String(value).split(':');const items=({pdc:catalog.pdcMaterials,back:catalog.backMaterials,worktop:catalog.worktops})[type];
 if(!/^\d+$/.test(index)||!items?.[Number(index)])throw Error('Избери наличен материал от активната база.');
 return {type,index:Number(index),item:items[Number(index)]};
}
export function generateCabinet(settings,catalog){
 const c={...cabinetPresets.base,...settings},items=[];
 const integer=(key,label,min=1,max=30000)=>{if(!Number.isInteger(c[key])||c[key]<min||c[key]>max)throw Error(label+': въведи цяло число от '+min+' до '+max+' мм.');return c[key]};
 const w=integer('w','Ширина'),h=integer('h','Височина'),d=integer('d','Дълбочина'),t=integer('t','Дебелина',1,80),n=integer('shelves','Брой рафтове',0,20),gap=integer('gap','Фуга',0,20);
 if(!['none','panel','rails'].includes(c.top)||![0,1,2].includes(c.doors))throw Error('Избери валидна конструкция и брой врати.');
 const legH=c.legs?integer('legH','Височина на краката',1,500):0,worktopT=c.worktop?integer('worktopT','Дебелина на плота',1,100):0,backT=c.back?integer('backT','Дебелина на гърба',1,80):0,doorT=c.doors?integer('doorT','Дебелина на вратите',1,80):0;
 const bodyH=h-legH-worktopT,bodyD=d-backT-(c.doors?doorT+2:0),innerW=w-(c.sides?2*t:0),baseY=legH,bodyTop=h-worktopT,rear=-d/2+backT,front=rear+bodyD;
 const lower=baseY+(c.bottom?t:0),sideTop=c.type==='base'?bodyTop:bodyTop-(c.top==='none'?0:t),sideH=sideTop-lower,capWidth=c.type==='base'?innerW:w,upper=bodyTop-(c.top==='none'?0:t),free=upper-lower-n*t;
 if(innerW<1||bodyD<=t||bodyH<1||(c.sides&&sideH<1)||free<n+1)throw Error('Размерите не оставят достатъчен вътрешен отвор за плоскостите и рафтовете.');
 if(n&&bodyD<=10+t)throw Error('Дълбочината не е достатъчна за рафт с предно отстояние 10 мм.');
 const edgeFor=role=>{const value=c.edges?.[role];if(value===null||value===undefined||value==='')return null;if(!Number.isInteger(value)||!catalog.edgeMaterials?.[value])throw Error('Избери наличен кант от активната база.');return value};
 const make=(name,role,p,thin,all=false,cut=true)=>{
  const value=c.materials?.[role]??c.materials?.body??'pdc:0',material=materialAt(catalog,value),part={key:'generated'+items.length,...p,locks:cut?{w:thin==='x',h:thin==='y',d:thin==='z'}:{w:true,h:true,d:true},assembly:'generated-cabinet'};
  if(thin&&axes.some(axis=>axis!==thin&&part[dimensions[axis]]<=part[dimensions[thin]]))throw Error('Лицевите размери на '+name+' трябва да са по-големи от дебелината.');
  const edge=edgeFor(role==='shelves'?'shelves':role==='doors'?'doors':'body'),edges=[null,null,null,null];
  if(cut&&role!=='back'&&role!=='worktop'){if(all)edges.fill(edge);else edges[panelAxes(part).thickness==='x'?1:2]=edge}
  items.push({part,name,finish:{materialType:material.type,material:material.index,color:material.item.color||'#dfd0bc',grainAxis:physicalGrainAxis(part),edges,includeInCut:cut},allEdges:all&&edge!==null});
 };
 const body=(name,p,thin)=>make(name,'body',p,thin);
 if(c.sides){body('Лява страница',{w:t,h:sideH,d:bodyD,x:-w/2+t/2,y:lower+sideH/2,z:(rear+front)/2},'x');body('Дясна страница',{w:t,h:sideH,d:bodyD,x:w/2-t/2,y:lower+sideH/2,z:(rear+front)/2},'x')}
 if(c.bottom)body('Дъно',{w,h:t,d:bodyD,x:0,y:baseY+t/2,z:(rear+front)/2},'y');
 if(c.top==='panel')body('Таван',{w:capWidth,h:t,d:bodyD,x:0,y:bodyTop-t/2,z:(rear+front)/2},'y');
 if(c.top==='rails'){const rail=integer('railDepth','Дълбочина на царгите',1);if(2*rail>bodyD||rail<=t)throw Error('Двете горни царги трябва да се побират по дълбочина и да са по-широки от дебелината.');for(const [name,z] of [['Задна горна царга',rear+rail/2],['Предна горна царга',front-rail/2]])body(name,{w:capWidth,h:t,d:rail,x:0,y:bodyTop-t/2,z},'y')}
 for(let i=0;i<n;i++)make('Рафт '+(i+1),'shelves',{w:innerW,h:t,d:bodyD-10,x:0,y:lower+i*t+Math.round((i+1)*free/(n+1))+t/2,z:rear+(bodyD-10)/2},'y');
 if(c.back)make('Гръб','back',{w,h:bodyH,d:backT,x:0,y:baseY+bodyH/2,z:-d/2+backT/2},'z');
 if(c.worktop)make('Плот','worktop',{w,h:worktopT,d,x:0,y:h-worktopT/2,z:0},'y');
 if(c.doors){const available=w-2*gap-(c.doors-1)*gap,doorH=bodyH-2*gap;if(available<c.doors||doorH<=doorT)throw Error('Фугите не оставят достатъчно място за вратите.');let left=-w/2+gap;for(let i=0;i<c.doors;i++){const width=i===0?Math.floor(available/c.doors):available-Math.floor(available/c.doors);make('Врата '+(i+1),'doors',{w:width,h:doorH,d:doorT,x:left+width/2,y:baseY+gap+doorH/2,z:front+2+doorT/2},'z',true);left+=width+gap}}
 if(c.legs){if(w<160||bodyD<160)throw Error('За четири крака 50 × 50 мм са нужни поне 160 мм ширина и дълбочина на корпуса.');for(const x of [-w/2+55,w/2-55])for(const z of [rear+55,front-55])make('Крак '+(items.filter(i=>i.name.startsWith('Крак')).length+1),'body',{w:50,h:legH,d:50,x,y:legH/2,z},null,false,false)}
 if(!items.length)throw Error('Избери поне един конструктивен елемент.');
 // Use the same AABB/room validation as the editor, not a generator collision engine.
 if(!canPlace(items.map(i=>i.part),[],{w,h,d}))throw Error('Конструкцията съдържа невалидни размери или застъпване.');
 return items;
}
export function placeCabinet(items,obstacles,room){
 const parts=items.map(i=>i.part),extent=Object.fromEntries(axes.map(a=>[a,bounds(parts,a)])),size=Object.fromEntries(axes.map(a=>[a,extent[a].max-extent[a].min]));
 const xs=[-size.x/2,-room.w/2,...obstacles.flatMap(p=>[p.x+p.w/2,p.x-p.w/2-size.x])],zs=[-size.z/2,-room.d/2,...obstacles.flatMap(p=>[p.z+p.d/2,p.z-p.d/2-size.z])];
 for(const x of new Set(xs))for(const z of new Set(zs)){
  if(x<-room.w/2||x+size.x>room.w/2||z<-room.d/2||z+size.z>room.d/2)continue;const shifted=parts.map(p=>({...p,x:p.x+x-extent.x.min,z:p.z+z-extent.z.min})),placed=snapPositionToMillimetres(shifted,obstacles,room);
  if(placed&&canPlace(placed,obstacles,room))return items.map((item,i)=>({...item,part:placed[i]}));
 }throw Error('Няма свободно място за шкафа в стаята. Освободи място или промени габаритите.');
}
