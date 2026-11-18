const labels={owner:'Собственик',editor:'Редактор',viewer:'Наблюдател'};
const baseLabel=base=>base.role==='owner'?'Моята база':'Базата на '+base.ownerName;

function element(tag,text=''){
 const node=document.createElement(tag);
 node.textContent=text;
 return node;
}
function button(text,action){
 const node=element('button',text);
 node.type='button';node.onclick=action;
 return node;
}
function roleSelect(selected,label){
 const select=element('select');
 select.setAttribute('aria-label',label);
 for(const role of ['editor','viewer'])select.add(new Option(labels[role],role));
 select.value=selected;
 return select;
}

export function installSharingUI({sharing,account,selectBase}){
 let dialog=null,refresh=null,discovery=0;
 const indicator=button('',()=>open('choose'));
 indicator.id='sharedBaseStatus';indicator.hidden=true;
 const indicatorName=element('span'),indicatorRole=element('span');
 indicator.append(indicatorName,indicatorRole);
 document.getElementById('cloudStatus').after(indicator);
 function open(kind='manage'){
  if(dialog?.open)dialog.close();
  const active=element('dialog'),heading=element('h3',kind==='choose'?'Избор на база данни':'Потребители и достъп');
  active.id='sharingDialog';active.className='materialEditDialog';dialog=active;
  heading.id='sharingTitle';active.setAttribute('aria-labelledby',heading.id);
  const body=element('div'),status=element('p');
  status.setAttribute('role','status');
  active.append(heading,body,status,button('Затвори',()=>active.close()));
  active.addEventListener('keydown',event=>event.stopPropagation());
  active.addEventListener('close',()=>{active.remove();if(dialog===active){dialog=null;refresh=null}});
  document.body.append(active);active.showModal();
  let revision=0;
  const current=version=>dialog===active&&active.open&&revision===version;
  async function action(operation,message,close=false){
   const version=revision;
   const controls=[...body.querySelectorAll('button,input,select')].filter(node=>!node.disabled);
   controls.forEach(node=>node.disabled=true);
   try{
    await operation();
    if(close&&active.open){active.close();return}
    if(current(version))await render(message);
   }catch(error){if(current(version))status.textContent=error.message}
   finally{controls.forEach(node=>node.disabled=false)}
  }
  async function render(message=''){
   const version=++revision,session=account();
   body.replaceChildren();status.textContent=message;
   if(!session.actorUid){
    body.append(element('p','Влез с Google, за да управляваш достъпа.'));
    return;
   }
   if(kind==='choose'){
    body.append(element('p','Зареждане на базите…'));
    try{
     const rows=await sharing.bases();
     if(!current(version))return;
     body.replaceChildren();
     const bases=[{ownerUid:session.actorUid,role:'owner'},...rows];
     const select=element('select');select.setAttribute('aria-label','Избрана база');
     for(const base of bases)select.add(new Option(baseLabel(base)+' — '+labels[base.role],base.ownerUid));
     select.value=session.uid;
     body.append(select,button('Отвори база',()=>action(()=>selectBase(select.value),'',true)));
    }catch{
     if(!current(version))return;
     body.replaceChildren(button('Моята база — Собственик',()=>action(()=>selectBase(session.actorUid),'',true)));
     status.textContent='Споделените бази са недостъпни.';
    }
    return;
   }
   body.append(button('Смени активната база',()=>open('choose')));
   body.append(element('p','Управляваш достъпа до личната си база.'));
   const form=element('form'),email=element('input'),role=roleSelect('viewer','Роля');
   email.type='email';email.required=true;email.maxLength=254;email.placeholder='Google имейл';
   email.setAttribute('aria-label','Google имейл');
   const add=element('button','Добави');add.type='submit';
   form.append(email,role,add);body.append(form);
   form.onsubmit=event=>{event.preventDefault();action(()=>sharing.add(email.value,role.value),'Достъпът е предоставен.')};
   try{
    const rows=await sharing.members();
    if(!current(version))return;
    body.append(element('h4','Потребители с достъп'));
    if(!rows.length)body.append(element('p','Няма добавени потребители.'));
    for(const member of rows){
     const row=element('p'),select=roleSelect(member.role,'Роля за '+member.email);
     row.append(element('span',member.email+' '),select,
      button('Запази роля',()=>action(()=>sharing.changeRole(member.email,select.value),'Ролята е обновена.')),
      button('Отнеми достъп',()=>action(()=>sharing.revoke(member.email),'Достъпът е отнет.')));
     body.append(row);
    }
   }catch(error){if(current(version))status.textContent=error.message}
  }
  refresh=render;render();
 }
 window.addEventListener('ned-sharing-open',()=>open());
 window.addEventListener('kitchen-project-auth',()=>{
  const state=account();
  indicator.hidden=!state.uid;
  indicatorName.textContent=state.uid?baseLabel(state):'';
  indicatorRole.textContent=state.uid?' — '+labels[state.role]:'';
  indicator.title=indicator.textContent;
  indicator.setAttribute('aria-label',indicator.textContent+(state.uid?' · Смени база':''));
  refresh?.();
 });
 return {
  async discover(){
   const version=++discovery,actor=account().actorUid;
   if(!actor)return;
   try{
    const rows=await sharing.bases();
    if(version===discovery&&actor===account().actorUid&&rows.length&&!dialog?.open)open('choose');
   }catch{/* The personal base remains available when discovery fails. */}
  }
 };
}
