const roles=['editor','viewer'];
export const normalizeEmail=email=>String(email||'').trim().toLowerCase();

export function createSharingStore({db,sdk,getUser}){
 function actor(){
  const user=getUser();
  if(!user?.uid||!user.emailVerified||!user.email)throw Error('Влез с потвърден Google акаунт.');
  return user;
 }
 const own=(uid,email)=>sdk.doc(db,'users',uid,'access_grants',email);
 const inbox=(email,uid)=>sdk.doc(db,'nediq_access',email,'bases',uid);
 function entry(email){
  email=normalizeEmail(email);
  if(email.length>254||!/^\S+@[^\s/@]+\.[^\s/@]+$/.test(email)||email.includes('/')||email.split('@').length!==2)
   throw Error('Въведи валиден Google имейл.');
  return email;
 }
 async function change(email,role,{existing=false,remove=false}={}){
  const user=actor();
  email=entry(email);
  if(email===normalizeEmail(user.email))throw Error('Вече си собственик на тази база.');
  if(!remove&&!roles.includes(role))throw Error('Невалидна роля.');
  const local=own(user.uid,email),remote=inbox(email,user.uid);
  return sdk.runTransaction(db,async tx=>{
   const old=await tx.get(local);
   if(getUser()?.uid!==user.uid)throw Error('Профилът е сменен.');
   if(existing!==old.exists())throw Error(existing?'Достъпът вече е премахнат.':'Потребителят вече има достъп. Промени ролята му в списъка.');
   if(remove){tx.delete(local);tx.delete(remote);return}
   const grant={ownerUid:user.uid,role,ownerName:(user.displayName?.trim()||user.email).slice(0,120)};
   tx.set(local,grant);tx.set(remote,grant);
  });
 }
 return {
  add:(email,role)=>change(email,role),
  changeRole:(email,role)=>change(email,role,{existing:true}),
  revoke:email=>change(email,null,{existing:true,remove:true}),
  async members(){return (await sdk.getDocsFromServer(sdk.collection(db,'users',actor().uid,'access_grants'))).docs.map(d=>({email:d.id,...d.data()}))},
  async bases(){return (await sdk.getDocsFromServer(sdk.collection(db,'nediq_access',normalizeEmail(actor().email),'bases'))).docs.map(d=>d.data())},
  async membership(uid){return (await sdk.getDocFromServer(inbox(normalizeEmail(actor().email),uid))).data()},
  membershipRef:(email,uid)=>inbox(normalizeEmail(email),uid)
 };
}
