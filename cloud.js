import {MATERIAL_PREFERENCES_ID} from './material-base-preferences.mjs';
import {createProjectStore} from './project-store.mjs';
import {projectErrorMessage} from './project-model.mjs';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,setDoc,getDocs,getDoc,deleteDoc,getDocsFromServer,getDocFromServer,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const config={apiKey:"AIzaSyBlrriK3iQAuO0KN-bHkd1p5PoLWoqjTJ4",authDomain:"kitchen-designer-9d437.firebaseapp.com",projectId:"kitchen-designer-9d437",storageBucket:"kitchen-designer-9d437.firebasestorage.app",messagingSenderId:"579302190437",appId:"1:579302190437:web:b2ce4dda4911447588458c"};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const el=id=>document.getElementById(id),status=msg=>el('cloudStatus').textContent=msg;
const emit=(type,detail)=>window.dispatchEvent(new CustomEvent('kitchen-v2-cloud-'+type,{detail}));
let user=null,authGeneration=0;
onAuthStateChanged(auth,u=>{
 user=u;authGeneration++;el('cloudLogin').hidden=!!u;el('cloudLogout').hidden=!u;
 status(u?'☁ '+(u.email||'Свързан'):'☁ Не сте влезли');
 window.dispatchEvent(new CustomEvent('kitchen-project-auth',{detail:{uid:u?.uid||null}}));
 if(u){window.dispatchEvent(new Event('kitchen-v2-material-list-request'));window.dispatchEvent(new Event('kitchen-v2-cloud-list-request'))}
});
el('cloudLogin').onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){status('Вход: '+e.message)}};
el('cloudLogout').onclick=async()=>{try{await signOut(auth)}catch(e){status('Изход: '+e.message)}};
const cabinetCollection=()=>collection(db,'users',user.uid,'v2_cabinets');
function requireUser(){if(!user)throw new Error('Първо влез с Google от горния десен ъгъл.')}
window.addEventListener('kitchen-v2-cloud-list-request',async()=>{
 try{
  requireUser();
  const snap=await getDocs(cabinetCollection());
  const items=snap.docs.map(d=>({id:d.id,name:d.data().name||'Без име',parts:d.data().parts||[],updatedAt:d.data().updatedAt||0})).sort((a,b)=>a.name.localeCompare(b.name,'bg'));
  emit('list',{items});
 }catch(e){emit('error',{message:'Грешка при зареждане: '+e.message})}
});
window.addEventListener('kitchen-v2-cloud-save-request',async e=>{
 try{
  requireUser();
  const {name,parts,id:requestedId}=e.detail;
  if(!Array.isArray(parts)||!parts.length)throw new Error('Няма детайли.');
  const id=requestedId||'cab_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
  if(requestedId){const old=await getDoc(doc(cabinetCollection(),id));if(!old.exists())throw new Error('Оригиналният шкаф вече не съществува.');}
  await setDoc(doc(cabinetCollection(),id),{name,parts,v2:true,updatedAt:Date.now()});
  emit('saved',{id,name});
  status('☁ Запазено: '+name);
 }catch(err){emit('error',{message:'Грешка при запис: '+err.message})}
});
window.addEventListener('kitchen-v2-cloud-open-request',async e=>{
 try{
  requireUser();
  const snap=await getDoc(doc(cabinetCollection(),e.detail.id));
  if(!snap.exists())throw new Error('Шкафът не е намерен.');
  const data=snap.data();
  if(!Array.isArray(data.parts))throw new Error('Невалиден формат на шкафа.');
  emit('opened',{id:e.detail.id,name:data.name||'Без име',parts:data.parts});
 }catch(err){emit('error',{message:'Грешка при отваряне: '+err.message})}
});

window.addEventListener('kitchen-v2-cloud-delete-request',async e=>{
 try{
  requireUser();
  const id=e.detail?.id;
  if(typeof id!=='string'||!id.startsWith('cab_'))throw new Error('Невалиден идентификатор.');
  await deleteDoc(doc(cabinetCollection(),id));
  emit('deleted',{id});
  status('☁ Шкафът е изтрит.');
 }catch(err){emit('error',{message:'Грешка при изтриване: '+err.message})}
});

