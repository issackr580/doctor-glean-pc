import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AutomationController} from '../src/automation-controller.js';
import {LocalState} from '../src/local-state.js';
import {UsageMeter} from '../src/resource-use.js';
import {kstInstant} from '../src/schedule.js';
import {surveyKey,surveyReadUrl} from '../src/survey-policy.js';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/doctorville-survey-v176.json',import.meta.url)));
const replay=fixture.opening.fiveLectureReplay;
const date=replay.jobs[0].date,start=Date.parse(replay.jobs[0].startAt),minute=60_000;
const observationAt=Date.parse(fixture.reminder.cases[0].observedAt);
const deadline=Date.parse(fixture.reminder.baseExpectedEstimatedDeadlineAt),reminderAt=Date.parse(fixture.reminder.baseExpectedScheduleAt);
const openingStart=start+fixture.opening.defaultDelayMinutes*minute;
const openProof=(id,minutesLeft)=>({site:'doctorville',seminarId:id,status:'open',buttonCount:1,disabled:false,minutesLeft});
const eventFor=({site='doctorville',seminarId,date,time='15:00'})=>({site,date,time,title:'합성 설문 '+seminarId,url:'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId='+seminarId});
const receipt=(id,status)=>status==='open'?openProof(id,9):{site:'doctorville',seminarId:id,status};

function harness(t,{mode='experiment',reminder=false,delay=60,now=start-1,inputs=replay.jobs}={}){
 const dir=mkdtempSync(join(tmpdir(),'pc-v176-')),workFile=join(dir,'workflows-v1.json'),file=join(dir,'surveys-v1.json');
 const events=inputs.map(eventFor);
 const context={now,access:true,online:true,manual:false,busy:false,epoch:0,result:'unknown',requests:[],loads:[],notices:[],closes:0,errors:[],events,file};
 const create=()=>{
  const ledger=new LocalState(join(dir,'state-v1.json'));ledger.setPaused(false);
  const controller=new AutomationController({
   file:workFile,ledger,now:()=>context.now,catalog:()=>({doctorville:{status:'ok',stale:false,events}}),
   catalogBusy:()=>context.busy,isManualOpen:()=>context.manual,queueCatalog(){},yieldCatalog(){},
   executionAllowed:()=>context.access,surveyAllowed:()=>context.online,surveyContext:()=>context.epoch,
   notifySurvey:value=>{context.notices.push(value);return true;},onError:error=>{context.errors.push(error.message);},
   createPage:()=>{throw Error('unexpected_recovery_or_submission');},
   createInspectionPage:(site,signal,{surveyRead})=>{
    assert.equal(site,'doctorville');
    context.requests.push({at:context.now,...surveyRead});
    const measures={url:'',load:async url=>{
     const row=JSON.parse(readFileSync(file)).rows[surveyKey(date,surveyRead.id)];
     assert.ok(surveyRead.phase==='survey'?row.reads&&row.openingSlotAt:row.reminderCheckedAt);
     assert.equal(signal.aborted,false);measures.url=url;context.loads.push(url);
     if(context.result.startsWith('http_'))throw Error('site_wait');
    },call:async(name,[id,url])=>{
     assert.equal(name,'doctorville-survey.js');assert.equal(id,surveyRead.id);assert.equal(url,measures.url);
     return context.pending?context.pending:receipt(id,context.result);
    },close:()=>context.closes++};
    return measures;
   },
  });
  clearInterval(controller.timer);
  return controller;
 };
 const started=h=>h.entryState==='waiting_room'||h.entryState==='broadcast_room'||h.entryState==='clicked';
 context.controller=create();
 inputs.forEach((raw,i)=>{
  const event=events[i],began=Date.parse(raw.startAt);
  const key=context.controller.store.entryKey(event);
  context.controller.store.putEntry({...event,key:raw.key??key,start:began,due:began,deadline:began+600_000,slot:0,retries:0,
   nextAt:0,status:started(raw)?'clicked':'reserved',entryAttempted:started(raw),attempts:[],
   doctorvilleArrival:['waiting_room','broadcast_room'].includes(raw.entryState)?raw.entryState:undefined,
  });
 });
 context.controller.setSurveySettings({mode,delay,reminder});
 context.observe=(id,status='open',left=30)=>context.controller.survey.observe(surveyReadUrl(id),status==='open'?openProof(id,left):receipt(id,status),null);
 context.tick=async at=>{context.now=at;context.controller.tick();await new Promise(resolve=>setImmediate(resolve));};
 context.restart=()=>{context.controller.close();context.controller=create();};
 t.after(()=>{context.controller.close();rmSync(dir,{recursive:true,force:true});});
 return context;
}

