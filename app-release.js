// GitHub Pages renders release.json and sw.js with the same build revision.
// Plain static development servers keep the visible development fallback.
async function initializeRelease(){
 try{
  const response=await fetch(new URL('./release.json',import.meta.url),{cache:'no-store'});
  if(!response.ok)return;
  const release=await response.json();
  if(!/^[a-f0-9]{40}$/.test(release.revision)||!/^\d+\.\d+$/.test(release.version))return;
  const label=document.getElementById('appVersion');
  if(label){label.textContent=`v${release.version}`;document.documentElement.dataset.buildRevision=release.revision}
  if('serviceWorker' in navigator){
   const registration=await navigator.serviceWorker.register(new URL('./sw.js',import.meta.url),{updateViaCache:'none'});
   await registration.update();
  }
 }catch{
  // Offline or an unprocessed local Jekyll source: keep the existing app usable.
 }
}
initializeRelease();
