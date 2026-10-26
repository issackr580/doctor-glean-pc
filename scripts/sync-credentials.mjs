import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=resolve(process.argv[2]??resolve(root,'../doctor-glean-handoff-v0.7.62/webinar-android'));
const out=resolve(root,'vendor/credentials'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');mkdirSync(out,{recursive:true});
const sourceFiles={},outputs={};
for(const name of ['credential-login.js','credential-keymedi-proof.js','credential-background-keymedi-proof.js']){
 const path='app/src/main/assets/'+name,bytes=readFileSync(resolve(source,path));if(typeof new vm.Script(bytes.toString()).runInNewContext()!=='function')throw Error('invalid_asset');
 sourceFiles[path]=hash(bytes);outputs[name]=hash(bytes);writeFileSync(resolve(out,name),bytes);
}
const registryPath='engine/credential-sites.js',bytes=readFileSync(resolve(source,registryPath));sourceFiles[registryPath]=hash(bytes);
const {CREDENTIAL_SITES}=await import(pathToFileURL(resolve(source,registryPath)));const registry=JSON.stringify(CREDENTIAL_SITES,null,2)+'\n';writeFileSync(resolve(out,'sites.json'),registry);outputs['sites.json']=hash(registry);
writeFileSync(resolve(out,'manifest.json'),JSON.stringify({schemaVersion:1,sourceVersion:'0.7.113',sourceFiles,outputs},null,2)+'\n');
console.log('Credential snapshot: 3 standalone assets and 10 reviewed site routes.');
