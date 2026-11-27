import {decorateAction} from '../icons.mjs';
import {appStorage} from '../safe-storage.mjs';
import {workspaceHelp} from './help-content.mjs';
import {t as text} from './i18n.mjs';

const preference='nedIQ.help.showAtStartup';
const quickTitle='Кратко ръководство';
const fullTitle='Пълно ръководство';

function element(tag,text=''){
 const node=document.createElement(tag);
 if(text)node.textContent=text;
 return node;
}
function button(text,action){
 const control=element('button',text);
 control.type='button';
 control.onclick=action;
 return control;
}
function iconText(icon,label,tag='span'){
 const node=element(tag,label);
 const iconHolder=decorateAction(element('button'),icon,label,{iconOnly:true});
 node.prepend(iconHolder.firstElementChild);
 return node;
}
function dialogFrame(id,text){
 const dialog=element('dialog');
 dialog.id=id;
 dialog.className='nedHelpDialog';
 const head=element('div');
 head.className='dialogHead';
 const title=element('h2');
 title.id=id+'Title';
 title.tabIndex=-1;
 dialog.setAttribute('aria-labelledby',title.id);
 const close=decorateAction(button('',()=>dialog.close()),'close',text('Затваряне на прозореца'),{iconOnly:true});
 close.classList.add('nedDialogClose');
 if(id==='helpDialog')close.id='helpClose';
 head.append(title,close);
 const body=element('div');
 body.className='nedHelpBody';
 body.tabIndex=0;
 const footer=element('div');
 footer.className='dialogFoot';
 dialog.append(head,body,footer);
 document.body.append(dialog);
 dialog.addEventListener('keydown',event=>{
  event.stopPropagation();
  if(event.key==='Escape'){
   event.preventDefault();
   dialog.close();
  }
 });
 return {dialog,title,body,footer};
}
function renderQuick(body,guide){
 for(const [icon,title,description] of guide){
  const section=element('section');
  section.append(iconText(icon,title,'h3'),element('p',description));
  body.append(section);
 }
}
function renderTopic(topic,heading=true){
 const section=element('section');
 if(heading)section.append(iconText(topic.icon,topic.title,'h3'));
 const steps=element('ol');
 for(const step of topic.steps)steps.append(element('li',step));
 section.append(steps);
 if(topic.icons){
  const icons=element('ul');
  icons.className='nedHelpIcons';
  for(const [icon,label] of topic.icons)icons.append(iconText(icon,label,'li'));
  section.append(icons);
 }
 return section;
}

export function installHelp(){
 const {guide,topics}=workspaceHelp(document.documentElement.lang);
 const welcome=dialogFrame('welcomeDialog',text);
 welcome.title.textContent=text('Добре дошли в NED-IQ');
 welcome.body.append(element('p',text('Кратко ръководство за начало')));
 renderQuick(welcome.body,guide);
 welcome.body.append(element('p',text('Подробни инструкции в меню „Помощ“')));
 let showAtStartup=appStorage.getItem(preference)!=='off';
 const preferences=[];
 function startupPreference(){
  const label=element('label');
  const checkbox=element('input');
  checkbox.type='checkbox';
  checkbox.checked=showAtStartup;
  checkbox.onchange=()=>{
   showAtStartup=checkbox.checked;
   appStorage.setItem(preference,showAtStartup?'on':'off');
   for(const peer of preferences)peer.checked=showAtStartup;
  };
  preferences.push(checkbox);
  label.append(checkbox,text('Показвай при стартиране'));
  return label;
 }
 const preferenceLabel=startupPreference();
 const start=button(text('Започни работа'),()=>welcome.dialog.close());
 start.className='nedPrimaryButton';
 welcome.footer.append(preferenceLabel,start);

 const help=dialogFrame('helpDialog',text);
 const quickPreference=startupPreference();
 const titles=[text(quickTitle),...topics.map(topic=>topic.title),text(fullTitle)];
 let page=0,section=0;
 function render(){
  const full=page===titles.length-1;
  const titleIcon=page>0&&!full?topics[page-1].icon:'info';
  help.title.replaceChildren(...iconText(titleIcon,titles[page]).childNodes);
  help.body.replaceChildren();
  if(page===0)renderQuick(help.body,guide);
  else if(full){
   const picker=element('select');
   picker.setAttribute('aria-label',text('Раздел от пълното ръководство'));
   topics.forEach((topic,index)=>picker.add(new Option(topic.title,index)));
   picker.value=section;
   picker.onchange=()=>{section=Number(picker.value);render();help.title.focus({preventScroll:true})};
   help.body.append(picker,renderTopic(topics[section]));
  }else help.body.append(renderTopic(topics[page-1],false));
  help.body.scrollTop=0;
  quickPreference.hidden=page!==0;
  previous.disabled=full?section===0:page===0;
  next.disabled=full&&section===topics.length-1;
 }
 function turn(delta){
  if(page===titles.length-1)section+=delta;
  else page+=delta;
  render();
  help.title.focus({preventScroll:true});
 }
 const previous=button(text('Предишна'),()=>turn(-1));
 const next=button(text('Следваща'),()=>turn(1));
 help.footer.append(previous,quickPreference,next);

 // The startup window leaves the workspace and sign-in available.
 function dismissOutside(event){
  if(welcome.dialog.open&&!welcome.dialog.contains(event.target))welcome.dialog.close();
 }
 document.addEventListener('pointerdown',dismissOutside,true);
 document.addEventListener('focusin',dismissOutside);
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&welcome.dialog.open&&!document.querySelector('dialog:modal')){
   event.preventDefault();
   welcome.dialog.close();
  }
 },true);
 return {
  items:titles.map((title,index)=>[title,()=>{
   if(welcome.dialog.open)welcome.dialog.close();
   page=index;section=0;
   render();
   help.dialog.showModal();
   help.title.focus({preventScroll:true});
  }]),
  showStartup(){
   if(showAtStartup&&!document.querySelector('dialog[open]'))welcome.dialog.show();
  }
 };
}
