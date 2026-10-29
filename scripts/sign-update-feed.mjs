import {readFileSync,writeFileSync} from 'node:fs';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {resolve,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {UPDATE_KEY_ID,UPDATE_PUBLIC_KEY,canonicalUpdate,validateUpdatePayload} from '../src/update-trust.js';

export function signUpdatePayload(payload,key){
  validateUpdatePayload(payload);
  const privateKey=createPrivateKey(key),publicKey=createPublicKey(privateKey).export({type:'spki',format:'der'}).toString('base64');
  if(publicKey!==UPDATE_PUBLIC_KEY)throw Error('update_signing_key_mismatch');
  return {keyId:UPDATE_KEY_ID,payload,signature:sign(null,Buffer.from(canonicalUpdate(payload)),privateKey).toString('base64')};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return [value.slice(2,at),value.slice(at+1)];}));
  if(!args.input||!args.key||!args.output)throw Error('use_--input=payload_json_--key=private_key_outside_repository_--output=public_feed_json');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),keyPath=resolve(args.key);
  if(keyPath===root||keyPath.startsWith(root+sep))throw Error('keep_update_private_key_outside_repository');
  const signed=signUpdatePayload(JSON.parse(readFileSync(args.input,'utf8')),readFileSync(keyPath));writeFileSync(args.output,JSON.stringify(signed,null,2)+'\n',{mode:0o644});
  console.log('Signed PC '+signed.payload.channel+' update feed; private key not exported.');
}
