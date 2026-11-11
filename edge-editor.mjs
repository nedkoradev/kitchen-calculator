import {requiresGrain,textureCoordinates,edgeDiagramLayout,validTextureUrl} from './grain.mjs';
import {decorateAction} from './icons.mjs';
import {withPhotoOrientation} from './photo-orientation.mjs';
export function openEdgeEditor({part,finish,material,edgeMaterials,allEdges=false,onApply}){
 const make=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node};
 const dialog=make('dialog');dialog.className='visualEdgeDialog';dialog.setAttribute('aria-label','Кантиране на детайла');
 const header=make('div');header.className='dialogHead';header.append(make('strong','Кантиране на детайла'));
 const close=make('button');decorateAction(close,'close','Затвори кантирането',{iconOnly:true});close.type='button';close.setAttribute('aria-label','Затвори кантирането');close.onclick=()=>dialog.close();header.append(close);
 const body=make('div');body.className='edgeDialogBody';body.append(make('p','Избери кант за всеки ръб. Тънките червени линии показват кантираните страни.'));
 const draft=Array.from({length:4},(_,i)=>finish.edges?.[i]??null),diagram=edgeDiagramLayout(part,finish,material),slots=diagram.slots,names=['Ширина Б ляво (Л)','Ширина Б дясно (Д)','Дължина А горе (П)','Дължина А долу (З)'];let allMode=allEdges,closed=false;
 function select(label,value){const node=make('select');node.setAttribute('aria-label',label);node.add(new Option('— без кант —',''));edgeMaterials.forEach((edge,i)=>node.add(new Option(edge.name||'Кант '+(i+1),String(i))));if(value!=null&&!edgeMaterials[value])node.add(new Option('Липсващ кант ('+value+')',String(value)));node.value=value==null?'':String(value);return node}
 const allBar=make('div');allBar.className='edgeAllBar';const allLabel=make('label','Кантиране на 4-те страни с:');const uniform=draft.every(v=>v===draft[0])?draft[0]:null,allSelect=select('Кант за четирите страни',uniform);allSelect.id='visualEdgeAll';allLabel.append(allSelect);const useAll=make('button','Кантирай');useAll.type='button';useAll.id='visualEdgeUseAll';allBar.append(allLabel,useAll);body.append(allBar);
 const grid=make('div');grid.className='edgeDiagram';const controls=[];
 for(let i=0;i<4;i++){const label=make('label',names[i]);label.className='edgeSide edgeSide'+i;const input=select(names[i],draft[slots[i]]);input.dataset.edgeSide=String(i);input.onchange=()=>{draft[slots[i]]=input.value===''?null:Number(input.value);allMode=false;paint()};label.append(input);grid.append(label);controls.push(input)}
 const preview=make('div');preview.className='edgePreview';const canvas=make('canvas');canvas.setAttribute('role','img');preview.append(canvas);grid.append(preview);body.append(grid);
 const {axes,width,height}=diagram,grain=requiresGrain(finish,material);
 canvas.setAttribute('aria-label','Детайл А '+width+' × Б '+height+' мм'+(grain?' · фладер по хоризонтала':''));
 const caption=make('p',grain?'↔ Дължина А е по посоката на фладера':'А × Б — ориентация като в Salex XLSX (без задължителен фладер)');caption.className='edgeGrainCaption';body.append(caption);
 const status=make('p');status.setAttribute('role','status');body.append(status);
 const footer=make('div');footer.className='dialogFoot';const cancel=make('button','Отказ');cancel.type='button';cancel.id='visualEdgeCancel';cancel.onclick=()=>dialog.close();const apply=make('button','Приложи');apply.type='button';apply.id='visualEdgeApply';apply.className='nedPrimaryButton';footer.append(cancel,apply);
 let image=null;
 function paint(){
  if(closed)return;const W=270,H=240,ratio=Math.min(globalThis.devicePixelRatio||1,2);canvas.width=W*ratio;canvas.height=H*ratio;const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);
  const scale=Math.min((W-48)/width,(H-44)/height),w=width*scale,h=height*scale,x=34+(W-48-w)/2,y=12+(H-44-h)/2;
  ctx.fillStyle=material?.color||finish.color||'#dfd0bc';ctx.fillRect(x,y,w,h);
  if(image){const uv=textureCoordinates(part,finish,withPhotoOrientation(material),image.naturalWidth/image.naturalHeight),pattern=ctx.createPattern(image,'repeat');if(pattern){const u=uv.width*scale/image.naturalWidth,v=uv.height*scale/image.naturalHeight;pattern.setTransform(new DOMMatrix(uv.uAxis===axes[0]?[u,0,0,v,x,y]:[0,u,v,0,x,y]));ctx.fillStyle=pattern;ctx.fillRect(x,y,w,h)}}
  const lines=[[x,y,x,y+h],[x+w,y,x+w,y+h],[x,y,x+w,y],[x,y+h,x+w,y+h]];
  for(let i=0;i<4;i++){const edge=draft[slots[i]],edged=edge!==null&&edge!==undefined&&edge!=='';ctx.beginPath();ctx.moveTo(lines[i][0],lines[i][1]);ctx.lineTo(lines[i][2],lines[i][3]);ctx.lineWidth=edged?2:1;ctx.strokeStyle=edged?'#ef4444':'#8ba0b6';ctx.stroke();}
  ctx.strokeStyle='#a9b9ca';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+h+7);ctx.lineTo(x+w,y+h+7);ctx.moveTo(x-9,y);ctx.lineTo(x-9,y+h);ctx.stroke();ctx.font='12px Arial';ctx.fillStyle='#edf4fc';ctx.textAlign='center';ctx.fillText('А: '+Math.round(width)+' мм',x+w/2,y+h+23);ctx.save();ctx.translate(x-18,y+h/2);ctx.rotate(-Math.PI/2);ctx.fillText('Б: '+Math.round(height)+' мм',0,0);ctx.restore();
  if(grain){const cx=x+w/2,cy=y+h/2,dx=Math.min(60,w*.65)/2;ctx.strokeStyle='#143e6a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-dx,cy);ctx.lineTo(cx+dx,cy);for(const sign of [-1,1]){const px=cx+sign*dx;ctx.moveTo(px-sign*6,cy-5);ctx.lineTo(px,cy);ctx.lineTo(px-sign*6,cy+5)}ctx.stroke()}
 }
 useAll.onclick=()=>{const value=allSelect.value===''?null:Number(allSelect.value);draft.fill(value);allMode=value!==null;controls.forEach(input=>input.value=allSelect.value);paint()};
 apply.onclick=()=>{apply.disabled=true;try{if(onApply({edges:[...draft],allEdges:allMode&&draft.every(v=>v===draft[0])})===false){status.textContent='Детайлът е променен. Затвори и отвори кантирането отново.';apply.disabled=false;return}dialog.close()}catch{status.textContent='Кантирането не е приложено. Опитай отново.';apply.disabled=false}};
 dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.addEventListener('close',()=>{closed=true;if(image)image.onload=image.onerror=null;dialog.remove()},{once:true});dialog.append(header,body,footer);document.body.append(dialog);dialog.showModal();paint();
 const url=validTextureUrl(material?.textureUrl);if(url){const texture=new Image();texture.onload=()=>{image=texture;paint()};texture.onerror=()=>{if(!closed)status.textContent='Снимката на декора не се зарежда. Показан е цветът на материала.'};texture.src=url}
 return dialog;
}
