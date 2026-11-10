import test from 'node:test';import assert from 'node:assert/strict';import {chooseDefaultMaterialBase,MATERIAL_PREFERENCES_ID} from '../material-base-preferences.mjs';
test('material default is explicit when set, deterministic otherwise and excludes metadata',()=>{
 const bases=[{id:'z',name:'Явор'},{id:'a',name:'Бук'},{id:MATERIAL_PREFERENCES_ID,name:'А настройки'}];
 assert.equal(chooseDefaultMaterialBase(bases).id,'a');assert.equal(chooseDefaultMaterialBase(bases,'z').id,'z');assert.equal(chooseDefaultMaterialBase(bases,'deleted'),null);assert.equal(chooseDefaultMaterialBase([]),null);assert.equal(chooseDefaultMaterialBase(bases,MATERIAL_PREFERENCES_ID),null);
});
