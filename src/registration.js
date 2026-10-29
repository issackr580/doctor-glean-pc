import {createHash} from 'node:crypto';
import {atomicJson,readJson} from './atomic-json.js';
import {ENTRY_SITES,doctorvilleDetailNavigation} from './automation-policy.js';
import {kstDate,kstInstant} from './schedule.js';
import {siteById} from './security.js';
import {waitFor} from './async-work.js';
const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e15;
export const registrationKey=job=>createHash('sha256').update(JSON.stringify([job.site,job.date,job.time,job.title.replace(/\s+/g,' ').trim()])).digest('hex');
export function registrationTarget(job,now=Date.now()){
 try{
  if(!job||!ENTRY_SITES.includes(job.site)||typeof job.title!=='string'||!job.title.trim()||job.title.length>800||typeof job.date!=='string'||typeof job.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(job.time)||job.lectureEnded||job.registrationStatus==='closed')return null;
  const start=kstInstant(job.date,job.time);if(job.date<kstDate(now)||job.date>kstDate(now+7*86400000)||now>start+600000)return null;
  return {site:job.site,date:job.date,time:job.time,title:job.title,key:registrationKey(job),slot:0,due:now,deadline:Math.min(now+45000,start+600000)};
 }catch{return null;}
}
function valid(data){
 if(!data||data.schemaVersion!==1||Object.keys(data).sort().join('|')!=='rows|schemaVersion'||!data.rows||Array.isArray(data.rows)||typeof data.rows!=='object'||Object.keys(data.rows).length>400)return false;
 return Object.entries(data.rows).every(([key,row])=>/^[a-f0-9]{64}$/.test(key)&&row&&Object.keys(row).sort().join('|')==='attempted|date|site|state|time|updatedAt'&&ENTRY_SITES.includes(row.site)&&typeof row.date==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(row.date)&&typeof row.time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)&&['unknown','attempting','confirmed'].includes(row.state)&&typeof row.attempted==='boolean'&&number(row.updatedAt));
}
export class RegistrationStore{
 constructor(file,{commit=atomicJson}={}){this.file=file;this.commit=commit;this.failed=false;this.data={schemaVersion:1,rows:{}};try{this.data=readJson(file,this.data,valid,524288);}catch{this.failed=true;}}
 status(job){try{const row=this.data.rows[registrationKey(job)];return row?{...row,state:row.state==='attempting'?'unknown':row.state}:undefined;}catch{return undefined;}}
 #save(job,state,attempted,now){
  if(this.failed)throw Error('storage_error');const next=structuredClone(this.data);
  for(const [key,row] of Object.entries(next.rows))if(row.updatedAt<now-7*86400000)delete next.rows[key];
  next.rows[registrationKey(job)]={site:job.site,date:job.date,time:job.time,state,attempted,updatedAt:now};
  if(!valid(next))throw Error('storage_error');try{this.commit(this.file,next);this.data=next;}catch{this.failed=true;throw Error('storage_error');}
 }
 reserve(job,now){if(this.status(job))return false;this.#save(job,'attempting',true,now);return true;}
 result(job,confirmed,now){const old=this.status(job);if(!old&&!confirmed)return;this.#save(job,confirmed?'confirmed':'unknown',old?.attempted===true,now);}
 snapshot(){return {storageUnavailable:this.failed,attempts:Object.values(this.data.rows).map(r=>({...r,state:r.state==='attempting'?'unknown':r.state}))};}
}
export class RegistrationController{
 constructor({store,resolve,createPage,createInspectionPage,isBusy=()=>false,onConfirmed=()=>{},onChange=()=>{},now=Date.now,sleep=waitFor}){Object.assign(this,{store,resolve,createPage,createInspectionPage,isBusy,onConfirmed,onChange,now,sleep});this.active=null;}
 cancel(site){if(this.active&&(!site||this.active.job.site===site))this.active.controller.abort();}
 async request(source,key,{readOnly:requestedReadOnly=false}={}){
  if(!['entry','catalog'].includes(source)||typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))return {ok:false,reason:'invalid_registration'};
  const target=this.resolve(source,key),job=registrationTarget(target,this.now());if(!job)return {ok:false,reason:'registration_unavailable'};
  if(this.active||this.isBusy())return {ok:false,reason:'busy'};if(this.store.failed)return {ok:false,reason:'storage_error'};
  const controller=new AbortController(),run={job,controller};this.active=run;this.onChange();let page,consumed=false,confirmed=false,visible=false;
  const cancelled=()=>({ok:false,reason:'cancelled',attempted:consumed});
  const allowed=()=>this.active===run&&!controller.signal.aborted&&this.now()<=job.deadline&&job.date>=kstDate(this.now())&&!this.store.failed;
  try{
   const readOnly=requestedReadOnly||!!this.store.status(job);visible=!readOnly;
   page=await (readOnly?this.createInspectionPage:this.createPage)(job,controller.signal,{check:()=>this.request(source,key,{readOnly:true})});
   if(!allowed())return cancelled();await page.load(siteById(job.site).url);
   let reply={},navigated=false;
   for(let reads=0;reads<21&&allowed();reads++){
    await page.ready?.();reply=await page.call(job,'inspect');if(!allowed())return cancelled();
    if(reply.status==='navigate'&&!navigated&&job.site==='doctorville'&&doctorvilleDetailNavigation(page.url,reply.url)){navigated=true;await page.load(reply.url);continue;}
    if(!['not_open','target_missing','button_missing'].includes(reply.status)||reads===20)break;
    await this.sleep(400,controller.signal);
   }
   if(!allowed())return cancelled();
   if(reply.status==='registered'&&reply.targetMatched===true){confirmed=true;this.store.result(job,true,this.now());this.onConfirmed(target);return {ok:true,status:'confirmed'};}
   if(readOnly)return {ok:true,status:'unconfirmed',reason:'registration_already_attempted'};
   if(reply.status!=='registration_ready'||reply.targetMatched!==true||reply.registrationControls!==1)return {ok:false,reason:reply.status==='login'?'login_required':'registration_manual_required'};
   const binding={url:page.url,version:page.version};if(!this.store.reserve(job,this.now()))return {ok:true,status:'unconfirmed',reason:'registration_already_attempted'};consumed=true;
   if(!allowed())return cancelled();
   const response=await page.call(job,'click',binding);if(!allowed())return cancelled();
   await this.sleep(700,controller.signal);if(!allowed())return cancelled();
   try{await page.ready?.();const after=await page.call(job,'inspect');if(allowed()&&after.status==='registered'&&after.targetMatched===true){confirmed=true;this.store.result(job,true,this.now());this.onConfirmed(target);}}catch{}
   return {ok:true,status:confirmed?'confirmed':response.status==='registration_clicked'?'requested':'unconfirmed'};
  }catch(error){return {ok:false,attempted:consumed,reason:error.message==='storage_error'?'storage_error':error.message==='manual_view_open'?'manual_view_open':controller.signal.aborted?'cancelled':'registration_manual_required'};}
  finally{try{if(consumed&&!confirmed)this.store.result(job,false,this.now());}catch{}if(!visible)page?.close();if(this.active===run)this.active=null;this.onChange();}
 }
}
