import {generateCabinet,cabinetPresets} from '../../cabinet-generator.mjs';
// Deliberately model the legacy project: door, shelf and 90mm leg groups nested
// inside complete cabinets, imported wrappers, row groups, then one kitchen.
export function dimensionKitchen(catalog,{anonymous=false,sharedWorktop=false}={}){
 const parts=[],labels={},finishes={},names={},expected=[];
 const specifications=[
  ['base',600,898,-700,0,-700,0],['base',800,858,0,0,-700,0],
  ['base',600,898,700,0,-700,1],['base',700,858,700,0,-50,1],
  ['wall',600,900,-700,1450,-840,0],['wall',800,720,0,1450,-840,0],
  ['wall',600,900,840,1450,-700,1],['wall',700,720,840,1450,-50,1]
 ];
 specifications.forEach(([type,w,h,x,y,z,turn],index)=>{
  const cabinet='cabinet-'+index,wrapper='import-'+index,row=type+'-arm-'+turn;
  const items=generateCabinet({...cabinetPresets[type],w,h,legH:90,shelves:1,edgeProfiles:{shelves:[null,null,0,null]}},catalog);
  names[wrapper]=type==='base'?'Долен шкаф '+index:'Горен шкаф '+index;
  expected.push({id:wrapper,w,h,axis:turn?'z':'x'});
  for(const [n,item] of items.entries()){
   const p=structuredClone(item.part),name=item.name;
   p.key='fixture-'+index+'-'+n;
   if(turn){const px=p.x;p.x=-p.z;p.z=px;[p.w,p.d]=[p.d,p.w]}
   p.x+=x;p.y+=y;p.z+=z;
   const structure=/страница|дъно|таван|царга|гръб/iu.test(name),component=/врата/iu.test(name)?cabinet+'-doors':/крак/iu.test(name)?cabinet+'-leg-'+n:/рафт/iu.test(name)?cabinet+'-shelves':cabinet+'-body-part-'+n;
   p.assemblyStack=[component,...(structure?[cabinet+'-carcass']:[]),cabinet,wrapper,row];p.assembly='kitchen';
   parts.push(p);labels[p.key]=anonymous?'Детайл '+p.key:name;finishes[p.key]=structuredClone(item.finish);
  }
 });
 if(sharedWorktop){
  const top={key:'shared-top',w:1400,h:38,d:600,x:-300,y:936,z:-700,assemblyStack:[null],assembly:'kitchen'};
  parts.push(top);labels[top.key]='Общ плот';finishes[top.key]={materialType:'worktop',material:0};
 }
 return {parts,labels,finishes,names,expected};
}
