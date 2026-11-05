import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {manyPartCabinet,largeRoom} from './fixtures.mjs';
const moduleUrl=process.argv[2]?pathToFileURL(resolve(process.argv[2])):new URL('../geometry.mjs',import.meta.url);
const {resize,bounds}=await import(moduleUrl);
const runs=Number(process.env.BENCH_RUNS||9);
const counts=(process.env.BENCH_COUNTS||'5,50,100,200').split(',').map(Number);
const results=[];
for(const count of counts){
 const parts=manyPartCabinet(count),samples=[];
 for(let i=0;i<runs;i++){
  const start=performance.now(),next=resize(parts,[],largeRoom,'w',4000);
  samples.push(performance.now()-start);
  assert.equal(bounds(next,'x').max-bounds(next,'x').min,4000);
 }
 const sorted=[...samples].sort((a,b)=>a-b),round=n=>+n.toFixed(2);
 results.push({parts:count,runs,medianMs:round(sorted[Math.floor(runs/2)]),maxMs:round(sorted.at(-1)),samplesMs:samples.map(round)});
}
console.log(JSON.stringify({node:process.version,from:600,to:4000,room:largeRoom,results},null,2));
