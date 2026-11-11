import {readFileSync,lstatSync,mkdirSync,writeFileSync,openSync,fsyncSync,closeSync,renameSync,existsSync} from 'node:fs';
import {dirname,basename,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
const FILES=['state-v1.json','workflows-v1.json','catalog-v1.json','credentials-v1.json','credential-attempts-v1.json','pc-options-v1.json','quiz-action-fuses-v1.json','credential-action-fuses-v1.json','registration-attempts-v1.json','surveys-v1.json'];
// Local opaque backup only. Never exported, decrypted or automatically restored.
// Restoring an old action ledger over newer attempts would permit a replay.
export function snapshotIdentityState(file,marker='before-official-id-v1'){
 if(!['before-official-id-v1','before-entry-policy-v156'].includes(marker))throw Error('storage_error');
 const directory=dirname(file),target=join(directory,'identity-state-snapshots',marker);
 if(existsSync(target)){
  if(!lstatSync(target).isDirectory()||lstatSync(target).isSymbolicLink()||lstatSync(join(target,'SNAPSHOT.json')).isSymbolicLink())throw Error('storage_error');
  const meta=JSON.parse(readFileSync(join(target,'SNAPSHOT.json'),'utf8'));if(meta.schemaVersion!==1||!meta.files||Array.isArray(meta.files)||typeof meta.files!=='object')throw Error('storage_error');
  for(const [name,h] of Object.entries(meta.files)){if(!FILES.includes(name)&&name!==basename(file)||lstatSync(join(target,name)).isSymbolicLink()||sha(readFileSync(join(target,name)))!==h)throw Error('storage_error');}return;
 }
 mkdirSync(dirname(target),{recursive:true,mode:0o700});const temporary=target+'.'+randomUUID();mkdirSync(temporary,{mode:0o700});const files={};
 for(const name of new Set([...FILES,basename(file)])){
  const source=join(directory,name);let stat;try{stat=lstatSync(source);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4194304)throw Error('storage_error');const bytes=readFileSync(source);files[name]=sha(bytes);
  const fd=openSync(join(temporary,name),'wx',0o600);try{writeFileSync(fd,bytes);fsyncSync(fd);}finally{closeSync(fd);}
 }
 const fd=openSync(join(temporary,'SNAPSHOT.json'),'wx',0o600);try{writeFileSync(fd,JSON.stringify({schemaVersion:1,createdAt:Date.now(),files,restorePolicy:'pause_and_preserve_newer_attempt_consumption'})+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 renameSync(temporary,target);
}
