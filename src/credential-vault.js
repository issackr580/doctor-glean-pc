import {atomicJson,readJson} from './atomic-json.js';
import {credentialSite,credentialInput} from './credential-policy.js';
const time=value=>Number.isSafeInteger(value)&&value>0&&value<=1e15;
const valid=data=>data?.schemaVersion===1&&typeof data.applicationId==='string'&&data.entries&&typeof data.entries==='object'&&!Array.isArray(data.entries)&&Object.keys(data.entries).length<=10&&Object.keys(data).sort().join('|')==='applicationId|entries|schemaVersion'&&Object.entries(data.entries).every(([id,row])=>credentialSite(id)&&row&&Object.keys(row).sort().join('|')==='automatic|ciphertext|savedAt'&&typeof row.automatic==='boolean'&&time(row.savedAt)&&typeof row.ciphertext==='string'&&row.ciphertext.length<=32768&&/^[A-Za-z0-9+/]+={0,2}$/.test(row.ciphertext));
// In production, protect is Electron safeStorage backed by Windows DPAPI only.
// The adapter is injected so Node tests never pretend to exercise Windows DPAPI.
export class CredentialVault{
 constructor(file,applicationId,protect,{commit=atomicJson}={}){Object.assign(this,{file,applicationId,protect,commit});this.failed=false;this.data=readJson(file,{schemaVersion:1,applicationId,entries:{}},valid);if(this.data.applicationId!==applicationId)throw Error('storage_error');}
 available(){try{return !this.failed&&this.protect.available()===true;}catch{return false;}}
 #write(next){try{if(!valid(next))throw Error();this.commit(this.file,next);this.data=next;}catch{this.failed=true;throw Error('storage_error');}}
 save(site,credentials,automatic,now=Date.now()){
  if(!credentialSite(site)||!credentialInput(credentials)||typeof automatic!=='boolean'||!time(now))throw Error('invalid_credentials');
  if(!this.available())throw Error('storage_unavailable');
  let plaintext=JSON.stringify({schemaVersion:1,applicationId:this.applicationId,site,id:credentials.id,password:credentials.password}),sealed;
  try{sealed=this.protect.encrypt(plaintext);if(!Buffer.isBuffer(sealed)||!sealed.length)throw Error();}catch{this.failed=true;throw Error('storage_error');}finally{plaintext='';}
  const next=structuredClone(this.data);next.entries[site]={ciphertext:sealed.toString('base64'),automatic,savedAt:now};sealed.fill(0);this.#write(next);
 }
 read(site,{automatic=false}={}){
  const row=this.data.entries[site];if(!row||automatic&&!row.automatic)return null;
  if(!this.available())throw Error('storage_unavailable');let plaintext='',sealed=Buffer.from(row.ciphertext,'base64');
  try{plaintext=this.protect.decrypt(sealed);const data=JSON.parse(plaintext);if(data.schemaVersion!==1||data.applicationId!==this.applicationId||data.site!==site||!credentialInput(data))throw Error();return {id:data.id,password:data.password};}catch{this.failed=true;throw Error('storage_error');}finally{plaintext='';sealed.fill(0);}
 }
 enabled(site){return this.available()&&this.data.entries[site]?.automatic===true;}
 has(site){return !!this.data.entries[site];}
 setAutomatic(site,value){if(!credentialSite(site)||typeof value!=='boolean'||!this.has(site))throw Error('invalid_setting');if(value&&!this.available())throw Error('storage_unavailable');const next=structuredClone(this.data);next.entries[site].automatic=value;this.#write(next);}
 remove(site){if(!credentialSite(site))throw Error('invalid_site');const next=structuredClone(this.data);delete next.entries[site];this.#write(next);}
 snapshot(){return {available:this.available(),backend:this.available()?'windows_dpapi':'unavailable',sites:Object.entries(this.data.entries).map(([site,row])=>({site,saved:true,automatic:row.automatic,savedAt:row.savedAt}))};}
}
