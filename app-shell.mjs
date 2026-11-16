// Layout adapter: move the real controls; never copy an editor or model state.
export function installAppShell({getContext}){
 const $=id=>document.getElementById(id),body=document.body,main=document.querySelector('main');body.classList.add('ned-shell');
 const header=document.querySelector('header'),title=document.createElement('span');title.id='documentHeading';header.querySelector('strong').after(title);
 const menus=document.createElement('div');menus.id='shellMenus';header.after(menus);menus.append($('documentMenus'),$('mainNavigation'));
 const tools=document.createElement('div');tools.id='shellTools';menus.after(tools);const modes=document.createElement('div');modes.id='shellModes';tools.append(modes);modes.append($('modeProject'),$('modeConstructor'));
 tools.append($('toolsPanel'),$('projectTools'));const history=document.querySelector('.historyTools');tools.append(history);
 const viewDock=$('viewControlsDock');if(viewDock)tools.append(viewDock);
 const aside=main.querySelector('aside');aside.id='outlinePanel';const outlineHead=document.createElement('h2');outlineHead.id='outlineHeading';aside.prepend(outlineHead);aside.append($('groupList'));$('groupList').hidden=false;
 const inspector=document.createElement('section');inspector.id='inspectorPanel';inspector.setAttribute('aria-label','Свойства');inspector.innerHTML='<h2>Свойства</h2><p class="projectHint">Изберете детайл или група. Свойствата са достъпни и от контекстното меню.</p>';main.append(inspector);
 const help=$('helpButton');menus.append(help);help.textContent='Помощ';
 const settings=$('settingsButton');settings.title='Настройки';
 function render(){const ctx=getContext();body.dataset.documentKind=ctx.kind;title.textContent=(ctx.kind==='project'?'ПРОЕКТ: ':'КОНСТРУКТОР: ')+ctx.name+(ctx.dirty?' •':'');title.title=ctx.dirty?'Има незаписани промени':'Работен документ';outlineHead.textContent=(ctx.kind==='project'?'Проект: ':'Модел: ')+ctx.name;for(const [id,kind] of [['modeProject','project'],['modeConstructor','constructor']])$(id).setAttribute('aria-pressed',String(ctx.kind===kind));}
 for(const name of ['ned-document-change','ned-document-state','ned-selection-change'])window.addEventListener(name,render);render();return {render};
}
