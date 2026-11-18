import {memoryFirestore} from './memory-firestore.mjs';
const {db,sdk}=memoryFirestore();
let readGate=null,releaseRead=null,listGate=null,releaseList=null;
const snapshots=new Map();
let uid='alice';const listeners=[];
const notify=()=>listeners.forEach(fn=>fn(uid?{uid,email:uid+'@example.test',emailVerified:true,displayName:uid}:null));
export const initializeApp=()=>({});
export const getAuth=()=>({});
export class GoogleAuthProvider{}
export const signInWithPopup=async()=>{uid='alice';notify()};
export const signOut=async()=>{uid=null;notify()};
export const onAuthStateChanged=(_auth,fn)=>{listeners.push(fn);queueMicrotask(notify)};
export const getFirestore=()=>db;
export const {collection,doc,serverTimestamp,runTransaction}=sdk;
export const getDocFromServer=async ref=>{if(readGate)await readGate;if(db.rejectReads)throw {code:'unavailable'};return sdk.getDocFromServer(ref)};
export const getDocsFromServer=async ref=>{if(listGate)await listGate;if(db.rejectReads)throw {code:'unavailable'};return sdk.getDocsFromServer(ref)};
export const getDoc=getDocFromServer,getDocs=getDocsFromServer;
export const setDoc=async(ref,value,options={})=>{if(db.beforeCommit)await db.beforeCommit();if(db.rejectWrites)throw {code:'unavailable',message:'offline fixture'};db.rows.set(ref.path,structuredClone(options.merge?{...db.rows.get(ref.path),...value}:value))};
export const deleteDoc=async ref=>db.rows.delete(ref.path);
window.__firebaseDouble={
 seed(path,value){db.rows.set(path,structuredClone(value));db.version++;for(const notify of snapshots.get(path)||[])notify()},
 remove(path){db.rows.delete(path);db.version++;for(const notify of snapshots.get(path)||[])notify()},
 setUser(next){uid=next;notify()},rows:()=>[...db.rows].map(([path,value])=>({path,value:structuredClone(value)})),
 failWrites(value){db.rejectWrites=value},failReads(value){db.rejectReads=value},
 holdWrites(){db.beforeCommit=()=>new Promise(resolve=>window.__releaseProjectWrite=resolve)},release(){db.beforeCommit=null;window.__releaseProjectWrite?.()},
 holdLists(){listGate=new Promise(resolve=>releaseList=resolve)},releaseLists(){listGate=null;releaseList?.();releaseList=null},
 holdReads(){readGate=new Promise(resolve=>releaseRead=resolve)},releaseReads(){readGate=null;releaseRead?.();releaseRead=null},
 reset(){db.rows.clear();db.version++}
};

export function onSnapshot(ref,_options,update){
 const listeners=snapshots.get(ref.path)||new Set();
 snapshots.set(ref.path,listeners);
 const notify=async()=>update({...await sdk.getDocFromServer(ref),metadata:{fromCache:false}});
 listeners.add(notify);queueMicrotask(notify);
 return ()=>listeners.delete(notify);
}
