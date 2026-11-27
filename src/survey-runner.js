import {atomicJson,readJson} from './atomic-json.js';
import {kstDate,kstInstant} from './schedule.js';
import {doctorvilleDetailNavigation} from './automation-policy.js';
import {resourceCount} from './resource-use.js';
import {DEFAULT_SURVEY_SETTINGS,doctorvilleSurveyId,MINUTE,OPENING_WINDOW,REMINDER_WINDOW,SURVEY_OFFSETS,surveyCatalog,surveyKey,surveyOpeningTargets,surveyReadUrl,surveySettingsValid} from './survey-policy.js';

export function surveyTarget(raw,date){
 const id=doctorvilleSurveyId(raw);if(!id)return null;
 try{kstInstant(date,'00:00');}catch{return null;}
 return {key:surveyKey(date,id),url:new URL(raw).href,id,date};
}
const number=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e15;
const terminal=status=>['complete','elapsed','skipped'].includes(status);
const rowLimit=800;
function valid(d){
 return d?.schemaVersion===1&&(d.settings===undefined||surveySettingsValid(d.settings))&&(d.lastStartedAt===undefined||number(d.lastStartedAt))&&d.rows&&typeof d.rows==='object'&&!Array.isArray(d.rows)&&Object.keys(d.rows).length<=rowLimit&&
  Object.entries(d.rows).every(([key,r])=>r?.key===key&&surveyTarget(r.url,r.date)?.key===key&&r.id===doctorvilleSurveyId(r.url)&&
   ['firstAt','checkedAt','nextAt','closesAt','reads','discoveryUntil','alertMask'].every(field=>number(r[field]))&&r.reads<=40&&r.alertMask<=7&&
   ['unknown','open','complete','elapsed','skipped'].includes(r.status)&&typeof r.notified==='boolean'&&
   (r.title===undefined||typeof r.title==='string'&&r.title.length<=800)&&
   ['openingSlotAt','reminderAt','reminderDeadline','reminderCheckedAt'].every(field=>r[field]===undefined||number(r[field]))&&
   (r.minutesLeft===undefined||Number.isInteger(r.minutesLeft)&&r.minutesLeft>=0&&r.minutesLeft<=60)&&
   (r.observedUrl===undefined||doctorvilleSurveyId(r.observedUrl)===r.id)&&
   ['openingFinished','reminderNotified'].every(field=>r[field]===undefined||typeof r[field]==='boolean'));
}
function makeRow(target,now){
 return {...surveyTarget(surveyReadUrl(target.id),target.date),detail:target.detail,title:typeof target.title==='string'?target.title.slice(0,800):'닥터빌 강의',
  firstAt:now,checkedAt:0,nextAt:0,closesAt:0,reads:0,status:'unknown',notified:false,alertMask:0,discoveryUntil:0};
}
function outcome(raw,id){
 if(raw?.site!=='doctorville'||raw.seminarId!==id)return 'unknown';
 if(['complete','closed'].includes(raw.status))return raw.status;
 if(raw.status==='open'&&raw.buttonCount===1&&raw.disabled===false&&Number.isInteger(raw.minutesLeft)&&raw.minutesLeft>=0&&raw.minutesLeft<=60)return 'open';
 return 'unknown';
}

