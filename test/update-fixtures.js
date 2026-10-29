import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {crc32,deflateRawSync} from 'node:zlib';
import {generateKeyPairSync,sign} from 'node:crypto';
import {updateHash} from '../src/update-package.js';
import {canonicalUpdate,UPDATE_KEY_ID} from '../src/update-trust.js';

// Independent minimal ZIP fixture writer. Production reads Python-built ZIPs.
export function syntheticZip(files,{flags=0x800,attributes=0}={}){
  const local=[],central=[];let offset=0;
  for(const [name,value] of Object.entries(files)){
    const filename=Buffer.from(name),data=Buffer.from(value),compressed=deflateRawSync(data),header=Buffer.alloc(30),entry=Buffer.alloc(46);
    header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(flags,6);header.writeUInt16LE(8,8);header.writeUInt32LE(crc32(data),14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
    entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(0x314,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(flags,8);entry.writeUInt16LE(8,10);entry.writeUInt32LE(crc32(data),16);entry.writeUInt32LE(compressed.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(attributes>>>0,38);entry.writeUInt32LE(offset,42);
    local.push(header,filename,compressed);central.push(entry,filename);offset+=header.length+filename.length+compressed.length;
  }
  const index=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,8);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(index.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,index,end]);
}
export function syntheticUpdate(t,{edition='distribution',from='0.1.0-preview.28',to='0.1.0-preview.29'}={}){
  const root=mkdtempSync(join(tmpdir(),'pc-update-test-'));t?.after(()=>rmSync(root,{recursive:true,force:true}));
  const executable=edition==='developer'?'DoctorGlean-Developer.exe':'DoctorGlean.exe',appPath=join(root,'resources','app');mkdirSync(join(appPath,'src'),{recursive:true});
  writeFileSync(join(root,executable),'synthetic fixed runtime');writeFileSync(join(root,'version'),'45.0.0');
  writeFileSync(join(appPath,'package.json'),JSON.stringify({version:from,doctorGleanEdition:edition,main:'src/main.js'}));writeFileSync(join(appPath,'src/main.js'),'old application');writeFileSync(join(appPath,'src/obsolete.js'),'removed module');
  const data=join(root,'separate-user-data');mkdirSync(data);writeFileSync(join(data,'state-v1.json'),'synthetic reservation and attempt sentinel');writeFileSync(join(data,'credentials-v1.json'),'synthetic protected account sentinel');
  const sourceCommit='d'.repeat(40),payload={'package.json':Buffer.from(JSON.stringify({version:to,doctorGleanEdition:edition,sourceCommit,main:'src/main.js'})),'src/main.js':Buffer.from('new application'),'src/new-module.js':Buffer.from('new module')};
  const manifest={schemaVersion:1,kind:'manual_whole_app_folder_replacement',edition,applicationId:edition==='developer'?'kr.webinar.planner.pc.developer':'kr.webinar.planner.pc.app',fromVersion:from,toVersion:to,electronVersion:'45.0.0',requiredExecutable:executable,replaceDirectory:'resources/app',runtimeFingerprints:{[executable]:updateHash(readFileSync(join(root,executable))),version:updateHash(readFileSync(join(root,'version')))},appFiles:Object.fromEntries(Object.entries(payload).map(([path,bytes])=>['resources/app/'+path,updateHash(bytes)]))};
  const prefix=edition==='developer'?'doctor-glean-pc-developer':'doctor-glean-pc',name=prefix+'-patch-v'+from+'-to-v'+to+'-windows-x64.zip',folder=name.slice(0,-4),files=Object.fromEntries(Object.entries(payload).map(([path,bytes])=>[folder+'/resources/app/'+path,bytes]));files[folder+'/PATCH_MANIFEST.json']=Buffer.from(JSON.stringify(manifest));
  const bytes=syntheticZip(files),page='https://github.com/issackr580/doctor-glean-pc/releases/tag/'+(edition==='developer'?'untagged-synthetic':'pc-v'+to),assetTag=page.split('/').at(-1),target={edition,version:to,electronVersion:'45.0.0',sourceCommit,page,compatibleVersions:[from],patch:{name,sha256:updateHash(bytes),size:bytes.length,url:'https://github.com/issackr580/doctor-glean-pc/releases/download/'+assetTag+'/'+name}};
  const feed={schemaVersion:1,repository:'issackr580/doctor-glean-pc',channel:'preview',issuedAt:Date.now(),targets:[target]},context={appPath,executable:join(root,executable),edition,currentVersion:from,electronVersion:'45.0.0',channel:'preview',platform:'win32',arch:'x64'};
  return {root,data,context,target,feed,bytes,files,manifest,payload};
}
export function signedSyntheticFeed(payload){const {privateKey,publicKey}=generateKeyPairSync('ed25519');return {publicKey:publicKey.export({type:'spki',format:'der'}).toString('base64'),bytes:Buffer.from(JSON.stringify({keyId:UPDATE_KEY_ID,payload,signature:sign(null,Buffer.from(canonicalUpdate(payload)),privateKey).toString('base64')}))};}
