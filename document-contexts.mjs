// Working documents are independent from navigation pages and cloud records.
export const documentKinds=Object.freeze(['project','constructor']);
export function createDocumentContexts(){
 const records=new Map(documentKinds.map(kind=>[kind,{id:'working-'+kind,kind,name:kind==='project'?'Нов проект':'Нов модел',snapshot:null}]));
 let activeKind='constructor';
 function get(kind=activeKind){if(!records.has(kind))throw new TypeError('Unknown document kind');return records.get(kind)}
 return {get,get active(){return get()},activate(kind){get(kind);activeKind=kind;return get()},checkpoint(kind,{snapshot,name}){const record=get(kind);record.snapshot=structuredClone(snapshot);if(name!==undefined)record.name=String(name);return record},export(){return documentKinds.map(kind=>structuredClone(get(kind)))}};
}
