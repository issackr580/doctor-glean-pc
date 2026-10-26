import {readFileSync,statSync,mkdirSync,openSync,writeFileSync,fsyncSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {SITES} from '../vendor/engine/core.js';
import {allowedNavigation,siteById} from './security.js';
import {kstInstant} from './schedule.js';

const IDS=new Set(SITES.map(s=>s.id));
const STATUSES=new Set(['ok','review','login','blocked','error','cancelled','busy']);
const REASONS=new Set(['list_read','list_unconfirmed','login_required','security_check','network_error','time_limit','cancelled','manual_view_open','invalid_response','date_mismatch','navigation_changed','action_rejected','storage_error','suspended','entry_priority']);
const MAX_BYTES=4_194_304;
const STOP_REASONS=new Set(['doctorville_list_exhausted','hmp_list_exhausted','after_target_date','past_target_date','current_list_only','whodadoc_date_checked']);
function inspectResult(raw){
 const d=raw?.diagnostics??raw?.inspection??{},out={stopReason:STOP_REASONS.has(d.stopReason)?d.stopReason:'unclassified',listStatus:['checked','read'].includes(d.listDetails?.status??d.listStatus)?d.listDetails?.status??d.listStatus:'unknown'};
 for(const key of ['rows','totalRows','undated','untimed','untitled','pages','expansions','unknown','reads','elapsedMs'])if(Number.isSafeInteger(d[key])&&d[key]>=0&&d[key]<=1000000)out[key]=d[key];
 if(['provider','login','catalog','daily','lounge','brand','quiz','home','other'].includes(d.pageRole))out.pageRole=d.pageRole;
 if(['dns_error','offline','time_limit','certificate_error','load_failed','navigation_cancelled'].includes(d.failure))out.failure=d.failure;
 if(typeof d.calendarAgreement==='boolean')out.calendarAgreement=d.calendarAgreement;
 if(['after_target_date','past_target_date'].includes(d.dateBoundary))out.dateBoundary=d.dateBoundary;
 return out;
}
function scopeOf(inspection,coverage){
 if(coverage&&['doctorville_list_exhausted','hmp_list_exhausted'].includes(inspection.stopReason)&&inspection.listStatus==='checked')return 'list_checked';
 if(coverage&&inspection.stopReason==='whodadoc_date_checked'&&inspection.listStatus==='checked')return 'date_range_checked';
 if(coverage&&inspection.calendarAgreement===true&&inspection.unknown===0)return 'calendar_checked';
 if(coverage&&inspection.dateBoundary===inspection.stopReason&&['after_target_date','past_target_date'].includes(inspection.stopReason))return 'date_range_checked';
 return inspection.stopReason==='current_list_only'?'current_page':'unconfirmed';
}
const validDate=date=>{try{kstInstant(date,'00:00');return true;}catch{return false;}};
const sha=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);

function cleanEvent(site,date,event){
 if(!event||event.site!==site||event.date!==date||typeof event.time!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(event.time)||typeof event.title!=='string')return null;
 const title=event.title.replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
 if(!title||title.length>800)return null;
 let url='';
 if(event.url){
  if(!allowedNavigation(site,event.url)||!siteById(site).hosts.includes(new URL(event.url).hostname))return null;
  const parsed=new URL(event.url);
  for(const key of [...parsed.searchParams.keys()])if(/token|auth|session|password|email|code|ticket/i.test(key))parsed.searchParams.delete(key);
  parsed.hash='';url=parsed.href;
 }
 const id=typeof event.id==='string'&&/^[a-f0-9]{64}$/.test(event.id)?event.id:sha(JSON.stringify([site,date,event.time,title,String(event.id??'').slice(0,2000)]));
 const out={site,date,time:event.time,title,id,url,advanced:event.advanced===true};
 if(site==='hmp'){
  out.registrationStatus=['registered','not_registered','closed','unknown'].includes(event.registrationStatus)?event.registrationStatus:'unknown';
  out.lectureEnded=event.lectureEnded===true;
  out.hmpWatchAvailable=event.hmpWatchAvailable===true;
 }
 return out;
}

export function sanitiseResult(site,date,raw,now=Date.now()){
 if(!IDS.has(site)||!validDate(date)||!Number.isSafeInteger(now)||now<0)throw Error('invalid_catalog_request');
 const valid=raw&&typeof raw==='object'&&Array.isArray(raw.events)&&raw.events.length<=400;
 let status=valid&&STATUSES.has(raw.status)?raw.status:'review';
 let reason=REASONS.has(raw?.reason)?raw.reason:status==='ok'?'list_read':status==='login'?'login_required':status==='blocked'?'security_check':'list_unconfirmed';
 let rejected=0;const seen=new Set(),events=[];
 if(valid)for(const row of raw.events){
  const event=cleanEvent(site,date,row);
  if(!event){rejected++;continue;}
  const key=JSON.stringify([event.id,event.date,event.time,event.title]);
  if(!seen.has(key)){events.push(event);seen.add(key);}
 }
 if(!valid||rejected){status='review';reason='invalid_response';}
 events.sort((a,b)=>a.time.localeCompare(b.time)||a.title.localeCompare(b.title));
 const coverage=valid&&!rejected&&raw.coverage===true,inspection=inspectResult(raw);
 return {site,date,status,reason,coverage,scope:scopeOf(inspection,coverage),inspection,events,checkedAt:now,stale:false};
}

