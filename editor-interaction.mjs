// Selection and command policy, independent of Three.js and document navigation.
export const isTypingTarget=target=>!!target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
export function deletionKeys(parts,selected,selection=[],single=false){
 const chosen=new Set(selection.length?selection:selected?[selected]:[]),assemblies=new Set();
 if(!single)for(const p of parts)if(chosen.has(p.key)&&p.assembly)assemblies.add(p.assembly);
 return new Set(parts.filter(p=>chosen.has(p.key)||assemblies.has(p.assembly)).map(p=>p.key));
}
