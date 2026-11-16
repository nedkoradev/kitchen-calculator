import {decorateAction,iconNames} from './icons.mjs';
import {createDataTable,cutTableHeaders} from './ui-components.mjs';
import {createCabinetGenerator} from './cabinet-generator-ui.mjs';
import {createEdgeEditor} from './edge-editor.mjs';
import {createApplianceEditor} from './appliance.mjs';
export const catalogSections=['Бутони и икони','Цветове и фонове','Текстове','Менюта и полета','Таблици','Диалози и съобщения'];
const make=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e};
const hash=s=>{let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16)};
const properties=['display','width','height','min-height','padding','gap','color','background-color','background-image','border','border-radius','font-family','font-size','font-weight','line-height','box-shadow','opacity','stroke','stroke-width'];
function sheets(){
 const active=rules=>[...rules].map(r=>{if(r.type===CSSRule.MEDIA_RULE)return matchMedia(r.conditionText).matches?active(r.cssRules):'';if(r.type===CSSRule.SUPPORTS_RULE)return CSS.supports(r.conditionText)?active(r.cssRules):'';return r.cssText}).join('\n');
 const result=[];for(const sheet of document.styleSheets){try{result.push({url:sheet.href||'index.html · '+(sheet.ownerNode?.id||'style'),text:active(sheet.cssRules),rules:sheet.cssRules})}catch{/* Cross-origin sheets cannot be inspected. */}}return result;
}
function category(e){if(e.matches('button,svg,img'))return 0;if(e.matches('input,select,textarea,summary'))return 3;if(e.matches('table'))return 4;if(e.matches('dialog,[role=status],[role=alert],.status,.projectHint'))return 5;return 2}
function identity(e){if(e.id)return e.id;const semantic=['data-tab','data-v','data-action','aria-label','title','name'].map(a=>e.getAttribute(a)).find(Boolean);if(!semantic){if(e.matches('button,input,select,textarea,table,h1,h2,h3,h4,.projectHint,[role=status],[role=alert]'))return (e.parentElement?.closest('[id]')?.id||'app')+'-'+e.tagName.toLowerCase()+'-'+hash(e.matches('table')?[...e.querySelectorAll('th')].map(n=>n.textContent).join('|'):e.className||e.textContent.trim());return null}return (e.closest('[id]')?.id||'app')+'-'+e.tagName.toLowerCase()+'-'+hash(semantic)}
function name(e){return e.getAttribute('aria-label')||e.title||(e.labels?.[0]?.textContent||'').trim()||(e.previousElementSibling?.matches('label')?e.previousElementSibling.textContent.trim():'')||e.querySelector('.dialogHead')?.textContent.trim()||e.textContent.trim().slice(0,100)||e.id||e.tagName.toLowerCase()}
function safeClone(source){
 const clone=source.cloneNode(true);
 for(const e of [clone,...clone.querySelectorAll('*')]){
  for(const a of [...e.attributes])if(/^on/i.test(a.name)||['autofocus','form','formaction','href','srcdoc'].includes(a.name))e.removeAttribute(a.name);
  if(e.matches('script,iframe,object,embed,canvas,video,audio')){e.remove();continue}
  if(e.matches('button'))e.type='button';
  if(e.matches('input')){e.value=e.type==='number'?'600':e.type==='color'?'#3b82f6':'';e.checked=false;e.removeAttribute('value');e.removeAttribute('checked');if(e.type==='file')e.disabled=true}
  if(e.matches('textarea'))e.value='';
  if(e.matches('select')){e.replaceChildren(new Option('Примерен избор','sample'),new Option('Друг избор','other'))}
  if(e.matches('img')){const url=new URL(e.getAttribute('src')||'',location.href);if(url.origin!==location.origin||!url.pathname.includes('/assets/icons/'))e.remove();else e.src=url.href}
 }
 // Tables/dialogs demonstrate structure, never a saved project or material database.
 for(const table of [...(clone.matches('table')?[clone]:[]),...clone.querySelectorAll('table')]){for(const e of table.querySelectorAll('tbody td'))e.textContent='Пример';if(!table.querySelector('td')){const body=table.createTBody(),row=body.insertRow();for(let i=0;i<Math.max(2,table.querySelectorAll('th').length);i++)row.insertCell().textContent='Пример'}}
 for(const status of [...(clone.matches('[role=status],[role=alert],.status')?[clone]:[]),...clone.querySelectorAll('[role=status],[role=alert],.status')])status.textContent='Примерно съобщение';
 if(clone.matches('dialog'))clone.removeAttribute('open');
 return clone;
}
function context(source){const parents=[];for(let p=source.parentElement;p&&p!==document.body;p=p.parentElement){const clone=p.cloneNode(false);clone.removeAttribute('hidden');clone.removeAttribute('open');for(const a of [...clone.attributes])if(/^on/i.test(a.name))clone.removeAttribute(a.name);clone.style.setProperty('display','contents','important');parents.unshift(clone)}return parents}
export function installUICatalog(){
 const trigger=make('button','UI каталог');trigger.type='button';trigger.id='uiCatalogOpen';trigger.className='nedSettingsChoice';document.querySelector('#settingsDialog .nedSettingsMenu').append(trigger);
 const dialog=make('dialog');dialog.id='uiCatalogDialog';dialog.className='nedSettingsSubdialog';dialog.setAttribute('aria-labelledby','uiCatalogTitle');
 const head=make('div');head.className='dialogHead';const title=make('strong','UI каталог');title.id='uiCatalogTitle';const close=make('button','Затвори');close.type='button';close.id='uiCatalogClose';head.append(title,close);
 const body=make('div');body.className='dialogBody';const hint=make('p','Визуален справочник на реалните компоненти. Прегледите са изолирани и не изпълняват действия в проекта.');hint.className='projectHint';
 const searchLabel=make('label','Търсене по ID или наименование');searchLabel.htmlFor='uiCatalogSearch';const search=make('input');search.id='uiCatalogSearch';search.type='search';search.placeholder='Напр. quickSave или Запази';const tabs=make('div');tabs.className='tabs';tabs.setAttribute('aria-label','Раздели на UI каталога');
 const count=make('p');count.id='uiCatalogCount';count.setAttribute('role','status');const list=make('div');list.id='uiCatalogList';body.append(hint,searchLabel,search,tabs,count,list);dialog.append(head,body);document.body.append(dialog);
 const entries=new Map(),proposals=new Map();let selected=0,css=sheets();
 function add(source,detached=false){if((!source.isConnected&&!detached)||source.closest('#uiCatalogDialog')||source.matches('#uiCatalogOpen')||source.closest('#nedCabinetDimensions,.partNameLabel'))return;const key=identity(source);if(!key)return;const section=category(source),id='UI-'+['BUTTON','COLOR','TEXT','FIELD','TABLE','DIALOG'][section]+'-'+key;
  const area=source.closest('dialog')?.id||source.parentElement?.closest('[id]')?.id||'Приложение',areas={toolsPanel:'Конструктор — инструменти',projectTools:'Проект — инструменти',mainNavigation:'Основно меню',headerRight:'Горна лента',viewControlsDock:'3D изглед',propertiesDialog:'Свойства на детайл',settingsDialog:'Настройки',newCabinetDialog:'Конструктор — Нов шкаф',applianceDialog:'Уреди',projectResults:'Разкрой и Разходи'};
  const usage=(areas[area]||area)+' · '+(source.id?'#'+source.id:source.tagName.toLowerCase());
  entries.set(id,{id,name:name(source),section,source:safeClone(source),parents:context(source),usage,selector:source.id?'#'+source.id:source.tagName.toLowerCase()+(source.classList.length?'.'+[...source.classList].join('.'):'')});
 }
 const selector='button,input:not([type=hidden]),select,textarea,table,dialog,h1,h2,h3,h4,label[id],summary,[role=status],[role=alert],.projectHint';
 function scan(root=document,detached=false){if(root.matches?.(selector))add(root,detached);root.querySelectorAll?.(selector).forEach(e=>add(e,detached))}
 // Take static/hidden adapters as well as controls created later by real editors.
 scan();const observer=new MutationObserver(records=>{for(const r of records)for(const e of r.addedNodes)if(e.nodeType===1&&!e.closest('#uiCatalogDialog'))scan(e)});observer.observe(document.body,{childList:true,subtree:true});
 for(const icon of iconNames){const button=make('button');decorateAction(button,icon,icon,{iconOnly:true});const id='UI-ICON-'+icon;entries.set(id,{id,name:'SVG · '+icon,section:0,source:button,parents:[],usage:'icons.mjs · decorateAction('+icon+')',selector:'.actionSvg'})}
 // Include illustrated files even when the corresponding tool is hidden in this mode.
 const assets=['cabinet','horizontal','vertical','open','save','saveas','room','rotate-left','rotate-right','undo','redo'];
 for(const asset of assets){const image=make('img');image.src=new URL('./assets/icons/'+asset+'.svg',import.meta.url).href;image.className='nedPictureIcon';image.width=image.height=34;image.alt=asset;const id='UI-ASSET-'+asset;entries.set(id,{id,name:'Икона · '+asset,section:0,source:image,parents:[],usage:'assets/icons/'+asset+'.svg',selector:'.nedPictureIcon'})}
 function colors(){
  for(const sheet of css){function visit(rules){for(const r of rules){if(r.cssRules)visit(r.cssRules);if(!r.style)continue;for(const prop of r.style){const val=r.style.getPropertyValue(prop);const matches=val.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi)||[];for(const value of matches){const id='UI-COLOR-'+value.toLowerCase().replace(/[^a-z0-9]+/g,'-');if(entries.has(id)){entries.get(id).usage+='\n'+r.selectorText+' · '+prop;continue}entries.set(id,{id,name:value,section:1,color:value,usage:sheet.url+'\n'+r.selectorText+' · '+prop,selector:r.selectorText})}}}}visit(sheet.rules)}
  const style=getComputedStyle(document.documentElement);for(const prop of style){if(!prop.startsWith('--nd-'))continue;const value=style.getPropertyValue(prop).trim();const id='UI-TOKEN-'+prop.slice(2);entries.set(id,{id,name:prop,section:1,color:value,usage:':root · app-theme.css',selector:':root'})}
 }
 colors();
 const tableContext=make('div');tableContext.id='projectResults';const dataTable=createDataTable(cutTableHeaders,[['1','Примерен детайл',1,'600 × 400 мм','18 мм','няма','0.0 м']]);
 entries.set('UI-TABLE-project-data',{id:'UI-TABLE-project-data',name:'Таблица с проектни данни',section:4,source:dataTable,parents:[tableContext],usage:'ui-components.mjs · createDataTable\nРазкрой и Разходи · projectRefresh()',selector:'#projectResults table'});
 function frame(entry,state){
  const wrap=make('div');wrap.className='uiCatalogState';wrap.append(make('small',state));const iframe=make('iframe');iframe.title=entry.name+' · '+state;iframe.setAttribute('sandbox','allow-same-origin');wrap.append(iframe);
  iframe.addEventListener('load',()=>{
   const doc=iframe.contentDocument;if(!doc)return;doc.body.className=document.body.className;doc.body.dataset.documentKind=document.body.dataset.documentKind;
   for(const sheet of css){const style=doc.createElement('style');style.textContent=sheet.text+(state==='hover'||state==='активно'?'\n'+sheet.text.replace(/:hover/g,'[data-ui-preview-hover]').replace(/:active/g,'[data-ui-preview-active]'):'');doc.head.append(style)}
   const layout=doc.createElement('style');layout.textContent='html,body{margin:0!important;min-width:0!important;width:100%!important;height:auto!important;overflow:auto!important}body{display:block!important;box-sizing:border-box;padding:14px!important}dialog{position:static!important;display:block!important;margin:0!important;inset:auto!important;max-width:100%!important;width:100%!important;max-height:none!important}table{width:100%}';doc.head.append(layout);
   let parent=doc.body;for(const ancestor of entry.parents){const c=doc.importNode(ancestor,false);parent.append(c);parent=c}
   const sample=doc.importNode(entry.source,true);sample.removeAttribute('hidden');sample.style.removeProperty('display');if(sample.matches('button')){sample.disabled=state==='disabled';sample.classList.remove('mainNavActive','modeActive');sample.classList.toggle('active',state==='активно');sample.setAttribute('aria-pressed',String(state==='активно'));if(state==='hover')sample.setAttribute('data-ui-preview-hover','');if(state==='активно')sample.setAttribute('data-ui-preview-active','')}
   parent.append(sample);if(sample.matches('dialog'))sample.open=true;
   // No inline handlers survive cloning; sandbox has no scripts or form navigation.
   const style=doc.defaultView.getComputedStyle(sample),params=properties.map(p=>p+': '+style.getPropertyValue(p)).join('\n');
   const metrics=wrap.parentElement?.parentElement?.querySelector('[data-ui-css]');if(metrics){const block=make('pre',state+'\n'+params);block.dataset.uiCssState=state;metrics.append(block)}
   iframe.style.height=Math.min(300,Math.max(100,doc.body.scrollHeight+12))+'px';
  },{once:true});iframe.src='about:blank';return wrap;
 }
 function expand(card,entry){
  if(!card.open){card.querySelector('[data-ui-details]')?.remove();return}for(const other of list.querySelectorAll('details[open]'))if(other!==card){other.open=false;other.querySelector('[data-ui-details]')?.remove()}
  if(card.querySelector('[data-ui-details]'))return;const content=make('div');content.dataset.uiDetails='';const usage=make('pre',entry.usage);content.append(make('h4','Къде се използва'),usage);
  const preview=make('div');preview.className='uiCatalogStates';const metrics=make('details');const mt=make('summary','CSS параметри (изчислени за прегледа)');metrics.append(mt);metrics.dataset.uiCss='';
  if(entry.color){const swatch=make('div');swatch.className='uiCatalogSwatch';swatch.style.background=entry.color;preview.append(swatch,make('code',entry.color));metrics.append(make('pre','color: '+entry.color))}
  content.append(preview,metrics);card.append(content);
  if(entry.source){content.append(make('code','Селектор: '+entry.selector+' · Класове: '+entry.source.className));for(const state of entry.source.matches('button')?['нормално','hover','активно','disabled']:['преглед'])preview.append(frame(entry,state))}
  const label=make('label','Предложена промяна');const note=make('textarea');note.rows=3;note.value=proposals.get(entry.id)||'';note.placeholder='Опиши идеята за този елемент…';note.setAttribute('aria-label','Предложена промяна · '+entry.id);note.oninput=()=>proposals.set(entry.id,note.value);label.append(note);const notice=make('p','Само за обсъждане — не променя интерфейса. Бележката остава до презареждане.');notice.className='projectHint';content.append(label,notice);
 }
 function render(){const query=search.value.trim().toLocaleLowerCase('bg'),items=[...entries.values()].filter(e=>(query||e.section===selected)&&(!query||(e.id+' '+e.name).toLocaleLowerCase('bg').includes(query))).sort((a,b)=>a.id.localeCompare(b.id));list.replaceChildren();for(const entry of items){const card=make('details');card.className='uiCatalogCard';card.dataset.uiId=entry.id;const summary=make('summary');const icon=entry.source?.matches('img,svg')?entry.source:entry.source?.querySelector('img,svg');if(icon){const picture=safeClone(icon);for(const e of [picture,...picture.querySelectorAll('[id]')])e.removeAttribute('id');summary.append(picture)}if(entry.color){const chip=make('span');chip.className='uiCatalogColorChip';chip.style.background=entry.color;summary.append(chip)}summary.append(make('code',entry.id),make('span',entry.name));card.append(summary);card.addEventListener('toggle',()=>expand(card,entry));list.append(card)}count.textContent=items.length+(items.length===1?' елемент':' елемента');if(!items.length)list.append(make('p','Няма намерени елементи.'));[...tabs.children].forEach((b,i)=>{b.classList.toggle('active',i===selected);b.setAttribute('aria-pressed',String(i===selected))})}
 catalogSections.forEach((name,i)=>{const b=make('button',name);b.type='button';b.onclick=()=>{selected=i;search.value='';render()};tabs.append(b)});search.oninput=render;
 let seed;
 async function seedExamples(){
  const response=await fetch(new URL('./materials/default.json',import.meta.url));if(!response.ok)throw Error('Missing public catalogue');const catalog=await response.json(),noop=()=>{};
  const generator=createCabinetGenerator({catalog,onCreate:noop,renderPreview:()=>''});scan(generator.dialog,true);
  const edge=createEdgeEditor({part:{w:600,h:18,d:400},finish:{edges:[null,null,null,null]},material:catalog.pdcMaterials[0],edgeMaterials:catalog.edgeMaterials,onApply:noop});scan(edge.dialog,true);edge.dispose();
  const appliance=createApplianceEditor({onSave:noop});scan(appliance.dialog,true);
 }
 trigger.onclick=async()=>{css=sheets();scan();document.getElementById('settingsDialog').close();list.replaceChildren();dialog.dataset.ready='false';dialog.showModal();search.disabled=true;for(const b of tabs.children)b.disabled=true;count.textContent='Зареждане на компонентите…';try{await(seed??=seedExamples());if(dialog.open)render()}catch{seed=null;if(dialog.open){render();count.textContent+=' · Примерите за редактори ще се заредят при следващо отваряне.'}}finally{dialog.dataset.ready='true';search.disabled=false;for(const b of tabs.children)b.disabled=false;if(dialog.open)search.focus()}};close.onclick=()=>dialog.close();dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('close',()=>{list.replaceChildren();trigger.ownerDocument.getElementById('settingsButton')?.focus()});
 let resize=0;window.addEventListener('resize',()=>{cancelAnimationFrame(resize);resize=requestAnimationFrame(()=>{if(!dialog.open)return;css=sheets();const card=list.querySelector('details[open]');if(card){card.querySelector('[data-ui-details]')?.remove();expand(card,entries.get(card.dataset.uiId))}})});
 return {dialog,entries};
}
