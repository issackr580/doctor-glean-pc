import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DataAccess} from '../src/data-access.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {kstInstant} from '../src/schedule.js';
import {SiteWait,observeSiteResponse} from '../src/site-wait.js';
const dir=()=>mkdtempSync(join(tmpdir(),'pc-v168-'));
test('data choice invalidates running work, survives restart, blocks on corrupt or interrupted save',()=>{
 const file=join(dir(),'mode'),a=new DataAccess(file);assert.ok(a.allowed());const signal=a.controller.signal;
 for(const mode of ['off','wifi']){a.set(mode);assert.equal(signal.aborted,true);assert.throws(()=>new DataAccess(file).require());}
 a.set('always');new DataAccess(file).require();writeFileSync(file,'{}');assert.equal(new DataAccess(file).allowed(),false);
 const bad=new DataAccess(file,()=>{throw Error('disk');});assert.throws(()=>bad.set('always'));assert.equal(new DataAccess(file).allowed(),false);
});
test('Docple visible completion preserves prior attempt and first limit across late callbacks and restart',()=>{
 const root=dir(),date='2026-11-23',now=kstInstant(date,'05:10'),key='docple:attendance',file=join(root,'workflow');
 const opts={now:()=>now},s=new WorkflowStore(file,opts),gate=new SiteWait(join(root,'wait'),opts),url='https://docple-plus.com/api/season2/mission/attendance/calendar';
 const res={url,statusCode:429,resourceType:'xhr',responseHeaders:{'Retry-After':['120']}};
 assert.equal(observeSiteResponse(gate,'docple',{...res,url:'https://docple-plus.com/icon.png',resourceType:'image'}),false);observeSiteResponse(gate,'docple',res);
 s.record(date,key,{status:'unknown',reason:'site_wait',waitUntil:gate.status('docple').until,attempted:true},now);
 s.record(date,key,{status:'complete',reason:'docple_visible_receipt'},now+1);s.record(date,key,{status:'login',reason:'login_required'},now+2);
 const stored=new WorkflowStore(file,opts).day(date).daily[key];assert.equal(stored.status,'complete');assert.equal(stored.attempted,true);assert.equal(stored.firstIssue.until,now+120000);assert.equal(gate.allowed('docple'),false);
});
test('scheduler holds a due job through two wake signals in both restricted modes',async()=>{
 const {AutomationController}=await import('../src/automation-controller.js'),{LocalState}=await import('../src/local-state.js');
 const root=dir(),file=join(root,'mode'),date='2026-11-23';let now=kstInstant(date,'08:00')-1,calls=0;
 new DataAccess(file).set('off');
 const policy=new DataAccess(file),ledger=new LocalState(join(root,'ledger'));
 const controller=new AutomationController({file:join(root,'flows'),ledger,now:()=>now,executionAllowed:()=>policy.allowed(),catalog:()=>({}),catalogBusy:()=>false,queueCatalog(){calls++;},yieldCatalog(){}});
 clearInterval(controller.timer);
 try{
  ledger.setPaused(false);controller.store.setFeature('dailyClaim',true);
  controller.store.record(date,'intermd:quiz',{status:'scheduled',reason:'intermd_quiz_before_open'},now);
  controller.daily.run=async()=>{calls++;return {reason:'finished'};};
  now=controller.morning.quizDue(date);
  for(const mode of ['off','wifi']){policy.set(mode);controller.suspended();controller.resumed();controller.resumed();assert.equal(calls,0);}
  now=kstInstant(date,'08:21');policy.set('always');controller.resumed();assert.equal(calls,0);
 }finally{controller.close();}
});
test('a delayed local Docple read cannot change the saved daily result after account change, midnight or cancellation',async()=>{
 const {DailyRunner}=await import('../src/daily-runner.js'),{LocalState}=await import('../src/local-state.js');
 for(const change of ['account','day','cancel']){
  const root=dir(),date='2026-11-23';let now=kstInstant(date,'23:59'),epoch=0;
  const ledger=new LocalState(join(root,'ledger'));ledger.setPaused(false);
  const store=new WorkflowStore(join(root,'workflow'),{now:()=>now});
  store.record(date,'docple:attendance',{status:'pending',reason:'read_only'},now);
  const runner=new DailyRunner({ledger,store,now:()=>now,createPage:async()=>({
   load(){},close(){},call(){if(change==='account')epoch++;if(change==='day')now+=120000;if(change==='cancel')runner.cancel();return {status:'complete',reason:'docple_visible_receipt'};}
  })});
  runner.receiptContext=()=>epoch;
  await runner.run(['docple:attendance'],{readOnly:true});
  assert.equal(store.day(date).daily['docple:attendance'].status,'pending');
  assert.equal(store.day('2026-11-24').daily['docple:attendance'],undefined);
 }
});
