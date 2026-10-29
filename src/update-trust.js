import {createPublicKey,verify} from 'node:crypto';
import {pcVersion,PC_REPOSITORY,PC_RELEASES} from './update-policy.js';

export const UPDATE_KEY_ID='pc-update-2026-10';
export const UPDATE_PUBLIC_KEY='MCowBQYDK2VwAyEAXyNdXFgronMxc8Te7A0r0ZjUtLta2e+al3+Vn/Dp2Q8=';
export const UPDATE_FEED='https://raw.githubusercontent.com/issackr580/doctor-glean-pc/main/updates/';
export const compareVersions=(a,b)=>{
  const x=pcVersion(a),y=pcVersion(b);if(!x||!y)throw Error('update_version');
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;return 0;
};
export function canonicalUpdate(value){
  if(Array.isArray(value))return '['+value.map(canonicalUpdate).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalUpdate(value[key])).join(',')+'}';
  return JSON.stringify(value);
}
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('|')===keys.sort().join('|');
export function validateUpdatePayload(payload,now=Date.now()){
  if(!exact(payload,['schemaVersion','repository','channel','issuedAt','targets'])||payload.schemaVersion!==1||payload.repository!=='issackr580/doctor-glean-pc'||!['preview','stable'].includes(payload.channel)||!Number.isSafeInteger(payload.issuedAt)||payload.issuedAt>now+300000||payload.issuedAt<1760000000000||!Array.isArray(payload.targets)||!payload.targets.length||payload.targets.length>2)throw Error('update_manifest');
  const editions=new Set();
  for(const target of payload.targets){
    if(!exact(target,['edition','version','electronVersion','sourceCommit','page','compatibleVersions','patch'])||!['developer','distribution'].includes(target.edition)||editions.has(target.edition)||!pcVersion(target.version)||(payload.channel==='preview')!==target.version.includes('-preview.')||!/^\d+\.\d+\.\d+$/.test(target.electronVersion)||!/^[a-f0-9]{40}$/.test(target.sourceCommit))throw Error('update_manifest');
    editions.add(target.edition);
    const tag=(target.edition==='developer'?'pc-developer-v':'pc-v')+target.version,prefix=target.edition==='developer'?'doctor-glean-pc-developer':'doctor-glean-pc';
    if(target.page!==PC_RELEASES+'/tag/'+tag&&!(target.edition==='developer'&&new RegExp('^'+PC_RELEASES.replaceAll('.','\\.')+'/tag/untagged-[a-zA-Z0-9-]{1,80}$').test(target.page)))throw Error('update_manifest');
    const patch=target.patch,pattern=new RegExp('^'+prefix+'-patch-v(.+)-to-v'+target.version.replaceAll('.','\\.')+'-windows-x64\\.zip$'),from=patch?.name?.match(pattern)?.[1];
    const assetTag=target.edition==='developer'?target.page.split('/').at(-1):tag;
    if(!exact(patch,['name','sha256','size','url'])||!pcVersion(from)||compareVersions(from,target.version)>=0||!/^[a-f0-9]{64}$/.test(patch.sha256)||!Number.isSafeInteger(patch.size)||patch.size<1||patch.size>16*1024*1024||patch.url!==PC_REPOSITORY+'/releases/download/'+assetTag+'/'+patch.name)throw Error('update_manifest');
    if(!Array.isArray(target.compatibleVersions)||!target.compatibleVersions.length||target.compatibleVersions.length>100||new Set(target.compatibleVersions).size!==target.compatibleVersions.length||!target.compatibleVersions.includes(from)||target.compatibleVersions.some(version=>!pcVersion(version)||compareVersions(version,target.version)>=0))throw Error('update_manifest');
  }return payload;
}
export function verifyUpdateFeed(bytes,{now=Date.now(),publicKey=UPDATE_PUBLIC_KEY}={}){
  if(!Buffer.isBuffer(bytes)||bytes.length>131072)throw Error('update_manifest');
  const envelope=JSON.parse(bytes.toString('utf8'));
  if(!exact(envelope,['keyId','payload','signature'])||envelope.keyId!==UPDATE_KEY_ID||typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))throw Error('update_signature');
  const key=createPublicKey({key:Buffer.from(publicKey,'base64'),format:'der',type:'spki'});
  if(!verify(null,Buffer.from(canonicalUpdate(envelope.payload)),key,Buffer.from(envelope.signature,'base64')))throw Error('update_signature');
  return validateUpdatePayload(envelope.payload,now);
}
export function chooseSignedUpdate(payload,{edition,currentVersion,electronVersion,channel}){
  const target=payload.targets.find(row=>row.edition===edition);
  if(payload.channel!==channel||!target||compareVersions(target.version,currentVersion)<0)return {status:'unknown'};
  if(target.version===currentVersion)return {status:'current',version:target.version,signatureVerified:true};
  if(!target.compatibleVersions.includes(currentVersion)||target.electronVersion!==electronVersion)return {status:'full_required',version:target.version,page:target.page,signatureVerified:true};
  return {status:'available',version:target.version,page:target.page,signatureVerified:true,localFile:edition==='developer',target};
}
