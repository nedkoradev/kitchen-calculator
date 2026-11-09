import {decorateAction} from './icons.mjs';
import {photoOrientation,setPhotoOrientation} from './photo-orientation.mjs';
const REPO='nedkoradev/kitchen-calculator',DIR='materials/textures';
const api='https://api.github.com/repos/'+REPO+'/contents/'+DIR;
const folder='https://github.com/'+REPO+'/tree/main/'+DIR;
function make(tag,text,css){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(css)el.style.cssText=css;return el}
function icon(tag,name,label){const control=make(tag);if(tag==='button')control.type='button';decorateAction(control,name,label,{iconOnly:true});return control}
function openManager(){
 const dlg=make('dialog');dlg.className='materialEditDialog textureManager';dlg.setAttribute('aria-label','Снимки за фладер');
 const top=make('div');top.className='textureManagerHead';top.append(make('h3','Снимки за фладер'));
 const close=icon('button','close','Затвори');close.onclick=()=>dlg.close();top.append(close);
 const info=make('p','Зареждане на снимките…');info.setAttribute('role','status');
 const actions=make('div');actions.className='textureManagerActions';
 const upload=icon('a','image','Добави снимки');upload.href='https://github.com/'+REPO+'/upload/main/'+DIR;upload.target='_blank';upload.rel='noopener noreferrer';
 const refresh=icon('button','refresh','Обнови');actions.append(upload,refresh);
 const note=make('p','Избери посоката на фладера в оригиналната снимка веднъж. Тя се запомня за тази снимка в браузъра и се използва във всички материали. При запис на материалната база или проекта посоката се запазва и с материала.');note.className='projectHint';
 const fileNote=make('p','Добавянето, преименуването и изтриването на файлове се извършва през GitHub. След промяна натисни „Обнови“.');fileNote.className='projectHint';
 const grid=make('div');grid.className='textureManagerGrid';
 dlg.append(top,actions,info,note,fileNote,grid);document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove(),{once:true});dlg.addEventListener('keydown',e=>e.stopPropagation());dlg.showModal();
 let epoch=0;
 async function load(){
  const request=++epoch;info.textContent='Зареждане…';grid.replaceChildren();
  try{
   const response=await fetch(api,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
   if(!response.ok)throw Error('Грешка '+response.status);
   const files=(await response.json()).filter(x=>x.type==='file'&&/\.(?:png|jpe?g|webp)$/i.test(x.name));
   if(request!==epoch||!dlg.isConnected)return;
   info.textContent='Снимки в хранилището: '+files.length;
   for(const file of files){
    const url=DIR+'/'+encodeURIComponent(file.name),card=make('div');card.className='textureManagerCard';
    const img=make('img');const urls=[new URL(url,document.baseURI).href,file.download_url,'https://raw.githubusercontent.com/'+REPO+'/main/'+url];let sourceIndex=0;img.onerror=()=>{sourceIndex++;if(sourceIndex<urls.length&&urls[sourceIndex])img.src=urls[sourceIndex];else img.alt='Снимката не може да се зареди';};img.src=urls[0];img.alt=file.name;img.loading='lazy';img.referrerPolicy='no-referrer';
    const name=make('div',file.name);name.className='textureManagerName';
    const label=make('label','Фладер в снимката');
    const direction=make('select');direction.setAttribute('aria-label','Фладер в снимката — '+file.name);direction.add(new Option('Вертикален','vertical'));direction.add(new Option('Хоризонтален','horizontal'));direction.value=photoOrientation({textureUrl:url});
    direction.onchange=()=>{try{setPhotoOrientation(url,direction.value);info.textContent='Посоката е запазена за „'+file.name+'“.'}catch(error){direction.value=photoOrientation({textureUrl:url});info.textContent='Посоката не е запазена: '+error.message}};label.append(direction);
    const row=make('div');row.className='textureManagerActions';
    const view=icon('a','open','Отвори');view.href=file.html_url;view.target='_blank';view.rel='noopener noreferrer';
    const rename=icon('button','edit','Преименувай');rename.onclick=()=>{const v=prompt('Ново име на снимката (без промяна на разширението):',file.name);if(!v||v===file.name)return;alert('Преименуването на изображение изисква качване на файла с новото име в GitHub и изтриване на стария файл. Отвори GitHub, за да направиш промяната.');window.open(folder,'_blank','noopener')};
    const remove=icon('button','trash','Изтрий');remove.onclick=()=>{if(confirm('Отвори GitHub за изтриване на „'+file.name+'“?'))window.open(file.html_url,'_blank','noopener')};
    row.append(view,rename,remove);card.append(img,name,label,row);grid.append(card);
   }
  }catch(err){if(request===epoch&&dlg.isConnected)info.textContent='Неуспешно зареждане: '+err.message}
 }
 refresh.onclick=load;load();
}
document.getElementById('textureManagerOpen')?.addEventListener('click',openManager);
