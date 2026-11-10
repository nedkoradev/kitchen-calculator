import test from 'node:test';import assert from 'node:assert/strict';import {applianceFace,inCut} from '../appliance.mjs';import {projectData} from '../project-model.mjs';
test('appliance front follows quarter turns without changing face dimensions',()=>{
 for(let turn=0;turn<4;turn++){const p={w:turn%2?550:600,h:590,d:turn%2?600:550,appliance:{turn,textureUrl:''}},face=applianceFace(p);assert.equal(face.width,600);assert.equal(face.height,590);assert.equal(face.x,turn===1?-275.15:turn===3?275.15:0);assert.equal(face.z,turn===0?275.15:turn===2?-275.15:0)}
});
test('appliances cannot enter manufacturing lists through legacy finish flags',()=>{assert.equal(inCut({appliance:{turn:0}}, {includeInCut:true}),false);assert.equal(inCut({},{}),true);assert.equal(inCut({},{includeInCut:false}),false)});
test('appliance snapshots preserve image, rotation and geometry but reject temporary image addresses',()=>{
 const data={room:{w:3000,h:2600,d:3000},parts:[{part:{key:'oven',x:0,y:295,z:0,w:600,h:590,d:550,appliance:{turn:0,textureUrl:'materials/textures/oven.png'}}}]};assert.deepEqual(projectData(data),data);
 for(const url of ['blob:local','data:image/png;base64,abc','javascript:alert(1)','http://example.com/oven.png']){data.parts[0].part.appliance.textureUrl=url;assert.throws(()=>projectData(data),{code:'invalid-project'})}
});
