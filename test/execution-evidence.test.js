import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {EntryRunner} from '../src/entry-runner.js';
import {DailyRunner} from '../src/daily-runner.js';
import {AutomationController} from '../src/automation-controller.js';
import {DeveloperJournal} from '../editions/developer/developer-journal.js';
import {createDeveloperTools} from '../editions/developer/developer-tools.js';
import {dailyEvidenceLabel,entrySummary,entrySessionSummary,entryFailureLabel,entryEvidenceLabel,preflightLabel,entryRunVersion} from '../src/execution-presentation.js';
import {kstDate,kstInstant} from '../src/schedule.js';
const date=kstDate(),at=time=>kstInstant(date,time);
function setup(t){
 const root=mkdtempSync(join(tmpdir(),'pc-evidence-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let now=at('12:00');
 const ledger=new LocalState(join(root,'state.json')),store=new WorkflowStore(join(root,'workflows.json')),clock={now:()=>now,set:value=>{now=value;},sleep:async ms=>{now+=ms;}};
 const event={site:'medigate',date,time:'13:00',title:'합성 입장 검증'};
 return {root,ledger,store,clock,event};
}
const page=handler=>({closed:false,url:'https://new.medigate.net/symposium',version:1,route:'catalog',load:async()=>{},call:handler,close(){this.closed=true;},allowPopups(){}});
function reserve(s,options={}){s.store.setFeature('entry',true);const runner=new EntryRunner({...s,now:s.clock.now,sleep:s.clock.sleep,...options});runner.reserveCatalog(date,{medigate:{status:'review',events:[s.event]}});return runner;}
test('completed provider observations never imply that mobile or the current PC caused the completion',()=>{
 assert.match(dailyEvidenceLabel({status:'complete',attempted:false}),/기존 완료.*PC 새 제출 없음/);
 assert.match(dailyEvidenceLabel({status:'complete',attempted:true,submitted:false}),/이력.*상태 확인/);
 assert.match(dailyEvidenceLabel({status:'complete',submitted:true}),/PC 제출 후.*관찰/);
 assert.match(dailyEvidenceLabel({status:'complete'}),/미기록/);
 assert.doesNotMatch(dailyEvidenceLabel({status:'complete',attempted:false}),/모바일/);
 assert.equal(entryRunVersion({receipt:{checkedAt:20},executionFinishedAt:10,executionVersion:'0.1.0-preview.12'}),'');
 assert.equal(entryRunVersion({receipt:{checkedAt:20},executionFinishedAt:20,executionVersion:'0.1.0-preview.12'}),'0.1.0-preview.12');
});
test('five Hanmi clicks remain one lecture and never become confirmed playback or credit',()=>{
 const attempts=Array.from({length:5},()=>({status:'clicked',attempted:true,navigationObserved:true,playback:'inaccessible'})),job={status:'clicked',attempts,receipt:attempts.at(-1)};
 const summary=entrySummary([job,{status:'button_missing'},{status:'reserved'}]);
 assert.deepEqual(summary,{reservations:3,waiting:1,pcClickedJobs:1,pcClicks:5,needsAttention:1,manual:0});
 assert.match(entryEvidenceLabel(job),/PC 클릭 확인.*이동 확인/);
 assert.match(entryEvidenceLabel(job),/관찰 불가.*출석·적립 미확인/);
 assert.match(entryFailureLabel({receipt:{titleMatches:1,scheduleMatches:0,attempted:false}}),/날짜·시작 시각.*클릭 없음/);
 assert.match(preflightLabel({status:'complete'}),/실제 클릭 없음/);
});
test('preflight uses only its separate read-only page and leaves dispatch ledger and reservation untouched',async t=>{
 const s=setup(t);let loginOrEntry=0,inspections=0;
 const runner=reserve(s,{createPage:async()=>{loginOrEntry++;throw Error('must not recover');},createInspectionPage:async()=>page(async(name,[job,mode])=>{assert.equal(name,'pc-entry.js');assert.equal(mode,'preflight');inspections++;return {status:'ready',targetMatched:true,matchedTargets:1,entryControls:1};})});
 s.store.setFeature('entry',false);const before=s.store.entries()[0],ledgerBefore=JSON.stringify(s.ledger.snapshot());
 assert.equal((await runner.preflight(before.key)).ok,true);
 const {preflight,inspection,...after}=s.store.entries()[0];assert.deepEqual(after,before);assert.equal(inspection.readOnly,true);assert.equal(preflight.status,'complete');assert.equal(preflight.attempted,false);assert.equal(inspections,2);assert.equal(loginOrEntry,0);assert.equal(JSON.stringify(s.ledger.snapshot()),ledgerBefore);assert.equal(existsSync(join(s.root,'state.json')),false);
 assert.equal(new WorkflowStore(join(s.root,'workflows.json')).entries()[0].preflight.status,'complete');
});
test('a manual site owner or absent inspection transport cannot trigger preflight login recovery',async t=>{
 const s=setup(t);let created=0;const runner=reserve(s,{isManualOpen:()=>true,createPage:async()=>{created++;}});
 assert.equal((await runner.preflight(s.store.entries()[0].key)).ok,false);runner.isManualOpen=()=>false;
 assert.equal((await runner.preflight(s.store.entries()[0].key)).ok,false);assert.equal(created,0);
});
test('cancelled preflight ignores a late ready result and preserves the entry reservation',async t=>{
 const s=setup(t);let deliver;const late=new Promise(resolve=>{deliver=resolve;});
 const runner=reserve(s,{createInspectionPage:async()=>page(async()=>late)}),key=s.store.entries()[0].key;
 const checking=runner.preflight(key);await new Promise(resolve=>setImmediate(resolve));runner.cancel();deliver({status:'ready',targetMatched:true});await checking;
 assert.equal(s.store.entries()[0].status,'reserved');assert.equal(s.store.entries()[0].preflight.status,'cancelled');assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);assert.equal(runner.busy,false);
});
test('an entry becoming due interrupts preflight rather than waiting for its page read',async t=>{
 const s=setup(t);s.ledger.setPaused(false);let aborted=false,deliver;
 const controller=new AutomationController({file:join(s.root,'workflows.json'),ledger:s.ledger,createPage:async()=>{throw Error('unexpected dispatch');},createInspectionPage:async(_site,signal)=>{signal.addEventListener('abort',()=>{aborted=true;},{once:true});return page(async()=>new Promise(resolve=>{deliver=resolve;}));},isManualOpen:()=>false,catalog:()=>({}),catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){},now:s.clock.now});
 t.after(()=>controller.close());clearInterval(controller.timer);controller.store.setFeature('entry',true);controller.entry.reserveCatalog(date,{medigate:{status:'review',events:[s.event]}});
 const job=controller.store.entries()[0],checking=controller.preflightEntry(job.key);await new Promise(resolve=>setImmediate(resolve));s.clock.set(job.due);controller.tick();assert.equal(aborted,true);
 controller.closed=true;deliver({status:'ready',targetMatched:true});await checking;
 assert.equal(controller.store.entries()[0].preflight.status,'cancelled');assert.equal(controller.store.entries()[0].status,'reserved');assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('PC entry fallback dispatch is durable, binds its own click adapter and cannot repeat after lost response',async t=>{
 const s=setup(t);s.ledger.setPaused(false);s.clock.set(at('13:00:30'));let sent=0;
 const runner=reserve(s,{createPage:async()=>page(async(name,[_job,mode])=>{
  if(name==='auto-entry.js')return {status:'ambiguous',targetMatched:false,matchedTargets:2};
  assert.equal(name,'pc-entry.js');if(mode==='inspect')return {status:'ready',targetMatched:true,matchedTargets:1,entryControls:1};
  assert.equal(Object.values(s.ledger.snapshot().jobs)[0].state,'attempting');sent++;throw Error('network_error');
 })});
 await runner.run(runner.due());assert.equal(sent,1);const job=s.store.entries()[0];assert.equal(job.status,'unknown');assert.equal(job.entryAttempted,true);assert.equal(runner.retryJob(job.key),false);
 assert.equal(new LocalState(join(s.root,'state.json')).snapshot().jobs[Object.keys(s.ledger.snapshot().jobs)[0]].state,'unknown');
});
test('every unexecuted retry is retained and telemetry failures never cause a submit',async t=>{
 const s=setup(t);s.ledger.setPaused(false);s.clock.set(at('13:00:30'));let clicks=0;
 const runner=reserve(s,{onEvent(){throw Error('diagnostic disk unavailable');},createPage:async()=>page(async(_name,[_job,mode])=>{if(mode==='click')clicks++;return {status:'button_missing',targetMatched:true,matchedTargets:1,entryControls:0};})});
 for(let i=0;i<5;i++){const job=runner.due();assert.ok(job);await runner.run(job);if(i<4)s.clock.set(s.store.entries()[0].nextAt);}
 const job=s.store.entries()[0];assert.equal(clicks,0);assert.equal(job.retries,4);assert.equal(job.attempts.length,5);assert.equal(job.status,'button_missing');assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('automation journal links bounded phase facts and build version while excluding arbitrary page data',t=>{
 const s=setup(t),journal=new DeveloperJournal(join(s.root,'journal.json')),now=s.clock.now();journal.setEnabled(true,now);
 journal.event({area:'automation',phase:'inspect',site:'medigate',kind:'entry',key:'1'.repeat(64),runId:'2'.repeat(32),appVersion:'0.1.0-preview.12',reader:'pc',dateMatches:1,timeMatches:1,targetMatched:true,reason:'duplicate_target',title:'PRIVATE_TITLE',url:'https://PRIVATE.invalid/',account:'PRIVATE_ACCOUNT',html:'PRIVATE_HTML',status:'PRIVATE_STATUS'},now+1);
 const row=journal.export(now+2).events[0];assert.equal(row.dateMatches,1);assert.equal(row.reader,'pc');assert.equal(row.runId,'2'.repeat(32));assert.equal(row.status,undefined);assert.doesNotMatch(JSON.stringify(row),/PRIVATE|https:|account|html|title"/);
});
test('daily result history records an existing completion without reserving a PC submit',async t=>{
 const s=setup(t),events=[];s.ledger.setPaused(false);s.store.setFeature('dailyClaim',true);
 const runner=new DailyRunner({...s,now:s.clock.now,sleep:s.clock.sleep,onEvent:e=>events.push(e),createPage:async()=>page(async()=>({status:'complete',reason:'today_status'}))});
 await runner.run(['doctorville:attendance']);const result=events.find(e=>e.phase==='result');assert.equal(result.evidence,'existing_observed');assert.equal(result.attempted,false);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);assert.ok(result.appVersion);
});
test('explicit daily status refresh rereads an old completion without using credential recovery',async t=>{
 const s=setup(t);s.store.setFeature('dailyClaim',true);s.store.record(date,'doctorville:attendance',{status:'complete',reason:'today_status',attempted:true});let reads=0,normalPages=0;
 const runner=new DailyRunner({...s,now:s.clock.now,sleep:s.clock.sleep,createPage:async()=>{normalPages++;throw Error('must not recover credentials');},createInspectionPage:async()=>page(async()=>{reads++;return {status:'login',reason:'login_required'};})});
 await runner.run(['doctorville:attendance'],{readOnly:true});assert.equal(reads,1);assert.equal(normalPages,0);assert.equal(s.store.day().daily['doctorville:attendance'].status,'login');assert.equal(s.store.day().daily['doctorville:attendance'].attempted,true);assert.equal(runner.snapshot().readOnly,true);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('a new app session does not count five retained earlier clicks as current execution',()=>{
 const jobs=[{attempts:Array.from({length:5},(_,i)=>({status:'clicked',checkedAt:100+i}))},{receipt:{status:'clicked',checkedAt:201}},{receipt:{status:'clicked'}}];
 assert.deepEqual(entrySessionSummary(jobs,200),{currentClicks:1,previousClicks:5,undatedClicks:1});
 assert.deepEqual(entrySessionSummary(jobs),{currentClicks:0,previousClicks:0,undatedClicks:7});
});
function batchController(t,s,createInspectionPage,options={}){
 const controller=new AutomationController({file:join(s.root,'workflows.json'),ledger:s.ledger,createPage:async()=>{throw Error('unexpected credential or entry action');},createInspectionPage,isManualOpen:()=>false,catalog:()=>({}),catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){},now:s.clock.now,...options});
 clearInterval(controller.timer);t.after(()=>controller.close());controller.store.setFeature('entry',true);controller.entry.reserveCatalog(date,{medigate:{status:'review',events:[s.event,{...s.event,time:'14:00',title:'두 번째 합성 강의'}]}});return controller;
}
test('batch preflight checks upcoming reservations with zero dispatches and unchanged ledger',async t=>{
 const s=setup(t),pages=[],controller=batchController(t,s,async()=>{const p=page(async()=>({status:'ready',targetMatched:true,entryControls:1}));pages.push(p);return p;});
 const before=controller.store.entries().map(({key,status,due})=>({key,status,due}));assert.equal((await controller.preflightUpcoming()).ok,true);
 assert.deepEqual(controller.snapshot().preflight,{running:false,total:2,completed:2,skipped:0,ready:2,waiting:0,login:0,unresolved:0,reason:'finished'});
 assert.deepEqual(controller.store.entries().map(({key,status,due})=>({key,status,due})),before);assert.equal(pages.length,2);assert.ok(pages.every(p=>p.closed));assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('a due entry aborts the batch and cannot start its next inspection page',async t=>{
 const s=setup(t);s.ledger.setPaused(false);let reads=0,deliver;
 const controller=batchController(t,s,async()=>page(async()=>{reads++;return new Promise(resolve=>{deliver=resolve;});}));
 const checking=controller.preflightUpcoming();await new Promise(resolve=>setImmediate(resolve));s.clock.set(controller.store.entries()[0].due);controller.tick();controller.closed=true;deliver({status:'ready'});await checking;
 assert.equal(reads,1);assert.equal(controller.snapshot().preflight.reason,'cancelled');assert.equal(controller.store.entries()[0].preflight.status,'cancelled');assert.equal(controller.store.entries()[1].preflight,undefined);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('manual owners are skipped and batch read budget expires without affecting the next reservation',async t=>{
 const s=setup(t);let reads=0;
 const controller=batchController(t,s,async()=>page(async()=>{reads++;s.clock.set(s.clock.now()+120001);return {status:'login'};}));
 await controller.preflightUpcoming();assert.equal(reads,1);assert.equal(controller.snapshot().preflight.reason,'cancelled');assert.equal(controller.store.entries()[1].preflight,undefined);
 controller.entry.isManualOpen=()=>true;await controller.preflightUpcoming();assert.equal(controller.snapshot().preflight.skipped,2);assert.equal(reads,1);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('preflight waits for delayed catalog content and stable eligibility without creating a submit lease',async t=>{
 const s=setup(t);let reads=0,normal=0;
 const runner=reserve(s,{createPage:async()=>{normal++;},createInspectionPage:async()=>page(async()=>++reads<4?{status:'target_missing',candidateCards:0}:{status:'ready',targetMatched:true,entryControls:1})});
 const before=s.store.entries()[0];await runner.preflight(before.key);const job=s.store.entries()[0];
 assert.equal(reads,5);assert.equal(job.preflight.status,'complete');assert.equal(job.preflight.reads,5);assert.equal(normal,0);assert.equal(job.status,before.status);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('preflight ignores a changed document then reads the new document without repeating an action',async t=>{
 const s=setup(t);let reads=0;
 const runner=reserve(s,{createInspectionPage:async()=>page(async()=>{if(++reads===1)throw Object.assign(Error(),{code:'page_changed'});return {status:'ready',targetMatched:true,entryControls:1};})});
 await runner.preflight(s.store.entries()[0].key);assert.equal(reads,3);assert.equal(s.store.entries()[0].preflight.status,'complete');assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('a provider or login landing is classified before searching for missing lecture titles',async t=>{
 const s=setup(t);let calls=0;
 for(const route of ['provider','login']){
  const runner=reserve(s,{createInspectionPage:async()=>({...page(async()=>{calls++;}),route})});await runner.preflight(s.store.entries()[0].key);
  assert.equal(s.store.entries()[0].preflight.status,'login');assert.equal(s.store.entries()[0].preflight.reads,0);
 }
 assert.equal(calls,0);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('an empty catalog inspection is bounded and never changes an entry reservation or lease',async t=>{
 const s=setup(t);let reads=0;
 const runner=reserve(s,{createInspectionPage:async()=>page(async()=>{reads++;return {status:'target_missing',candidateCards:0};})});
 await runner.preflight(s.store.entries()[0].key);assert.equal(reads,21);assert.equal(s.store.entries()[0].preflight.status,'target_missing');assert.equal(s.store.entries()[0].status,'reserved');assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('batch processed counts distinguish waiting for an entry button from login need',async t=>{
 const s=setup(t);let pages=0;
 const controller=batchController(t,s,async()=>{const n=++pages;return page(async()=>n===1?{status:'not_open',targetMatched:true,reason:'opens_later'}:{status:'login',reason:'login_required'});});
 await controller.preflightUpcoming();assert.deepEqual(controller.snapshot().preflight,{running:false,total:2,completed:2,skipped:0,ready:0,waiting:1,login:1,unresolved:0,reason:'finished'});assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});

test('entry diagnostic exceptions never interrupt the durable one-shot dispatch',async t=>{
 const s=setup(t);s.ledger.setPaused(false);s.clock.set(at('13:00:30'));let clicks=0;
 const runner=reserve(s,{traceEntry(){throw Error('diagnostics unavailable');},observeEntry(){throw Error('diagnostics unavailable');},createPage:async()=>page(async(_name,[_job,mode])=>{if(mode==='click'){assert.equal(Object.values(s.ledger.snapshot().jobs)[0].state,'attempting');clicks++;return {status:'clicked'};}return {status:'ready',targetMatched:true};})});
 await runner.run(runner.due());assert.equal(clicks,1);assert.equal(s.store.entries()[0].entryAttempted,true);assert.equal(runner.retryJob(s.store.entries()[0].key),false);
});
test('clearing actual entry diagnostics preserves reservation and consumed attempt bytes',async t=>{
 const s=setup(t);s.ledger.setPaused(false);s.clock.set(at('13:00:30'));const handlers=new Map();let clicks=0;
 const tools=createDeveloperTools({directory:s.root,register:(k,fn)=>handlers.set(k,fn),save(){},copy(){},notify(){},policy:{},edition:{id:'developer',appId:'synthetic'},version:'0.1.0-preview.21',snapshot:()=>({})});tools.register();handlers.get('pc-dev:enabled')(true);
 const runner=reserve(s,{traceEntry:(...args)=>tools.traceEntry(...args),observeEntry:(...args)=>tools.observeEntry(...args),createPage:async()=>page(async(_name,[_job,mode])=>{if(mode==='click'){clicks++;return {status:'clicked'};}return {status:'ready',targetMatched:true};})});
 await runner.run(runner.due());const files=['state.json','workflows.json'],before=files.map(n=>readFileSync(join(s.root,n),'utf8'));
 assert.equal(handlers.get('pc-dev:entry-list')().records.length,1);handlers.get('pc-dev:clear')();assert.deepEqual(files.map(n=>readFileSync(join(s.root,n),'utf8')),before);assert.equal(handlers.get('pc-dev:entry-list')().records.length,0);assert.equal(runner.retryJob(s.store.entries()[0].key),false);assert.equal(clicks,1);
});
