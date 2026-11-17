const labels={owner:'Собственик',editor:'Редактор',viewer:'Наблюдател'};
const validId=value=>typeof value==='string'&&/^[\w-]{1,128}$/.test(value);

function invitationURL(owner,id){
 const url=new URL(location.pathname,location.origin);
 url.searchParams.set('inviteOwner',owner);
 url.searchParams.set('invite',id);
 return url;
}

export function installSharingUI({sharing,account,selectBase}){
 let dialog=null,revision=0;
 const initial=new URL(location.href);
 const invitation={owner:initial.searchParams.get('inviteOwner'),id:initial.searchParams.get('invite')};
 const hasInvitation=()=>validId(invitation.owner)&&validId(invitation.id);
 const element=(tag,text)=>{
  const e=document.createElement(tag);
  if(text)e.textContent=text;
  return e;
 };
 const button=(text,action)=>{
  const b=element('button',text);
  b.type='button';
  b.onclick=action;
  return b;
 };
 const roles=selected=>{
  const select=element('select');
  select.setAttribute('aria-label','Роля');
  for(const role of ['editor','viewer'])select.add(new Option(labels[role],role));
  select.value=selected;
  return select;
 };
 function forgetInvitation(){
  invitation.owner=null;invitation.id=null;
  const url=new URL(location.href);
  url.searchParams.delete('inviteOwner');url.searchParams.delete('invite');
  history.replaceState(history.state,'',url);
 }
 function open(){
  if(dialog?.open)return;
  dialog=element('dialog');
  dialog.id='sharingDialog';dialog.className='materialEditDialog';
  dialog.setAttribute('aria-labelledby','sharingTitle');
  const heading=element('h3','Потребители и достъп');heading.id='sharingTitle';
  const body=element('div'),status=element('p');
  status.setAttribute('role','status');
  const close=button('Затвори',()=>dialog.close());
  dialog.append(heading,body,status,close);
  const active=dialog;
  active.addEventListener('keydown',event=>event.stopPropagation());
  active.addEventListener('close',()=>{active.remove();if(dialog===active){dialog=null;revision++}});
  document.body.append(active);active.showModal();
  const current=()=>dialog===active&&active.open;
  const action=async(fn,success)=>{
   const generation=revision;
   const buttons=[...body.querySelectorAll('button,select,input')].filter(e=>!e.disabled);
   buttons.forEach(e=>e.disabled=true);status.textContent='Изчакване…';
   try{
    await fn();
    if(!current()||generation!==revision)return;
    await render(success);
   }catch(error){if(current()&&generation===revision)status.textContent=error.message||'Операцията е отказана.'}
   finally{buttons.forEach(e=>e.disabled=false)}
  };
  async function render(message=''){
   const generation=++revision,{actorUid,uid,role,email}=account();
   body.replaceChildren();status.textContent=message;
   if(!actorUid){
    body.append(element('p','Влез с Google, за да управляваш достъпа или да приемеш покана.'));
    body.append(button('Вход с Google',()=>document.getElementById('cloudLogin').click()));
    return;
   }
   body.append(element('p',email+' · '+labels[role]));
   if(hasInvitation()){
    body.append(element('h4','Получена покана'));
    body.append(button('Приеми поканата',()=>action(async()=>{
     const {owner,id}=invitation;
     await sharing.accept(owner,id);
     if(account().actorUid!==actorUid)return;
     forgetInvitation();
     await selectBase(owner);
    },'Поканата е приета.')));
   }
   const bases=element('section');
   bases.append(element('h4','Избрана база'));
   const select=element('select');select.setAttribute('aria-label','Избрана база');
   select.add(new Option('Моята база',actorUid));
   if(uid!==actorUid)select.add(new Option('Споделена база · '+uid,uid));
   select.value=uid;
   const switchButton=button('Отвори база',()=>action(()=>selectBase(select.value),'Базата е отворена.'));
   bases.append(select,switchButton);body.append(bases);
   const directory=sharing.bases().then(rows=>{
    if(!current()||revision!==generation)return;
    for(const row of rows){
     if(validId(row.ownerUid)&&![...select.options].some(o=>o.value===row.ownerUid)){
      select.add(new Option('Споделена база · '+row.ownerUid,row.ownerUid));
     }
    }
   }).catch(()=>{if(current()&&revision===generation)status.textContent='Списъкът със споделени бази е недостъпен.'});
   if(role!=='owner'){await directory;return}
   const section=element('section');
   section.append(element('h4','Покани потребител'));
   const form=element('form'),address=element('input'),roleInput=roles('viewer');
   address.type='email';address.required=true;address.placeholder='Google имейл';address.setAttribute('aria-label','Google имейл');
   const submit=element('button','Създай покана');submit.type='submit';
   form.append(address,roleInput,submit);section.append(form);body.append(section);
   form.onsubmit=event=>{
    event.preventDefault();
    action(()=>sharing.invite(actorUid,address.value,roleInput.value),'Поканата е създадена. Изпрати връзката на поканения потребител.');
   };
   try{
    const [members,invitations]=await Promise.all([sharing.members(actorUid),sharing.invitations(actorUid)]);
    if(!current()||revision!==generation)return;
    section.append(element('h4','Потребители с достъп'));
    const active=members.filter(m=>m.status==='active');
    if(!active.length)section.append(element('p','Няма други потребители с достъп.'));
    for(const member of active){
     const row=element('p'),selectRole=roles(member.role);
     selectRole.setAttribute('aria-label','Роля за '+member.email);
     row.append(element('span',member.email+' '),selectRole,
      button('Запази роля',()=>action(()=>sharing.changeRole(actorUid,member.uid,selectRole.value),'Ролята е обновена.')),
      button('Отнеми достъп',()=>action(()=>sharing.revoke(actorUid,member.uid),'Достъпът е отнет.')));
     section.append(row);
    }
    section.append(element('h4','Чакащи покани'));
    const pending=invitations.filter(i=>i.state==='pending');
    if(!pending.length)section.append(element('p','Няма чакащи покани.'));
    for(const invite of pending){
     const row=element('p'),expires=invite.expiresAt?.toDate?.()||new Date(invite.expiresAt);
     const expired=expires.getTime()<=Date.now();
     row.append(element('span',invite.email+' · '+labels[invite.role]+' · '+(expired?'Изтекла':'До '+expires.toLocaleString('bg-BG'))+' '));
     if(!expired){
      const link=element('input');link.type='url';link.readOnly=true;link.value=invitationURL(actorUid,invite.id).href;
      link.setAttribute('aria-label','Връзка за '+invite.email);
      row.append(link,button('Копирай връзка',async()=>{
       try{await navigator.clipboard.writeText(link.value);status.textContent='Връзката е копирана.'}
       catch{link.focus();link.select();status.textContent='Копирай маркираната връзка.'}
      }));
     }
     row.append(button('Отмени поканата',()=>action(()=>sharing.cancel(actorUid,invite.id),'Поканата е отменена.')));
     section.append(row);
    }
   }catch(error){if(current()&&revision===generation)status.textContent=error.message||'Достъпът до списъка е отказан.'}
  }
  active.refreshSharing=render;
  render();
 }
 const indicator=element('span');
 indicator.id='sharedBaseStatus';indicator.hidden=true;indicator.setAttribute('role','status');
 document.getElementById('cloudStatus').after(indicator);
 window.addEventListener('ned-sharing-open',open);
 window.addEventListener('kitchen-project-auth',()=>{
  const {uid,actorUid,role}=account();
  indicator.hidden=!uid||uid===actorUid;
  indicator.textContent=indicator.hidden?'':'Споделена база · '+labels[role];
  indicator.title=indicator.hidden?'':'Собственик: '+uid;
  if(dialog?.open)dialog.refreshSharing();
  else if(hasInvitation())open();
 });
 if(hasInvitation())open();
}
