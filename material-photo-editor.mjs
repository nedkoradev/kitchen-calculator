import {validTextureUrl} from './grain.mjs';
export const MAX_PHOTO_BYTES=10*1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp']);
export function imageMime(bytes){
 if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))return 'image/png';
 if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return 'image/webp';
 return null;
}
export function checkPhotoFile(file,header){
 if(!file.size||file.size>MAX_PHOTO_BYTES)throw Error('Избери снимка до 10 MiB.');
 const mime=imageMime(header),extension=file.name.split('.').at(-1).toLowerCase();
 if(!mime||!types.has(file.type||mime)||!({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[extension]||mime!==({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'})[extension]||(file.type&&file.type!==mime))throw Error('Файлът трябва действително да е JPG, PNG или WebP, а не само да има такова разширение.');
 return mime;
}
export function proposedTexturePath(name,mime,hash){
 const base=name.split(/[\\/]/).at(-1).replace(/\.[^.]*$/,'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/-+/g,'-').replace(/^[-_]+|[-_]+$/g,'');
 const slug=Array.from(base||'decor').slice(0,60).join(''),extension={ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
 return `materials/textures/${encodeURIComponent(slug)}-${hash.slice(0,10)}.${extension}`;
}
const hashBytes=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),value=>value.toString(16).padStart(2,'0')).join('');
async function decodePhoto(blob){
 const url=URL.createObjectURL(blob),image=new Image();
 try{image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth>8192||image.naturalHeight>8192||image.naturalWidth*image.naturalHeight>16*1024*1024)throw Error('Снимката е твърде голяма: максимум 8192 px на страна и 16 мегапиксела.');return {url,width:image.naturalWidth,height:image.naturalHeight};}
 catch(error){URL.revokeObjectURL(url);throw error}
}
export function installMaterialPhotoEditor(form,item,dialog){
 const baseline=validTextureUrl(item.textureUrl)||'';
 let verified=null,local=null,previewUrl=null,epoch=0,controller=null,timer=null,removed=false,closed=false;
 const label=document.createElement('label');label.textContent='Снимка на декора (HTTPS или materials/textures/...)';
 const input=document.createElement('input');input.type='text';input.id='materialTextureUrl';input.placeholder='materials/textures/decor.webp';input.value=baseline;label.append(input);form.append(label);
 const preview=document.createElement('img');preview.className='materialPhotoPreview';preview.alt='Предварителен преглед на декора';preview.hidden=true;form.append(preview);
 const status=document.createElement('p');status.id='materialPhotoStatus';status.setAttribute('role','status');status.className='projectHint';form.append(status);
 const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.id='materialPhotoUpload';file.hidden=true;file.setAttribute('aria-label','Избери снимка');form.append(file);
 const actions=document.createElement('div');actions.className='materialActions';
 const button=(id,text,handler)=>{const element=document.createElement('button');element.type='button';element.id=id;element.textContent=text;element.title=text;element.onclick=handler;actions.append(element);return element};
 button('chooseMaterialPhoto','Избери снимка',()=>file.click());
 const info=document.createElement('p');info.id='materialPhotoFileInfo';info.className='projectHint';
 const suggestion=document.createElement('p');suggestion.id='materialPhotoSuggestedPath';suggestion.className='projectHint';
 const pendingNote='Непубликувана снимка: „Запази“ ще запази останалите промени, но ще остави предишната снимка непроменена.';
 const setStatus=text=>status.textContent=text;
 function releasePreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;preview.removeAttribute('src');preview.hidden=true}
 function show(decoded){releasePreview();previewUrl=decoded.url;preview.src=previewUrl;preview.hidden=false}
 function invalidate(){clearTimeout(timer);controller?.abort();controller=null;verified=null;return ++epoch}
 async function verify(){
  const token=invalidate(),url=validTextureUrl(input.value);removed=false;
  if(!url){setStatus('Използвай HTTPS адрес или относителен път materials/textures/име.jpg. '+pendingNote);return}
  const expected=local;controller=new AbortController();const request=controller,timeout=setTimeout(()=>request.abort(),15000);setStatus('Проверка на публичната снимка…');
  try{
   const address=new URL(url,document.baseURI);address.searchParams.set('__kd_photo_check',crypto.randomUUID());
   const response=await fetch(address,{cache:'no-store',credentials:'omit',signal:request.signal});
   if(!response.ok)throw Error('Файлът още не е достъпен в GitHub Pages или на посочения HTTPS адрес.');
   const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   if(!types.has(mime))throw Error('Адресът не връща JPG, PNG или WebP изображение (възможна HTML страница за грешка).');
   const declared=Number(response.headers.get('content-length'));if(declared>MAX_PHOTO_BYTES)throw Error('Снимката трябва да е до 10 MiB.');
   if(!response.body)throw Error('Адресът не връща изображение.');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_PHOTO_BYTES){await reader.cancel();throw Error('Снимката трябва да е до 10 MiB.')}chunks.push(part.value)}}finally{reader.releaseLock()}
   const blob=new Blob(chunks,{type:mime});if(!blob.size||blob.size>MAX_PHOTO_BYTES||imageMime(new Uint8Array(await blob.slice(0,16).arrayBuffer()))!==mime)throw Error('Полученият файл не е валидна снимка до 10 MiB.');
   const hash=await hashBytes(blob);if(expected&&expected.hash!==hash)throw Error('Публикуваният файл не съвпада с избраната локална снимка. Качи избрания файл с предложеното име.');
   const decoded=await decodePhoto(blob);
   if(closed||token!==epoch){URL.revokeObjectURL(decoded.url);return}
   verified={url,hash};show(decoded);setStatus('Снимката е достъпна и проверена. Натисни „Запази“, за да я свържеш с материала.');
  }catch(error){if(closed||token!==epoch)return;if(!local)releasePreview();setStatus((error.name==='EncodingError'?'Файлът не може да се декодира като изображение.':error.name==='TypeError'?'Снимката не е достъпна от приложението. Провери адреса и публикуването.':error.name==='AbortError'?'Проверката отне твърде дълго. Опитай отново.':error.message)+' '+pendingNote)}finally{clearTimeout(timeout)}
 }
 button('verifyMaterialPhoto','Провери снимката в GitHub',verify);
 button('copyMaterialPhotoPath','Копирай пътя',async()=>{
  const value=validTextureUrl(input.value);if(!value){setStatus('Първо избери снимка или въведи валиден път.');return}
  try{await navigator.clipboard.writeText(value);setStatus('Пътят е копиран. '+(verified?'Снимката е проверена.':pendingNote))}catch{input.focus();input.select();setStatus('Копирай избрания път с Ctrl+C. '+pendingNote)}
 });
 button('removeMaterialPhoto','Премахни снимката',()=>{invalidate();local=null;file.value='';input.value='';removed=true;info.textContent='';suggestion.textContent='';releasePreview();setStatus('Връзката към снимката ще бъде премахната при „Запази“.')});
 button('cancelMaterialPhoto','Откажи избраната снимка',()=>{invalidate();local=null;file.value='';input.value=baseline;removed=false;info.textContent='';suggestion.textContent='';releasePreview();if(baseline)verify();else setStatus('Изборът е отменен; записаната снимка не е променена.')});
 form.append(actions,info,suggestion);
 const note=document.createElement('p');note.className='projectHint';note.textContent='За да използваш снимката, първо я публикувай в GitHub в папка materials/textures/. След това натисни „Провери снимката“. При успешна проверка тя ще бъде свързана с материала при „Запази“. Използвай предложения път и име чрез проверен клон/PR. Няма автоматично качване. JPG/PNG/WebP до 10 MiB. Фладерът в снимката трябва да е по вертикала.';form.append(note);
 input.oninput=()=>{invalidate();removed=false;local=null;file.value='';info.textContent='';suggestion.textContent='';releasePreview();setStatus(pendingNote);if(validTextureUrl(input.value))timer=setTimeout(verify,300)};
 file.onchange=async()=>{
  const selected=file.files[0];if(!selected)return;const token=invalidate();removed=false;local=null;file.value='';releasePreview();
  try{
   const mime=checkPhotoFile(selected,new Uint8Array(await selected.slice(0,16).arrayBuffer()));
   const hash=await hashBytes(selected),decoded=await decodePhoto(selected);
   if(closed||token!==epoch){URL.revokeObjectURL(decoded.url);return}
   local={hash};input.value=proposedTexturePath(selected.name,mime,hash);show(decoded);
   info.textContent=`${selected.name} · ${selected.size} B (${(selected.size/1024/1024).toFixed(2)} MiB) · ${decoded.width} × ${decoded.height} px`;
   suggestion.textContent='Предложен път: '+input.value+' · име за GitHub: '+decodeURIComponent(input.value.split('/').at(-1));setStatus(pendingNote);
  }catch(error){if(closed||token!==epoch)return;setStatus((error.name==='EncodingError'?'Избраната снимка не може да се декодира.':error.message)+' Записаната снимка не е променена.');}
 };
 dialog.addEventListener('close',()=>{closed=true;invalidate();releasePreview();local=null},{once:true});
 if(baseline)verify();
 return ()=>{
  if(removed)return '';
  const current=validTextureUrl(input.value);
  if(current===baseline)return baseline;
  if(verified&&verified.url===current)return verified.url;
  return baseline;
 };
}
