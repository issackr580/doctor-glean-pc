import {randomUUID} from 'node:crypto';
import {CredentialVault} from './credential-vault.js';
import {CredentialAttempts} from './credential-attempts.js';
import {CredentialRunner} from './credential-runner.js';
import {credentialSite,credentialInput,safeCredentialStatus} from './credential-policy.js';
import {join} from 'node:path';
export class CredentialManager{
 constructor({directory,applicationId,protect,createPage,automaticAllowed,isManualOpen,onChange=()=>{},now=Date.now}){
  Object.assign(this,{createPage,automaticAllowed,isManualOpen,onChange,now});this.vault=new CredentialVault(join(directory,'credentials-v1.json'),applicationId,protect);this.attempts=new CredentialAttempts(join(directory,'credential-attempts-v1.json'));this.runner=new CredentialRunner({attempts:this.attempts,now});this.active=null;this.last=new Map();
 }
 get busy(){return !!this.active;}
 snapshot(){return {vault:this.vault.snapshot(),attempts:this.attempts.snapshot(),active:this.active?{site:this.active.site,kind:this.active.kind}:null,results:[...this.last].map(([site,result])=>({site,...result}))};}
 cancel(site){if(this.active&&(!site||this.active.site===site)){this.active.controller.abort();this.active.page?.close();}}
 remove(site){this.cancel(site);this.vault.remove(site);this.last.set(site,{status:'removed',at:this.now()});this.onChange();}
 setAutomatic(site,value){if(!value)this.cancel(site);this.vault.setAutomatic(site,value);this.onChange();}
 async #operation(site,kind,work,{signal,automatic=false}={}){
  if(!credentialSite(site))return {status:'blocked'};
  if(this.active||this.isManualOpen(site))return {status:'busy'};
  if(!this.vault.available())return {status:'storage_unavailable'};
  if(automatic&&(!this.automaticAllowed()||!this.vault.enabled(site)))return {status:'disabled'};
  const decision=this.attempts.decision(site,this.now(),kind==='save',automatic);
  if(decision!=='ready'){
   const result={status:decision,at:this.now(),attempted:false,submitted:false,retryAt:this.attempts.retryAt(site,this.now()),kind};
   const old=this.last.get(site);if(old?.submitted&&old.trace)result.previous={status:old.status,at:old.at,trace:old.trace};
   else if(old?.previous)result.previous=old.previous;
   this.last.set(site,result);this.onChange();return result;
  }
  const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)controller.abort();signal?.addEventListener('abort',abort,{once:true});
  const run={site,kind,controller,page:null};this.active=run;this.onChange();let result={status:'unknown'};
  try{
   if(controller.signal.aborted)return result={status:'cancelled'};
   run.page=await this.createPage(site,controller.signal,{validation:kind==='save',partition:'credential-validation-'+randomUUID()});
   result=await work(run.page,controller.signal,()=>!controller.signal.aborted&&(!automatic||this.automaticAllowed()&&this.vault.enabled(site)));
  }catch(error){result={status:safeCredentialStatus(controller.signal.aborted?'cancelled':error.code??error.message)};}
  finally{run.page?.close();signal?.removeEventListener('abort',abort);if(this.active===run)this.active=null;this.last.set(site,{status:result.status,at:this.now(),kind,attempted:result.attempted===true,submitted:result.submitted===true,retryAt:this.attempts.retryAt(site,this.now()),...(Array.isArray(result.trace)?{trace:result.trace}:{}),...(Number.isSafeInteger(result.reads)?{reads:result.reads,elapsedMs:result.elapsedMs}:{})});this.onChange();}
  return result;
 }
 async save(site,id,password,automatic){
  let candidate={id,password};id='';password='';
  try{
   if(!credentialInput(candidate)||typeof automatic!=='boolean')return {status:'blocked'};
   return await this.#operation(site,'save',async(page,signal,allowed)=>{
    const result=await this.runner.run(site,page,{candidate,validation:true,signal,allowed});
    if(result.status!=='authenticated'||!result.submitted||!allowed())return result;
    this.vault.save(site,candidate,automatic,this.now());this.attempts.reset(site);return {...result,status:'saved'};
   });
  }finally{candidate.id='';candidate.password='';candidate=null;}
 }
 async recover(site,options={}){
  if(!this.vault.has(site))return {status:'not_saved'};
  return this.#operation(site,'recover',async(page,signal,allowed)=>this.runner.run(site,page,{readCredentials:()=>this.vault.read(site,{automatic:options.automatic===true}),automatic:options.automatic===true,signal,allowed}),options);
 }
 async verifyPage(site,page){
  const reply=await page.call('credential-login.js',[{site,mode:'verify',nonce:'readonly_session_123456789',pageTag:'1:'+Math.max(1,page.version),expectedUrl:page.url,diagnostics:false}]);
  return safeCredentialStatus(reply.status);
 }
 wrapPage(site,page){
  const load=page.load.bind(page),call=page.call.bind(page);let recovering=false,tried=false,target='';
  const recover=async()=>{
   if(recovering||tried||!this.automaticAllowed()||!this.vault.enabled(site))return false;
   tried=true;recovering=true;
   try{const result=await this.recover(site,{automatic:true,signal:page.signal});if(result.status==='authenticated'&&!page.signal.aborted){await load(target);return true;}return false;}
   finally{recovering=false;}
  };
  page.load=async url=>{
   target=url;await load(url);
   if(recovering||tried||!this.automaticAllowed()||!this.vault.enabled(site))return;
   const state=await this.verifyPage(site,page);if(state!=='login_required')return;
   await recover();
  };
  page.call=async(name,args,options)=>{
   const result=await call(name,args,options);
   if(!name.startsWith('credential-')&&!(options?.navigation)&&(result.status==='login'||result.reason==='login_required')&&await recover())return {status:'loading',reason:'document_loading',events:[]};
   return result;
  };return page;
 }
}
