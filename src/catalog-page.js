import {readFileSync} from 'node:fs';
import {allowedNavigation,siteById} from './security.js';
import {pageRole} from './page-role.js';

const ASSETS=new Map();
function asset(name){if(!ASSETS.has(name))ASSETS.set(name,readFileSync(new URL('../vendor/engine/'+name,import.meta.url),'utf8'));return ASSETS.get(name);}
const readerName=profile=>profile.id==='dtalks'?'reader-additional.js':profile.id==='ckd'?'reader-ckd.js':profile.id==='keymedi'?'reader-keymedi.js':profile.crawler==='additional-catalog-v1'?'reader-additional.js':'reader-catalog.js';
const fail=code=>Object.assign(Error(code),{code});
export function safeCatalogNavigation(profile,action,state){
 if(action?.kind!=='navigate'||!allowedNavigation(profile.id,action.url))return false;
 try{
  const url=new URL(action.url),entry=new URL(profile.url);
  if(profile.alternateCatalogUrl&&url.href===profile.alternateCatalogUrl)return true;
  const list=profile.crawler==='additional-catalog-v1'&&action.catalog===true&&state?.catalogUrl?new URL(state.catalogUrl):entry;
  if(!allowedNavigation(profile.id,list.href)||url.pathname!==list.pathname||/login|logout|regist|apply|enrol|detail|submit|payment/i.test(url.pathname)||/token|auth|session|password|email|ticket/i.test(url.search))return false;
  return profile.crawler!=='additional-catalog-v1'||url.searchParams.get('pn')===list.searchParams.get('pn');
 }catch{return false;}
}

/** An engine adapter shared by Electron and the real Chromium test boundary. */
export class CatalogPage{
 constructor(profile,transport,signal){this.profile=profile;this.transport=transport;this.signal=signal;this.closed=false;this.reads=0;this.documentChanges=0;this.started=performance.now();}
 #current(){if(this.closed||this.signal.aborted)throw fail('cancelled');return this.transport.snapshot();}
 async open(){
  this.#current();
  try{await this.transport.load(this.profile.url,this.signal);}
  catch(error){
   this.#current();const site=siteById(this.profile.id);
   // The fixed Whodadoc/Dtalks PC catalog can fail while its original login GET
   // remains available. Let the host read that form and recover once; never
   // turn an arbitrary failed navigation or a TLS failure into a login retry.
   if(!['whodadoc','dtalks'].includes(this.profile.id)||site?.url!==this.profile.url||!site.loginUrl||error.code!=='network_error'||error.failure!=='load_failed')throw error;
   await this.transport.load(site.loginUrl,this.signal);
  }
  this.#current();
 }
 async #evaluate(source){
  const before=this.#current();
  if(!allowedNavigation(this.profile.id,before.url))throw fail('navigation_changed');
  let value;
  try{value=await this.transport.evaluate(`(()=>{if(location.href!==${JSON.stringify(before.url)})return null;return (${source});})()`,this.signal);}catch(error){const after=this.#current();if(after.version!==before.version||after.url!==before.url)throw fail('navigation_changed');throw error;}
  const after=this.#current();
  if(after.version!==before.version||after.url!==before.url)throw fail('navigation_changed');
  return value;
 }
 async read(date,previous){
  this.reads++;
  const before=this.#current(),site=siteById(this.profile.id);
  if(before.loading)return {status:'loading',done:false,events:[]};
  if(!allowedNavigation(this.profile.id,before.url))throw fail('navigation_changed');
  if(!site.hosts.includes(new URL(before.url).hostname)||/\/login(?:\/|\.|$)|\/auth\/login|\/sign.?in/i.test(new URL(before.url).pathname))return {site:site.id,status:'login',done:true,events:[],coverage:false};
  const source=`(()=>{if(document.readyState!=='complete')return JSON.stringify({status:'loading',done:false,events:[]});const read=${asset(readerName(this.profile))};const result=read(${JSON.stringify(this.profile)},${JSON.stringify(date)},${JSON.stringify(previous)});return JSON.stringify(result);})()`;
  let encoded;
  try{encoded=await this.#evaluate(source);}catch(error){
   const after=this.#current();
   if(error.code==='navigation_changed'&&this.documentChanges++<12&&allowedNavigation(this.profile.id,after.url)&&this.transport.snapshot().loading!==undefined)return {status:'loading',done:false,events:[]};
   throw error;
  }
  if(typeof encoded!=='string'||encoded.length>2_000_000)throw fail('invalid_response');
  let result;try{result=JSON.parse(encoded);}catch{throw fail('invalid_response');}
  result.diagnostics={...(result.diagnostics??result.state?.diagnostics??{}),reads:this.reads,elapsedMs:Math.max(0,Math.round(performance.now()-this.started)),pageRole:pageRole(this.#current().url)};
  return result;
 }
 async act(action,state){
  this.#current();
  if(action?.kind==='navigate'){
   if(!safeCatalogNavigation(this.profile,action,state))return false;
   await this.transport.load(action.url,this.signal);this.#current();return true;
  }
  if(!action||!['click','scroll','date','select'].includes(action.kind)||JSON.stringify(action).length>16_000)return false;
  const name=this.profile.crawler==='additional-catalog-v1'?'additional-action.js':'catalog-action.js',before=this.#current();
  try{return await this.#evaluate(`(${asset(name)})(${JSON.stringify(action)})`)===true;}
  catch(error){
   const after=this.#current();
   // A reviewed list button may navigate before its JS return reaches us.
   // Continue by reading that list; never click the button a second time.
   if((after.version!==before.version||after.url!==before.url)&&safeCatalogNavigation(this.profile,{kind:'navigate',url:after.url,catalog:true},state))return true;
   throw error;
  }
 }
 close(){if(this.closed)return;this.closed=true;this.transport.close();}
}
