// Kept in the existing private materials collection; never a material base.
export const MATERIAL_PREFERENCES_ID='_app_preferences';
export function chooseDefaultMaterialBase(items,defaultId=''){
 const bases=items.filter(item=>item.id!==MATERIAL_PREFERENCES_ID);
 if(defaultId)return bases.find(item=>item.id===defaultId)||null;
 return [...bases].sort((a,b)=>a.name.localeCompare(b.name,'bg')||a.id.localeCompare(b.id))[0]||null;
}
