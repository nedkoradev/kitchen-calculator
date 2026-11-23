import test from 'node:test';import assert from 'node:assert/strict';import {documentTree} from '../document-tree.mjs';
import {v3GroupDisplayNames} from '../release-candidate/group-names.mjs';
test('hierarchy follows outer assembly then reverse stack without mutating parts',()=>{const parts=[{key:'a',assembly:'outer',assemblyStack:['cab','middle']},{key:'b',assembly:'outer',assemblyStack:['cab','middle']},{key:'free'}],copy=structuredClone(parts),tree=documentTree(parts,{cab:'Cabinet'},{a:'A'});assert.equal(tree[0].assembly,'outer');assert.equal(tree[0].children[0].assembly,'middle');assert.equal(tree[0].children[0].children[0].name,'Cabinet');assert.deepEqual(tree[0].keys,['a','b']);assert.equal(tree[1].id,'free');assert.deepEqual(parts,copy)});
test('v3 group display names number only unnamed groups and preserve custom names',()=>{
 const parts=[
  {key:'a',assembly:'outer',assemblyStack:['cab','middle']},
  {key:'b',assembly:'outer',assemblyStack:['cab','middle']},
  {key:'free'},
 ];
 const names={outer:'Кухня',cab:'Cabinet'};
 const beforeParts=structuredClone(parts),beforeNames={...names};
 const nodes=v3GroupDisplayNames(parts,names);
 assert.deepEqual(nodes.map(({assembly,name,count})=>({assembly,name,count})),[
  {assembly:'outer',name:'Кухня',count:2},
  {assembly:'middle',name:'Група 1',count:2},
  {assembly:'cab',name:'Cabinet',count:2},
 ]);
 assert.deepEqual(parts,beforeParts);
 assert.deepEqual(names,beforeNames);
});
test('v3 anonymous nested groups receive stable Bulgarian sequence numbers',()=>{
 const parts=[
  {key:'a',assembly:'assembly-outer',assemblyStack:['assembly-inner']},
  {key:'b',assembly:'assembly-outer',assemblyStack:['assembly-inner']},
 ];
 const beforeParts=structuredClone(parts);
 const nodes=v3GroupDisplayNames(parts,{});
 assert.deepEqual(nodes.map(node=>node.name),['Група 1','Група 2']);
 assert.deepEqual(parts,beforeParts);
});
