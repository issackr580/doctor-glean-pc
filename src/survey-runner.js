import {createHash} from 'node:crypto';
import {atomicJson,readJson} from './atomic-json.js';
import {kstDate,kstInstant} from './schedule.js';
import {doctorvilleDetailNavigation} from './automation-policy.js';

export function surveyTarget(raw,date){
 try{const u=new URL(raw),id=u.searchParams.get('seminarId');if(u.origin!=='https://www.doctorville.co.kr'||u.username||u.password||u.hash||!['/seminar/broadcastSeminarPopup','/seminar/seminarVodReplayDetail'].includes(u.pathname)||[...u.searchParams].some(([k,v])=>!['seminarId','viewType'].includes(k)||u.searchParams.getAll(k).length!==1||k==='viewType'&&v!=='2')||!/^\d{1,10}$/.test(id))return null;return {key:createHash('sha256').update('doctorville|'+date+'|'+id).digest('hex'),url:u.href,id,date};}catch{return null;}
}
const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e15;
function valid(d){return d?.schemaVersion===1&&d.rows&&typeof d.rows==='object'&&!Array.isArray(d.rows)&&Object.keys(d.rows).length<=200&&Object.entries(d.rows).every(([key,r])=>r?.key===key&&surveyTarget(r.url,r.date)?.key===key&&number(r.firstAt)&&number(r.checkedAt)&&number(r.nextAt)&&number(r.closesAt)&&number(r.reads)&&r.reads<=40&&number(r.discoveryUntil)&&number(r.alertMask)&&r.alertMask<=7&&['unknown','open','complete','elapsed'].includes(r.status)&&typeof r.notified==='boolean'&&(r.title===undefined||typeof r.title==='string'&&r.title.length<=800));}
// Observations only. Never answers, opens a survey form or extends its timer.
export class SurveyRunner{
 constructor({file,options,createPage,isManualOpen=()=>false,allowed=()=>false,notify=()=>{},onChange=()=>{},now=Date.now}){Object.assign(this,{file,options,createPage,isManualOpen,allowed,notify,onChange,now});this.data=readJson(file,{schemaVersion:1,rows:{}},valid);this.active=null;}
 save(next){if(!valid(next))throw Error('storage_error');atomicJson(this.file,next);this.data=next;this.onChange();}
 seed(date,result){
  if(!this.allowed()||date!==kstDate(this.now())||result?.stale!==false||!['ok','review'].includes(result?.status))return;
  const next=structuredClone(this.data),now=this.now();let changed=false;
  for(const event of result.events??[]){
   if(event.site!=='doctorville'||event.date!==date||!doctorvilleDetailNavigation('https://www.doctorville.co.kr/seminar/main',event.url))continue;
   const start=kstInstant(date,event.time);if(now>start+10800000)continue;
   const id=new URL(event.url).searchParams.get('seminarId');
   // This fixed read-only route is the reviewed DoctorvilleSurveyPolicy route,
   // bound to the catalog's observed seminar ID, never an answer/claim endpoint.
   const target=surveyTarget('https://www.doctorville.co.kr/seminar/broadcastSeminarPopup?viewType=2&seminarId='+id,date);
   if(!target||next.rows[target.key]||Object.keys(next.rows).length>=200)continue;
   next.rows[target.key]={...target,title:typeof event.title==='string'?event.title:'닥터빌 강의',firstAt:now,checkedAt:0,nextAt:Math.max(now+2000,start+1200000),closesAt:0,reads:0,status:'unknown',notified:false,alertMask:0,discoveryUntil:start+10800000};changed=true;
  }if(changed)this.save(next);
 }
 observe(url,raw,{background=false}={}){
  if(!this.allowed())return;const now=this.now(),target=surveyTarget(url,kstDate(now));if(!target)return;
  const next=structuredClone(this.data),old=next.rows[target.key];if(!old&&Object.keys(next.rows).length>=200)return;
  const row=old??{...target,firstAt:now,checkedAt:0,nextAt:now,closesAt:0,reads:0,status:'unknown',notified:false,alertMask:0,discoveryUntil:now+10800000};
  if(row.status==='complete'||background&&row.reads>=40||this.options.snapshot().surveyExcluded.includes(row.key))return;
  row.checkedAt=now;if(background)row.reads++;row.nextAt=now+(row.status==='open'?60000:300000);
  if(raw?.seminarId===row.id&&raw.site==='doctorville'){
   if(raw.status==='complete')row.status='complete';
   else if(raw.status==='open'&&Number.isInteger(raw.minutesLeft)&&raw.minutesLeft>=0&&raw.minutesLeft<=60&&raw.buttonCount===1&&raw.disabled===false){
    const deadline=now+Math.max(1,raw.minutesLeft)*60000;row.closesAt=row.closesAt?Math.min(row.closesAt,deadline):deadline;row.status='open';
   }
  }
  if(row.closesAt&&row.closesAt<=now&&row.status!=='complete')row.status='elapsed';
  const bit=raw?.minutesLeft<=5?4:raw?.minutesLeft<=10?2:1,alert=row.status==='open'&&!(row.alertMask&bit);if(alert){row.alertMask|=bit===4?7:bit===2?3:1;row.notified=true;}next.rows[row.key]=row;
  for(const [key,r] of Object.entries(next.rows))if(r.date<kstDate(now-7*86400000))delete next.rows[key];
  this.save(next);if(alert)try{this.notify(row.key);}catch{}
 }
 snapshot({diagnostics=false}={}){return Object.values(this.data.rows).filter(r=>r.date===kstDate(this.now())).map(({key,status,closesAt,checkedAt,reads,title})=>({key,status,closesAt,checkedAt,reads,...(diagnostics?{}:{title:title??'닥터빌 강의'}),excluded:this.options.snapshot().surveyExcluded.includes(key)}));}
 target(key){const r=this.data.rows[key];return r&&r.date===kstDate(this.now())?r.url:null;}
 due(){if(!this.allowed()||this.active||this.isManualOpen('doctorville'))return null;const now=this.now(),excluded=this.options.snapshot().surveyExcluded;return Object.values(this.data.rows).find(r=>r.date===kstDate(now)&&!excluded.includes(r.key)&&['open','unknown'].includes(r.status)&&r.reads<40&&(r.status==='open'||r.discoveryUntil>now)&&r.nextAt<=now);}
 cancel(){this.active?.controller.abort();this.active?.page?.close();}
 async run(row){
  if(!this.allowed()||!row||this.active)return;const controller=new AbortController(),run={controller,page:null};this.active=run;
  const timer=setTimeout(()=>{controller.abort();run.page?.close();},12000);timer.unref?.();
  try{this.observe(row.url,null,{background:true});run.page=await this.createPage('doctorville',controller.signal);await run.page.load(row.url);const raw=await run.page.call('doctorville-survey.js',[row.id]);if(!controller.signal.aborted&&this.active===run&&this.allowed())this.observe(row.url,raw);}
  catch(error){if(error.message==='storage_error')throw error;}
  finally{clearTimeout(timer);run.page?.close();if(this.active===run)this.active=null;}
 }
}
