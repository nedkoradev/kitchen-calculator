import test from 'node:test';import assert from 'node:assert/strict';import {partLabelIndex} from '../part-labels.mjs';
test('physical labels use all groups and parts rather than filtered or aggregated rows',()=>{
 const parts=[{key:'a',assembly:'one'},{key:'b',assembly:'one'},{key:'excluded'},{key:'c',assembly:'two'},{key:'d',assembly:'one'},{key:'e',assembly:'two'}],before=structuredClone(parts);
 assert.deepEqual([...partLabelIndex(parts)],[['a','Д1-1'],['b','Д1-2'],['excluded','Д2-1'],['c','Д3-1'],['d','Д1-3'],['e','Д3-2']]);assert.deepEqual(parts,before);
 assert.deepEqual([...partLabelIndex(structuredClone(parts))],[...partLabelIndex(parts)]);
});

test('projected silhouettes reject empty bounding-box corners and retain thin targets',async()=>{
 const {convexHull,silhouetteDistance}=await import('../viewport-helpers.mjs');
 const hull=convexHull([{x:0,y:5},{x:5,y:0},{x:10,y:5},{x:5,y:10},{x:5,y:5}]);
 assert.equal(hull.length,4);assert.equal(silhouetteDistance({x:5,y:5},hull),0);assert.ok(silhouetteDistance({x:0,y:0},hull)>3);
 assert.equal(silhouetteDistance({x:4,y:3},convexHull([{x:0,y:0},{x:10,y:0}])) ,3);
});
