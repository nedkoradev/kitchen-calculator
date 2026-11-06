import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
test('release numbers advance once per functional update and stay stable on docs/test reruns',()=>{
 const directory=mkdtempSync(join(tmpdir(),'kitchen-release-')),script=resolve('scripts/prepare-release.mjs');
 const git=(...args)=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 const prepare=(...args)=>execFileSync(process.execPath,[script,...args],{cwd:directory,encoding:'utf8'});
 const version=()=>JSON.parse(readFileSync(join(directory,'_data/version.json'),'utf8'));
 try{
  git('init');git('config','user.name','Release test');git('config','user.email','release@example.test');
  mkdirSync(join(directory,'_data'));writeFileSync(join(directory,'_data/version.json'),'{"major":1,"minor":65}\n');
  writeFileSync(join(directory,'index.html'),'<strong>Kitchen Designer <span id="appVersion">v1.65</span></strong>');
  git('add','.');git('commit','-m','base');git('update-ref','refs/remotes/origin/main',git('rev-parse','HEAD'));
  writeFileSync(join(directory,'README.md'),'Documentation update');prepare();assert.equal(version().minor,65);
  writeFileSync(join(directory,'index.html'),readFileSync(join(directory,'index.html'),'utf8')+'<button>Feature</button>');
  prepare();assert.equal(version().minor,66);prepare();prepare('--check');assert.equal(version().minor,66);
  assert.match(readFileSync(join(directory,'index.html'),'utf8'),/Kitchen Designer <span id="appVersion">v1\.66<\/span>/);
  git('add','.');git('commit','-m','feature');git('update-ref','refs/remotes/origin/main',git('rev-parse','HEAD'));
  writeFileSync(join(directory,'app.js'),'// Next functionality');git('add','app.js');prepare();assert.equal(version().minor,67);
 }finally{rmSync(directory,{recursive:true,force:true})}
});
