import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,setDoc,getDocs,getDoc,deleteDoc} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const config={apiKey:"AIzaSyBlrriK3iQAuO0KN-bHkd1p5PoLWoqjTJ4",authDomain:"kitchen-designer-9d437.firebaseapp.com",projectId:"kitchen-designer-9d437",storageBucket:"kitchen-designer-9d437.firebasestorage.app",messagingSenderId:"579302190437",appId:"1:579302190437:web:b2ce4dda4911447588458c"};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const el=id=>document.getElementById(id),status=msg=>el('cloudStatus').textContent=msg;
const emit=(type,detail)=>window.dispatchEvent(new CustomEvent('kitchen-v2-cloud-'+type,{detail}));
let user=null;
onAuthStateChanged(auth,u=>{
 user=u;el('cloudLogin').hidden=!!u;el('cloudLogout').hidden=!u;
 status(u?'☁ '+(u.email||'Свързан'):'☁ Не сте влезли');
});
el('cloudLogin').onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){status('Вход: '+e.message)}};
el('cloudLogout').onclick=async()=>{try{await signOut(auth)}catch(e){status('Изход: '+e.message)}};
const cabinetCollection=()=>collection(db,'users',user.uid,'v2_cabinets');
function requireUser(){if(!user)throw new Error('Първо влез с Google от горния десен ъгъл.')}
window.addEventListener('kitchen-v2-cloud-list-request',async()=>{
 try{
  requireUser();
  const snap=await getDocs(cabinetCollection());
  const items=snap.docs.map(d=>({id:d.id,name:d.data().name||'Без име'})).sort((a,b)=>a.name.localeCompare(b.name,'bg'));
  emit('list',{items});
 }catch(e){emit('error',{message:'Грешка при зареждане: '+e.message})}
});
window.addEventListener('kitchen-v2-cloud-save-request',async e=>{
 try{
  requireUser();
  const {name,parts}=e.detail;
  if(!Array.isArray(parts)||!parts.length)throw new Error('Няма детайли.');
  const id='cab_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
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
  emit('opened',{name:data.name||'Без име',parts:data.parts});
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
