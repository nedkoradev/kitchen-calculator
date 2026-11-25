// Pure SVG projection of actual model panels, matching the v2.96 thumbnail.
export function cabinetPreviewSvg(items){
 const parts=(items||[]).map(i=>i.part||i).filter(p=>p&&['x','y','z','w','h','d'].every(k=>Number.isFinite(Number(p[k])))&&p.w>0&&p.h>0&&p.d>0);
 if(!parts.length)return '<svg viewBox="0 0 100 100"><text x="50" y="52" text-anchor="middle" font-size="10" fill="#678">Няма изглед</text></svg>';
 // Draw actual saved panels, not a generic cabinet pictogram. Painter order
 // uses the depth of EACH visible face rather than the panel centre.
 const project=(x,y,z)=>[x*.72-z*.54,-y*.86+z*.27+x*.14];
 const faces=[],all=[];
 const defs=[
  {idx:[4,5,6,7],normal:[0,0,1],fill:'#f2eee8'},
  {idx:[1,5,6,2],normal:[1,0,0],fill:'#c6b7a5'},
  {idx:[3,2,6,7],normal:[0,1,0],fill:'#e6d2bb'},
  {idx:[0,3,7,4],normal:[-1,0,0],fill:'#c6b7a5'},
  {idx:[0,1,2,3],normal:[0,0,-1],fill:'#f2eee8'},
  {idx:[0,4,5,1],normal:[0,-1,0],fill:'#e6d2bb'}
 ];
 const view=[1,1.1,1.25];
 for(const p of parts){
  const xs=[p.x-p.w/2,p.x+p.w/2],ys=[p.y-p.h/2,p.y+p.h/2],zs=[p.z-p.d/2,p.z+p.d/2];
  const corners=[[xs[0],ys[0],zs[0]],[xs[1],ys[0],zs[0]],[xs[1],ys[1],zs[0]],[xs[0],ys[1],zs[0]],[xs[0],ys[0],zs[1]],[xs[1],ys[0],zs[1]],[xs[1],ys[1],zs[1]],[xs[0],ys[1],zs[1]]];
  all.push(...corners.map(c=>project(...c)));
  for(const face of defs){
   if(face.normal.reduce((v,n,i)=>v+n*view[i],0)<=0)continue;
   const vertices=face.idx.map(i=>corners[i]);
   const depth=vertices.reduce((sum,v)=>sum+v[0]*view[0]+v[1]*view[1]+v[2]*view[2],0)/4;
   faces.push({depth,pts:vertices.map(v=>project(...v)),fill:face.fill});
  }
 }
 const minX=Math.min(...all.map(p=>p[0])),maxX=Math.max(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxY=Math.max(...all.map(p=>p[1]));
 const scale=Math.min(88/Math.max(1,maxX-minX),88/Math.max(1,maxY-minY)),tx=50-(minX+maxX)*scale/2,ty=50-(minY+maxY)*scale/2;
 return '<svg viewBox="0 0 100 100" aria-label="Изглед на запазения корпус"><g transform="translate('+tx+' '+ty+') scale('+scale+')">'+faces.sort((a,b)=>a.depth-b.depth).map(f=>'<polygon points="'+f.pts.map(p=>p.join(',')).join(' ')+'" fill="'+f.fill+'" stroke="#7d746b" stroke-width="'+(0.7/scale)+'" stroke-linejoin="round"/>').join('')+'</g></svg>';
}
