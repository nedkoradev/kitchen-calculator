const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,errors}=await openKitchen({
  extraHooks:`window.__baseline={
   apply:applyProjectSnapshot,
   capture:captureProjectSnapshot,
   collectExport(){
    XLSX.writeFile=book=>{this.xlsx=XLSX.utils.sheet_to_json(book.Sheets.RIK_order,{header:1,defval:''})};
   }
  };`
 });
 try{
  await page.locator('#modeProject').click();
  await page.evaluate(()=>{
   const panel=(key,x)=>({
    part:{key,x,y:9,z:0,w:600,h:18,d:400,assembly:'cabinet',locks:{h:true}},
    name:'Рафт',finish:{material:0,edges:[0,null,null,null],grainRequired:true,grainAxis:'x'},allEdges:false
   });
   window.__baseline.apply({
    room:{w:3000,h:2600,d:3000},
    parts:[panel('custom101',-300),panel('custom102',300)],
    assemblyNames:{cabinet:'Корпус'},
    materials:{
     pdcMaterials:[{name:'Контролна плоскост',color:'#ddd0b8',fullW:2000,fullH:1000,fullPrice:35,halfW:1000,halfH:1000,halfPrice:20}],
     edgeMaterials:[{name:'Контролен кант',price:2}],
     backMaterials:[],worktops:[],servicePrices:{cutStart:3,cutPart:1,edging:0.5}
    },
    settings:{sheetUtilization:80,viewMode:'front',projectTab:'3d'}
   });
  });
  const before=await page.evaluate(()=>window.__baseline.capture());
  await page.locator('#reportsMenu summary').click();
  await page.locator('#navCut').click();
  const rows=page.locator('#projectCutList tbody tr');
  assert.equal(await rows.count(),1);
  const cells=await rows.first().locator('td').allTextContents();
  assert.deepEqual(cells.slice(2,5),['2','600 × 400 мм ↔','18 мм']);
  assert.match(cells[5],/Контролен кант/);
  assert.equal(cells[6],'0.8 м');

  await page.evaluate(()=>window.__baseline.collectExport());
  await page.locator('#exportProjectCut').click();
  const xlsx=await page.evaluate(()=>window.__baseline.xlsx);
  assert.equal(xlsx.length,2);
  assert.deepEqual(xlsx[1].slice(1,6),['Контролна плоскост',18,600,400,2]);
  assert.equal(xlsx[1][8],0);
  assert.deepEqual(xlsx[1].slice(10,14),['','','','Контролен кант']);

  await page.locator('#reportsMenu summary').click();
  await page.locator('#navCosts').click();
  const costs=await page.locator('#projectCosts tbody tr').evaluateAll(rows=>Object.fromEntries(
   rows.map(row=>[row.cells[0].textContent,row.cells[6].textContent])
  ));
  // 20 for one half sheet + 0.8 m × 2 + (3 + 2 × 1) + 0.8 m × 0.5.
  assert.equal(costs['Контролна плоскост'],'20.00 €');
  assert.equal(costs['Кант — Контролен кант'],'1.60 €');
  assert.equal(costs['Разкрой'],'5.00 €');
  assert.equal(costs['Кантиране'],'0.40 €');
  assert.equal(costs['ОБЩА СУМА'],'27.00 €');
  const after=await page.evaluate(()=>window.__baseline.capture());
  assert.deepEqual(after.parts,before.parts);
  assert.deepEqual(after.materials,before.materials);
  assert.deepEqual(errors,[]);
  console.log('PASS v2.93 cut, XLSX and 27.00 € reference estimate');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
