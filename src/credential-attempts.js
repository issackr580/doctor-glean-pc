import {atomicJson,readJson} from './atomic-json.js';
import {credentialSite,safeCredentialStatus,CREDENTIAL_STATUSES} from './credential-policy.js';
import {kstDate,kstInstant} from './schedule.js';
const time=n=>Number.isSafeInteger(n)&&n>0&&n<=1e15;
function valid(data){return data?.schemaVersion===1&&Object.keys(data).sort().join('|')==='schemaVersion|sites'&&data.sites&&typeof data.sites==='object'&&!Array.isArray(data.sites)&&Object.keys(data.sites).length<=10&&Object.entries(data.sites).every(([site,r])=>credentialSite(site)&&r&&Object.keys(r).sort().join('|')==='at|attempts|disabled|status'&&Array.isArray(r.attempts)&&r.attempts.length<=13&&r.attempts.every((n,i)=>time(n)&&(!i||n>r.attempts[i-1]))&&time(r.at)&&CREDENTIAL_STATUSES.has(r.status)&&typeof r.disabled==='boolean');}
export class CredentialAttempts{
 constructor(file,{commit=atomicJson}={}){Object.assign(this,{file,commit});this.failed=false;this.data=readJson(file,{schemaVersion:1,sites:{}},valid);for(const [id,row] of Object.entries(this.data.sites))if(row.status==='submitted')this.finish(id,'unknown',row.at);}
 #save(next){try{if(!valid(next))throw Error();this.commit(this.file,next);this.data=next;}catch{this.failed=true;throw Error('storage_error');}}
 decision(site,now=Date.now(),validation=false,automatic=false){
  if(this.failed||!credentialSite(site)||!time(now))return 'storage_error';const row=this.data.sites[site];if(!row)return 'ready';
  if(row.disabled&&!validation)return 'disabled';if(now<row.at||row.attempts.some(n=>n>now))return 'cooldown';
  if(automatic&&row.attempts.length&&!['authenticated','saved'].includes(row.status))return 'disabled';
  if(row.attempts.filter(n=>kstDate(n)===kstDate(now)).length>=10)return 'daily_limit';
  if(row.attempts.filter(n=>now-n<900000).length>=3||row.attempts.length&&now-row.attempts.at(-1)<60000&&row.status!=='saved')return 'cooldown';return 'ready';
 }
 retryAt(site,now=Date.now()){
  const row=this.data.sites[site];if(!row||!time(now))return 0;
  const recent=row.attempts.filter(n=>now-n<900000),today=row.attempts.filter(n=>kstDate(n)===kstDate(now));let at=0;
  if(row.at>now)at=row.at;
  if(row.status!=='saved'&&row.attempts.length)at=Math.max(at,row.attempts.at(-1)+60000);
  if(recent.length>=3)at=Math.max(at,recent[recent.length-3]+900000);
  if(today.length>=10)at=Math.max(at,kstInstant(kstDate(now+86400000),'00:00'));
  return at>now?at:0;
 }
 reserve(site,now=Date.now(),{validation=false,automatic=false}={}){
  const decision=this.decision(site,now,validation,automatic);if(decision!=='ready')return decision;const next=structuredClone(this.data),old=next.sites[site];
  next.sites[site]={at:now,status:'submitted',disabled:old?.disabled===true,attempts:[...(old?.attempts??[]).filter(n=>kstDate(n)===kstDate(now)||now-n<900000),now]};this.#save(next);return 'ready';
 }
 finish(site,status,now=Date.now()){
  const row=this.data.sites[site];if(!row)return;const next=structuredClone(this.data);next.sites[site]={...row,at:Math.max(row.at,now),status:safeCredentialStatus(status),disabled:row.disabled||status==='rejected'};this.#save(next);
 }
 reset(site){if(!this.data.sites[site])return;const next=structuredClone(this.data);next.sites[site].disabled=false;next.sites[site].status='saved';this.#save(next);}
 snapshot(){return {storageUnavailable:this.failed,sites:Object.entries(this.data.sites).map(([site,{at,status,disabled,attempts}])=>({site,at,status,disabled,retryAt:this.retryAt(site),attemptsToday:attempts.filter(n=>kstDate(n)===kstDate()).length}))};}
}