function persist(file,data){
 const raw=JSON.stringify(data,null,2)+'\n';if(Buffer.byteLength(raw)>MAX_BYTES)throw Error('catalog_unavailable');
 mkdirSync(dirname(file),{recursive:true,mode:0o700});const temporary=file+'.'+randomUUID()+'.tmp';let fd;
 try{fd=openSync(temporary,'wx',0o600);writeFileSync(fd,raw,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined;renameSync(temporary,file);}
 finally{if(fd!==undefined)try{closeSync(fd);}catch{}try{unlinkSync(temporary);}catch{}}
}

function validate(data){
 if(!data||data.schemaVersion!==1||Object.keys(data).sort().join('|')!=='schemaVersion|selected|snapshots'||!Array.isArray(data.selected)||!data.selected.length||data.selected.length>9||data.selected.some(id=>!IDS.has(id))||new Set(data.selected).size!==data.selected.length||!data.snapshots||typeof data.snapshots!=='object'||Array.isArray(data.snapshots)||Object.keys(data.snapshots).length>8)return false;
 for(const [date,snapshot] of Object.entries(data.snapshots)){
  if(!validDate(date)||snapshot?.date!==date||!snapshot.results||typeof snapshot.results!=='object'||Array.isArray(snapshot.results)||Object.keys(snapshot.results).length>9)return false;
  for(const [site,row] of Object.entries(snapshot.results)){
   if(!IDS.has(site)||row?.site!==site||row.date!==date||!STATUSES.has(row.status)||!REASONS.has(row.reason)||typeof row.coverage!=='boolean'||typeof row.stale!=='boolean'||!Number.isSafeInteger(row.checkedAt)||row.checkedAt<0||!Array.isArray(row.events)||row.events.length>400)return false;
   if(row.events.some(event=>!cleanEvent(site,date,event)))return false;
  }
 }
 return true;
}

export class CatalogStore{
 #file;#commit;#data;
 constructor(file,{commit=persist}={}){
  this.#file=file;this.#commit=commit;this.#data={schemaVersion:1,selected:['doctorville','keymedi'],snapshots:{}};
  try{
   if(statSync(file).size>MAX_BYTES)throw Error('catalog_unavailable');
   const data=JSON.parse(readFileSync(file,'utf8'));if(!validate(data))throw Error('catalog_unavailable');
   // Saved files are still projected to the same allowlist before returning.
   this.#data={schemaVersion:1,selected:[...data.selected],snapshots:{}};
   for(const [date,snapshot] of Object.entries(data.snapshots)){
    const results={};for(const [site,row] of Object.entries(snapshot.results)){
     const clean=sanitiseResult(site,date,row,row.checkedAt);clean.stale=row.stale;
     if(Number.isSafeInteger(row.previousCheckedAt))clean.previousCheckedAt=row.previousCheckedAt;
     results[site]=clean;
    }
    this.#data.snapshots[date]={date,results};
   }
  }catch(error){if(error.code!=='ENOENT')throw Error('catalog_unavailable');}
 }
 #save(next){try{this.#commit(this.#file,next);this.#data=next;}catch{throw Error('catalog_unavailable');}}
 selected(){return [...this.#data.selected];}
 select(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>9||ids.some(id=>!IDS.has(id))||new Set(ids).size!==ids.length)throw Error('invalid_selection');
  const next=clone(this.#data);next.selected=[...ids];this.#save(next);
 }
 view(date){if(!validDate(date))throw Error('invalid_date');return clone(this.#data.snapshots[date]??{date,results:{}});}
 record(site,date,raw,now=Date.now()){
  const fresh=sanitiseResult(site,date,raw,now),old=this.#data.snapshots[date]?.results[site];
  const verifiedEmpty=fresh.events.length===0&&fresh.coverage&&['ok','review'].includes(fresh.status);
  if(!fresh.events.length&&!verifiedEmpty&&old?.events.length){fresh.events=clone(old.events);fresh.stale=true;fresh.previousCheckedAt=old.previousCheckedAt??old.checkedAt;}
  const next=clone(this.#data);next.snapshots[date]??={date,results:{}};next.snapshots[date].results[site]=fresh;
  const keep=new Set([date,...Object.keys(next.snapshots).filter(day=>day!==date).sort().reverse().slice(0,7)]);
  for(const day of Object.keys(next.snapshots))if(!keep.has(day))delete next.snapshots[day];
  this.#save(next);return clone(fresh);
 }
 diagnostics(date){return Object.values(this.view(date).results).map(({site,status,reason,coverage,scope,inspection,checkedAt,stale,events})=>({site,status,reason,coverage,scope,inspection,checkedAt,stale,eventCount:events.length}));}
}