test('v176 opening modes use the real PC scheduler and the per-lecture plan',async t=>{
 for(const [mode,offsets] of Object.entries(fixture.opening.offsetsFromFirstReadMinutes))await t.test(mode,async t=>{
  const s=harness(t,{mode,inputs:replay.jobs.slice(0,mode==='experiment'?5:1)});
  for(let i=0;i<=114;i++)await s.tick(openingStart+i*minute);
  assert.equal(s.requests.length,mode==='experiment'?replay.expectedTotal:offsets.length);
  const byId=Map.groupBy(s.requests,row=>row.id);
  for(const checks of byId.values())assert.deepEqual(checks.map(row=>(row.at-checks[0].at)/minute),offsets);
  assert.ok(s.requests.every((row,i)=>!i||row.at-s.requests[i-1].at>=replay.minimumStartSpacingSeconds*1000));
  assert.equal(s.closes,s.loads.length);
  assert.equal(s.notices.length,0);
  assert.deepEqual(s.errors,[]);
 });
});

test('opening is limited to proven same-date identities; ambiguous or reserved records do not dispatch',async t=>{
 const a=replay.jobs[0],b=replay.jobs[1],c=replay.jobs[2],d=replay.jobs[3];
 const inputs=[a,{...b,entryState:'reserved'},{...c,date:'2026-11-24'},{...d},
  {...d,key:'b'.repeat(64),time:'16:00',startAt:'2026-11-25T16:00:00+09:00',entryState:'reserved'}];
 const s=harness(t,{mode:'economy',inputs});
 await s.tick(openingStart);
 await s.tick(openingStart+minute);
 assert.deepEqual(s.requests.map(row=>row.id),[a.seminarId]);
});

test('serialized opening survives restart, later modes, global stop and late wakes',async t=>{
 const s=harness(t,{mode:'balanced',inputs:replay.jobs.slice(0,1)});
 const id=replay.jobs[0].seminarId;
 await s.tick(openingStart+5*minute);
 assert.equal(s.requests.length,0);
 s.restart();
 await s.tick(openingStart+15*minute);
 assert.equal(s.requests.length,1);
 s.controller.setSurveySettings({mode:'economy',delay:60,reminder:false});
 s.restart();
 await s.tick(openingStart+30*minute);
 assert.equal(s.requests.length,1);
 s.controller.setSurveySettings({mode:'active',delay:60,reminder:false});
 s.controller.ledger.setPaused(true);
 await s.tick(openingStart+50*minute);
 s.controller.ledger.setPaused(false);s.controller.resumed();
 await s.tick(openingStart+50*minute+1000);
 assert.equal(s.requests.length,1);
 assert.equal(JSON.parse(readFileSync(s.file)).rows[surveyKey(date,id)].reads,1);
});

test('delay is shared and opening notifies once, with no replay after settings change or restart',async t=>{
 const s=harness(t,{mode:'experiment',delay:45,reminder:true,inputs:replay.jobs.slice(0,1)});
 s.result='open';
 await s.tick(start+45*minute);
 assert.deepEqual(s.requests.map(row=>row.phase),['survey']);
 assert.equal(s.notices.length,1);
 assert.equal(s.notices[0].minutesLeft,9);
 s.controller.setSurveySettings({mode:'active',delay:60,reminder:true});
 s.restart();
 await s.tick(start+60*minute);
 await s.tick(start+90*minute);
 assert.equal(s.requests.length,1);
 assert.equal(s.notices.length,1);
 assert.equal(s.controller.survey.snapshot()[0].reminderAt,0);
});

test('v176 reminder fixture runs through the actual scheduler, including a persisted restart',async t=>{
 for(const scenario of fixture.reminder.cases)await t.test(scenario.case,async t=>{
  const id=replay.jobs[0].seminarId;
  const s=harness(t,{mode:scenario.openingMode,reminder:scenario.reminderEnabled,now:observationAt-1,inputs:replay.jobs.slice(0,1)});
  s.now=Date.parse(scenario.observedAt);s.observe(id,'open',scenario.minutesLeft);
  const row=s.controller.survey.snapshot()[0];
  assert.equal(row.closesAt,s.now+scenario.minutesLeft*minute);
  if(scenario.reminderEnabled&&scenario.minutesLeft===30){
   assert.equal(row.closesAt,deadline);assert.equal(row.reminderAt,reminderAt);
  }
  if(scenario.savedStatusAtTick)s.observe(id,scenario.savedStatusAtTick);
  if(scenario.networkAccess==='off')s.access=false;
  if(scenario.alreadyConsumed){
   await s.tick(reminderAt);
   s.restart();
   s.requests.length=0;s.notices.length=0;
  }
  s.result=scenario.freshResult;
  await s.tick(Date.parse(scenario.tickAt));
  assert.equal(s.requests.filter(row=>row.phase==='survey_reminder').length,scenario.expectedReminderReads);
  assert.equal(s.requests.filter(row=>row.phase==='survey').length,0);
  assert.equal(s.notices.length,scenario.expectedNotifications);
  if(s.notices.length)assert.equal(s.controller.survey.target(s.notices[0].key),s.events[0].url);
  assert.deepEqual(s.errors,[]);
 });
});

