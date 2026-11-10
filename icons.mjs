// Shared local SVG vocabulary: Lucide-style 24px, 2px strokes, no icon font/CDN.
const paths={
 appliance:'<rect x="3" y="2" width="18" height="20" rx="2"/><path d="M3 7h18M7 4h.01M11 4h.01M7 10h10v8H7zM8 12h8"/>',
 viewperspective:'<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9L3 8m9 4 9-4m-9 4v9"/>',
 viewfront:'<rect x="3" y="4" width="18" height="16"/><path d="M8 15h8m-4-4 4 4-4 4"/>',
 viewtop:'<rect x="3" y="4" width="18" height="16"/><path d="M8 7h8M12 17V9m-3 3 3-3 3 3"/>',
 viewleft:'<rect x="3" y="4" width="18" height="16"/><path d="M7 4v16m10-8H9m3-3-3 3 3 3"/>',
 viewright:'<rect x="3" y="4" width="18" height="16"/><path d="M17 4v16M7 12h8m-3-3 3 3-3 3"/>',
 tags:'<path d="M3 3h7l11 11-7 7L3 10V3Z"/><circle cx="7" cy="7" r="1"/>',

 refresh:'<path d="M3 10a9 9 0 0 1 15-6l3 3M21 3v4h-4M21 14a9 9 0 0 1-15 6l-3-3M3 21v-4h4"/>',
 image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7M17 2v6m-3-3h6"/>',
 edit:'<path d="m15 5 4 4M4 20l1-5L17 3l4 4L9 19l-5 1Z"/>',
 gear:'<path d="M10 2h4l.5 3 2 1 2.8-1 2 3.5-2.3 2v3l2.3 2-2 3.5-2.8-1-2 1-.5 3h-4l-.5-3-2-1-2.8 1-2-3.5 2.3-2v-3l-2.3-2 2-3.5 2.8 1 2-1Z"/><circle cx="12" cy="12" r="3"/>',
 save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>',
 saveAs:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h6M14 2v6h6l-6-6Z"/><path d="m16 15 3 3m-7 3 1-4 6-6 3 3-6 6-4 1Z"/>',
 open:'<path d="M3 8V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v2M3 8h17a1 1 0 0 1 1 1l-3 11H5L2 10a2 2 0 0 1 1-2Z"/>',
 horizontal:'<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 11h10"/>',
 vertical:'<rect x="7" y="3" width="10" height="18" rx="1"/><path d="M11 7v10"/>',
 group:'<path d="M7 3H3v4m14-4h4v4M3 17v4h4m14-4v4h-4"/><rect x="7" y="7" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>',
 ungroup:'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M14 4h6v6m0-6-6 6M4 14v6h6m-6 0 6-6"/>',
 rotateLeft:'<path d="M3 10a9 9 0 1 1 2.7 8.4M3 4v6h6"/>',
 rotateRight:'<path d="M21 10a9 9 0 1 0-2.7 8.4M21 4v6h-6"/>',
 cabinet:'<rect x="3" y="3" width="14" height="18" rx="1"/><path d="M10 3v18M7 10v3m6-3v3m4 3h6m-3-3v6"/>',
 room:'<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 7h10v10M7 17 17 7"/>',
 undo:'<path d="m3 7 5-4M3 7l5 4M3 7h11a7 7 0 0 1 0 14h-3"/>',
 redo:'<path d="m21 7-5-4m5 4-5 4m5-4H10a7 7 0 0 0 0 14h3"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.01"/>',
 copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
 settings:'<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>'
};
export function decorateAction(button,name,label,{iconOnly=false}={}){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 for(const [key,value] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false',class:'actionSvg'}))svg.setAttribute(key,value);
 svg.innerHTML=paths[name]||paths.settings;
 if(button.querySelector('.nedPictureIcon')){
  button.title=label;button.setAttribute('aria-label',label);button.classList.add('iconOnly');
  return button; // Preserve illustrated icons supplied by the page.
 }
 if(iconOnly)button.replaceChildren(svg);else button.prepend(svg);
 button.title=label;button.setAttribute('aria-label',label);button.classList.add(iconOnly?'iconOnly':'iconWithText');
 return button;
}
export function installActionIcons(){
 const actions={
 addHorizontal:['horizontal','Добави хоризонтален детайл'],addVertical:['vertical','Добави вертикален детайл'],
 groupParts:['group','Групирай'],ungroupParts:['ungroup','Разгрупирай'],
 quickSave:['save','Запази шкаф'],quickOpen:['open','Отвори шкаф'],
 rotateLeft:['rotateLeft','Завърти наляво'],rotateRight:['rotateRight','Завърти надясно'],
 projectQuickSave:['save','Запази проект'],projectQuickSaveAs:['saveAs','Запази проект като'],projectQuickOpen:['open','Отвори проект'],
 projectQuickAdd:['cabinet','Добави шкаф от библиотеката'],projectAddHorizontal:['horizontal','Добави хоризонтален детайл'],projectAddVertical:['vertical','Добави вертикален детайл'],
 projectGroupParts:['group','Групирай'],projectUngroupParts:['ungroup','Разгрупирай'],projectRoomSettings:['room','Размери на стаята'],
 projectRotateLeft:['rotateLeft','Завърти наляво'],projectRotateRight:['rotateRight','Завърти надясно'],
 undoStep:['undo','Върни последната промяна (Ctrl+Z)'],redoStep:['redo','Повтори промяната (Ctrl+Y)'],
 fileDialogDelete:['trash','Изтрий избрания шкаф от облака'],fileDialogClose:['close','Затвори'],helpClose:['close','Затвори'],dialogClose:['close','Затвори'],helpButton:['info','Помощ'],settingsButton:['gear','Настройки'],settingsClose:['close','Затвори настройките']
 };
 for(const [id,[icon,label]] of Object.entries(actions)){const button=document.getElementById(id);if(button)decorateAction(button,icon,label,{iconOnly:true})}
}
