import {atomicJson,readJson} from './atomic-json.js';
import {doctorvilleDetailNavigation} from './automation-policy.js';
import {officialIdentity} from './entry-identity.js';
import {kstDate,kstInstant} from './schedule.js';

const list='https://www.doctorville.co.kr/seminar/main';

// Serialized into the same read of the existing catalog document.
export function readDoctorvilleApplications(result){
 if(location.pathname!=='/seminar/main'||!Array.isArray(result?.events)||!result.events.length)return result;
 const visible=e=>e.getClientRects().length>0&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
 const cards=[...document.querySelectorAll('a.list_detail[href*="seminarDetail?"]')].filter(visible);
 const byUrl=new Map();
 for(const card of cards){
  const url=card.href;
  if(byUrl.has(url)){byUrl.set(url,'unknown');continue;}
  let scope=card;
  for(let depth=0;depth<3;depth++){
   const parent=scope.parentElement;
   if(!parent?.matches('li,article,div')||parent.querySelectorAll('a.list_detail').length!==1||parent.querySelectorAll('*').length>250)break;
   scope=parent;
   if(scope.matches('li,article'))break;
  }
  const controls=[...scope.querySelectorAll('a,button,[role="button"],span,strong,em')].filter(e=>visible(e)&&!e.closest('.tit,.time,header,footer,nav,aside,[role="dialog"],[hidden],[aria-hidden="true"]'));
  const statuses=new Set();
  for(const control of controls){
   const label=control.innerText.trim().replace(/\s/g,'');
   if(/^(신청완료|신청취소|등록완료)$/.test(label))statuses.add('registered');
   if(/^(신청마감|접수마감|강의종료|세미나종료)$/.test(label))statuses.add('closed');
   if(/^입장(?:하기)?$/.test(label))statuses.add('entry_visible');
   if(!control.closest('button:disabled,[disabled],[aria-disabled="true"],.disabled')&&
      (['신청가능','미신청'].includes(label)||/^(신청|신청하기|(?:사전|수강)신청(?:하기)?)$/.test(label)&&control.matches('a,button,[role="button"]')))statuses.add('not_registered');
  }
  if(statuses.delete('entry_visible')&&statuses.has('not_registered'))statuses.add('unknown');
  byUrl.set(url,statuses.size===1?[...statuses][0]:'unknown');
 }
 for(const event of result.events)if(byUrl.has(event.url))event.registrationStatus=byUrl.get(event.url);
 return result;
}

export function doctorvilleApplicationTargets(row,now=Date.now()){
 if(row?.site!=='doctorville'||row.stale||!['ok','review'].includes(row.status)||!['list_read','list_unconfirmed'].includes(row.reason)||!Array.isArray(row.events))return [];
 const observed=new Map();
 for(const event of row.events){
  const id=officialIdentity(event)?.id;
  if(id)observed.set(id,observed.has(id)?null:event);
 }
 return [...observed.values()].filter(event=>event?.site==='doctorville'&&event.date===row.date&&event.registrationStatus==='not_registered'&&
  !event.lectureEnded&&doctorvilleDetailNavigation(list,event.url)&&kstInstant(event.date,event.time)>now);
}

export class DoctorvilleApplicationNotices{
 constructor(file){
  this.file=file;
  this.seen=readJson(file,{},data=>data&&typeof data==='object'&&!Array.isArray(data)&&
   Object.entries(data).every(([id,at])=>/^\d{1,10}$/.test(id)&&Number.isSafeInteger(at)&&at>0));
 }
 accept(row,now=Date.now()){
  const recent=Object.fromEntries(Object.entries(this.seen).filter(([,at])=>at>=now-31*86400000));
  const targets=doctorvilleApplicationTargets(row,now).filter(event=>!Object.hasOwn(recent,officialIdentity(event).id));
  if(!targets.length)return targets;
  for(const event of targets)recent[officialIdentity(event).id]=now;
  atomicJson(this.file,recent);
  this.seen=recent;
  return targets;
 }
}
