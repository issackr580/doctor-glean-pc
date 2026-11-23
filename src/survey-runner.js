import {createHash} from 'node:crypto';
import {atomicJson,readJson} from './atomic-json.js';
import {kstDate} from './schedule.js';
import {doctorvilleDetailNavigation} from './automation-policy.js';

export function surveyTarget(raw,date){
 try{const u=new URL(raw),id=u.searchParams.get('seminarId');if(u.origin!=='https://www.doctorville.co.kr'||u.username||u.password||u.hash||!['/seminar/broadcastSeminarPopup','/seminar/seminarVodReplayDetail'].includes(u.pathname)||[...u.searchParams].some(([k,v])=>!['seminarId','viewType'].includes(k)||u.searchParams.getAll(k).length!==1||k==='viewType'&&v!=='2')||!/^\d{1,10}$/.test(id))return null;return {key:createHash('sha256').update('doctorville|'+date+'|'+id).digest('hex'),url:u.href,id,date};}catch{return null;}
}
const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e15;
function valid(d){return d?.schemaVersion===1&&d.rows&&typeof d.rows==='object'&&!Array.isArray(d.rows)&&Object.keys(d.rows).length<=200&&Object.entries(d.rows).every(([key,r])=>r?.key===key&&surveyTarget(r.url,r.date)?.key===key&&number(r.firstAt)&&number(r.checkedAt)&&number(r.nextAt)&&number(r.closesAt)&&number(r.reads)&&r.reads<=40&&number(r.discoveryUntil)&&number(r.alertMask)&&r.alertMask<=7&&['unknown','open','complete','elapsed','skipped'].includes(r.status)&&typeof r.notified==='boolean'&&(r.title===undefined||typeof r.title==='string'&&r.title.length<=800));}
// Observations only. Never answers, opens a survey form or extends its timer.
export class SurveyRunner{
 constructor({file,options,allowed=()=>false,onChange=()=>{},now=Date.now}){
  Object.assign(this,{file,options,allowed,onChange,now});
  this.data=readJson(file,{schemaVersion:1,rows:{}},valid);
  let migrated=false;
  for(const row of Object.values(this.data.rows))if(row.nextAt||row.discoveryUntil){row.nextAt=0;row.discoveryUntil=0;migrated=true;}
  if(migrated)atomicJson(file,this.data);
 }
 save(next){if(!valid(next))throw Error('storage_error');atomicJson(this.file,next);this.data=next;this.onChange();}
 seed(date,result){
  if(!this.allowed()||date!==kstDate(this.now())||result?.stale!==false||!['ok','review'].includes(result?.status))return;
  const next=structuredClone(this.data),now=this.now();let changed=false;
  for(const [key,row] of Object.entries(next.rows))if(row.date<kstDate(Math.max(0,now-7*86400000))){delete next.rows[key];changed=true;}
  for(const event of result.events??[]){
   if(event.site!=='doctorville'||event.date!==date||!doctorvilleDetailNavigation('https://www.doctorville.co.kr/seminar/main',event.url))continue;

   const id=new URL(event.url).searchParams.get('seminarId');
   // This fixed read-only route is the reviewed DoctorvilleSurveyPolicy route,
   // bound to the catalog's observed seminar ID, never an answer/claim endpoint.
   const target=surveyTarget('https://www.doctorville.co.kr/seminar/broadcastSeminarPopup?viewType=2&seminarId='+id,date);
   if(!target)continue;
   const existing=next.rows[target.key];
   if(existing){if(existing.detail!==event.url){existing.detail=event.url;changed=true;}continue;}
   if(Object.keys(next.rows).length>=200)continue;
   next.rows[target.key]={...target,detail:event.url,title:typeof event.title==='string'?event.title:'닥터빌 강의',firstAt:now,checkedAt:0,nextAt:0,closesAt:0,reads:0,status:'unknown',notified:false,alertMask:0,discoveryUntil:0};changed=true;
  }if(changed)this.save(next);
 }
 // Only the user's selected manual window can supply a completion observation.
 observe(url,raw,selected){
  const target=surveyTarget(url,kstDate(this.now())),row=this.data.rows[selected];
  if(!target||row?.key!==target.key||['complete','skipped'].includes(row.status)||raw?.site!=='doctorville'||raw.seminarId!==row.id||raw.status!=='complete')return;
  this.save({...this.data,rows:{...this.data.rows,[row.key]:{...row,status:'complete',checkedAt:this.now()}}});
 }
 skip(key,value){
  const row=this.data.rows[key];if(typeof value!=='boolean'||!row||row.date!==kstDate(this.now())||row.status==='complete')return false;
  this.save({...this.data,rows:{...this.data.rows,[key]:{...row,status:value?'skipped':'unknown',checkedAt:this.now()}}});return true;
 }
 snapshot({diagnostics=false}={}){return Object.values(this.data.rows).filter(r=>r.date===kstDate(this.now())).map(({key,status,closesAt,checkedAt,reads,title})=>({key,status,closesAt,checkedAt,reads,...(diagnostics?{}:{title:title??'닥터빌 강의'}),excluded:this.options.snapshot().surveyExcluded.includes(key)}));}
 target(key){
  const r=this.data.rows[key];if(!r||r.date!==kstDate(this.now())||r.status==='skipped')return null;
  return doctorvilleDetailNavigation('https://www.doctorville.co.kr/seminar/main',r.detail)&&new URL(r.detail).searchParams.get('seminarId')===r.id?r.detail:r.url;
 }
}
