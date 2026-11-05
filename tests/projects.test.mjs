import test from 'node:test';
import assert from 'node:assert/strict';
import {projectName,projectData,projectErrorMessage,ProjectError} from '../project-model.mjs';
const fixture=()=>({room:{w:3000,h:2600,d:3000},parts:[{part:{key:'a',x:.5,y:9,z:0,w:101,h:18,d:400,assembly:'outer',assemblyStack:[null,'inner'],locks:{h:true,w:undefined}},finish:{material:1,edges:[0,null,1,2]},allEdges:false}]});
test('Bulgarian names share a canonical key regardless of case/outer whitespace',()=>{
 assert.deepEqual(projectName('  МОЯТА   кухня  '),{name:'МОЯТА кухня',nameKey:'моята кухня'});
 assert.equal(projectName('e\u0301').name,projectName('é').name);
});
test('empty/reserved/oversized/path names are rejected',()=>{
 for(const name of ['', '  ', '/', '..','__reserved__','a'.repeat(101)])assert.throws(()=>projectName(name),{code:'invalid-name'});
});
test('serialization preserves geometry, finishes, locks and explicit null histories',()=>{
 const source=fixture(),data=projectData(source);
 assert.deepEqual(data.parts[0].part.assemblyStack,[null,'inner']);
 assert.equal(data.parts[0].part.x,.5);assert.equal(data.parts[0].part.locks.h,true);
 assert.equal('w' in data.parts[0].part.locks,false);
 assert.deepEqual(data.parts[0].finish,source.parts[0].finish);
 assert.notEqual(data.parts,source.parts);assert.ok('w' in source.parts[0].part.locks);
});
test('malformed data is rejected before scene replacement',()=>{
 for(const modify of [p=>p.room.w=0,p=>p.parts[0].part.x=NaN,p=>p.parts[0].part.w=-1,p=>p.parts[0].part.assemblyStack=[4],p=>p.materials={},p=>p.settings={camera:{position:[],target:[],zoom:0}}]){
  const p=fixture();modify(p);assert.throws(()=>projectData(p),{code:'invalid-project'});
 }
});
test('size guard applies to cloud writes without imposing a geometry limit',()=>{
 const p=fixture();p.extra='x'.repeat(850001);
 assert.throws(()=>projectData(p,{maxBytes:850000}),{code:'project-too-large'});
 assert.ok(projectData(p).extra);
});
test('permission and network failures have readable messages without success',()=>{
 assert.match(projectErrorMessage({code:'permission-denied'}),/Нямаш достъп/);
 assert.match(projectErrorMessage({code:'unavailable'}),/не е потвърден/);
 assert.equal(projectErrorMessage(new ProjectError('offline','Няма интернет.')),'Няма интернет.');
});
