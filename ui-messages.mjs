import {decorateAction} from './icons.mjs';

export function installDialogs(){
 const layouts=new WeakMap();
 const selector='dialog[open]';

 function bounds(){
  const viewport=window.visualViewport;
  return viewport
   ? {x:viewport.offsetLeft,y:viewport.offsetTop,width:viewport.width,height:viewport.height}
   : {x:0,y:0,width:window.innerWidth,height:window.innerHeight};
 }
 function limit(dialog,state,left,top){
  const rect=dialog.getBoundingClientRect(),view=bounds();
  const x=Math.max(view.x,Math.min(left,view.x+view.width-rect.width));
  const y=Math.max(view.y,Math.min(top,view.y+view.height-rect.height));
  state.x+=x-rect.left;
  state.y+=y-rect.top;
  dialog.style.setProperty('--dialog-x',state.x+'px');
  dialog.style.setProperty('--dialog-y',state.y+'px');
 }
 function reset(dialog,state){
  state.drag=null;
  state.x=state.y=0;
  dialog.style.removeProperty('--dialog-x');
  dialog.style.removeProperty('--dialog-y');
 }
 function decorate(dialog){
  const panel=dialog.querySelector(':scope > .nedConfirmPanel, :scope > form, :scope > div:has(> h3)')||dialog;
  let header=dialog.querySelector('.dialogHead,.textureManagerHead');
  if(!header){
   const heading=panel.querySelector(':scope > :is(h1,h2,h3)')||document.createElement('strong');
   if(!heading.textContent)heading.textContent=dialog.getAttribute('aria-label')||'NED-IQ';
   header=document.createElement('div');
   panel.prepend(header);
   header.append(heading);
  }
  header.classList.add('dialogHead','nedDialogHandle');
  let close=header.querySelector('button');
  if(!close){
   close=document.createElement('button');
   close.type='button';
   close.onclick=()=>{
    if(typeof dialog.requestClose==='function')dialog.requestClose();
    else if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
   };
   header.append(close);
  }
  close.classList.add('nedDialogClose');
  if(!close.querySelector('svg'))decorateAction(close,'close','Затваряне на прозореца',{iconOnly:true});

  const state={x:0,y:0,drag:null};
  layouts.set(dialog,state);
  dialog.classList.add('nedMovableDialog');
  header.addEventListener('pointerdown',event=>{
   if(!event.isPrimary||event.button!==0||event.target.closest('button,a,input,select,textarea,[contenteditable]'))return;
   const rect=dialog.getBoundingClientRect();
   state.drag={id:event.pointerId,x:event.clientX-rect.left,y:event.clientY-rect.top};
   header.setPointerCapture(event.pointerId);
   event.preventDefault();
  });
  header.addEventListener('pointermove',event=>{
   const drag=state.drag;
   if(drag?.id===event.pointerId)limit(dialog,state,event.clientX-drag.x,event.clientY-drag.y);
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture']){
   header.addEventListener(name,event=>{if(state.drag?.id===event.pointerId)state.drag=null});
  }
  dialog.addEventListener('close',()=>{if(!dialog.open)reset(dialog,state)});
 }
 function prepare(dialog){
  if(!layouts.has(dialog))decorate(dialog);
 }
 document.querySelectorAll(selector).forEach(prepare);
 new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes'&&record.target.matches('dialog')){
    if(record.oldValue!==null&&layouts.has(record.target))reset(record.target,layouts.get(record.target));
    if(record.target.open)prepare(record.target);
   }
   for(const node of record.addedNodes){
    if(!(node instanceof Element))continue;
    if(node.matches(selector))prepare(node);
    node.querySelectorAll(selector).forEach(prepare);
   }
  }
 }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeOldValue:true,attributeFilter:['open']});
 function keepVisible(){
  for(const dialog of document.querySelectorAll(selector)){
   const state=layouts.get(dialog);
   if(!state)continue;
   const rect=dialog.getBoundingClientRect();
   limit(dialog,state,rect.left,rect.top);
  }
 }
 window.addEventListener('resize',keepVisible);
 window.visualViewport?.addEventListener('resize',keepVisible);
 window.visualViewport?.addEventListener('scroll',keepVisible);
}

