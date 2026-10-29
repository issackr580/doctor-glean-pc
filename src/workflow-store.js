import {createHash} from 'node:crypto';
import {atomicJson,readJson} from './atomic-json.js';
import {kstDate,kstInstant} from './schedule.js';
import {DEFAULT_FEATURES,DAILY_TASKS,ENTRY_SITES,safeReason} from './automation-policy.js';
const clone=value=>structuredClone(value);
const STATUSES=new Set(['idle','running','reserved','attempting','complete','pending','none','offday','scheduled','login','ended','unknown','blocked','busy','cancelled','network','clicked','manual_clicked','expired','not_open','target_missing','button_missing','ambiguous','not_registered','lecture_ended','wrong','success','stopped','missed']);
const validDate=value=>{try{kstInstant(value,'00:00');return true;}catch{return false;}};
const number=value=>Number.isSafeInteger(value)&&value>=0&&value<=1e15;
const hash=value=>createHash('sha256').update(value).digest('hex');
export function cleanReceipt(raw,now=Date.now()){
 const out={status:STATUSES.has(raw?.status)?raw.status:'unknown',reason:safeReason(raw?.reason),checkedAt:now};
 for(const key of ['attempted','confirmationAttempted','submitted','targetMatched','navigationObserved','dailyChecked','catalogChecked'])if(typeof raw?.[key]==='boolean')out[key]=raw[key];
 for(const key of ['slot','due','retryCount','reads','elapsedMs','navigations','candidateCards','titleMatches','scheduleMatches','matchedTargets','entryControls','attemptMask','sentMask','successMask','providerComplete','startedAt','opensAt','firstPageReadyAt','firstMissionReadAt','firstEligibleAt','firstClaimAt','lastClaimAt','finishedAt','alarmDelayMs'])if(number(raw?.[key]))out[key]=raw[key];
 if(['not_checked','no_video','requested','playing_observed','gesture_required','play_failed','inaccessible','not_ready','navigation_unconfirmed'].includes(raw?.playback))out.playback=raw.playback;
 return out;
}
// Optional entry metadata is outside the stable receipt schema. Older builds
// ignore this field, retaining their existing data and durable attempt format.
export function cleanEntryInspection(raw,now=Date.now()){
 const out={status:raw?.status==='ready'?'ready':STATUSES.has(raw?.status)?raw.status:'unknown',reason:safeReason(raw?.reason),checkedAt:now};
 for(const key of ['candidateCards','titleMatches','dateMatches','timeMatches','scheduleMatches','matchedTargets','entryControls','identifiedTargets','distinctIdentities','stateVariants'])if(number(raw?.[key]))out[key]=raw[key];
 for(const key of ['duplicateEquivalent','readOnly'])if(typeof raw?.[key]==='boolean')out[key]=raw[key];
 return out;
}
function valid(data){
 if(!data||data.schemaVersion!==1||Object.keys(data).sort().join('|')!=='days|entries|entrySites|features|schemaVersion'||!Array.isArray(data.entrySites)||data.entrySites.length>6||data.entrySites.some(id=>!ENTRY_SITES.includes(id))||new Set(data.entrySites).size!==data.entrySites.length||!data.features||Object.keys(data.features).sort().join('|')!==Object.keys(DEFAULT_FEATURES).sort().join('|')||Object.values(data.features).some(value=>typeof value!=='boolean')||!data.days||Array.isArray(data.days)||!data.entries||Array.isArray(data.entries)||Object.keys(data.days).length>9||Object.keys(data.entries).length>400)return false;
 const receipt=row=>row&&typeof row==='object'&&!Array.isArray(row)&&number(row.checkedAt)&&JSON.stringify(cleanReceipt(row,row.checkedAt))===JSON.stringify(row);
 for(const [day,row] of Object.entries(data.days)){
  if(!validDate(day)||!row||typeof row!=='object'||!row.daily||Array.isArray(row.daily)||Object.keys(row).some(key=>!['daily','morning','lounge','quizAuto','survey'].includes(key))||Object.keys(row.daily).some(key=>!DAILY_TASKS.some(task=>task.key===key)))return false;
  if(Object.values(row.daily).some(value=>!receipt(value))||['morning','lounge','quizAuto','survey'].some(key=>row[key]!==undefined&&!receipt(row[key])))return false;
 }
 for(const [key,row] of Object.entries(data.entries))if(!/^[a-f0-9]{64}$/.test(key)||row?.key!==key||!ENTRY_SITES.includes(row.site)||!validDate(row.date)||typeof row.title!=='string'||row.title.length>800||!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time)||!number(row.start)||!number(row.due)||!number(row.deadline)||!STATUSES.has(row.status)||!number(row.nextAt)||!number(row.slot)||row.slot>4||!number(row.retries)||row.retries>4||typeof row.entryAttempted!=='boolean'||!Array.isArray(row.attempts)||row.attempts.length>5||row.attempts.some(item=>!receipt(item))||row.receipt!==undefined&&!receipt(row.receipt)||row.preflight!==undefined&&!receipt(row.preflight)||row.lastStartedAt!==undefined&&!number(row.lastStartedAt)||row.executionFinishedAt!==undefined&&!number(row.executionFinishedAt)||row.executionVersion!==undefined&&!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(row.executionVersion)||row.sourceCommit!==undefined&&!/^[a-f0-9]{40}$/.test(row.sourceCommit))return false;
 for(const row of Object.values(data.entries))if(row.inspection!==undefined&&(!row.inspection||!number(row.inspection.checkedAt)||JSON.stringify(cleanEntryInspection(row.inspection,row.inspection.checkedAt))!==JSON.stringify(row.inspection)))return false;
 for(const row of Object.values(data.entries)){
  if(row.scheduleIdentity!==undefined&&!/^[a-f0-9]{64}$/.test(row.scheduleIdentity))return false;
  if(row.entryClosesAt!==undefined&&!number(row.entryClosesAt))return false;
  if(row.scheduleChanges!==undefined&&(!Array.isArray(row.scheduleChanges)||!row.scheduleChanges.length||row.scheduleChanges.length>8||row.scheduleChanges.some(change=>!change||Object.keys(change).filter(key=>key!=='recovered').sort().join('|')!=='checkedAt|deadline|due|oldDeadline|oldDue|oldStart|oldTime|start|time'||change.recovered!==undefined&&change.recovered!==true||!/^([01]\d|2[0-3]):[0-5]\d$/.test(change.oldTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(change.time)||['checkedAt','oldStart','start','oldDue','due','oldDeadline','deadline'].some(key=>!number(change[key])))))return false;
 }
 return true;
}
export class WorkflowStore{
 constructor(file,{commit=atomicJson}={}){this.file=file;this.commit=commit;this.failed=false;this.data=readJson(file,{schemaVersion:1,features:{...DEFAULT_FEATURES},entrySites:[...ENTRY_SITES],days:{},entries:{}},valid);}
 #save(next){
  const today=kstDate(),first=kstDate(Date.now()-7*86400000);
  for(const day of Object.keys(next.days))if(day<first||day>today)delete next.days[day];
  for(const [id,row] of Object.entries(next.entries))if(row.date<first)delete next.entries[id];
  if(!valid(next))throw Error('storage_error');
  try{this.commit(this.file,next);this.data=next;}catch{this.failed=true;throw Error('storage_error');}
 }
 features(){return {...this.data.features};}
 recover(){
  const next=clone(this.data);let changed=false;
  for(const row of Object.values(next.days))for(const group of [row.daily,row])for(const [key,value] of Object.entries(group))if(['running','attempting'].includes(value?.status)){group[key]=cleanReceipt({...value,status:'unknown',reason:'unknown_result'},value.checkedAt);changed=true;}
  if(changed)this.#save(next);
 }
 setFeature(key,value){if(!Object.hasOwn(DEFAULT_FEATURES,key)||typeof value!=='boolean')throw Error('invalid_setting');const next=clone(this.data);next.features[key]=value;this.#save(next);}
 entrySites(){return [...this.data.entrySites];}
 setEntrySites(ids){if(!Array.isArray(ids)||ids.some(id=>!ENTRY_SITES.includes(id))||new Set(ids).size!==ids.length)throw Error('invalid_setting');const next=clone(this.data);next.entrySites=[...ids];this.#save(next);}
 day(day=kstDate()){
  const raw=this.data.days[day]??{daily:{}};const daily={};
  for(const task of DAILY_TASKS)if(raw.daily[task.key])daily[task.key]=cleanReceipt(raw.daily[task.key],raw.daily[task.key].checkedAt);
  const out={daily};for(const key of ['morning','lounge','quizAuto','survey'])if(raw[key])out[key]=cleanReceipt(raw[key],raw[key].checkedAt);
  return out;
 }
 record(day,key,raw,now=Date.now()){
  if(!validDate(day)||!number(now)||!DAILY_TASKS.some(task=>task.key===key)&&!['morning','lounge','quizAuto','survey'].includes(key))throw Error('invalid_task');
  const next=clone(this.data);next.days[day]??={daily:{}};const row=cleanReceipt(raw,now);
  if(DAILY_TASKS.some(task=>task.key===key))next.days[day].daily[key]=row;else next.days[day][key]=row;
  this.#save(next);return row;
 }
 entries(day=kstDate()){return Object.values(this.data.entries).filter(row=>row.date===day).map(clone);}
 entryKey(event){return hash(JSON.stringify([event.site,event.date,event.site==='hmp'?event.time:'',event.title.replace(/\s+/g,' ').trim()]));}
 putEntry(row){const next=clone(this.data);next.entries[row.key]=clone(row);this.#save(next);}
 updateEntry(key,change){const row=this.data.entries[key];if(!row)return false;const next=clone(this.data);next.entries[key]={...next.entries[key],...clone(change)};this.#save(next);return true;}
 diagnostics(){return {features:this.features(),entrySites:this.entrySites(),today:this.day(),entries:this.entries().map(({key,site,date,time,status,due,deadline,nextAt,slot,retries,attempts,receipt,preflight,inspection,lastStartedAt,executionFinishedAt,executionVersion,sourceCommit,scheduleChanges,entryClosesAt})=>({key,site,date,time,status,due,deadline,nextAt,slot,retries,attempts:attempts?.map(item=>cleanReceipt(item,item.checkedAt)),receipt:receipt?cleanReceipt(receipt,receipt.checkedAt):undefined,...(preflight?{preflight:cleanReceipt(preflight,preflight.checkedAt)}:{}),...(inspection?{inspection:cleanEntryInspection(inspection,inspection.checkedAt)}:{}),...(lastStartedAt!==undefined?{lastStartedAt,executionFinishedAt,executionVersion,...(sourceCommit?{sourceCommit}:{})}:{}),...(scheduleChanges?{scheduleChanges:clone(scheduleChanges)}:{}),...(entryClosesAt?{entryClosesAt}:{})})),storageUnavailable:this.failed};}
}
