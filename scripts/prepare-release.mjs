import {prepareInventory} from './repository-space.mjs';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
let base={major:1,minor:65};
try{base=JSON.parse(git('show','origin/main:_data/version.json'))}catch{}
const files=git('diff','--name-only','origin/main','--').split('\n');
const functional=files.some(file=>/^[^/]+\.(html|js|mjs|webmanifest)$/.test(file)||file.startsWith('materials/'));
const version={major:base.major,minor:base.minor+(functional?1:0)};
if(process.argv.includes('--check')){
 if(readFileSync('_data/version.json','utf8').trim()!==JSON.stringify(version))throw Error('Run npm run release:prepare against the latest origin/main before release tests.');
}else{
 writeFileSync('_data/version.json',JSON.stringify(version)+'\n');
 const source=readFileSync('index.html','utf8');writeFileSync('index.html',source.replace(/(<span id="appVersion">)[^<]*(<\/span>)/,`$1v${version.major}.${version.minor}$2`));
}
prepareInventory({check:process.argv.includes('--check')});
console.log(`Kitchen Designer v${version.major}.${version.minor}`);
