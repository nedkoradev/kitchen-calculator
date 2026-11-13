import {requiresGrain,textureCoordinates,edgeDiagramLayout,validTextureUrl} from './grain.mjs';
import {decorateAction} from './icons.mjs';
import {withPhotoOrientation} from './photo-orientation.mjs';
const make=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node};
export function openEdgeEditor(options){
 const {onApply}=options,variants=options.variants||[{...options,id:'part',label:options.label||'Детайл'}],states=variants.map(v=>({edges:Array.from({length:4},(_,i)=>v.finish.edges?.[i]??null),allEdges:!!v.allEdges}));
 const dialog=make('dialog');dialog.className='visualEdgeDialog'+(options.variants?' edgeVariantDialog':'');dialog.setAttribute('aria-label',options.title||'Кантиране на детайла');
 const header=make('div');header.className='dialogHead';header.append(make('strong',options.title||'Кантиране на детайла'));
 const close=make('button');decorateAction(close,'close','Затвори кантирането',{iconOnly:true});close.type='button';close.onclick=()=>dialog.close();header.append(close);dialog.append(header);
 const footer=make('div');footer.className='dialogFoot';const cancel=make('button','Отказ');cancel.type='button';cancel.id='visualEdgeCancel';cancel.onclick=()=>dialog.close();const apply=make('button','Приложи');apply.type='button';apply.id='visualEdgeApply';apply.className='nedPrimaryButton';footer.append(cancel,apply);
 let active=0,panel;
 function show(index){if(panel){states[active]=panel.read();panel.dispose();panel.body.remove()}active=index;panel=createEdgePanel({...variants[active],finish:{...variants[active].finish,edges:states[active].edges},allEdges:states[active].allEdges,edgeMaterials:options.edgeMaterials});dialog.insertBefore(panel.body,footer)}
 if(options.variants){const bar=make('div');bar.className='edgeVariantBar';const label=make('label','Детайл за кантиране');const select=make('select');select.id='visualEdgeVariant';variants.forEach((v,i)=>select.add(new Option(v.label,v.id)));select.onchange=()=>show(variants.findIndex(v=>v.id===select.value));label.append(select);bar.append(label);dialog.append(bar)}
 dialog.append(footer);show(0);
 apply.onclick=()=>{apply.disabled=true;states[active]=panel.read();if(variants.some((v,i)=>v.requiredSlots?.some(slot=>states[i].edges[slot]===null))){panel.status.textContent='Рафтове: избери кант за предния ръб.';panel.body.querySelector('select[required]')?.focus();apply.disabled=false;return}try{const result=options.variants?{variants:variants.map((v,i)=>({id:v.id,...states[i]}))}:states[0];if(onApply(result)===false){panel.status.textContent='Детайлът е променен. Затвори и отвори кантирането отново.';apply.disabled=false;return}dialog.close()}catch{panel.status.textContent='Кантирането не е приложено. Опитай отново.';apply.disabled=false}};
 dialog.addEventListener('keydown',event=>event.stopPropagation());dialog.addEventListener('close',()=>{panel.dispose();dialog.remove()},{once:true});document.body.append(dialog);dialog.showModal();return dialog;
}
function createEdgePanel({part,finish,material,edgeMaterials,allEdges=false,slotLabels,requiredSlots=[]}){
 const body=make('div');body.className='edgeDialogBody';body.append(make('p','Избери кант за всеки ръб. Плътните червени линии показват кантираните страни.'));
 const draft=Array.from({length:4},(_,i)=>finish.edges?.[i]??null),diagram=edgeDiagramLayout(part,finish,material),slots=diagram.slots,names=['Ширина Б ляво (Л)','Ширина Б дясно (Д)','Дължина А горе (П)','Дължина А долу (З)'];let allMode=allEdges,closed=false;
 function select(label,value){const node=make('select');node.setAttribute('aria-label',label);node.add(new Option('— без кант —',''));edgeMaterials.forEach((edge,i)=>node.add(new Option(edge.name||'Кант '+(i+1),String(i))));if(value!=null&&!edgeMaterials[value])node.add(new Option('Липсващ кант ('+value+')',String(value)));node.value=value==null?'':String(value);return node}
 const allBar=make('div');allBar.className='edgeAllBar';const allLabel=make('label','Кантиране на 4-те страни с:');const uniform=draft.every(v=>v===draft[0])?draft[0]:null,allSelect=select('Кант за четирите страни',uniform);allSelect.id='visualEdgeAll';allLabel.append(allSelect);const useAll=make('button','Кантирай');useAll.type='button';useAll.id='visualEdgeUseAll';allBar.append(allLabel,useAll);body.append(allBar);
 const grid=make('div');grid.className='edgeDiagram';const controls=[];
 for(let i=0;i<4;i++){const sideName=names[i]+(slotLabels?' — '+slotLabels[slots[i]]:'')+(requiredSlots.includes(slots[i])?' — задължителен':'');const label=make('label',sideName);label.className='edgeSide edgeSide'+i;const input=select(sideName,draft[slots[i]]);input.required=requiredSlots.includes(slots[i]);input.dataset.edgeSide=String(i);input.dataset.edgeSlot=String(slots[i]);input.onchange=()=>{draft[slots[i]]=input.value===''?null:Number(input.value);allMode=false;paint()};label.append(input);grid.append(label);controls.push(input)}
 const preview=make('div');preview.className='edgePreview';const canvas=make('canvas');canvas.setAttribute('role','img');preview.append(canvas);grid.append(preview);body.append(grid);
 const {axes,width,height}=diagram,grain=requiresGrain(finish,material);
 canvas.setAttribute('aria-label','Детайл А '+width+' × Б '+height+' мм'+(grain?' · фладер по хоризонтала':''));
 const caption=make('p',grain?'↔ Дължина А е по посоката на фладера':'А × Б — ориентация като в Salex XLSX (без задължителен фладер)');caption.className='edgeGrainCaption';body.append(caption);
 const status=make('p');status.setAttribute('role','status');body.append(status);
 let image=null,texture=null;
 function paint(){
  if(closed)return;const {width:W,height:H}=canvas.getBoundingClientRect();if(!W||!H)return;const ratio=globalThis.devicePixelRatio||1;canvas.width=Math.round(W*ratio);canvas.height=Math.round(H*ratio);const ctx=canvas.getContext('2d');ctx.scale(canvas.width/W,canvas.height/H);
  // Reserve dimension gutters; keep even very narrow parts wide enough for two inset bands.
  const scale=Math.min((W-48)/width,(H-44)/height),w=Math.max(12,Math.round(width*scale)),h=Math.max(12,Math.round(height*scale)),x=Math.round(34+(W-48-w)/2),y=Math.round(12+(H-44-h)/2);
  ctx.fillStyle=material?.color||finish.color||'#dfd0bc';ctx.fillRect(x,y,w,h);
  if(image){const uv=textureCoordinates(part,finish,withPhotoOrientation(material),image.naturalWidth/image.naturalHeight),pattern=ctx.createPattern(image,'repeat');if(pattern){const u=uv.width*scale/image.naturalWidth,v=uv.height*scale/image.naturalHeight;pattern.setTransform(new DOMMatrix(uv.uAxis===axes[0]?[u,0,0,v,x,y]:[0,u,v,0,x,y]));ctx.fillStyle=pattern;ctx.fillRect(x,y,w,h)}}
  ctx.strokeStyle='#a9b9ca';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y+h+7);ctx.lineTo(x+w,y+h+7);ctx.moveTo(x-9,y);ctx.lineTo(x-9,y+h);ctx.stroke();ctx.font='12px Arial';ctx.fillStyle='#edf4fc';ctx.textAlign='center';ctx.fillText('А: '+Math.round(width)+' мм',x+w/2,y+h+23);ctx.save();ctx.translate(x-18,y+h/2);ctx.rotate(-Math.PI/2);ctx.fillText('Б: '+Math.round(height)+' мм',0,0);ctx.restore();
  if(grain){const cx=x+w/2,cy=y+h/2,dx=Math.min(60,w*.65)/2;ctx.strokeStyle='#143e6a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx-dx,cy);ctx.lineTo(cx+dx,cy);for(const sign of [-1,1]){const px=cx+sign*dx;ctx.moveTo(px-sign*6,cy-5);ctx.lineTo(px,cy);ctx.lineTo(px-sign*6,cy+5)}ctx.stroke()}
  // One inset fill mechanism for every side: exact CSS-pixel thickness, no centred
  // strokes, clipping or orientation-dependent antialiasing. Draw bands last.
  for(const edged of [false,true])for(let i=0;i<4;i++){
   if((draft[slots[i]]!==null&&draft[slots[i]]!==undefined&&draft[slots[i]]!=='')!==edged)continue;
   const t=edged?4:1,rects=[[x,y,t,h],[x+w-t,y,t,h],[x,y,w,t],[x,y+h-t,w,t]];
   ctx.fillStyle=edged?'#ef4444':'#8ba0b6';ctx.fillRect(...rects[i]);
  }
 }
 useAll.onclick=()=>{const value=allSelect.value===''?null:Number(allSelect.value);draft.fill(value);allMode=value!==null;controls.forEach(input=>input.value=allSelect.value);paint()};
 const url=validTextureUrl(material?.textureUrl);if(url){texture=new Image();texture.onload=()=>{image=texture;paint()};texture.onerror=()=>{if(!closed)status.textContent='Снимката на декора не се зарежда. Показан е цветът на материала.'};texture.src=url}
 const observer=new ResizeObserver(paint);observer.observe(canvas);paint();return {body,status,read:()=>({edges:[...draft],allEdges:allMode&&draft.every(v=>v===draft[0])}),dispose(){closed=true;observer.disconnect();if(texture)texture.onload=texture.onerror=null}};
}
