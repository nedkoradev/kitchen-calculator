// Transactions are conveniences only: firestore.rules is the authoritative enforcement.
export function createSharingStore({db,sdk,getUser}){
 const actor=()=>{const u=getUser();if(!u?.uid)throw Error('Влез с Google.');return u};
 const ref=(owner,collection,id)=>sdk.doc(db,'users',owner,collection,id);
 const ownerOnly=owner=>{if(actor().uid!==owner)throw Error('Само собственикът управлява достъпа.')};
 return {
 async invite(owner,email,role){ownerOnly(owner);email=String(email).trim().toLowerCase();if(!/^[^\s/@]+@[^\s/]+\.[^\s/]+$/.test(email)||!['editor','viewer'].includes(role))throw Error('Невалиден имейл или роля.');const target=sdk.doc(sdk.collection(db,'users',owner,'access_invites'));await sdk.setDoc(target,{ownerUid:owner,email,role,state:'pending',createdAt:sdk.serverTimestamp(),expiresAt:new Date(Date.now()+7*86400000)});return target.id},
 async accept(owner,id){const user=actor();return sdk.runTransaction(db,async tx=>{const invitation=ref(owner,'access_invites',id),snap=await tx.get(invitation);if(!snap.exists())throw Error('Поканата не съществува.');const invite=snap.data();const membership=ref(owner,'members',user.uid);await tx.get(membership);const directory=ref(user.uid,'shared_bases',owner);tx.set(membership,{uid:user.uid,ownerUid:owner,email:invite.email,role:invite.role,status:'active',inviteId:id});tx.set(invitation,{...invite,state:'accepted',acceptedBy:user.uid,acceptedAt:sdk.serverTimestamp()});tx.set(directory,{ownerUid:owner,joinedAt:sdk.serverTimestamp()});return {ownerUid:owner,role:invite.role}})},
 async changeRole(owner,uid,role){ownerOnly(owner);if(!['editor','viewer'].includes(role))throw Error('Невалидна роля.');return sdk.runTransaction(db,async tx=>{const target=ref(owner,'members',uid),snap=await tx.get(target);if(!snap.exists())throw Error('Членството не съществува.');tx.set(target,{...snap.data(),role})})},
 async revoke(owner,uid){ownerOnly(owner);return sdk.runTransaction(db,async tx=>{const target=ref(owner,'members',uid),snap=await tx.get(target);if(!snap.exists())throw Error('Членството не съществува.');if(snap.data().status!=='revoked')tx.set(target,{...snap.data(),status:'revoked'});tx.delete(ref(uid,'shared_bases',owner))})},
 async invitations(owner){
  ownerOnly(owner);
  return (await sdk.getDocsFromServer(sdk.collection(db,'users',owner,'access_invites'))).docs.map(d=>({id:d.id,...d.data()}));
 },
 async cancel(owner,id){
  ownerOnly(owner);
  return sdk.runTransaction(db,async tx=>{
   const target=ref(owner,'access_invites',id),snap=await tx.get(target);
   if(!snap.exists()||snap.data().state!=='pending')throw Error('Поканата вече не чака приемане.');
   tx.delete(target);
  });
 },
 async membership(owner){
  const snap=await sdk.getDocFromServer(ref(owner,'members',actor().uid));
  const member=snap.data();
  return member?.status==='active'&&['editor','viewer'].includes(member.role)?member:null;
 },
 async members(owner){ownerOnly(owner);return (await sdk.getDocsFromServer(sdk.collection(db,'users',owner,'members'))).docs.map(d=>({id:d.id,...d.data()}))},
 async bases(){return (await sdk.getDocsFromServer(sdk.collection(db,'users',actor().uid,'shared_bases'))).docs.map(d=>d.data())}
 };
}
