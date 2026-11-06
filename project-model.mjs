// Storage boundaries only: never modify geometry, locks or grouping histories.
export class ProjectError extends Error{
 constructor(code,message,details={}){super(message);this.code=code;this.details=details}
}
export function projectName(input){
 const name=String(input||'').normalize('NFC').trim().replace(/\s+/gu,' '),nameKey=name.toLowerCase();
 if(!name||name.length>100||/[\u0000-\u001f\u007f/]/u.test(name)||nameKey==='.'||nameKey==='..'||/^__.*__$/.test(nameKey))
  throw new ProjectError('invalid-name','Въведи име до 100 знака, без „/“.');
 return {name,nameKey};
}
export function projectData(input,{maxBytes=Infinity}={}){
 if(!input||!Array.isArray(input.parts)||!input.room)throw new ProjectError('invalid-project','Невалиден формат на проекта.');
 for(const k of ['w','h','d'])if(!Number.isInteger(input.room[k])||input.room[k]<500||input.room[k]>30000)
  throw new ProjectError('invalid-project','Невалидни размери на стаята.');
 if(input.materials){
  for(const key of ['pdcMaterials','edgeMaterials','backMaterials','worktops'])if(!Array.isArray(input.materials[key]))throw new ProjectError('invalid-project','Невалидна материална база на проекта.');
 }
 if(input.settings?.camera){
  const camera=input.settings.camera;
  if(!['position','target'].every(k=>Array.isArray(camera[k])&&camera[k].length===3&&camera[k].every(Number.isFinite))||!Number.isFinite(camera.zoom)||camera.zoom<=0)
   throw new ProjectError('invalid-project','Невалидни настройки на изгледа.');
 }
 const keys=new Set();
 for(const item of input.parts){
  const p=item?.part;
  if(!p||typeof p.key!=='string'||!p.key||keys.has(p.key)||!['x','y','z','w','h','d'].every(k=>Number.isFinite(p[k]))||['w','h','d'].some(k=>p[k]<=0)||
    (p.assemblyStack!==undefined&&(!Array.isArray(p.assemblyStack)||p.assemblyStack.some(id=>id!==null&&typeof id!=='string'))))
   throw new ProjectError('invalid-project','Проектът съдържа невалиден детайл или група.');
  keys.add(p.key);
 }
 // Existing rotations may leave undefined lock fields. Firestore rejects those;
 // JSON omits object fields and preserves explicit null entries in histories.
 const data=JSON.parse(JSON.stringify(input));
 if(new TextEncoder().encode(JSON.stringify(data)).length>maxBytes)
  throw new ProjectError('project-too-large','Проектът е твърде голям за един облачен запис (850 KB).');
 return data;
}
export function projectErrorMessage(error){
 if(error instanceof ProjectError)return error.message;
 const code=String(error?.code||'');
 if(code.includes('permission-denied'))return 'Нямаш достъп до проекта. Провери входа и правилата на Firestore.';
 if(code.includes('unavailable')||code.includes('deadline-exceeded')||code.includes('network'))return 'Няма връзка с облака. Записът не е потвърден. Провери интернет и опитай отново.';
 return 'Операцията не е потвърдена от облака. Опитай отново. '+(error?.message||'');
}
