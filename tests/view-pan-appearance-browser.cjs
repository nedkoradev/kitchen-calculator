const assert=require('node:assert/strict');
const {openKitchen}=require('./browser-harness.cjs');

(async()=>{
 const {browser,page,errors}=await openKitchen();
 try{
  await page.addStyleTag({content:'#view canvas{visibility:hidden}'});
  for(const width of [1400,390]){
   await page.setViewportSize({width,height:900});
   for(const axis of ['X','Y']){
    const control=page.locator('#viewPan'+axis),box=await control.boundingBox();
    const {center,extent,track}=await page.evaluate(async png=>{
     const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
     const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
     const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
     const {data}=ctx.getImageData(0,0,image.width,image.height),dots=[];
     let track=0;
     for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const i=(y*image.width+x)*4;
      if(data[i]===102&&data[i+1]===158&&data[i+2]===234)dots.push([x,y]);
      if(data[i]===32&&data[i+1]===37&&data[i+2]===43)track++;
     }
     if(!dots.length)return {center:null,extent:[],track};
     const xs=dots.map(p=>p[0]),ys=dots.map(p=>p[1]);
     const center=[(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2];
     return {center,extent:[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],track};
    },(await control.screenshot()).toString('base64'));
    assert.ok(center,axis+' blue thumb is visible');
    assert.ok(extent.every(value=>value>=12&&value<=16),axis+' blue pixels fit one circular thumb: '+extent);
    assert.ok(track>100,axis+' dark track remains visible');
    const [x,y]=center;
    await page.mouse.move(box.x+x,box.y+y);
    await page.mouse.down();
    await page.mouse.move(box.x+x+(axis==='X'?45:0),box.y+y+(axis==='Y'?-45:0),{steps:8});
    await page.mouse.up();
    assert.ok(Number(await control.inputValue())>0,axis+' native drag updates the slider');
    await page.locator('#viewPanCenter').click();
    assert.ok(Math.abs(Number(await control.inputValue()))<.001);
   }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS one blue circular thumb, dark track and native dragging on both axes at desktop and mobile widths');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