const materialCollection=()=>collection(db,'users',user.uid,'materials');
window.addEventListener('kitchen-v2-material-list-request',async()=>{
 const generation=authGeneration;
 try{requireUser();const uid=user.uid,ref=materialCollection();const [snap,prefs]=await Promise.all([getDocs(ref),getDoc(doc(ref,MATERIAL_PREFERENCES_ID))]);if(generation!==authGeneration)return;emit('material-list',{uid,items:snap.docs.filter(d=>d.id!==MATERIAL_PREFERENCES_ID).map(d=>({id:d.id,name:d.data().name||d.id})),defaultBaseId:prefs.data()?.defaultMaterialBaseId||''})}
 catch(e){if(generation===authGeneration)emit('material-error',{operation:'list',message:e.message})}
});
window.addEventListener('kitchen-v2-material-load-request',async e=>{
 const generation=authGeneration;
 try{requireUser();const uid=user.uid,id=e.detail.id;if(id===MATERIAL_PREFERENCES_ID)throw Error('Избери материална база.');const snap=await getDoc(doc(materialCollection(),id));if(generation!==authGeneration)return;if(!snap.exists())throw Error('Базата не е намерена');emit('material-loaded',{uid,id,automatic:!!e.detail.automatic,name:snap.data().name||id,data:snap.data()})}
 catch(error){if(generation===authGeneration)emit('material-error',{operation:'load',automatic:!!e.detail.automatic,message:error.message})}
});
window.addEventListener('kitchen-v2-material-default-request',async e=>{
 const generation=authGeneration;
 try{requireUser();const uid=user.uid,ref=materialCollection(),id=e.detail.id||'';
  if(id){if(typeof id!=='string'||id.includes('/')||id===MATERIAL_PREFERENCES_ID)throw Error('Невалидна база.');const base=await getDoc(doc(ref,id));if(!base.exists())throw Error('Базата вече не съществува.');}
  if(generation!==authGeneration)return;
  await setDoc(doc(ref,MATERIAL_PREFERENCES_ID),{schemaVersion:1,defaultMaterialBaseId:id,updatedAt:Date.now()},{merge:true});
  if(generation===authGeneration)emit('material-default-saved',{uid,id});
 }catch(error){if(generation===authGeneration)emit('material-default-error',{message:error.message})}
});

window.addEventListener('kitchen-v2-material-save-request',async e=>{
 const generation=authGeneration;
 try{
  requireUser();const uid=user.uid;
  const name=String(e.detail?.name||'').trim();if(!name)throw Error('Въведи име на базата');
  const id='base_'+name.toLowerCase().replace(/[^a-z0-9а-я]+/gi,'_');
  await setDoc(doc(materialCollection(),id),{...e.detail.data,name,updatedAt:Date.now()});
  if(generation!==authGeneration)return;
  emit('material-saved',{name,id,uid});
  window.dispatchEvent(new Event('kitchen-v2-material-list-request'));
 }catch(e){if(generation===authGeneration)emit('material-error',{message:e.message})}
});

// Separate request/response channel: existing cabinet/material contracts stay intact.
const projectStore=createProjectStore({db,sdk:{collection,doc,getDocsFromServer,getDocFromServer,runTransaction,serverTimestamp},getUser:()=>user,isOnline:()=>navigator.onLine});
window.addEventListener('kitchen-project-auth-request',()=>window.dispatchEvent(new CustomEvent('kitchen-project-auth',{detail:{uid:user?.uid||null}})));
window.addEventListener('kitchen-project-request',async event=>{
 const {requestId,action,args}=event.detail||{},uid=user?.uid||null;
 try{
  if(!['list','open','save','remove'].includes(action))throw Error('Непозната операция.');
  const result=await projectStore[action](args);
  window.dispatchEvent(new CustomEvent('kitchen-project-response',{detail:{requestId,uid,result}}));
 }catch(error){
  window.dispatchEvent(new CustomEvent('kitchen-project-response',{detail:{requestId,uid,error:{code:error.code||'unknown',message:projectErrorMessage(error),details:error.details}}}));
 }
});
