async function setGeneratorEdges(page,role,profiles){
 await page.locator('#newCabinetEdges-'+role).click();
 for(const [id,edges] of Object.entries(profiles)){
  await page.locator('#visualEdgeVariant').selectOption(id);
  for(let slot=0;slot<4;slot++)await page.locator('[data-edge-slot="'+slot+'"]').selectOption(edges[slot]===null?'':String(edges[slot]));
 }
 await page.locator('#visualEdgeApply').click();
}
module.exports={setGeneratorEdges};
