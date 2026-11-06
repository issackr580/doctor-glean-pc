// Explicit, narrow v148 identity snapshot. No Android application or credentials.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {bindEntryControl} from '../src/entry-browser.js';
import {SITES} from '../src/sites.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),input=resolve(process.argv[2]);
const map=JSON.parse(readFileSync(join(input,'SOURCE_MAP.json'),'utf8'));
if(map.sourceVersion!=='0.7.148'||map.sourceCommit!=='32d9080c77decadd48ed520b7e357bbcdd5928fd')throw Error('identity_source_mismatch');
const hash=b=>createHash('sha256').update(b).digest('hex');
function checked(name){const row=map.files.find(r=>r.path===name),bytes=readFileSync(join(input,name));if(!row||bytes.length!==row.bytes||hash(bytes)!==row.sha256)throw Error('identity_source_hash');return bytes.toString('utf8');}
const original=checked('reference/engine/lecture-identity.js'),functions=await import(pathToFileURL(join(input,'reference/engine/lecture-identity.js')));
const supported=['doctorville','keymedi','medigate','whodadoc','docple','hmp'];
let reader=functions.readLectureIdentity.toString();
const hosts=Object.fromEntries(SITES.filter(s=>supported.includes(s.id)).map(s=>[s.id,s.hosts]));
hosts.docple=['docple-plus.com'];
reader=reader.replace(/const hosts=\{[^\n]+\};/,`const hosts=${JSON.stringify(hosts)};`);
const hostTest="(site==='docple'?u.hostname===host:u.hostname===host||u.hostname.endsWith('.'+host))";
if(!reader.includes(hostTest))throw Error('identity_sync_changed');reader=reader.replace(hostTest,'host.includes(u.hostname)');
const before='const u=new URL(raw,base);';if(!reader.includes(before))throw Error('identity_sync_changed');
reader=reader.replace(before,String.raw`if(raw.includes('#')||/(?:^|\/)\.{1,2}(?:\/|$)/.test(raw.split('?')[0]))return null;
  if(raw.includes('?')&&!raw.slice(raw.indexOf('?')+1).split('&').every(p=>/^[^=&?#]+=[^=&?#]*$/.test(p)))return null;
  ${before}`);
const names=['reader-catalog.js','reader-additional.js','reader-keymedi.js','catalog-action.js','additional-action.js','auto-entry.js'];
const outputs={'lecture-identity.js':original.replace(functions.readLectureIdentity.toString(),reader)},sources={'engine/lecture-identity.js':hash(original)};
for(const name of names){
 let code=checked('reference/app/src/main/assets/'+name);sources['app/src/main/assets/'+name]=hash(code);
 const count=code.split(functions.readLectureIdentity.toString()).length-1;
 if(name.startsWith('reader-')||name==='auto-entry.js'){if(count!==1)throw Error('identity_dependency_missing');code=code.replace(functions.readLectureIdentity.toString(),reader);}
 if(name==='auto-entry.js'){
  for(const [from,to,count] of [
   ["if(mode!=='click')return out('ready','entry_ready');","if(!bindEntryControl(job,mode,button))return out('blocked','page_changed');if(mode!=='click')return out('ready','entry_ready');",2],
   ["if(mode==='inspect')return out('ready','entry_ready');","if(!bindEntryControl(job,mode,control))return out('blocked','page_changed');if(mode==='inspect')return out('ready','entry_ready');",1],
   ["if(mode==='inspect')return out('ready');","if(!bindEntryControl(job,mode,button))return out('blocked','page_changed');if(mode==='inspect')return out('ready');",1],
   ["if(mode!=='click')return out('ready');","if(!bindEntryControl(job,mode,button))return out('blocked','page_changed');if(mode!=='click')return out('ready');",1]
  ]){if(code.split(from).length-1!==count)throw Error('identity_control_boundary_changed');code=code.split(from).join(to);}
  code=code.replace('const readLectureIdentity=',`const bindEntryControl=(${bindEntryControl.toString()});const readLectureIdentity=`);
 }
 if(typeof new vm.Script(code).runInNewContext()!=='function')throw Error('identity_bundle_not_standalone');
 outputs[name]=code;
}
const fixture=readFileSync(join(input,'PC_ACCEPTANCE_CASES.synthetic.json'));mkdirSync(join(root,'test/fixtures'),{recursive:true});writeFileSync(join(root,'test/fixtures/official-id-v148.synthetic.json'),fixture);
const destination=join(root,'vendor/identity');mkdirSync(destination,{recursive:true});
for(const [name,code] of Object.entries(outputs))writeFileSync(join(destination,name),code);
writeFileSync(join(destination,'manifest.json'),JSON.stringify({schemaVersion:1,sourceVersion:map.sourceVersion,sourceCommit:map.sourceCommit,supported,sourceFiles:sources,acceptanceSha256:hash(fixture),pcHardening:['existing PC host allowlist','isolated original control/root binding','reject empty/malformed raw queries, fragments and dot segments'],outputs:Object.fromEntries(Object.entries(outputs).map(([n,c])=>[n,hash(c)]))},null,2)+'\n');
console.log('Reviewed identity snapshot: '+supported.length+' sites, '+Object.keys(outputs).length+' outputs; legacy engines retained.');