test('reminder switch uses fresh observations without work and keeps a consumed reminder across toggles',async t=>{
 const id=replay.jobs[0].seminarId,s=harness(t,{mode:'off',now:observationAt-1,inputs:replay.jobs.slice(0,1)});
 s.now=observationAt;s.observe(id,'open',30);
 s.now=observationAt+minute;s.controller.setSurveySettings({mode:'off',delay:60,reminder:true});
 assert.equal(s.requests.length,0);assert.equal(s.controller.survey.snapshot()[0].reminderAt,reminderAt);
 s.result='open';
 await s.tick(reminderAt);
 s.controller.setSurveySettings({mode:'off',delay:60,reminder:false});
 s.controller.setSurveySettings({mode:'off',delay:60,reminder:true});
 s.restart();
 await s.tick(reminderAt+minute);
 assert.equal(s.requests.length,1);assert.equal(s.notices.length,1);
 assert.equal(s.controller.survey.snapshot()[0].reads,0);
});

test('a future persisted reminder takes priority over a simultaneous opening slot',async t=>{
 const first=replay.jobs[0],second={...replay.jobs[1],startAt:'2026-11-25T19:30:00+09:00',time:'19:30'};
 const s=harness(t,{mode:'economy',reminder:true,now:observationAt-1,inputs:[first,second]});
 s.now=observationAt;s.observe(first.seminarId);
 s.now=reminderAt-1;s.restart();
 await s.tick(reminderAt);
 await s.tick(reminderAt+minute);
 assert.deepEqual(s.requests.map(row=>[row.phase,row.id]),[['survey_reminder',first.seminarId],['survey',second.seminarId]]);
});

test('no stale, skipped, sleeping, manually occupied, offline or date-mismatched reminder starts',async t=>{
 for(const scenario of ['stale','skipped','sleeping','manual','offline','new_day'])await t.test(scenario,async t=>{
  const id=replay.jobs[0].seminarId,s=harness(t,{mode:'off',reminder:scenario!=='stale',now:observationAt-1,inputs:replay.jobs.slice(0,1)});
  s.now=observationAt;s.observe(id);
  if(scenario==='stale'){s.now=observationAt+2*minute;s.controller.setSurveySettings({mode:'off',delay:60,reminder:true});}
  if(scenario==='skipped')s.controller.survey.skip(surveyKey(date,id),true);
  if(scenario==='sleeping'){s.controller.suspended();s.now=reminderAt+60_000;s.controller.resumed();}
  if(scenario==='manual')s.manual=true;
  if(scenario==='offline')s.online=false;
  await s.tick(scenario==='new_day'?kstInstant('2026-11-26','00:00'):Math.max(reminderAt,s.now));
  assert.equal(s.requests.length,0);
 });
});

test('atomic failure opens no page; a canceled or old-account callback cannot notify',async t=>{
 for(const scenario of ['storage','cancel','epoch'])await t.test(scenario,async t=>{
  const s=harness(t,{mode:'off',reminder:true,now:observationAt-1,inputs:replay.jobs.slice(0,1)}),id=replay.jobs[0].seminarId;
  s.now=observationAt;s.observe(id);
  if(scenario==='storage')s.controller.survey.commit=()=>{throw Error('disk_full');};
  let reply;s.pending=new Promise(resolve=>{reply=resolve;});
  await s.tick(reminderAt);
  if(scenario==='cancel')s.controller.cancel();
  if(scenario==='epoch')s.epoch++;
  reply(openProof(id,8));await s.tick(reminderAt+minute);
  assert.equal(s.requests.length,scenario==='storage'?0:1);
  assert.equal(s.notices.length,0);
  if(scenario==='storage')assert.deepEqual(s.errors,['storage_error']);
  else assert.equal(s.closes,1);
 });
});

test('usage counts owned browser samples per phase and version; unattributable bytes stay unset',t=>{
 const path=mkdtempSync(join(tmpdir(),'pc-v176-usage-'));t.after(()=>rmSync(path,{recursive:true,force:true}));
 const file=join(path,'usage.json'),meter=new UsageMeter(file,()=>observationAt,'0.1.0-preview.40');
 const phases=fixture.telemetry.exclusiveIntervals;
 const sample=({stage,estimatedBytes:n,documentNavigations})=>{
  meter.count('attempts',1,stage);meter.count('mainFrameLoads',documentNavigations,stage);meter.count('browserEncodedBytes',n,stage);meter.count('byteSamples',1,stage);
 };
 phases.forEach(sample);assert.deepEqual(meter.view().surveys,[]);
 assert.equal(meter.change('start'),true);
 phases.forEach(sample);
 meter.count('browserEncodedBytes',9900); // another page; no survey phase owns this measurement
 const result=meter.view();assert.deepEqual(result.surveys.map(row=>row.browserEncodedBytes),[110,220]);
 assert.ok(result.surveys.every(row=>row.processEstimatedBytes===null&&row.apiBodyBytes===null));
 assert.equal(meter.change('stop'),true);
 assert.deepEqual(new UsageMeter(file,()=>observationAt).view().surveys,result.surveys);
});
