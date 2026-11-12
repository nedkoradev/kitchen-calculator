// View-only overrides. Retain identities/maps and restore every changed property.
export function createTransparency(){
 let enabled=false;const originals=new WeakMap(),objects=new WeakMap();
 function apply(root){root.traverse(object=>{
  if(!object.isMesh&&!object.isLineSegments)return;
  if(!objects.has(object))objects.set(object,{castShadow:object.castShadow,receiveShadow:object.receiveShadow});
  const state=objects.get(object);object.castShadow=enabled?false:state.castShadow;object.receiveShadow=enabled?false:state.receiveShadow;
  for(const material of Array.isArray(object.material)?object.material:[object.material]){
   if(!material)continue;
   if(!originals.has(material))originals.set(material,{transparent:material.transparent,opacity:material.opacity,depthWrite:material.depthWrite,depthTest:material.depthTest});
   const original=originals.get(material);
   if(enabled){material.transparent=true;if(object.isMesh)material.opacity=.3;material.depthWrite=false;if(object.isLineSegments)material.depthTest=false}
   else {const opacity=material.opacity;Object.assign(material,original);if(object.isLineSegments)material.opacity=opacity;}
   material.needsUpdate=true;
  }
 });}
 return {get enabled(){return enabled},apply,set(value,root){enabled=Boolean(value);apply(root);return enabled}};
}
