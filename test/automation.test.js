import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore,cleanEntryInspection} from '../src/workflow-store.js';
import {DailyRunner} from '../src/daily-runner.js';
import {EntryRunner} from '../src/entry-runner.js';
import {LoungeRunner} from '../src/lounge-runner.js';
import {DoctorvilleQuizRunner} from '../src/doctorville-quiz-runner.js';
import {actionAllowed,DAILY_TASKS,dailyDialog} from '../src/automation-policy.js';
import {kstDate,kstInstant} from '../src/schedule.js';
import {atomicJson} from '../src/atomic-json.js';
import {AutomationController} from '../src/automation-controller.js';
const date=kstDate(),at=time=>kstInstant(date,time);
function setup(t,time='12:00'){
 const root=mkdtempSync(join(tmpdir(),'pc-automation-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 let now=at(time);const clock={now:()=>now,advance:ms=>{now+=ms;},set:value=>{now=value;},sleep:async ms=>{now+=ms;}};
 const ledger=new LocalState(join(root,'state.json'));ledger.setPaused(false);
 const store=new WorkflowStore(join(root,'workflows.json'));
 return {root,clock,ledger,store};
}
function page(handler){return {closed:false,url:'https://www.doctorville.co.kr/event/attend',route:'daily',version:1,load:async function(url){this.url=url;this.version++;},call:handler,allowPopups(){},close(){this.closed=true;}};}
const claim={type:'claim',selector:'#claim',label:'출석하기'};
test('new features default off and diagnostics discard provider text and IDs',t=>{
 const {store}=setup(t);assert.ok(Object.values(store.features()).every(v=>v===false));
 store.record(date,'doctorville:attendance',{status:'complete',reason:'today_status',account:'private',url:'https://private.invalid/',answers:[1],html:'private'});
 const text=JSON.stringify(store.diagnostics());assert.doesNotMatch(text,/private|answers|html|https:/);assert.equal(store.day(date).daily['doctorville:attendance'].status,'complete');
});
test('entry inspection metadata persists safely without changing the stable receipt or durable attempts',t=>{
 const {root,store,clock}=setup(t),key='a'.repeat(64);
 const raw={status:'ambiguous',reason:'duplicate_target',dateMatches:2,timeMatches:2,identifiedTargets:2,distinctIdentities:1,stateVariants:2,url:'https://PRIVATE/',account:'PRIVATE',html:'PRIVATE'};
 store.putEntry({key,site:'medigate',date,title:'합성 강의',time:'12:00',start:clock.now(),due:clock.now(),deadline:clock.now()+60000,nextAt:clock.now(),slot:0,retries:0,status:'reserved',attempts:[],entryAttempted:false,inspection:cleanEntryInspection(raw,clock.now())});
 const reopened=new WorkflowStore(join(root,'workflows.json')),row=reopened.diagnostics().entries[0];
 assert.equal(reopened.failed,false);assert.equal(row.inspection.stateVariants,2);assert.equal(row.inspection.dateMatches,2);assert.equal(row.receipt,undefined);assert.deepEqual(row.attempts,[]);assert.doesNotMatch(JSON.stringify(row),/PRIVATE|https:|html|account/);
});
test('read-only daily check never executes a claim even when it is available',async t=>{
 const {clock,ledger,store}=setup(t);store.setFeature('dailyClaim',true);let writes=0;
 const p=page(async(_name,[request])=>{if(request.phase==='execute')writes++;return {status:'pending',reason:'claim_available',claimAvailable:true};});
 const runner=new DailyRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep});await runner.run(['doctorville:attendance'],{readOnly:true});
 assert.equal(writes,0);assert.equal(Object.keys(ledger.snapshot().jobs).length,0);assert.ok(p.closed);
});
test('attempt is durable before the original click and completion prevents another claim',async t=>{
 const {root,clock,ledger,store}=setup(t);store.setFeature('dailyClaim',true);let sent=0;
 const make=()=>page(async(_name,[request])=>{
  if(request.phase==='execute'){assert.equal(Object.values(ledger.snapshot().jobs)[0].state,'attempting');sent++;return {status:'unknown',reason:'claim_verifying',executed:true};}
  return sent?{status:'complete',reason:'today_status'}:{status:'action',reason:'claim_available',action:claim};
 });
 const runner=new DailyRunner({ledger,store,createPage:async()=>make(),now:clock.now,sleep:clock.sleep});await runner.run(['doctorville:attendance']);await runner.run(['doctorville:attendance']);
 assert.equal(sent,1);assert.equal(store.day(date).daily['doctorville:attendance'].status,'complete');
 const restored=new LocalState(join(root,'state.json'));assert.equal(Object.values(restored.snapshot().jobs)[0].state,'confirmed');
});
test('lost click response remains consumed after restart and cannot be automatically resubmitted',async t=>{
 const {root,clock,ledger,store}=setup(t);store.setFeature('dailyClaim',true);let sent=0;
 const make=()=>page(async(_name,[request])=>{if(request.phase==='execute'){sent++;throw Error('network_error');}return request.attempted?{status:'pending',reason:'claim_available',claimAvailable:true}:{status:'action',reason:'claim_available',action:claim};});
 await new DailyRunner({ledger,store,createPage:async()=>make(),now:clock.now,sleep:clock.sleep}).run(['doctorville:attendance']);
 const restarted=new LocalState(join(root,'state.json'));await new DailyRunner({ledger:restarted,store,createPage:async()=>make(),now:clock.now,sleep:clock.sleep}).run(['doctorville:attendance']);
 assert.equal(sent,1);assert.equal(store.day(date).daily['doctorville:attendance'].status,'unknown');
});
test('storage failure before dispatch produces zero clicks and closes the worker',async t=>{
 const {root,clock,ledger}=setup(t);let fail=false,sent=0;
 const store=new WorkflowStore(join(root,'broken.json'),{commit:(file,data)=>{if(fail)throw Error('disk_full');atomicJson(file,data);}});store.setFeature('dailyClaim',true);fail=true;
 const p=page(async(_name,[request])=>{if(request.phase==='execute')sent++;return {status:'action',reason:'claim_available',action:claim};});
 const runner=new DailyRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep});await assert.rejects(runner.run(['doctorville:attendance']));
 assert.equal(sent,0);assert.ok(p.closed);assert.equal(runner.busy,false);
});
test('a pause observed after reading an available action prevents dispatch',async t=>{
 const {clock,ledger,store}=setup(t);store.setFeature('dailyClaim',true);let sent=0;
 const p=page(async(_name,[request])=>{if(request.phase==='execute')sent++;ledger.setPaused(true);return {status:'action',reason:'claim_available',action:claim};});
 await new DailyRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep}).run(['doctorville:attendance']);assert.equal(sent,0);
});
test('Keymedi attendance opener and final confirmation each have their own durable dispatch',async t=>{
 const {clock,ledger,store}=setup(t);store.setFeature('dailyClaim',true);let phase=0;
 const p=page(async(_name,[request])=>{
  if(request.phase==='execute'){assert.equal(Object.values(ledger.snapshot().jobs).filter(j=>j.state==='attempting').length,phase+1);phase++;return {status:'unknown',reason:'claim_verifying',executed:true};}
  return phase===2?{status:'complete',reason:'today_status'}:{status:'action',reason:'claim_available',action:{type:phase?'claim_confirm':'claim',selector:'#claim',label:phase?'광고 보고 출석하기':'출석하기'}};
 });
 p.url='https://www.keymedi.com/mypage/attendance';await new DailyRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep}).run(['keymedi:attendance']);assert.equal(phase,2);assert.equal(Object.keys(ledger.snapshot().jobs).length,2);
});
test('an absent brand recommendation ends both rounds without a reward claim',async t=>{
 const {clock,ledger,store}=setup(t);store.setFeature('brand',true);let sent=0;
 const p=page(async(_name,[request])=>{if(request.phase==='execute')sent++;return {status:'unknown',reason:'brand_recommendation_unavailable'};});
 await new DailyRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep}).run(['keymedi:brand1','keymedi:brand2']);
 assert.equal(sent,0);assert.equal(store.day(date).daily['keymedi:brand1'].status,'ended');assert.equal(store.day(date).daily['keymedi:brand2'].status,'ended');
});
test('claim confirmations and receipts stay scoped to the original task',()=>{
 const doctor=DAILY_TASKS[0],docple=DAILY_TASKS.find(t=>t.site==='docple');
 assert.equal(dailyDialog(doctor,'오늘 출석체크를 하시겠습니까?',true).accept,true);
 assert.equal(dailyDialog(doctor,'오늘 출석체크를 하시겠습니까?',false).accept,false);
 assert.notEqual(dailyDialog(doctor,'출석이 완료되지 않았습니다.',true).status,'complete');
 assert.equal(dailyDialog(docple,'출석 완료',true).accept,false);
 assert.equal(actionAllowed(doctor,'https://www.doctorville.co.kr/payment',{...claim}),false);
});
test('Hanmi repeats from the actual lecture start for five separate slots only',async t=>{
 const {clock,ledger,store}=setup(t,'13:10');store.setFeature('entry',true);const sent=[];
 const event={site:'hmp',date,time:'13:10',title:'한미 테스트 강의',registrationStatus:'registered'};
 const make=()=>page(async(_name,[job,mode])=>{
  if(mode==='inspect')return {status:'ready',targetMatched:true,matchedTargets:1,entryControls:1};
  if(mode==='click'){sent.push(job.hmpSlot);return {status:'clicked'};}
  return {status:'no_video'};
 });
 const runner=new EntryRunner({ledger,store,createPage:async()=>make(),now:clock.now,sleep:clock.sleep});runner.reserveCatalog(date,{hmp:{status:'review',stale:false,events:[event]}});
 for(let slot=0;slot<5;slot++){clock.set(at('13:10')+slot*600000);const job=runner.due();assert.equal(job.slot,slot);await runner.run(job);}
 assert.deepEqual(sent,[0,1,2,3,4]);assert.equal(runner.due(),null);assert.equal(store.entries()[0].attempts.length,5);
});
test('Hanmi end evidence stops remaining slots and missed slots are not backfilled',async t=>{
 const {clock,ledger,store}=setup(t,'13:35');store.setFeature('entry',true);
 const runner=new EntryRunner({ledger,store,createPage:async()=>page(async()=>({status:'lecture_ended',reason:'hmp_ended'})),now:clock.now,sleep:clock.sleep});
 runner.reserveCatalog(date,{hmp:{status:'review',events:[{site:'hmp',date,time:'13:10',title:'한미 테스트',registrationStatus:'registered'}]}});
 assert.equal(store.entries()[0].slot,3);clock.set(at('13:40'));await runner.run(runner.due());assert.equal(store.entries()[0].status,'lecture_ended');clock.set(at('13:50'));assert.equal(runner.due(),null);
});
test('unknown entry dispatch is not retried while unexecuted failures keep a bounded retry',async t=>{
 const {clock,ledger,store}=setup(t,'18:00:30');store.setFeature('entry',true);let sent=0;
 const p=page(async(_name,[_job,mode])=>{if(mode==='click'){sent++;throw Error('network_error');}return {status:'ready',targetMatched:true,matchedTargets:1,entryControls:1};});
 const runner=new EntryRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep});runner.reserveCatalog(date,{medigate:{status:'review',events:[{site:'medigate',date,time:'18:00',title:'테스트 강의'}]}});
 await runner.run(runner.due());assert.equal(sent,1);assert.equal(store.entries()[0].status,'unknown');assert.equal(runner.retryJob(store.entries()[0].key),false);
});
test('lounge never claims before opening and durably reserves all seven categories',async t=>{
 const {clock,ledger,store}=setup(t,'00:00:02');store.setFeature('lounge',true);let sent=0,loads=0;
 const p=page(async(_name,[input])=>{
  if(input.mode==='claim'){assert.ok(clock.now()>=at('00:01:02'));assert.equal(Object.values(ledger.snapshot().jobs).filter(j=>j.state==='attempting').length,7);assert.equal(input.mask,127);sent++;return {status:'ready',current:0,total:7,eligibleMask:127,successMask:0,sentMask:127};}
  return {status:'ready',current:sent?7:0,total:7,eligibleMask:127,successMask:sent?127:0};
 });p.load=async()=>{loads++;p.url='https://www.keymedi.com/drlounge';p.route='lounge';p.version++;};
 const runner=new LoungeRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep});await runner.run(date,at('00:00:02'));assert.equal(sent,1);assert.ok(loads>=2);assert.equal(store.day(date).lounge.status,'complete');
 await runner.run(date,at('00:00:02'));assert.equal(sent,1);
});
test('lounge rejects malformed eligibility and never sends after its deadline',async t=>{
 const {clock,ledger,store}=setup(t,'00:01:03');store.setFeature('lounge',true);let sent=0;
 const p=page(async(_name,[input])=>{if(input.mode==='claim')sent++;return {status:'ready',total:7,current:0,eligibleMask:'127',successMask:0};});p.load=async()=>{p.url='https://www.keymedi.com/drlounge';p.route='lounge';};
 await new LoungeRunner({ledger,store,createPage:async()=>p,now:clock.now,sleep:clock.sleep}).run(date,at('00:00:02'));assert.equal(sent,0);
});
test('quiz uses observed product navigation and reserves the one daily submit before the original button',async t=>{
 const {clock,ledger,store}=setup(t);let sent=0;
 const p=page(async(name,args)=>{
  const input=args[0];if(name==='doctorville-quiz-journey.js')return {status:'navigate',url:'https://www.doctorville.co.kr/product/productView?pId=1',productName:'테스트 제품'};
  if(input.mode==='prepare')return {status:'ready',attemptCount:0,quizId:123};
  if(input.mode==='submit'){assert.equal(Object.values(ledger.snapshot().jobs)[0].state,'attempting');sent++;return {status:'success',reason:'success_receipt'};}
  return {status:'stopped',reason:'cancelled'};
 });
 const runner=new DoctorvilleQuizRunner({ledger,store,now:clock.now,sleep:clock.sleep});const signal=new AbortController().signal;
 const result=await runner.run(p,date,{signal,allowed:()=>true});assert.equal(result.status,'complete');assert.equal(sent,1);assert.equal(store.day(date).quizAuto.submitted,true);
 await runner.run(p,date,{signal,allowed:()=>true});assert.equal(sent,1);
 assert.doesNotMatch(JSON.stringify(store.diagnostics()),/테스트 제품|pId|quizId|answers/);
});
test('quiz already completed on another device never starts ambiguous product discovery or reserves a submit',async t=>{
 const {clock,ledger,store}=setup(t);let discovery=0;
 const p=page(async(name)=>{if(name==='daily.js')return {status:'complete',reason:'today_quiz_visual'};if(name==='doctorville-quiz-journey.js')discovery++;return {status:'stopped',reason:'product_link_ambiguous'};});
 const result=await new DoctorvilleQuizRunner({ledger,store,now:clock.now,sleep:clock.sleep}).run(p,date,{signal:new AbortController().signal,allowed:()=>true});
 assert.equal(result.status,'complete');assert.equal(result.reason,'already_participated');assert.equal(discovery,0);assert.equal(Object.keys(ledger.snapshot().jobs).length,0);assert.equal(store.day(date).quizAuto.submitted,false);
});
test('desktop quiz duplicate-link recovery still reserves the daily submit before the original handler',async t=>{
 const {clock,ledger,store}=setup(t);let sent=0;
 const p=page(async(name,[input])=>{
  if(name==='daily.js')return {status:'pending',reason:'today_quiz_visual'};
  if(name==='doctorville-quiz-journey.js')return {status:'stopped',reason:'product_link_ambiguous'};
  if(name==='doctorville-quiz-page.js')return {status:'navigate',reason:'today_product_link',productName:'합성 제품',url:'https://www.doctorville.co.kr/product/productView?pId=123'};
  if(input.mode==='prepare')return {status:'ready',attemptCount:0};
  if(input.mode==='submit'){assert.equal(Object.values(ledger.snapshot().jobs)[0].state,'attempting');sent++;return {status:'success',reason:'success_receipt'};}
  return {status:'stopped',reason:'cancelled'};
 });
 const runner=new DoctorvilleQuizRunner({ledger,store,now:clock.now,sleep:clock.sleep});
 assert.equal((await runner.run(p,date,{signal:new AbortController().signal,allowed:()=>true})).status,'complete');
 await runner.run(p,date,{signal:new AbortController().signal,allowed:()=>true});assert.equal(sent,1);
});
test('genuinely ambiguous quiz products remain unsubmitted without consuming a ticket',async t=>{
 const {clock,ledger,store}=setup(t);let prepared=0;
 const p=page(async(name,[input])=>{if(input.mode==='prepare')prepared++;return {status:'stopped',reason:'product_link_ambiguous'};});
 const result=await new DoctorvilleQuizRunner({ledger,store,now:clock.now,sleep:clock.sleep}).run(p,date,{signal:new AbortController().signal,allowed:()=>true});
 assert.equal(result.reason,'product_link_ambiguous');assert.equal(prepared,0);assert.equal(Object.keys(ledger.snapshot().jobs).length,0);
});

