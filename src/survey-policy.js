import {createHash} from 'node:crypto';
import {doctorvilleDetailNavigation} from './automation-policy.js';
import {officialIdentity} from './entry-identity.js';
import {kstInstant} from './schedule.js';

export const MINUTE=60_000;
export const OPENING_WINDOW=5*MINUTE;
export const REMINDER_WINDOW=2*MINUTE;
export const SURVEY_OFFSETS=Object.freeze({off:[],economy:[0],balanced:[0,15,30],active:[0,5,15,30,50],experiment:[0,5,10,20,35,55,80,110]});
export const DEFAULT_SURVEY_SETTINGS=Object.freeze({mode:'off',delay:60,reminder:false});
export const surveySettingsValid=value=>!!value&&Object.keys(value).sort().join('|')==='delay|mode|reminder'&&typeof value.mode==='string'&&Object.hasOwn(SURVEY_OFFSETS,value.mode)&&[30,45,60,75,90].includes(value.delay)&&typeof value.reminder==='boolean';

export const surveyKey=(date,id)=>createHash('sha256').update('doctorville|'+date+'|'+id).digest('hex');
export const surveyReadUrl=id=>'https://www.doctorville.co.kr/seminar/broadcastSeminarPopup?viewType=2&seminarId='+id;
export function doctorvilleSurveyId(raw){
 try{
  const u=new URL(raw);
  if(u.username||u.password||u.hash)return null;
  if(u.origin==='https://m.doctorville.co.kr')return !u.search?(/^\/cme\/vod\/([1-9]\d{0,9})$/.exec(u.pathname)?.[1]??null):null;
  if(u.origin!=='https://www.doctorville.co.kr')return null;
  const popup=u.pathname==='/seminar/broadcastSeminarPopup',replay=u.pathname==='/seminar/seminarVodReplayDetail';
  if(!popup&&!replay)return null;
  for(const [k,v] of u.searchParams){
   if(u.searchParams.getAll(k).length!==1||!(k==='seminarId'||popup&&k==='viewType'&&v==='2'||replay&&k==='type'&&v==='reply'))return null;
  }
  const id=u.searchParams.get('seminarId');return /^[1-9]\d{0,9}$/.test(id)?id:null;
 }catch{return null;}
}

function startsAt(event){try{return kstInstant(event.date,event.time);}catch{return 0;}}
export function surveyCatalog(date,result){
 const entries=new Map();
 if(result?.stale!==false||!['ok','review'].includes(result.status))return entries;
 for(const event of result.events??[]){
  if(event.site!=='doctorville'||event.date!==date||event.historyOnly||!doctorvilleDetailNavigation('https://www.doctorville.co.kr/seminar/main',event.url))continue;
  const id=officialIdentity(event)?.id;
  if(id){const group=entries.get(id)??[];group.push(event);entries.set(id,group);}
 }
 return entries;
}
export function surveyOpeningTargets(date,result,jobs){
 const catalog=surveyCatalog(date,result),starts=new Map(),executed=new Set();
 for(const job of jobs){
  if(job.site!=='doctorville'||job.date!==date)continue;
  const id=officialIdentity(job)?.id;if(!id)continue;
  const times=starts.get(id)??new Set();times.add(job.start===startsAt(job)?job.start:0);starts.set(id,times);
  if(!job.identityBlock&&(['waiting_room','broadcast_room'].includes(job.doctorvilleArrival)||job.entryAttempted&&
    (job.status==='clicked'||[job.receipt,...(job.attempts??[])].some(receipt=>receipt?.status==='clicked'&&receipt.attempted===true))))executed.add(id);
 }
 const targets=[];
 for(const id of executed){
  const times=starts.get(id),events=catalog.get(id);
  const start=times.values().next().value;
  if(start&&times.size===1&&events?.length&&events.every(event=>startsAt(event)===start))targets.push({id,date,start,detail:events[0].url,title:events[0].title});
 }
 return targets;
}
