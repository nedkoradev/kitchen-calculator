import {textureCoordinates,edgeTextureCoordinates,validTextureUrl} from './grain.mjs';
import {withPhotoOrientation} from './photo-orientation.mjs';
// One downloaded image per URL; per-panel UVs use physical millimetres.
export function createMaterialTextures(THREE){
 const entries=new Map(),loader=new THREE.TextureLoader();loader.setCrossOrigin('anonymous');
 function apply(mesh,p,finish,material,edge=null){
  material=withPhotoOrientation(material);
  const url=validTextureUrl(material?.textureUrl);if(!url)return;
  let entry=entries.get(url);
  if(!entry){
   entry={texture:null,failed:false,targets:new Map()};entries.set(url,entry);
   loader.load(url,texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;entry.texture=texture;
    for(const [target,updateUV] of entry.targets){updateUV(texture.image.width/texture.image.height);target.map=texture;target.color.set('#ffffff');target.needsUpdate=true}entry.targets.clear();
   },undefined,()=>{entry.failed=true;entry.targets.clear()});
  }
  if(entry.failed)return;
  const updateUV=(aspect=1)=>{
   const {uAxis,vAxis,width,height}=(edge?edgeTextureCoordinates(p,edge.normal,material,aspect):textureCoordinates(p,finish,material,aspect)),position=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
   const coordinate=(i,axis)=>axis==='x'?position.getX(i):axis==='y'?position.getY(i):position.getZ(i);
   for(let i=0;i<uv.count;i++)uv.setXY(i,coordinate(i,uAxis)/width+.5,coordinate(i,vAxis)/height+.5);
   uv.needsUpdate=true;
  };
  updateUV(entry.texture?entry.texture.image.width/entry.texture.image.height:1);
  if(entry.texture){mesh.material.map=entry.texture;mesh.material.color.set('#ffffff');mesh.material.needsUpdate=true}
  else entry.targets.set(mesh.material,updateUV);
 }
 // A URL may have failed before its GitHub Pages file was published. A saved
 // or reloaded catalog is an explicit retry, without reloading the application.
 function retryFailed(){for(const [url,entry] of entries)if(entry.failed)entries.delete(url)}
 function release(material){for(const entry of entries.values())entry.targets.delete(material)}
 function prune(activeUrls){const active=new Set(activeUrls.map(validTextureUrl).filter(Boolean));for(const [url,entry] of entries)if(!active.has(url)){entry.texture?.dispose();entry.targets.clear();entries.delete(url)}}
 return {apply,release,prune,retryFailed};
}
