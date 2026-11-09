import {validTextureUrl} from './grain.mjs';
const KEY='kitchenDesigner.photoOrientations';
const directions=new Map(),catalogDirections=new Map();
export function rememberPhotoOrientations(materials){catalogDirections.clear();for(const material of materials)if(material?.textureUrl&&['vertical','horizontal'].includes(material.textureGrainDirection))catalogDirections.set(photoKey(material.textureUrl),material.textureGrainDirection)}
// Settings belong to the image URL, across materials and design modes.
export function photoKey(value){
 const valid=validTextureUrl(value);if(!valid)return null;
 const pages='https://nedkoradev.github.io/kitchen-calculator/';
 return (valid.startsWith(pages)?valid.slice(pages.length):valid).split(/[?#]/)[0];
}
try{
 const saved=JSON.parse(globalThis.localStorage?.getItem(KEY)||'{}');
 for(const [url,direction] of Object.entries(saved))if(photoKey(url)&&['vertical','horizontal'].includes(direction))directions.set(photoKey(url),direction);
}catch{}
export function photoOrientation(material={}){
 return directions.get(photoKey(material.textureUrl))||(['vertical','horizontal'].includes(material.textureGrainDirection)?material.textureGrainDirection:catalogDirections.get(photoKey(material.textureUrl)))||'vertical';
}
export function withPhotoOrientation(material){
 return material?.textureUrl?{...material,textureGrainDirection:photoOrientation(material)}:material;
}
export function setPhotoOrientation(url,direction){
 const key=photoKey(url);if(!key||!['vertical','horizontal'].includes(direction))throw Error('Невалидна посока на снимката.');
 const next=new Map(directions);next.set(key,direction);
 // Persist before reporting success; a blocked/full storage must remain visible.
 globalThis.localStorage.setItem(KEY,JSON.stringify(Object.fromEntries(next)));
 directions.set(key,direction);
 globalThis.dispatchEvent(new CustomEvent('kitchen-photo-orientation-changed',{detail:{url:key,direction}}));
}
