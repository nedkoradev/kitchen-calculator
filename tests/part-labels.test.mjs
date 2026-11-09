import test from 'node:test';import assert from 'node:assert/strict';import {partLabelIndex} from '../part-labels.mjs';
test('physical labels use all groups and parts rather than filtered or aggregated rows',()=>{
 const parts=[{key:'a',assembly:'one'},{key:'b',assembly:'one'},{key:'excluded'},{key:'c',assembly:'two'},{key:'d',assembly:'one'},{key:'e',assembly:'two'}],before=structuredClone(parts);
 assert.deepEqual([...partLabelIndex(parts)],[['a','Д1-1'],['b','Д1-2'],['excluded','Д2-1'],['c','Д3-1'],['d','Д1-3'],['e','Д3-2']]);assert.deepEqual(parts,before);
 assert.deepEqual([...partLabelIndex(structuredClone(parts))],[...partLabelIndex(parts)]);
});
