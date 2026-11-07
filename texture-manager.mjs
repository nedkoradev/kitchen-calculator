const REPO='nedkoradev/kitchen-calculator',DIR='materials/textures';
const api='https://api.github.com/repos/'+REPO+'/contents/'+DIR;
const folder='https://github.com/'+REPO+'/tree/main/'+DIR;
function make(tag,text,css){const el=document.createElement(tag);if(text!=null)el.textContent=text;if(css)el.style.cssText=css;return el}
function openManager(){
 const dlg=make('dialog');dlg.className='materialEditDialog';dlg.style.cssText='width:min(840px,96vw);max-height:88dvh;overflow:auto;background:#202c3b;color:#f2f6ff;border:1px solid #50617a;border-radius:14px;padding:18px';
 const top=make('div',null,'display:flex;justify-content:space-between;align-items:center;gap:12px');
 top.append(make('h3','Снимки за фладер'));
 const close=make('button','Затвори');close.onclick=()=>dlg.close();top.append(close);
 const info=make('p','Зареждане на снимките…');
 const actions=make('div',null,'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0');
 const upload=make('a','Добави снимки');upload.href='https://github.com/'+REPO+'/upload/main/'+DIR;upload.target='_blank';upload.rel='noopener noreferrer';upload.className='materialPhotoLink';
 const refresh=make('button','Обнови');actions.append(upload,refresh);
 const note=make('p','Добавянето, преименуването и изтриването на файловете се извършват през GitHub. След промяна натисни „Обнови“. Това не изтрива връзките към снимки в вече записани материали.');note.className='projectHint';
 const grid=make('div',null,'display:grid;grid-template-columns:repeat(auto-fill,minmax(145px,1fr));gap:12px');
 dlg.append(top,actions,info,note,grid);document.body.append(dlg);dlg.addEventListener('close',()=>dlg.remove(),{once:true});dlg.showModal();
 async function load(){
  info.textContent='Зареждане…';grid.replaceChildren();
  try{
   const response=await fetch(api,{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
   if(!response.ok)throw Error('Грешка '+response.status);
   const files=(await response.json()).filter(x=>x.type==='file'&&/\.(?:png|jpe?g|webp)$/i.test(x.name));
   info.textContent='Снимки в хранилището: '+files.length;
   for(const file of files){
    const card=make('div',null,'background:#29384a;border:1px solid #50617a;border-radius:9px;padding:8px;min-width:0');
    const img=make('img');img.src=file.download_url;img.alt=file.name;img.loading='lazy';img.style.cssText='width:100%;height:110px;object-fit:contain;background:#edf1f6;border-radius:5px';
    const name=make('div',file.name,'overflow-wrap:anywhere;font-size:12px;margin:6px 0');
    const row=make('div',null,'display:flex;gap:6px;flex-wrap:wrap');
    const view=make('a','Отвори');view.href=file.html_url;view.target='_blank';view.rel='noopener noreferrer';view.className='materialPhotoLink';
    const rename=make('button','Преименувай');rename.onclick=()=>{const v=prompt('Ново име на снимката (без промяна на разширението):',file.name);if(!v||v===file.name)return;alert('Преименуването на изображение изисква качване на файла с новото име в GitHub и изтриване на стария файл. Отвори GitHub, за да направиш промяната.');window.open(folder,'_blank','noopener')};
    const remove=make('button','Изтрий');remove.onclick=()=>{if(confirm('Отвори GitHub за изтриване на „'+file.name+'“?'))window.open(file.html_url,'_blank','noopener')};
    row.append(view,rename,remove);card.append(img,name,row);grid.append(card);
   }
  }catch(err){info.textContent='Неуспешно зареждане: '+err.message}
 }
 refresh.onclick=load;load();
}
document.getElementById('textureManagerOpen')?.addEventListener('click',openManager);
