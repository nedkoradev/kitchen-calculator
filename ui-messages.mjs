import {decorateAction} from './icons.mjs';

export function installDialogCloseButtons(){
 function decorate(dialog){
  if(!dialog.open||dialog.querySelector('.nedDialogClose'))return;
  const existing=dialog.querySelector('.dialogHead > button,header > button');
  const close=existing||document.createElement('button');
  close.type='button';
  close.classList.add('nedDialogClose');
  decorateAction(close,'close','Затвори',{iconOnly:true});
  if(!existing){
   close.onclick=()=>{
    if(typeof dialog.requestClose==='function')dialog.requestClose();
    else if(dialog.dispatchEvent(new Event('cancel',{cancelable:true})))dialog.close();
   };
   (dialog.querySelector('.nedConfirmPanel')||dialog).prepend(close);
  }
 }
 const selector='dialog[open]';
 document.querySelectorAll(selector).forEach(decorate);
 new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes'&&record.target.matches(selector))decorate(record.target);
   for(const node of record.addedNodes){
    if(!(node instanceof Element))continue;
    if(node.matches(selector))decorate(node);
    node.querySelectorAll(selector).forEach(decorate);
   }
  }
 }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
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