export function nedPromptName(message,initial='',{heading='Наименование',okLabel='Запази'}={}){
 return new Promise(resolve=>{
 const overlay=document.createElement('dialog');overlay.className='nedConfirmOverlay';
 const panel=document.createElement('div');panel.className='nedConfirmPanel';
 const title=document.createElement('h3');title.textContent=heading;title.id='notice-'+crypto.randomUUID();overlay.setAttribute('aria-labelledby',title.id);
 const desc=document.createElement('p');desc.textContent=message;
 const field=document.createElement('input');field.type='text';field.value=initial;field.className='nedPromptInput';field.setAttribute('aria-label',message);
 const actions=document.createElement('div');actions.className='nedConfirmActions';
 const cancel=document.createElement('button');cancel.textContent='Отказ';
 const save=document.createElement('button');save.textContent=okLabel;save.className='nedPrimaryButton';
 const done=value=>{document.removeEventListener('keydown',keys);overlay.close();overlay.remove();resolve(value)};
 const keys=e=>{if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();done(null)}else if(e.key==='Enter'){e.preventDefault();if(field.value.trim())done(field.value.trim())}};
 overlay.addEventListener('cancel',e=>{e.preventDefault();done(null)});cancel.onclick=()=>done(null);save.onclick=()=>{if(field.value.trim())done(field.value.trim());else field.focus()};
 overlay.onclick=e=>{if(e.target===overlay)done(null)};
 actions.append(cancel,save);panel.append(title,desc,field,actions);overlay.append(panel);document.body.append(overlay);overlay.showModal();document.addEventListener('keydown',keys);field.focus();field.select();
 });
}
export function nedConfirmAction(message,heading='Потвърждение',okLabel='Потвърди'){
 return new Promise(resolve=>{
 const overlay=document.createElement('dialog');overlay.className='nedConfirmOverlay';
 const panel=document.createElement('div');panel.className='nedConfirmPanel';
 const title=document.createElement('h3');title.textContent=heading;title.id='notice-'+crypto.randomUUID();overlay.setAttribute('aria-labelledby',title.id);
 const desc=document.createElement('p');desc.textContent=message;
 const actions=document.createElement('div');actions.className='nedConfirmActions';
 const cancel=document.createElement('button');cancel.textContent='Отказ';
 const accept=document.createElement('button');accept.textContent=okLabel;accept.className=okLabel==='Изтрий'?'nedDangerButton':'nedPrimaryButton';
 const done=value=>{document.removeEventListener('keydown',keys);overlay.close();overlay.remove();resolve(value)};
 const keys=e=>{if(e.isComposing)return;if(e.key==='Escape'){e.preventDefault();done(false)}else if(e.key==='Enter'){e.preventDefault();done(true)}};
 overlay.addEventListener('cancel',e=>{e.preventDefault();done(false)});cancel.onclick=()=>done(false);accept.onclick=()=>done(true);
 overlay.onclick=e=>{if(e.target===overlay)done(false)};
 actions.append(cancel,accept);panel.append(title,desc,actions);overlay.append(panel);document.body.append(overlay);overlay.showModal();document.addEventListener('keydown',keys);cancel.focus();
 });
}
export function nedConfirmDelete(message){return nedConfirmAction(message,'Потвърждение за изтриване','Изтрий')}
export function materialSaveNotice(message,isError=false){
 let toast=document.getElementById('nedMaterialSaveToast');
 if(!toast){toast=document.createElement('div');toast.id='nedMaterialSaveToast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.appendChild(toast)}
 toast.textContent=message.replace(/^[✓⚠]\s*/,isError?'⚠  ':'✓  ');toast.classList.toggle('nedNoticeError',isError);toast.style.background=isError?'#7d2933':'#14634f';toast.style.setProperty('display','block','important');toast.style.setProperty('visibility','visible','important');toast.style.setProperty('opacity','1','important');
 clearTimeout(materialSaveNotice.timer);materialSaveNotice.timer=setTimeout(()=>toast.style.display='none',4500);
}
