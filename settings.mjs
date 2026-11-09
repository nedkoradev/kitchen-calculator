const referenceBytes=1024**3;
export function formatBytes(bytes){
 if(bytes<1024)return `${bytes} B`;
 const units=['KiB','MiB','GiB'];let value=bytes/1024,index=0;
 while(value>=1024&&index<units.length-1){value/=1024;index++}
 return `${new Intl.NumberFormat('bg-BG',{maximumFractionDigits:2}).format(value)} ${units[index]}`;
}
export function validSpaceStats(value){
 return value?.schemaVersion===1&&value.inventoryReady===true&&value.scope==='published-source-snapshot'&&value.includesGitHistory===false&&/^\d+\.\d+$/.test(value.version)&&/^[a-f0-9]{40}$/.test(value.revision)&&Number.isFinite(Date.parse(value.measuredAt))&&
 ['totalBytes','textureBytes','imageCount','fileCount'].every(key=>Number.isSafeInteger(value[key])&&value[key]>=0)&&value.totalBytes>=value.textureBytes&&value.fileCount>=value.imageCount&&value.referenceBytes===referenceBytes;
}
export function installSettings(){
 const dialog=document.getElementById('settingsDialog'),button=document.getElementById('settingsButton');
 dialog.addEventListener('keydown',event=>event.stopPropagation());
 const status=document.getElementById('spaceStatus'),details=document.getElementById('spaceDetails');
 let request=0;
 async function load(){
  const epoch=++request;status.textContent='Зареждане на последното измерване…';details.hidden=true;
  try{
   const response=await fetch(new URL('./repository-space.json',import.meta.url),{cache:'no-store'});
   if(!response.ok)throw Error('Stats unavailable');
   const data=await response.json();if(!validSpaceStats(data))throw Error('Invalid stats');
   if(epoch!==request)return;
   document.getElementById('repositoryBytes').textContent=formatBytes(data.totalBytes);
   document.getElementById('textureBytes').textContent=formatBytes(data.textureBytes);
   document.getElementById('textureImageCount').textContent=String(data.imageCount);
   document.getElementById('spaceMeasuredAt').textContent=new Intl.DateTimeFormat('bg-BG',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Sofia'}).format(new Date(data.measuredAt))+' (българско време)';
   document.getElementById('spaceSnapshotVersion').textContent=`Измерване за v${data.version} · ${data.fileCount} изходни файла`;
   const progress=document.getElementById('spaceProgress');progress.max=referenceBytes;progress.value=Math.min(data.totalBytes,referenceBytes);
   document.getElementById('spaceProgressLabel').textContent=`${formatBytes(data.totalBytes)} / 1 GiB · ${new Intl.NumberFormat('bg-BG',{maximumFractionDigits:2}).format(data.totalBytes/referenceBytes*100)}%`;
   details.hidden=false;status.textContent='';
  }catch{if(epoch===request)status.textContent='Статистиката не е налична. Опитай отново при връзка или след публикуване.'}
 }
 button.onclick=()=>{document.getElementById('settingsVersion').textContent=document.getElementById('appVersion').textContent;dialog.showModal();load()};
 for(const id of ['settingsClose','settingsDone']){const control=document.getElementById(id);if(control)control.onclick=()=>dialog.close();}
 const retry=document.getElementById('spaceRetry');if(retry)retry.onclick=load;
}
