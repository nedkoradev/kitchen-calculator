---
layout: null
---
// Changes on EVERY Pages deployment, so browsers install a new worker/cache.
const REVISION='{{ site.github.build_revision }}';
const PREFIX=`kitchen-designer:${self.registration.scope}:`;
const CACHE=PREFIX+REVISION;
const FILES=['./','./index.html','./professional-dark.css?v=238','./app-release.js','./local-reset.js','./icons.mjs','./release.json','./settings.mjs','./texture-manager.mjs','./photo-orientation.mjs','./repository-space.json','./transparency.mjs','./cabinet-dimensions.mjs','./cabinet-generator.mjs','./cabinet-generator-ui.mjs','./geometry.mjs','./grain.mjs','./edge-editor.mjs','./viewport-helpers.mjs','./view-pan.mjs','./rendering.mjs','./appliance.mjs','./part-labels.mjs','./material-textures.mjs','./material-photo-editor.mjs','./project-model.mjs','./project-store.mjs','./project-ui.mjs','./cloud.js','./material-base-preferences.mjs','./materials/default.json','./manifest.webmanifest','./icon.svg'];
const urls=FILES.map(path=>new URL(path,self.registration.scope).href);
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(urls.map(url=>new Request(url,{cache:'reload'})));
  // Do not skipWaiting or reload clients: a tab may contain an unsaved project.
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 // Public-image verification must reach the network, never an offline fallback.
 if(url.searchParams.has('__kd_photo_check'))return;
 // Cache the public app shell and repository decor images only.
 // Never cache Firebase/user data, external textures or authentication calls.
 const repositoryTexture=url.href.startsWith(new URL('./materials/textures/',self.registration.scope).href)&&/\.(jpe?g|png|webp)$/i.test(url.pathname);
 if(request.method!=='GET'||(!urls.includes(url.href)&&!repositoryTexture))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(request,{cache:'no-cache'});
   if(response.ok)await cache.put(request,response.clone());
   return response;
  }catch(error){
   const cached=await cache.match(request);
   if(cached)return cached;
   throw error;
  }
 })());
});
