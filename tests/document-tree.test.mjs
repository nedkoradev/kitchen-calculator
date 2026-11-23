import test from 'node:test';import assert from 'node:assert/strict';import {documentTree} from '../document-tree.mjs';
import {v3GroupNameMap} from '../release-candidate/group-names.mjs';
test('hierarchy follows outer assembly then reverse stack without mutating parts',()=>{const parts=[{key:'a',assembly:'outer',assemblyStack:['cab','middle']},{key:'b',assembly:'outer',assemblyStack:['cab','middle']},{key:'free'}],copy=structuredClone(parts),tree=documentTree(parts,{cab:'Cabinet'},{a:'A'});assert.equal(tree[0].assembly,'outer');assert.equal(tree[0].children[0].assembly,'middle');assert.equal(tree[0].children[0].children[0].name,'Cabinet');assert.deepEqual(tree[0].keys,['a','b']);assert.equal(tree[1].id,'free');assert.deepEqual(parts,copy)});
test('v3 group name map feeds the existing visualization without mutating data',()=>{
 const parts=[{key:'a',assembly:'assembly1',assemblyStack:['assembly2']},{key:'b',assembly:'assembly1',assemblyStack:['assembly2']}];
 const beforeParts=structuredClone(parts),names={assembly2:'Потребителска група'};
 const map=v3GroupNameMap(parts,names);
 assert.deepEqual([...map],[['assembly1','Група 1'],['assembly2','Потребителска група']]);
 assert.deepEqual(parts,beforeParts);
 assert.deepEqual(names,{assembly2:'Потребителска група'});
});