test('morning completion waits for both the daily run and its queued catalog',async t=>{
 const {root,clock,ledger,store}=setup(t,'08:09');store.setFeature('morning',true);let queries=0;
 const c=new AutomationController({file:join(root,'workflows.json'),ledger,createPage:async()=>{throw Error('unexpected_page');},isManualOpen:()=>false,catalog:()=>({}),catalogBusy:()=>false,queueCatalog:()=>queries++,yieldCatalog:()=>{},now:clock.now});t.after(()=>c.close());clearInterval(c.timer);
 c.daily.run=async()=>({reason:'finished'});clock.advance(60000);c.tick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(queries,1);assert.equal(c.store.day().morning.status,'running');assert.equal(c.store.day().morning.dailyChecked,true);
 c.catalogFinished(date,[],{reason:'finished'});assert.equal(c.store.day().morning.status,'complete');assert.equal(c.store.day().morning.catalogChecked,true);
});
test('controller pauses dispatch and preserves the original non-storage error for reporting',t=>{
 const {root,clock,ledger}=setup(t),error=TypeError('synthetic scheduling failure'),observed=[];ledger.setPaused(false);
 const c=new AutomationController({file:join(root,'workflows.json'),ledger,createPage:async()=>{throw Error('unexpected_page');},isManualOpen:()=>false,catalog:()=>({}),catalogBusy:()=>{throw error;},queueCatalog:()=>{},yieldCatalog:()=>{},onError:value=>observed.push(value),now:clock.now});
 clearInterval(c.timer);t.after(()=>c.close());c.tick();
 assert.equal(ledger.snapshot().paused,true);assert.deepEqual(observed,[error]);
});
test('restart marks interrupted lounge and quiz results unknown without erasing attempts',t=>{
 const {root,store}=setup(t);store.record(date,'lounge',{status:'running',reason:'running',attemptMask:127,sentMask:3});store.record(date,'quizAuto',{status:'attempting',reason:'submission_reserved',submitted:true});
 const restarted=new WorkflowStore(join(root,'workflows.json'));restarted.recover();assert.equal(restarted.day().lounge.status,'unknown');assert.equal(restarted.day().lounge.attemptMask,127);assert.equal(restarted.day().quizAuto.submitted,true);
});
test('corrupt persisted receipts fail closed rather than manufacturing a current timestamp',t=>{
 const {root,store}=setup(t);store.record(date,'keymedi:attendance',{status:'complete',reason:'today_status'});const file=join(root,'workflows.json'),data=JSON.parse(readFileSync(file,'utf8'));delete data.days[date].daily['keymedi:attendance'].checkedAt;writeFileSync(file,JSON.stringify(data));assert.throws(()=>new WorkflowStore(file),/storage_error/);
});
