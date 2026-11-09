import {memoryFirestore} from './memory-firestore.mjs';
const {db,sdk}=memoryFirestore();
let uid='alice';const listeners=[];
const notify=()=>listeners.forEach(fn=>fn(uid?{uid,email:uid+'@example.test'}:null));
export const initializeApp=()=>({});
export const getAuth=()=>({});
export class GoogleAuthProvider{}
export const signInWithPopup=async()=>{uid='alice';notify()};
export const signOut=async()=>{uid=null;notify()};
export const onAuthStateChanged=(_auth,fn)=>{listeners.push(fn);queueMicrotask(notify)};
export const getFirestore=()=>db;
export const {collection,doc,serverTimestamp,runTransaction}=sdk;
export const getDocFromServer=async ref=>{if(db.rejectReads)throw {code:'unavailable'};return sdk.getDocFromServer(ref)};
export const getDocsFromServer=async ref=>{if(db.rejectReads)throw {code:'unavailable'};return sdk.getDocsFromServer(ref)};
export const getDoc=getDocFromServer,getDocs=getDocsFromServer;
export const setDoc=async(ref,value)=>{if(db.beforeCommit)await db.beforeCommit();if(db.rejectWrites)throw {code:'unavailable',message:'offline fixture'};db.rows.set(ref.path,structuredClone(value))};
export const deleteDoc=async ref=>db.rows.delete(ref.path);
window.__firebaseDouble={
 setUser(next){uid=next;notify()},rows:()=>[...db.rows].map(([path,value])=>({path,value:structuredClone(value)})),
 failWrites(value){db.rejectWrites=value},failReads(value){db.rejectReads=value},
 holdWrites(){db.beforeCommit=()=>new Promise(resolve=>window.__releaseProjectWrite=resolve)},release(){db.beforeCommit=null;window.__releaseProjectWrite?.()},
 reset(){db.rows.clear();db.version++}
};
