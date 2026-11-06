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
 const original=name.split(/[\\/]/).at(-1);
 if(/^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,119}\.(?:jpe?g|png|webp)$/iu.test(original)&&!original.includes('..'))return `materials/textures/${encodeURIComponent(original)}`;
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
 const label=document.createElement('label');label.textContent='Линк към снимката';
 const input=document.createElement('input');input.type='text';input.id='materialTextureUrl';input.placeholder='materials/textures/decor.webp';input.value=baseline;label.append(input);
 const preview=document.createElement('img');preview.className='materialPhotoPreview';preview.alt='Предварителен преглед на декора';preview.hidden=true;form.append(preview);
 const status=document.createElement('p');status.id='materialPhotoStatus';status.setAttribute('role','status');status.className='projectHint';form.append(status);
 const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.id='materialPhotoUpload';file.hidden=true;file.setAttribute('aria-label','Избери снимка');form.append(file);
 const actions=document.createElement('div');actions.className='materialActions';
 const button=(id,text,handler)=>{const element=document.createElement('button');element.type='button';element.id=id;element.textContent=text;element.title=text;element.onclick=handler;actions.append(element);return element};
 button('chooseMaterialPhoto','Избери снимка',()=>file.click());
 const github=document.createElement('a');github.id='uploadMaterialPhoto';github.className='materialPhotoLink';github.textContent='Отвори GitHub за качване';github.href='https://github.com/nedkoradev/kitchen-calculator/upload/main/materials/textures';github.target='_blank';github.rel='noopener noreferrer';actions.append(github);
 const info=document.createElement('p');info.id='materialPhotoFileInfo';info.className='projectHint';
 const suggestion=document.createElement('p');suggestion.id='materialPhotoSuggestedPath';suggestion.className='projectHint';
 const pendingNote='Снимката още не е проверена. Предишната снимка се запазва.';
 const setStatus=text=>{status.textContent=text;if(wizardStatus)wizardStatus.textContent=text;};
 let wizardStatus=null,wizard=null,wizardTimer=null;
 function closeWizard(){if(wizardTimer){clearTimeout(wizardTimer);wizardTimer=null}wizard?.close();wizard?.remove();wizard=null;wizardStatus=null}
 function openWizard(filename,originalName){
  closeWizard();
  wizard=document.createElement('dialog');wizard.className='photoWizard';wizard.setAttribute('role','dialog');wizard.setAttribute('aria-modal','true');wizard.setAttribute('aria-label','Добавяне на снимка');
  wizard.style.cssText='border:0;padding:0;border-radius:10px;width:min(460px,94vw);max-height:90vh;overflow:auto;background:white';
  const panel=document.createElement('div');panel.style.cssText='background:white;color:#19334e;border-radius:10px;padding:20px;width:min(460px,100%);box-shadow:0 12px 40px #0003;font:14px Arial,sans-serif';
  const heading=document.createElement('h3');heading.textContent='Добавяне на снимка';heading.style.margin='0 0 14px';
  const steps=document.createElement('p');steps.textContent='1. Натисни „Качи в GitHub“ и избери същата снимка от компютъра. 2. Натисни зеления „Commit changes“ в GitHub. 3. Върни се тук — приложението ще провери снимката автоматично.';steps.style.lineHeight='1.65';
  const name=document.createElement('p');name.style.cssText='font-weight:bold;overflow-wrap:anywhere';name.textContent='Име на файла: '+filename;
  const note=document.createElement('p');note.style.cssText='font-size:12px;line-height:1.5';note.textContent=filename===originalName?'Качи файла със същото име.':'Името за GitHub е различно. Изтегли преименувания файл от бутона по-долу и качи него.';
  const actionsRow=document.createElement('div');actionsRow.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin-top:14px';
  const upload=document.createElement('a');upload.href='https://github.com/nedkoradev/kitchen-calculator/upload/main/materials/textures';upload.target='_blank';upload.rel='noopener noreferrer';upload.textContent='Качи в GitHub';upload.style.cssText='background:#163d68;color:white;border-radius:5px;padding:10px 12px;text-decoration:none';
  const finish=document.createElement('button');finish.type='button';finish.textContent='Затвори';finish.onclick=closeWizard;
  actionsRow.append(upload);
  if(filename!==originalName){const renamed=document.createElement('a');renamed.href=previewUrl;renamed.download=filename;renamed.textContent='Изтегли с правилното име';renamed.style.cssText='padding:10px;border:1px solid #bdc9d7;border-radius:5px';actionsRow.append(renamed)}
  actionsRow.append(finish);
  wizardStatus=document.createElement('p');wizardStatus.setAttribute('role','status');wizardStatus.style.cssText='margin-top:12px;font-weight:bold;line-height:1.5';wizardStatus.textContent=status.textContent;
  panel.append(heading,steps,name,note,actionsRow,wizardStatus);wizard.append(panel);document.body.append(wizard);wizard.addEventListener('cancel',closeWizard);wizard.showModal();
  const currentWizard=wizard;
  async function recheck(){
   if(wizard!==currentWizard||closed||verified)return;
   if(controller){wizardTimer=setTimeout(recheck,10000);return}
   await verify();
   if(wizard!==currentWizard||closed)return;
   if(verified){wizardStatus.textContent='✓ Снимката е намерена! Затвори прозореца и натисни „Запази“.';finish.textContent='Готово';wizardTimer=null}
   else wizardTimer=setTimeout(recheck,10000);
  }
  wizardTimer=setTimeout(recheck,10000);
 }

 function releasePreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;if(download){download.hidden=true;download.removeAttribute('href')}preview.removeAttribute('src');preview.hidden=true}
 function show(decoded){releasePreview();previewUrl=decoded.url;preview.src=previewUrl;preview.hidden=false}
 function invalidate(){clearTimeout(timer);controller?.abort();controller=null;verified=null;return ++epoch}
 async function verify(){
  const token=invalidate(),url=validTextureUrl(input.value);removed=false;
  if(!url){setStatus('Въведи HTTPS линк или път materials/textures/име.jpg.');return}
  const expected=local;controller=new AbortController();const request=controller,timeout=setTimeout(()=>request.abort(),15000);setStatus('Проверка на публичната снимка…');
  try{
   const address=new URL(url,document.baseURI);address.searchParams.set('__kd_photo_check',crypto.randomUUID());
   const response=await fetch(address,{cache:'no-store',credentials:'omit',signal:request.signal});
   if(!response.ok)throw Error('Снимката още не е достъпна. Изчакай публикуването и опитай пак.');
   const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
   if(!types.has(mime))throw Error('Линкът не връща снимка.');
   const declared=Number(response.headers.get('content-length'));if(declared>MAX_PHOTO_BYTES)throw Error('Снимката трябва да е до 10 MiB.');
   if(!response.body)throw Error('Адресът не връща изображение.');
   const reader=response.body.getReader(),chunks=[];let size=0;
   try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_PHOTO_BYTES){await reader.cancel();throw Error('Снимката трябва да е до 10 MiB.')}chunks.push(part.value)}}finally{reader.releaseLock()}
   const blob=new Blob(chunks,{type:mime});if(!blob.size||blob.size>MAX_PHOTO_BYTES||imageMime(new Uint8Array(await blob.slice(0,16).arrayBuffer()))!==mime)throw Error('Полученият файл не е валидна снимка до 10 MiB.');
   const hash=await hashBytes(blob);if(expected&&expected.hash!==hash)throw Error('Снимката не съвпада с избрания файл.');
   const decoded=await decodePhoto(blob);
   if(closed||token!==epoch){URL.revokeObjectURL(decoded.url);return}
   verified={url,hash};show(decoded);setStatus('Снимката е проверена. Натисни „Запази“.');
  }catch(error){if(closed||token!==epoch)return;if(!local)releasePreview();setStatus((local?'Снимката не е качена. Показва се само преглед. ':'')+(error.name==='EncodingError'?'Файлът не може да се декодира като изображение.':error.name==='TypeError'?'Снимката не е достъпна от приложението. Провери адреса и публикуването.':error.name==='AbortError'?'Проверката отне твърде дълго. Опитай отново.':error.message))}finally{clearTimeout(timeout);if(controller===request)controller=null}
 }
 button('verifyMaterialPhoto','Провери снимката',verify);
 const details=document.createElement('details');details.className='materialPhotoHelp';
 const summary=document.createElement('summary');summary.textContent='ⓘ Информация за снимката';details.append(summary);
 const extraActions=document.createElement('div');extraActions.className='materialActions';
 const copy=button('copyMaterialPhotoPath','Копирай пътя',async()=>{
  const value=validTextureUrl(input.value);if(!value){setStatus('Първо избери снимка или въведи валиден път.');return}
  try{await navigator.clipboard.writeText(value);setStatus('Пътят е копиран. '+(verified?'Снимката е проверена.':pendingNote))}catch{input.focus();input.select();setStatus('Копирай избрания път с Ctrl+C. '+pendingNote)}
 });
 extraActions.append(copy);
 const download=document.createElement('a');download.id='downloadMaterialPhoto';download.className='materialPhotoLink';download.textContent='Изтегли с безопасно име';download.hidden=true;
 button('removeMaterialPhoto','Премахни снимката',()=>{invalidate();local=null;file.value='';input.value='';removed=true;info.textContent='';suggestion.textContent='';releasePreview();setStatus('Връзката към снимката ще бъде премахната при „Запази“.')});
 // Keep only the photo picker in the primary interface.
 const advancedActions=document.createElement('div');advancedActions.className='materialActions';
 for(const action of [...actions.children])if(action.id!=='chooseMaterialPhoto')advancedActions.append(action);
 form.append(actions);
 const note=document.createElement('p');note.className='projectHint';note.textContent='Избери снимка, качи я в GitHub и натисни „Провери снимката“.';details.append(note);
 const help=document.createElement('p');help.textContent='JPG, PNG или WebP до 10 MiB. Качи файла в materials/textures/ с показаното име. Изчакай GitHub Pages да го публикува. Фладерът в снимката следва вертикалата. Непроверената снимка не заменя записаната.';
 details.append(label,advancedActions,download,info,suggestion,help,extraActions);form.append(details);
 input.oninput=()=>{invalidate();removed=false;local=null;file.value='';info.textContent='';suggestion.textContent='';releasePreview();setStatus(pendingNote);if(validTextureUrl(input.value))timer=setTimeout(verify,300)};
 file.onchange=async()=>{
  const selected=file.files[0];if(!selected)return;const token=invalidate();removed=false;local=null;file.value='';releasePreview();
  try{
   const mime=checkPhotoFile(selected,new Uint8Array(await selected.slice(0,16).arrayBuffer()));
   const hash=await hashBytes(selected),decoded=await decodePhoto(selected);
   if(closed||token!==epoch){URL.revokeObjectURL(decoded.url);return}
   local={hash};input.value=proposedTexturePath(selected.name,mime,hash);show(decoded);
   info.textContent=`${selected.name} · ${selected.size} B (${(selected.size/1024/1024).toFixed(2)} MiB) · ${decoded.width} × ${decoded.height} px`;
   const filename=decodeURIComponent(input.value.split('/').at(-1));
   suggestion.textContent='Име за GitHub: '+filename;
   if(filename!==selected.name){download.href=previewUrl;download.download=filename;download.hidden=false;setStatus('Качи снимката с безопасното име от бутона за изтегляне.')}else setStatus('Проверка дали снимката вече е публикувана…');
   openWizard(filename,selected.name);
   await verify();
   if(verified&&wizardStatus){wizard.querySelector('button').textContent='Готово';wizardStatus.textContent='✓ Снимката е намерена! Затвори прозореца и натисни „Запази“.';clearTimeout(wizardTimer);wizardTimer=null}
  }catch(error){if(closed||token!==epoch)return;setStatus((error.name==='EncodingError'?'Избраната снимка не може да се декодира.':error.message)+' Записаната снимка не е променена.');}
 };
 dialog.addEventListener('close',()=>{closed=true;closeWizard();invalidate();releasePreview();local=null},{once:true});
 if(baseline)verify();
 const readPhoto=()=>{
  if(removed)return '';
  const current=validTextureUrl(input.value);
  if(current===baseline)return baseline;
  if(verified&&verified.url===current)return verified.url;
  return baseline;
 };
 readPhoto.useColor=()=>{closeWizard();invalidate();local=null;removed=true;input.value='';file.value='';releasePreview();setStatus('Избран е цвят.');};
 return readPhoto;
}
