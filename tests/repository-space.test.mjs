import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {prepareInventory,INVENTORY} from '../scripts/repository-space.mjs';
import {validSpaceStats,formatBytes} from '../settings.mjs';
test('source inventory measures bytes, recursive texture images without generated metadata, history or ignored files',()=>{
 const root=mkdtempSync(join(tmpdir(),'kitchen-space-'));
 try{
  execFileSync('git',['init'],{cwd:root,stdio:'ignore'});mkdirSync(join(root,'materials/textures/nested'),{recursive:true});
  writeFileSync(join(root,'.gitignore'),'ignored.bin\n');writeFileSync(join(root,'ignored.bin'),Buffer.alloc(50000));
  writeFileSync(join(root,'main.txt'),'Текст');writeFileSync(join(root,'materials/textures/A.JPG'),Buffer.alloc(13));
  writeFileSync(join(root,'materials/textures/nested/B.webp'),Buffer.alloc(17));writeFileSync(join(root,'materials/textures/README.md'),'docs');
  const result=prepareInventory({root});assert.ok(!result.files.some(file=>file.path==='ignored.bin'||file.path.startsWith('.git/')));
  assert.equal(result.files.find(file=>file.path==='main.txt').bytes,Buffer.byteLength('Текст'));
  assert.ok(!result.files.some(file=>file.path===INVENTORY));
  assert.equal(result.files.filter(file=>file.image).length,2);assert.equal(result.files.filter(file=>file.texture).reduce((sum,file)=>sum+file.bytes,0),34);
  const bytes=result.files.reduce((sum,file)=>sum+file.bytes,0);assert.equal(bytes,result.files.reduce((sum,file)=>sum+statSync(join(root,file.path)).size,0));
  const before=readFileSync(join(root,INVENTORY),'utf8');prepareInventory({root});assert.equal(readFileSync(join(root,INVENTORY),'utf8'),before);prepareInventory({root,check:true});
  writeFileSync(join(root,'materials/textures/A.JPG'),Buffer.alloc(18));assert.throws(()=>prepareInventory({root,check:true}),/changed after measurement/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('space statistics reject invalid/suspicious values and use readable binary units',()=>{
 const stats={schemaVersion:1,inventoryReady:true,scope:'published-source-snapshot',includesGitHistory:false,version:'1.67',revision:'a'.repeat(40),measuredAt:'2026-11-06T12:00:00Z',totalBytes:2000,textureBytes:1000,fileCount:3,imageCount:2,referenceBytes:1024**3};
 assert.equal(validSpaceStats(stats),true);
 for(const changes of [{inventoryReady:false},{totalBytes:-1},{textureBytes:2001},{imageCount:4},{measuredAt:'yesterday'},{includesGitHistory:true},{referenceBytes:0},{revision:'bad'},{version:'1.67+sha'}])assert.equal(validSpaceStats({...stats,...changes}),false);
 assert.equal(formatBytes(0),'0 B');assert.equal(formatBytes(1024),'1 KiB');assert.equal(formatBytes(1024**3),'1 GiB');
});
