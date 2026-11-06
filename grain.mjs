// Physical axes remain model axes; cutting orientation never resizes a panel.
export function panelAxes(p){
 const thickness=p.w<=p.h&&p.w<=p.d?'x':p.d<=p.w&&p.d<=p.h?'z':'y';
 return {thickness,axes:thickness==='x'?['z','y']:thickness==='z'?['x','y']:['x','z']};
}
const dimension=(p,axis)=>p[{x:'w',y:'h',z:'d'}[axis]];
export function physicalGrainAxis(p,finish={}){
 const {axes}=panelAxes(p);
 return axes.includes(finish.grainAxis)?finish.grainAxis:(dimension(p,axes[0])>=dimension(p,axes[1])?axes[0]:axes[1]);
}
export const rotatedGrainAxis=axis=>({x:'z',y:'y',z:'x'})[axis];
export function cutLayout(p,finish={},material={}){
 const [thickness,short,long]=[p.w,p.h,p.d].map(Math.round).sort((a,b)=>a-b);
 if(!material?.grainRequired)return {A:long,B:short,thickness,grainRequired:false,edgeIndices:p.w<=p.h&&p.w<=p.d?[0,1,2,3]:[2,3,1,0]};
 const {thickness:thin,axes}=panelAxes(p),axis=physicalGrainAxis(p,finish),other=axes.find(value=>value!==axis);
 const edgeIndices=thin==='y'?(axis==='x'?[2,3,1,0]:[0,1,2,3]):axis==='y'?[0,1,2,3]:[3,2,1,0];
 return {A:Math.round(dimension(p,axis)),B:Math.round(dimension(p,other)),thickness,grainRequired:true,axis,edgeIndices};
}
export function textureCoordinates(p,finish={},material={},imageAspect=1){
 const {axes}=panelAxes(p),grain=physicalGrainAxis(p,finish),other=axes.find(axis=>axis!==grain);
 const width=Number(material.textureWidthMm)>0?Number(material.textureWidthMm):1000;
 const height=Number(material.textureHeightMm)>0?Number(material.textureHeightMm):width/(Number(imageAspect)>0?Number(imageAspect):1);
 return {uAxis:other,vAxis:grain,width,height};
}
export function validTextureUrl(value){
 if(typeof value!=='string')return null;
 const input=value.trim();
 // Repository textures stay relative so project/library metadata is portable
 // between Pages subpaths. No root paths, traversal, schemes or auth are allowed.
 if(/^(?:\.\/)?materials\/textures\//.test(input)){
  const path=input.replace(/^\.\//,'').split(/[?#]/)[0];
  if(/%(?:2f|5c|25)/i.test(path))return null;
  let decoded;try{decoded=decodeURIComponent(path)}catch{return null}
  if(/[\\\u0000-\u001f\u007f]/.test(decoded)||decoded.split('/').some(part=>!part||part==='.'||part==='..')||!/^materials\/textures\/.+\.(jpe?g|png|webp)$/i.test(decoded))return null;
  const suffix=input.slice(input.indexOf(path)+path.length);
  return decoded.split('/').map(encodeURIComponent).join('/')+suffix;
 }
 try{const url=new URL(input);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null}catch{return null}
}
