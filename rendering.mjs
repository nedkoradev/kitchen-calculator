// Presentation only: never change the model, materials catalog or camera controls.
export function installStudioLighting(THREE,renderer,scene){
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;
 const sky=new THREE.HemisphereLight(0xf5f8ff,0x8190a1,1.8);scene.add(sky);
 const sun=new THREE.DirectionalLight(0xfff5e6,3.0);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00015;sun.shadow.normalBias=1.2;sun.shadow.radius=3;scene.add(sun,sun.target);
 const fill=new THREE.DirectionalLight(0xe0ebff,1.4);fill.position.set(2000,1200,1400);scene.add(fill,fill.target);
 const rim=new THREE.DirectionalLight(0xffffff,.6);rim.position.set(600,1800,-1600);scene.add(rim,rim.target);
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({color:0x26344a,opacity:.22}));floor.rotation.x=-Math.PI/2;floor.position.y=-1.5;floor.receiveShadow=true;scene.add(floor);
 let previous='';
 function update(parts,room,view,cameraPosition,viewTarget){
  const shadowed=view==='perspective'||view==='iso';floor.visible=shadowed;sun.castShadow=shadowed;
  const dx=(cameraPosition?.x||0)-(viewTarget?.x||0),dy=(cameraPosition?.y||0)-(viewTarget?.y||0),dz=(cameraPosition?.z??1)-(viewTarget?.z||0);
  const azimuth=Math.atan2(dx,dz),elevation=Math.atan2(dy,Math.hypot(dx,dz));
  const signature=JSON.stringify([view,room,azimuth.toFixed(4),elevation.toFixed(4),parts.map(p=>[p.key,p.x,p.y,p.z,p.w,p.h,p.d])]);if(signature===previous)return;previous=signature;
  floor.scale.set(room.w,room.d,1);
  const min=(axis,dim)=>Math.min(...parts.map(p=>p[axis]-p[dim]/2)),max=(axis,dim)=>Math.max(...parts.map(p=>p[axis]+p[dim]/2));
  const cx=parts.length?(min('x','w')+max('x','w'))/2:0,cy=parts.length?(min('y','h')+max('y','h'))/2:400,cz=parts.length?(min('z','d')+max('z','d'))/2:0;
  const span=parts.length?Math.max(max('x','w')-min('x','w'),max('y','h')-min('y','h'),max('z','d')-min('z','d'),800):1600;
  const sin=Math.sin(azimuth),cos=Math.cos(azimuth);
  sun.target.position.set(cx,cy,cz);sun.position.set(cx+span*(sin*1.2-cos*.75),cy+span*(1.45+Math.sin(elevation)*.3),cz+span*(cos*1.2+sin*.75));
  fill.target.position.set(cx,cy,cz);fill.position.set(cx+span*(sin*1.4+cos*1.8),cy+span*.9,cz+span*(cos*1.4-sin*1.8));
  rim.target.position.set(cx,cy,cz);rim.position.set(cx-span*sin,cy+span*1.5,cz-span*cos);
  const camera=sun.shadow.camera,extent=span*.95;camera.left=camera.bottom=-extent;camera.right=camera.top=extent;camera.near=1;camera.far=span*5;camera.updateProjectionMatrix();renderer.shadowMap.needsUpdate=true;
 }
 return {update,sun,floor};
}
export function outlineStyle(THREE,color,selected=false){
 if(selected)return {color:0xff8700,opacity:1};
 const c=new THREE.Color(color),luminance=.2126*c.r+.7152*c.g+.0722*c.b;
 return {color:luminance<.12?0xa6b2c1:0x354252,opacity:luminance<.12?.48:.42};
}
