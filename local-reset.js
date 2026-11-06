// Explicitly requested one-time cleanup of this app's existing local records.
// Run before application modules read their libraries. Never clear Firebase auth
// or another app's origin storage, and never repeat the reset on later releases.
(()=>{
 const marker='kitchenDesigner.localReset.2026-11-06';
 try{
  if(localStorage.getItem(marker)==='done')return;
  for(const key of ['kitchenV2Cabinets','kitchenV2Projects','kitchenPdcMaterials','kitchenEdgeMaterials','kitchenV2ExtraMaterials','kitchenActiveMaterialBase'])localStorage.removeItem(key);
  localStorage.setItem(marker,'done');
 }catch{/* Storage may be disabled; the cloud UI remains available. */}
})();