export class SurveyRunner{
 constructor({file,options,allowed=()=>false,canRead=()=>false,context=()=>'',catalog=()=>null,jobs=()=>[],createPage,notify=()=>false,onChange=()=>{},now=Date.now,commit=atomicJson}){
  Object.assign(this,{file,options,allowed,canRead,context,catalog,jobs,createPage,notify,onChange,now,commit});
  this.data=readJson(file,{schemaVersion:1,rows:{}},valid);
  this.boundary=this.openingBoundary=now();
  let migrated=false;
  for(const row of Object.values(this.data.rows))if(row.nextAt||row.discoveryUntil){row.nextAt=0;row.discoveryUntil=0;migrated=true;}
  if(migrated)this.commit(file,this.data);
 }
 save(next){
  try{if(this.failed||!valid(next))throw Error('storage_error');this.commit(this.file,next);}
  catch{this.failed=true;throw Error('storage_error');}
  this.data=next;this.onChange();
 }
 #prune(rows,now){
  let changed=false;const oldest=kstDate(Math.max(0,now-7*86400000));
  for(const [key,row] of Object.entries(rows))if(row.date<oldest){delete rows[key];changed=true;}
  return changed;
 }
 #put(row,lastStartedAt=this.data.lastStartedAt){
  const rows={...this.data.rows,[row.key]:row};this.#prune(rows,this.now());
  this.save({...this.data,lastStartedAt,rows});
 }
 #eligible(row,key){
  return !terminal(row?.status)&&!this.options.snapshot().surveyExcluded.includes(key);
 }
 seed(date,result){
  if(this.failed||!this.allowed()||date!==kstDate(this.now()))return;
  const next=structuredClone(this.data),now=this.now();let changed=this.#prune(next.rows,now);
  for(const [id,entries] of surveyCatalog(date,result)){
   const [event]=entries,key=surveyKey(date,id),row=next.rows[key];
   if(entries.some(other=>other.time!==event.time))continue;
   if(row){if(row.detail!==event.url){row.detail=event.url;changed=true;}continue;}
   if(Object.keys(next.rows).length>=rowLimit)break;
   next.rows[key]=makeRow({id,date,detail:event.url,title:event.title},now);changed=true;
  }
  if(changed)this.save(next);
 }
 #manualTarget(url,key){
  const target=surveyTarget(url,kstDate(this.now()));
  if(!target||key!==null&&target.key!==key||terminal(this.data.rows[target.key]?.status))return null;
  const existing=this.data.rows[target.key];if(existing)return existing;
  const group=surveyCatalog(target.date,this.catalog(target.date)).get(target.id);
  if(!group?.length||group.some(event=>event.time!==group[0].time))return null;
  return makeRow({...target,detail:group[0].url,title:group[0].title},this.now());
 }
 wantsObservation(url,key){return !this.failed&&!!this.#manualTarget(url,key);}
 observe(url,raw,selected){
  if(this.failed)return;
  const row=this.#manualTarget(url,selected),status=row&&outcome(raw,row.id);if(!row||status==='unknown')return;
  const now=this.now();
  this.#put(this.#observation(row,url,raw,status,now));
 }
 #observation(row,url,raw,status,now){
  if(status==='complete'||status==='closed')return {...row,status:status==='closed'?'elapsed':status,checkedAt:now,openingFinished:true};
  const open={...row,status:'open',checkedAt:now,openingFinished:true,closesAt:now+raw.minutesLeft*MINUTE,minutesLeft:raw.minutesLeft,observedUrl:url};
  return this.#arm(open,now);
 }
 #arm(row,now,enabled=this.settings().reminder){
  if(!enabled||row.status!=='open'||!row.observedUrl||row.reminderAt||row.reminderCheckedAt||
     row.checkedAt>now||now-row.checkedAt>=REMINDER_WINDOW||!(row.minutesLeft>10)||row.closesAt!==row.checkedAt+row.minutesLeft*MINUTE||
     row.closesAt-10*MINUTE<=now||kstDate(row.closesAt-10*MINUTE)!==row.date)return row;
  return {...row,reminderAt:row.closesAt-10*MINUTE,reminderDeadline:row.closesAt};
 }
 settings(){return {...(this.data.settings??DEFAULT_SURVEY_SETTINGS)};}
 setSettings(current){
  if(!surveySettingsValid(current))throw Error('invalid_setting');
  const previous=this.settings();
  if(previous.mode===current.mode&&previous.delay===current.delay&&previous.reminder===current.reminder)return;
  const now=this.now(),rows={...this.data.rows};
  if(current.reminder&&!previous.reminder){
   // An already observed document can arm the one read without opening a page.
   for(const [key,row] of Object.entries(rows))if(row.date===kstDate(now)&&this.#eligible(row,key))rows[key]=this.#arm(row,now,true);
  }
  this.save({...this.data,rows,settings:{...current}});
  if(previous.mode!==current.mode||previous.delay!==current.delay){this.openingBoundary=now;if(this.active?.phase==='survey')this.cancel();}
  if(!current.reminder&&this.active?.phase==='survey_reminder')this.cancel();
 }
 rearm(){this.boundary=this.openingBoundary=this.now();}
 cancel(){this.active?.controller.abort();}
 due(now=this.now()){
  if(this.failed||this.active||!this.canRead()||now<(this.data.lastStartedAt??0)+MINUTE)return null;
  const date=kstDate(now),{mode,delay,reminder}=this.settings();
  const reminders=reminder?Object.values(this.data.rows).filter(row=>row.date===date&&row.status==='open'&&this.#eligible(row,row.key)&&!row.reminderCheckedAt&&row.reminderAt>this.boundary&&now>=row.reminderAt&&now<Math.min(row.reminderDeadline,row.reminderAt+REMINDER_WINDOW)):[];
  if(reminders.length){
   const row=reminders.sort((a,b)=>a.reminderDeadline-b.reminderDeadline)[0];
   return {phase:'survey_reminder',key:row.key,id:row.id,date,at:row.reminderAt,until:Math.min(row.reminderDeadline,row.reminderAt+REMINDER_WINDOW),url:row.observedUrl};
  }
  if(mode==='off')return null;
  const offsets=SURVEY_OFFSETS[mode],tasks=[];
  for(const target of surveyOpeningTargets(date,this.catalog(date),this.jobs(date))){
   const key=surveyKey(date,target.id),row=this.data.rows[key];
   if(!this.#eligible(row,key)||row?.openingFinished||row?.notified||row?.status==='open'||(row?.reads??0)>=offsets.length)continue;
   const at=offsets.map(offset=>target.start+(delay+offset)*MINUTE).find(slot=>slot>Math.max(this.openingBoundary,row?.openingSlotAt??0)&&slot<=now&&now<slot+OPENING_WINDOW&&kstDate(slot)===date);
   if(at)tasks.push({...target,key,at,until:at+OPENING_WINDOW,phase:'survey',url:surveyReadUrl(target.id)});
  }
  return tasks.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))[0]??null;
 }
 async run(task){
  const now=this.now(),due=this.due(now);
  if(!due||!task||task.key!==due.key||task.phase!==due.phase||task.at!==due.at)return;
  task=due;
  const row=this.data.rows[task.key]??makeRow(task,now);
  const opening=task.phase==='survey',settings=this.settings();
  const controller=new AbortController(),scope=this.context();
  this.active={key:task.key,phase:task.phase,controller};
  let page,timer,raw,url,attempted=false,result='unknown';
  try{
   // The shared spacing and the task's own consume marker use one atomic write.
   this.#put(opening?{...row,reads:row.reads+1,openingSlotAt:task.at}:{...row,reminderCheckedAt:now},now);
   const current=()=>{
    const saved=this.data.rows[task.key],options=this.settings();
    return !controller.signal.aborted&&!this.failed&&this.canRead()&&this.context()===scope&&kstDate(this.now())===task.date&&this.now()<task.until&&
     this.#eligible(saved,task.key)&&(opening?options.mode===settings.mode&&options.delay===settings.delay&&!saved.openingFinished:
      options.reminder&&saved.status==='open'&&saved.reminderCheckedAt===now);
   };
   if(!current())return;
   attempted=true;
   resourceCount('attempts',1,task.phase);
   timer=setTimeout(()=>controller.abort(),8000);timer.unref?.();
   try{
    page=this.createPage('doctorville',controller.signal,{surveyRead:{id:task.id,phase:task.phase,current}});
    if(!current())return;
    await page.load(task.url);
    url=page.url;
    if(!current()||doctorvilleSurveyId(url)!==task.id)return;
    raw=await page.call('doctorville-survey.js',[task.id,url],{authorize:current});
    if(!current()||page.url!==url)return;
   }catch{return;}
   if(opening&&!surveyOpeningTargets(task.date,this.catalog(task.date),this.jobs(task.date)).some(target=>target.id===task.id&&target.start===task.start))return;
   const status=outcome(raw,task.id);
   if(status==='unknown')return;
   const saved=this.data.rows[task.key],next=this.#observation(saved,url,raw,status,this.now());
   if(status==='open'){
    if(opening)next.notified=true;else next.reminderNotified=true;
   }
   this.#put(next);
   result=status;
   if(status==='open'&&!controller.signal.aborted&&this.canRead()&&this.context()===scope&&this.data.rows[task.key]===next&&
      this.notify({key:task.key,title:next.title,phase:task.phase,minutesLeft:raw.minutesLeft}))resourceCount('notifications',1,task.phase);
  }finally{
   clearTimeout(timer);page?.close();this.active=null;if(attempted)resourceCount(result,1,task.phase);
  }
 }
 skip(key,value){
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))return false;
  const row=this.data.rows[key];if(typeof value!=='boolean'||!row||row.date!==kstDate(this.now())||row.status==='complete')return false;
  this.#put({...row,status:value?'skipped':'unknown',checkedAt:this.now(),openingFinished:true});
  if(this.active?.key===key)this.cancel();return true;
 }
 snapshot({diagnostics=false,date=kstDate(this.now())}={}){
  return Object.values(this.data.rows).filter(row=>row.date===date).map(row=>({
   ...(diagnostics?{}:{key:row.key,title:row.title??'닥터빌 강의'}),
   status:row.status,closesAt:row.closesAt,checkedAt:row.checkedAt,reads:row.reads,reminderAt:row.reminderAt??0,
   reminderReads:row.reminderCheckedAt?1:0,openingNotified:row.notified,reminderNotified:!!row.reminderNotified,
   excluded:this.options.snapshot().surveyExcluded.includes(row.key),
  }));
 }
 target(key){
  if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))return null;
  const r=this.data.rows[key];if(!r||r.date!==kstDate(this.now())||r.status==='skipped')return null;
  return doctorvilleDetailNavigation('https://www.doctorville.co.kr/seminar/main',r.detail)&&new URL(r.detail).searchParams.get('seminarId')===r.id?r.detail:r.url;
 }
}
