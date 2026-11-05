import {ProjectError,projectName,projectData} from './project-model.mjs';

// SDK injection allows the very same transactions to run against the isolated
// Firestore emulator. Production supplies the existing Firebase app/auth/SDK.
export function createProjectStore({db,sdk,getUser,isOnline=()=>true}){
 const {collection,doc,getDocsFromServer,getDocFromServer,runTransaction,serverTimestamp}=sdk;
 function session(){
  const user=getUser();
  if(!user)throw new ProjectError('signed-out','Първо влез с Google от горния десен ъгъл.');
  if(!isOnline())throw new ProjectError('offline','Няма интернет. Операцията не е изпълнена; проектът остава в редактора.');
  return user.uid;
 }
 function check(uid){if(getUser()?.uid!==uid)throw new ProjectError('auth-changed','Потребителят е сменен. Отвори проекта отново.')}
 const projects=uid=>collection(db,'users',uid,'v2_projects');
 const ref=(uid,id)=>{
  if(typeof id!=='string'||!id||id.includes('/'))throw new ProjectError('invalid-id','Невалиден проект.');
  return doc(projects(uid),id);
 };
 const nameRef=(uid,key)=>doc(db,'users',uid,'v2_project_names',key);
 const metadata=snap=>({id:snap.id,name:snap.data().name,revision:snap.data().revision,updatedAt:snap.data().updatedAt});
 return {
  async list(){const uid=session(),snap=await getDocsFromServer(projects(uid));check(uid);return {uid,items:snap.docs.map(metadata).sort((a,b)=>a.name.localeCompare(b.name,'bg'))}},
  async open(id){
   const uid=session(),snap=await getDocFromServer(ref(uid,id));check(uid);
   if(!snap.exists())throw new ProjectError('not-found','Проектът вече не съществува.');
   const data=snap.data();if(data.schemaVersion!==1)throw new ProjectError('unsupported-project','Неподдържана версия на проекта. Няма промени в редактора.');return {uid,...metadata(snap),data:projectData(data.data)};
  },
  async save({name:input,data:inputData,id,revision,saveAs=false,confirmation}){
   const uid=session(),{name,nameKey}=projectName(input),data=projectData(inputData,{maxBytes:850000});
   const fresh=doc(projects(uid));
   return runTransaction(db,async tx=>{
    check(uid);
    const source=id&&!saveAs?await tx.get(ref(uid,id)):null;
    if(source&&!source.exists())throw new ProjectError('not-found','Оригиналният проект вече не съществува.');
    if(source&&source.data().revision!==revision)throw new ProjectError('conflict','Проектът е променен в друг прозорец. Отвори го отново преди запис.');
    const claim=await tx.get(nameRef(uid,nameKey));
    const collision=claim.exists()&&claim.data().projectId!==source?.id;
    if(collision&&saveAs)throw new ProjectError('duplicate-name','Вече има проект с това име. Избери друго име за „Запази като“.');
    const target=collision?await tx.get(ref(uid,claim.data().projectId)):source;
    if(collision&&!target.exists())throw new ProjectError('invalid-registry','Името е резервирано от липсващ проект. Не е извършена промяна.');
    const old=target?.data(),targetId=target?.id||fresh.id;
    const kind=collision?'collision':old&&old.name!==name?'rename':null;
    const approval={kind,id:targetId,revision:old?.revision||0,name,sourceId:source?.id||null};
    if(kind&&JSON.stringify(confirmation)!==JSON.stringify(approval))
     throw new ProjectError('confirmation-required',collision?'Има друг проект с това име. Да презапиша ли него? Първоначално отвореният проект ще остане непроменен.':'Да променя ли името на отворения проект и да го презапиша?',approval);
    // All reads precede writes. Renaming releases the old name atomically.
    if(old&&old.nameKey!==nameKey)await tx.get(nameRef(uid,old.nameKey));
    check(uid);
    const nextRevision=(old?.revision||0)+1;
    tx.set(ref(uid,targetId),{schemaVersion:1,name,nameKey,data,revision:nextRevision,createdAt:old?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(nameRef(uid,nameKey),{nameKey,projectId:targetId});
    if(old&&old.nameKey!==nameKey)tx.delete(nameRef(uid,old.nameKey));
    return {uid,id:targetId,name,revision:nextRevision};
   }).then(result=>{check(uid);return result});
  },
  async remove({id,revision}){
   const uid=session();
   await runTransaction(db,async tx=>{
    const snap=await tx.get(ref(uid,id));check(uid);
    if(!snap.exists())throw new ProjectError('not-found','Проектът вече не съществува.');
    if(snap.data().revision!==revision)throw new ProjectError('conflict','Проектът е променен в друг прозорец. Обнови списъка преди изтриване.');
    const claim=await tx.get(nameRef(uid,snap.data().nameKey));check(uid);
    if(!claim.exists()||claim.data().projectId!==id)throw new ProjectError('invalid-registry','Невалиден регистър на имената. Няма изтрит проект.');
    tx.delete(ref(uid,id));tx.delete(nameRef(uid,snap.data().nameKey));
   });
   check(uid);return {uid,id};
  }
 };
}
