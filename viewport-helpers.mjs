// View-only helpers: no model or storage mutations.
export function convexHull(points){
 const p=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const half=list=>{const out=[];for(const point of list){while(out.length>1&&cross(out.at(-2),out.at(-1),point)<=0)out.pop();out.push(point)}return out};
 if(p.length<2)return p;return [...half(p).slice(0,-1),...half([...p].reverse()).slice(0,-1)];
}
export function silhouetteDistance(point,hull){
 if(!hull.length)return Infinity;if(hull.length===1)return Math.hypot(point.x-hull[0].x,point.y-hull[0].y);
 let inside=true,min=Infinity;
 for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],dx=b.x-a.x,dy=b.y-a.y;
  if(dx*(point.y-a.y)-dy*(point.x-a.x)<0)inside=false;
  const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));min=Math.min(min,Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy));
 }return inside&&hull.length>2?0:min;
}
export function visibleSurfaceAnchor(THREE,mesh,boards,camera,preferred){
 mesh.updateWorldMatrix(true,false);camera.updateMatrixWorld();
 const dims=[mesh.userData.w,mesh.userData.h,mesh.userData.d],eye=mesh.worldToLocal(camera.position.clone());
 const inverse=new THREE.Matrix4().copy(mesh.matrixWorld).invert();
 const localForward=camera.getWorldDirection(new THREE.Vector3()).transformDirection(inverse);
 const ray=new THREE.Raycaster(),candidates=[],samples=[[0,0],[.26,0],[-.26,0],[0,.26],[0,-.26],[.26,.26],[-.26,.26],[.26,-.26],[-.26,-.26]];
 for(let axis=0;axis<3;axis++){
  const [a,b]=[0,1,2].filter(i=>i!==axis),sign=(camera.isOrthographicCamera?-localForward.getComponent(axis):eye.getComponent(axis))>=0?1:-1;
  for(const [u,v] of samples){
   const p=[0,0,0];p[axis]=sign*(dims[axis]/2+.05);p[a]=u*dims[a];p[b]=v*dims[b];
   const world=mesh.localToWorld(new THREE.Vector3(...p)),projected=world.clone().project(camera);
   if(projected.z<-1||projected.z>1||Math.abs(projected.x)>1||Math.abs(projected.y)>1)continue;
   ray.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);
   const direction=ray.ray.direction.clone().transformDirection(inverse),facing=-direction.getComponent(axis)*sign;
   if(facing<.08)continue;
   const hit=ray.intersectObjects(boards,false)[0];
   if(!hit||hit.object!==mesh||hit.face.normal.getComponent(axis)*sign<.99)continue;
   const area=dims[a]*dims[b]*facing,score=area*(1-(Math.abs(u)+Math.abs(v))*.25);
   candidates.push({world:hit.point,score,id:[axis,sign,u,v].join(':')});
  }
 }
 if(!candidates.length)return null;candidates.sort((a,b)=>b.score-a.score);
 const previous=candidates.find(p=>p.id===preferred),best=previous&&previous.score>=candidates[0].score*.85?previous:candidates[0];
 return {point:best.world.clone().project(camera),id:best.id};
}
