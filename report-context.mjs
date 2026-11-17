import {projectData} from './project-model.mjs';
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
export function createReportContext(document,snapshot,scope={kind:'whole'}){
 if(!document?.id||!['project','constructor'].includes(document.kind))throw Error('Не е определен документ за справката.');
 const data=projectData(snapshot),ids=[...new Set(scope.cabinetIds||[])];
 if(!['whole','cabinet-set'].includes(scope.kind))throw Error('Невалиден обхват на справката.');
 if(scope.kind==='cabinet-set'){
  if(document.kind!=='project'||!ids.length||ids.some(id=>typeof id!=='string'||!data.parts.some(e=>e.part.assembly===id||e.part.assemblyStack?.includes(id))))throw Error('Избраните шкафове не съществуват в този проект.');
 }
 const content=JSON.stringify([data.parts,data.room,data.materials,data.settings?.sheetUtilization??80]),code=[2166136261,5381];for(const c of content){code[0]=Math.imul(code[0]^c.charCodeAt(0),16777619);code[1]=Math.imul(code[1],33)^c.charCodeAt(0)}
 return freeze({documentId:document.id,kind:document.kind,name:document.name||'Без име',revision:code.map(n=>(n>>>0).toString(16)).join('-'),scope:scope.kind==='whole'?{kind:'whole'}:{kind:'cabinet-set',cabinetIds:ids},snapshot:data});
}
export function reportInputs(context){
 const source=context.snapshot,allParts=source.parts.map(e=>e.part),chosen=source.parts.filter(e=>context.scope.kind==='whole'||context.scope.cabinetIds.some(id=>e.part.assembly===id||e.part.assemblyStack?.includes(id))),materials=source.materials||{},catalogExtra={backMaterials:materials.backMaterials||[],worktops:materials.worktops||[]},libraryBoards=materials.pdcMaterials||[];
 return {customParts:chosen.map(e=>e.part),allParts,labels:Object.fromEntries(source.parts.map(e=>[e.part.key,e.name||e.part.key])),finishes:Object.fromEntries(source.parts.map(e=>[e.part.key,e.finish||{}])),libraryBoards,libraryEdges:materials.edgeMaterials||[],catalogExtra,servicePrices:materials.servicePrices||{},selectedBoard:f=>f?.materialType==='back'?catalogExtra.backMaterials[Number(f.material)]||null:f?.materialType==='worktop'?catalogExtra.worktops[Number(f.material)]||null:libraryBoards[Number(f?.material)]||null};
}
