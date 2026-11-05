// A 600-mm cabinet with two locked 18-mm side panels and separated shelves.
// Tall fixtures isolate resize cost without introducing initial shelf overlaps.
export function manyPartCabinet(count=5){
 const height=Math.max(720,(count-4)*24+60),left=-2000;
 const p=(key,x,y,w,h)=>({key,x:left+x,y,z:0,w,h,d:500,locks:w===18?{w:true}:{h:true},assembly:'cab'});
 return [p('left',9,height/2,18,height),p('right',591,height/2,18,height),
  p('bottom',300,9,564,18),p('top',300,height-9,564,18),
  ...Array.from({length:count-4},(_,i)=>p('shelf'+i,300,36+i*24,564,18))];
}
export const largeRoom={w:10000,h:10000,d:10000};
