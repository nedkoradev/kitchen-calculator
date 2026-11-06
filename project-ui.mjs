import {decorateAction} from './icons.mjs';
import {ProjectError,projectErrorMessage} from './project-model.mjs';

export function installProjectUI({snapshot,apply,feedback,isProjectMode,onSaved,getName,captureDraft,restoreDraft,clearDraft}){
 let uid=null,epoch=0,opened=null,busy=false,dialog=null,anonymousDraft=false;
 const pending=new Map(),drafts=new Map();
 function call(action,args){
  return new Promise((resolve,reject)=>{
   const requestId=crypto.randomUUID(),timer=setTimeout(()=>{
    pending.delete(requestId);
    reject(new ProjectError('unconfirmed','Облакът не потвърди операцията навреме. Тя може да завърши по-късно; обнови списъка преди повторение.'));
   },30000);
   pending.set(requestId,{resolve,reject,timer,epoch,uid});
   window.dispatchEvent(new CustomEvent('kitchen-project-request',{detail:{requestId,action,args}}));
  });
 }
 window.addEventListener('kitchen-project-response',event=>{
  const response=event.detail||{},job=pending.get(response.requestId);if(!job)return;
  pending.delete(response.requestId);clearTimeout(job.timer);
  if(job.epoch!==epoch||response.uid!==job.uid)return job.reject(new ProjectError('auth-changed','Потребителят е сменен. Опитай отново.'));
  if(response.error)job.reject(new ProjectError(response.error.code,response.error.message,response.error.details));
  else job.resolve(response.result);
 });
 window.addEventListener('kitchen-project-auth',event=>{
  const next=event.detail?.uid||null;if(next===uid)return;
  const keepAnonymous=!uid&&(anonymousDraft||captureDraft()?.data?.parts?.length);
  if(uid){drafts.set(uid,{draft:captureDraft(),opened});clearDraft()}
  uid=next;epoch++;opened=null;
  for(const job of pending.values()){clearTimeout(job.timer);job.reject(new ProjectError('auth-changed','Потребителят е сменен. Няма потвърдена операция за текущия потребител.'))}
  pending.clear();dialog?.close();busy=false;
  if(uid&&drafts.has(uid)&&!keepAnonymous){const saved=drafts.get(uid);restoreDraft(saved.draft);opened=saved.opened}
  anonymousDraft=false;
 });
 window.dispatchEvent(new Event('kitchen-project-auth-request'));
 function modal(title){
  dialog?.close();
  const element=document.createElement('dialog');element.id='projectCloudDialog';element.className='materialEditDialog';
  const heading=document.createElement('h3');heading.textContent=title;
  const status=document.createElement('p');status.id='projectCloudStatus';status.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='materialActions';
  const cancel=button('projectCloudCancel','Отказ',()=>element.close());
  actions.append(cancel);element.append(heading,status,actions);
  document.body.append(element);element.addEventListener('cancel',event=>{if(busy)event.preventDefault()});element.addEventListener('close',()=>element.remove());element.showModal();dialog=element;
  return {element,status,actions,cancel,insert:el=>element.insertBefore(el,status)};
 }
 function button(id,text,action){const b=document.createElement('button');b.id=id;b.type='button';b.textContent=text;b.onclick=action;return decorateAction(b,id.includes('Save')?'save':id.includes('Open')?'open':id.includes('Delete')?'trash':'close',text)}
 function eligible(){if(!isProjectMode()||busy)return false;return true}
 async function operation(ui,run){
  if(busy)return;busy=true;
  const token=epoch;
  ui.element.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  ui.status.textContent='Изчакване на потвърждение от облака…';
  try{await run(token)}catch(error){if(token===epoch)ui.status.textContent=projectErrorMessage(error)}
  finally{if(token===epoch){busy=false;ui.element.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);const select=ui.element.querySelector('#projectCloudList');if(select&&!select.options.length)ui.element.querySelectorAll('#projectCloudOpen,#projectCloudDelete').forEach(el=>el.disabled=true)}}
 }
 async function save(saveAs=false){
  if(!eligible())return;
  const ui=modal(saveAs?'Запази проект като':'Запази проект в облака');
  const label=document.createElement('label');label.textContent='Име на проекта';
  const input=document.createElement('input');input.id='projectCloudName';input.type='text';input.maxLength=100;
  input.value=saveAs?'':getName();label.htmlFor=input.id;ui.insert(label);ui.insert(input);
  const saveButton=button('projectCloudSave','Запази',()=>operation(ui,async token=>{
   const args={name:input.value,data:snapshot(),saveAs,...(!saveAs&&opened?.uid===uid?{id:opened.id,revision:opened.revision}:{})};
   let result;
   for(;;){
    try{result=await call('save',args);break}
    catch(error){if(error.code!=='confirmation-required'||!confirm(error.message))throw error.code==='confirmation-required'?new ProjectError('cancelled','Записът е отказан. Няма промени в облака.'):error;args.confirmation=error.details}
   }
   if(token!==epoch)return;
   opened=result;onSaved(result);feedback('☁ Проектът „'+result.name+'“ е потвърдено записан в облака.');ui.element.close();
  }));
  saveButton.classList.add('libraryPrimary');ui.actions.append(saveButton);input.focus();
  if(!uid)ui.status.textContent='Първо влез с Google от горния десен ъгъл.';
 }
 async function open(){
  if(!eligible())return;
  const ui=modal('Отвори облачен проект'),select=document.createElement('select');select.id='projectCloudList';ui.insert(select);
  const load=button('projectCloudOpen','Отвори',()=>operation(ui,async token=>{
   const result=await call('open',select.value);
   if(token!==epoch||!isProjectMode())return;
   apply(result.data);opened=result;onSaved(result);feedback('☁ Отворен проект: '+result.name);ui.element.close();
  }));
  const remove=button('projectCloudDelete','Изтрий',()=>operation(ui,async token=>{
   const option=select.selectedOptions[0];if(!option)return;
   if(!confirm('Да изтрия ли облачния проект „'+option.textContent+'“?')){ui.status.textContent='Изтриването е отказано.';return}
   const id=option.value;
   await call('remove',{id,revision:Number(option.dataset.revision)});if(token!==epoch)return;
   option.remove();if(opened?.id===id)opened=null;feedback('☁ Изтриването е потвърдено от облака.');ui.status.textContent='Проектът е изтрит.';
  }));
  ui.actions.append(remove,load);
  load.disabled=remove.disabled=true;ui.status.textContent='Зареждане от облака…';
  const token=epoch;
  try{
   const result=await call('list');if(token!==epoch||!ui.element.isConnected)return;
   result.items.forEach(p=>{const option=new Option(p.name,p.id);option.dataset.revision=p.revision;select.add(option)});
   load.disabled=remove.disabled=!select.options.length;ui.status.textContent=result.items.length?'':'Няма запазени облачни проекти.';
  }catch(error){if(token===epoch)ui.status.textContent=projectErrorMessage(error)}
 }
 return {save,open,detach(){opened=null;anonymousDraft=!uid},get opened(){return opened}};
}
