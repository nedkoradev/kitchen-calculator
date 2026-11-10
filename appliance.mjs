import {decorateAction} from './icons.mjs';
import {installMaterialPhotoEditor} from './material-photo-editor.mjs?v=216';
import {validTextureUrl} from './grain.mjs';
export const isAppliance=p=>!!p?.appliance;
export const inCut=(p,finish)=>!isAppliance(p)&&finish?.includeInCut!==false;
export function applianceFace(p){
 const turn=((p.appliance?.turn||0)%4+4)%4,angle=-turn*Math.PI/2;
 return {width:turn%2?p.d:p.w,height:p.h,angle,x:[0,-1,0,1][turn]*(p.w/2+.15),z:[1,0,-1,0][turn]*(p.d/2+.15)};
}
export function openApplianceEditor({part,name='',onSave}){
 const dialog=document.createElement('dialog');dialog.id='applianceDialog';dialog.className='materialEditDialog';dialog.style.cssText='width:min(480px,94vw);max-height:88dvh;overflow:auto';
 const title=document.createElement('h3');title.textContent=part?'Свойства на уреда':'Добави уред';dialog.append(title);
 const form=document.createElement('div');dialog.append(form);
 function field(id,label,value,type='text'){const l=document.createElement('label');l.htmlFor=id;l.textContent=label;const input=document.createElement('input');input.id=id;input.type=type;input.value=value;if(type==='number'){input.min=1;input.max=30000;input.step=1}form.append(l,input);return input}
 const titleInput=field('applianceName','Име',name||'Фурна');
 const dims={};for(const [k,label,value] of [['w','Ширина, мм',600],['h','Височина, мм',600],['d','Дълбочина, мм',550]]){dims[k]=field('appliance'+k,label,part?.[k]??value,'number');dims[k].disabled=!!part?.locks?.[k]}
 const hint=document.createElement('p');hint.className='projectHint';hint.textContent='Снимката покрива само предното лице, без повторение. Локалният файл е временен преглед; за запис на всички устройства снимката трябва да е публикувана в GitHub.';form.append(hint);
 const readPhoto=installMaterialPhotoEditor(form,{textureUrl:part?.appliance.textureUrl||''},dialog);
 const local=document.createElement('button');local.type='button';local.id='applianceLocalPhoto';local.textContent='Избери снимка от компютъра';local.onclick=()=>form.querySelector('input[type=file]').click();form.append(local);
 const status=document.createElement('p');status.setAttribute('role','status');status.id='applianceStatus';form.append(status);
 const actions=document.createElement('div');actions.className='materialActions';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отказ';cancel.onclick=()=>dialog.close();
 const save=document.createElement('button');save.id='applianceSave';save.type='button';save.textContent=part?'Приложи':'Добави';decorateAction(save,'save',save.textContent);
 save.onclick=()=>{const size=Object.fromEntries(Object.entries(dims).map(([k,input])=>[k,Number(input.value)]));if(!titleInput.value.trim()||Object.values(size).some(v=>!Number.isInteger(v)||v<1||v>30000)){status.textContent='Въведи име и цели размери от 1 до 30000 мм.';return}try{onSave({name:titleInput.value.trim(),...size,appliance:{turn:part?.appliance.turn||0,textureUrl:validTextureUrl(readPhoto())||''}});dialog.close()}catch(e){status.textContent=e.message}};
 actions.append(cancel,save);dialog.append(actions);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();titleInput.focus();
}
