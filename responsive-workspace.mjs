import {decorateAction} from './icons.mjs';
export function installResponsiveWorkspace({openProperties,getSelection}){
 const $=id=>document.getElementById(id),query=matchMedia('(max-width:900px)'),body=document.body;
 const viewTools=document.createElement('div');viewTools.id='shellViewTools';viewTools.setAttribute('aria-label','Изгледи и размери');$('shellBottomTools').append(viewTools);
 const panels=document.createElement('nav');panels.id='mobileWorkspaceBar';panels.setAttribute('aria-label','Работни панели');document.querySelector('main').before(panels);
 function closeTree(){body.classList.remove('outlineOpen');treeButton.setAttribute('aria-expanded','false')}
 const treeButton=document.createElement('button');treeButton.type='button';treeButton.id='mobileOutlineToggle';treeButton.textContent='Структура';treeButton.setAttribute('aria-controls','outlinePanel');treeButton.setAttribute('aria-expanded','false');decorateAction(treeButton,'group','Структура');
 treeButton.onclick=()=>{const open=!body.classList.contains('outlineOpen');$('inspectorPanel').classList.remove('inspectorOpen');body.classList.toggle('outlineOpen',open);treeButton.setAttribute('aria-expanded',String(open))};
 const propertyButton=document.createElement('button');propertyButton.type='button';propertyButton.id='mobilePropertiesToggle';propertyButton.textContent='Свойства';propertyButton.setAttribute('aria-controls','inspectorPanel');propertyButton.setAttribute('aria-expanded','false');decorateAction(propertyButton,'gear','Свойства');propertyButton.onclick=()=>{const open=!$('inspectorPanel').classList.contains('inspectorOpen');closeTree();if(open)openProperties();else $('inspectorPanel').classList.remove('inspectorOpen');propertyButton.setAttribute('aria-expanded',String(open))};panels.append(treeButton,propertyButton);
 const close=document.createElement('button');close.id='mobileOutlineClose';close.type='button';decorateAction(close,'close','Затвори структурата',{iconOnly:true});close.onclick=()=>{closeTree();treeButton.focus()};$('outlineHeading').after(close);
 const closeInspector=document.createElement('button');closeInspector.id='mobileInspectorClose';closeInspector.type='button';decorateAction(closeInspector,'close','Затвори свойствата',{iconOnly:true});closeInspector.onclick=()=>{$('inspectorPanel').classList.remove('inspectorOpen');propertyButton.focus()};$('inspectorTitle').after(closeInspector);
 function state(){propertyButton.disabled=false;propertyButton.setAttribute('aria-expanded',String($('inspectorPanel').classList.contains('inspectorOpen')))}
 function layout(){body.classList.toggle('compactWorkspace',query.matches);const dock=$('viewControlsDock');if(query.matches)viewTools.append(dock);else $('shellBottomTools').append(dock);closeTree();$('inspectorPanel').classList.remove('inspectorOpen');state()}
 query.addEventListener('change',layout);window.addEventListener('ned-selection-change',state);window.addEventListener('ned-document-change',()=>{closeTree();$('inspectorPanel').classList.remove('inspectorOpen');state()});
 new MutationObserver(state).observe($('inspectorPanel'),{attributes:true,attributeFilter:['class']});
 document.addEventListener('keydown',e=>{if(e.key!=='Escape'||document.querySelector('dialog:modal'))return;if(body.classList.contains('outlineOpen')){closeTree();treeButton.focus();e.preventDefault()}else if($('inspectorPanel').classList.contains('inspectorOpen')){$('inspectorPanel').classList.remove('inspectorOpen');propertyButton.focus();e.preventDefault()}});
 layout();return {layout};
}
