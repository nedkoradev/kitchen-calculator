import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getFirestore,collection,doc,setDoc,getDocs} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
const config={apiKey:"AIzaSyBlrriK3iQAuO0KN-bHkd1p5PoLWoqjTJ4",authDomain:"kitchen-designer-9d437.firebaseapp.com",projectId:"kitchen-designer-9d437",storageBucket:"kitchen-designer-9d437.firebasestorage.app",messagingSenderId:"579302190437",appId:"1:579302190437:web:b2ce4dda4911447588458c"};
const app=initializeApp(config),auth=getAuth(app),db=getFirestore(app);
const el=id=>document.getElementById(id),status=msg=>el('cloudStatus').textContent=msg;
let user=null;
onAuthStateChanged(auth,u=>{user=u;el('cloudLogin').hidden=!!u;el('cloudLogout').hidden=!u;el('cloudSync').disabled=!u;status(u?'Свързан: '+u.email:'Влез с Google, за да запазваш проектите онлайн.')});
el('cloudLogin').onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider())}catch(e){status('Вход: '+e.message)}};
el('cloudLogout').onclick=async()=>{try{await signOut(auth)}catch(e){status(e.message)}};
el('cloudSync').onclick=async()=>{
 if(!user)return;
 el('cloudSync').disabled=true;
 try{
  status('Синхронизиране…');
  const local=window.kitchenV2CloudData();
  const result={};
  for(const [kind,items] of [['cabinets',local.cabinets],['projects',local.projects]]){
   const ref=collection(db,'users',user.uid,'v2_'+kind);
   const snap=await getDocs(ref);
   const merged=new Map(snap.docs.map(d=>[d.id,d.data()]));
   for(const item of items){
    const id=String(item.id);
    await setDoc(doc(ref,id),{id,name:item.name,parts:item.parts,updatedAt:Date.now()});
    merged.set(id,{id,name:item.name,parts:item.parts});
   }
   result[kind]=[...merged.values()].filter(x=>Array.isArray(x.parts));
   localStorage.setItem(kind==='cabinets'?'kitchenV2Cabinets':'kitchenV2Projects',JSON.stringify(result[kind]));
  }
  window.dispatchEvent(new CustomEvent('kitchen-v2-cloud-data',{detail:{cabinetItems:result.cabinets,projectItems:result.projects}}));
  status('Синхронизирани '+(result.cabinets.length+result.projects.length)+' записа.');
 }catch(e){status('Грешка: '+e.message)}finally{el('cloudSync').disabled=!user}
};