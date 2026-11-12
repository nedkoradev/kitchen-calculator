async function setGeneratorEdges(page,role,profiles){
 for(const [id,edges] of Object.entries(profiles)){
  const button=page.locator('#newCabinetEdges-'+id);
  if(!await button.isVisible())continue;
  await button.click();
  for(let slot=0;slot<4;slot++)await page.locator('[data-edge-slot="'+slot+'"]').selectOption(edges[slot]===null?'':String(edges[slot]));
  await page.locator('#visualEdgeApply').click();
 }
}
module.exports={setGeneratorEdges};
