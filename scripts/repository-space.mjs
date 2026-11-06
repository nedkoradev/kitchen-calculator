import {execFileSync} from 'node:child_process';
import {lstatSync,readFileSync,readlinkSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const INVENTORY='_data/repository_space.json';
// Measure the planned committed source snapshot, never .git or ignored files.
// The release check prevents publishing a stale inventory after subsequent edits.
export function inventoryText(root=process.cwd()){
 const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 const files=[];
 for(const path of [...new Set(paths)].sort()){
  if(path===INVENTORY)continue;
  let stat;try{stat=lstatSync(join(root,path))}catch(error){if(error.code==='ENOENT')continue;throw error}
  if(!stat.isFile()&&!stat.isSymbolicLink())continue;
  const bytes=stat.isSymbolicLink()?Buffer.byteLength(readlinkSync(join(root,path))):stat.size;
  const texture=path.startsWith('materials/textures/');
  files.push({path,bytes,...(texture?{texture:true}:{}),...(texture&&/\.(jpe?g|png|webp)$/i.test(path)?{image:true}:{})});
 }
 return JSON.stringify({schemaVersion:1,files},null,2)+'\n';
}
export function prepareInventory({root=process.cwd(),check=false}={}){
 const expected=inventoryText(root),target=join(root,INVENTORY);
 if(check){if(readFileSync(target,'utf8')!==expected)throw Error('Source files changed after measurement; run npm run release:prepare again.');}
 else {mkdirSync(join(root,'_data'),{recursive:true});writeFileSync(target,expected)}
 return JSON.parse(expected);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const data=prepareInventory({check:process.argv.includes('--check')});console.log(`Measured ${data.files.length} source files`);
}
