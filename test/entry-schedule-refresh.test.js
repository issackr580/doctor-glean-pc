import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EntryRunner} from '../src/entry-runner.js';
import {WorkflowStore,cleanReceipt} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {AutomationController} from '../src/automation-controller.js';
import {atomicJson} from '../src/atomic-json.js';
import {kstDate,kstInstant} from '../src/schedule.js';
import {catalogScheduleRevision} from '../src/entry-revision.js';
const date=kstDate(),at=time=>kstInstant(date,time),url='https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=17';
const exact={status:'ready',reason:'entry_ready',targetMatched:true,titleMatches:1,dateMatches:1,timeMatches:1,scheduleMatches:1,matchedTargets:1,entryControls:1};
function setup(t,{oldTime='12:20',now='11:00'}={}){
 const root=mkdtempSync(join(tmpdir(),'pc-refresh-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let instant=at('11:00'),results={},fail=false,actionPages=0;
 const clock={now:()=>instant,set:value=>{instant=value;},sleep:async ms=>{instant+=ms;}};
 const ledger=new LocalState(join(root,'state.json'));ledger.setPaused(false);
 const file=join(root,'workflows.json'),store=new WorkflowStore(file,{commit:(p,d)=>{if(fail)throw Error('disk_full');atomicJson(p,d);}});store.setFeature('entry',true);
 const loads=[],calls=[],traces=[];
 const page={url:'about:blank',route:'catalog',version:0,closed:false,load:async function(u){loads.push(u);this.url=u;this.version++;},call:async function(name,[job,mode]){calls.push({name,mode,time:job.time});assert.equal(name,'pc-entry.js');assert.equal(mode,'schedule-inspect');assert.equal(this.url,url);return {...exact,observedTime:job.time,endsAt:at('14:00')};},close(){this.closed=true;}};
 const options={ledger,store,catalog:()=>results,now:clock.now,sleep:clock.sleep,createInspectionPage:async()=>page,createPage:async()=>{actionPages++;throw Error('no action page during revision');},traceEntry:()=>({event:(phase,detail)=>traces.push({phase,...detail}),finish(){}})};
 const runner=new EntryRunner(options),catalog=(time,extra={})=>({doctorville:{site:'doctorville',date,status:'review',stale:false,checkedAt:clock.now(),events:[{site:'doctorville',date,time,title:'합성 일정 갱신',url}],...extra}});
 results=catalog(oldTime);runner.reserveCatalog(date,results);const key=store.entries()[0].key;instant=at(now);
 const propose=(time='12:45',extra={})=>{instant++;results=catalog(time,extra);runner.reserveCatalog(date,results);return runner.revisionDue(key);};
 return {root,file,store,ledger,clock,page,runner,key,loads,calls,traces,options,catalog,propose,get results(){return results;},set results(v){results=v;},get actionPages(){return actionPages;},failStorage(){fail=true;}};
}
const flush=async()=>{for(let i=0;i<30;i++)await new Promise(resolve=>setImmediate(resolve));};
test('changed catalog alone is a proposal; two fresh detail reads atomically update all timing without an attempt',async t=>{
 const s=setup(t),before=s.store.entries()[0],ledger=readFileSync(join(s.root,'state.json'),'utf8');assert.ok(s.propose());assert.deepEqual(s.store.entries()[0],before);
 assert.equal((await s.runner.reviseSchedule(s.key)).ok,true);const row=new WorkflowStore(s.file).entries()[0];
 assert.equal(row.time,'12:45');assert.equal(row.start,at('12:45'));assert.equal(row.due,at('11:55'));assert.equal(row.deadline,at('12:55'));assert.equal(row.nextAt,at('11:55'));
 assert.equal(row.status,'reserved');assert.equal(row.retries,before.retries);assert.equal(row.entryAttempted,false);assert.deepEqual(row.attempts,before.attempts);assert.equal(row.executionVersion,undefined);
 assert.equal(row.scheduleChanges[0].oldTime,'12:20');assert.equal(row.scheduleChanges[0].time,'12:45');assert.equal(row.preflight.attempted,false);
 assert.equal(s.loads.filter(u=>u===url).length,1);assert.equal(s.calls.length,2);assert.equal(s.actionPages,0);assert.equal(readFileSync(join(s.root,'state.json'),'utf8'),ledger);
 assert.doesNotMatch(JSON.stringify(s.store.diagnostics()),/https:|seminarId|scheduleIdentity/);
});
test('earlier starts replace the old timer and repeated unchanged queries add no revision',async t=>{
 const s=setup(t,{oldTime:'13:30'});s.propose('12:20');await s.runner.reviseSchedule(s.key);
 assert.equal(s.store.entries()[0].nextAt,at('11:30'));assert.equal(s.runner.due(at('11:29')),null);assert.equal(s.runner.due(at('11:30')).time,'12:20');
 assert.ok(s.propose('12:20'));await s.runner.reviseSchedule(s.key);assert.equal(s.store.entries()[0].scheduleChanges.length,1);
});
test('read-only retry history remains while time, due, deadline and next timer move together',async t=>{
 const s=setup(t,{now:'11:50'}),receipt=cleanReceipt({status:'target_missing',reason:'schedule_unmatched',attempted:false},s.clock.now()-1000);
 s.store.updateEntry(s.key,{retries:2,nextAt:at('12:15'),receipt,attempts:[receipt]});s.propose();await s.runner.reviseSchedule(s.key);const row=s.store.entries()[0];
 assert.equal(row.retries,2);assert.deepEqual(row.receipt,receipt);assert.deepEqual(row.attempts,[receipt]);assert.equal(row.due,at('11:55'));assert.equal(row.deadline,at('12:55'));assert.equal(row.nextAt,at('11:55'));
});
test('obsolete original windows do not block a verified upcoming or currently open lecture',async t=>{
 for(const [now,newTime] of [['12:25','12:45'],['12:31','12:45'],['12:25','12:24']]){
  const s=setup(t,{now});assert.ok(s.propose(newTime));assert.equal((await s.runner.reviseSchedule(s.key)).ok,true);assert.equal(s.store.entries()[0].time,newTime);
 }
 const q=setup(t,{now:'14:01'});q.propose('12:45');assert.equal((await q.runner.reviseSchedule(q.key)).ok,false);assert.equal(q.store.entries()[0].time,'12:20');
});
test('terminal, cancelled, consumed and uncertain reservations cannot be refreshed',t=>{
 for(const status of ['cancelled','clicked','manual_clicked','lecture_ended','unknown','attempting','running']){
  const s=setup(t);s.store.updateEntry(s.key,{status});const before=readFileSync(s.file,'utf8');assert.equal(s.propose(),null,status);assert.equal(readFileSync(s.file,'utf8'),before);
 }
 const s=setup(t);s.store.updateEntry(s.key,{entryAttempted:true});assert.equal(s.propose(),null);
 const q=setup(t);q.store.updateEntry(q.key,{receipt:cleanReceipt({status:'unknown',attempted:true})});assert.equal(q.propose(),null);
});
test('the durable ledger blocks a refresh even if a stale workflow flag says unused',t=>{
 const s=setup(t,{now:'11:40'}),row=s.store.entries()[0],input={site:row.site,kind:'entry',date,target:row.key,slot:row.slot,dueAt:row.due,deadline:row.deadline};
 const ticket=s.ledger.reserve(input,s.clock.now());assert.ok(ticket);assert.equal(s.ledger.beginDispatch(ticket,s.clock.now()),true);s.ledger.finish(ticket,'unknown',s.clock.now());
 assert.equal(s.propose(),null);assert.equal(s.loads.length,0);assert.equal(s.ledger.consumed(input),true);
});
test('new identities, unsafe references and stale catalogs are never selected',t=>{
 for(const extra of [
  {events:[{site:'doctorville',date,time:'12:45',title:'합성 일정 갱신',url:url.replace('17','18')}]},
  {events:[{site:'doctorville',date,time:'12:45',title:'합성 일정 갱신',url:url+'&token=PRIVATE'}]},
  {stale:true},{status:'login'},
 ]){const s=setup(t);assert.equal(s.propose('12:45',extra),null);assert.equal(s.loads.length,0);}
});
test('legacy reservations without identity can bind one exact fresh detail without resetting attempts',async t=>{
 const s=setup(t),data=JSON.parse(readFileSync(s.file));delete data.entries[s.key].scheduleIdentity;atomicJson(s.file,data);
 const store=new WorkflowStore(s.file),runner=new EntryRunner({...s.options,store});s.results=s.catalog('12:45');runner.reserveCatalog(date,s.results);assert.ok(runner.revisionDue());await runner.reviseSchedule(s.key);
 assert.equal(store.entries()[0].time,'12:45');assert.match(store.entries()[0].scheduleIdentity,/^[a-f0-9]{64}$/);assert.deepEqual(store.entries()[0].attempts,[]);
});
test('a changed or ambiguous fresh detail never borrows the catalog schedule',async t=>{
 for(const reply of [{...exact,status:'target_missing',reason:'scope_changed',targetMatched:false,timeMatches:0,scheduleMatches:0,matchedTargets:0},{...exact,status:'ambiguous',targetMatched:false,matchedTargets:2},{...exact,status:'not_registered',reason:'registration_required'}]){
  const s=setup(t),before=readFileSync(s.file,'utf8');s.propose();s.page.call=async()=>reply;assert.equal((await s.runner.reviseSchedule(s.key)).ok,false);assert.equal(readFileSync(s.file,'utf8'),before);assert.equal(s.actionPages,0);assert.equal(s.runner.revisionDue(),null);
 }
});
test('a changed catalog or cancelled reservation invalidates an in-flight detail result',async t=>{
 for(const mutate of [s=>{s.results=s.catalog('12:50');},s=>s.runner.cancelJob(s.key)]){
  const s=setup(t);s.propose();let deliver,entered;const waiting=new Promise(resolve=>{entered=resolve;});
  s.page.call=async()=>{entered();await new Promise(resolve=>{deliver=resolve;});return exact;};
  const pending=s.runner.reviseSchedule(s.key);await waiting;mutate(s);deliver();await pending;
  const row=s.store.entries()[0];assert.equal(row.time,'12:20');assert.equal(row.scheduleChanges,undefined);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
 }
});
test('late results after pause, day change or the confirmed end cannot commit a revision',async t=>{
 for(const mutate of [s=>s.ledger.setPaused(true),s=>s.clock.set(at('14:01')),s=>s.clock.set(kstInstant(kstDate(at('12:00')+86400000),'00:00'))]){
  const s=setup(t);s.propose();let deliver,entered;const waiting=new Promise(resolve=>{entered=resolve;});s.page.call=async()=>{entered();await new Promise(resolve=>{deliver=resolve;});return exact;};
  const pending=s.runner.reviseSchedule(s.key);await waiting;mutate(s);deliver();await pending;assert.equal(JSON.parse(readFileSync(s.file)).entries[s.key].time,'12:20');
 }
});
test('storage failure during the atomic schedule commit has zero entry calls and preserves persisted bytes',async t=>{
 const s=setup(t);s.propose();const before=readFileSync(s.file,'utf8');s.failStorage();await assert.rejects(s.runner.reviseSchedule(s.key),/storage_error/);
 assert.equal(readFileSync(s.file,'utf8'),before);assert.equal(s.store.failed,true);assert.equal(s.actionPages,0);assert.equal(s.page.closed,true);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('global cancellation leaves an unchanged future proposal pending without applying late evidence',async t=>{
 const s=setup(t);s.propose();let deliver,entered;const waiting=new Promise(resolve=>{entered=resolve;});s.page.load=async function(u){this.url=u;if(u===url){entered();await new Promise(resolve=>{deliver=resolve;});}};
 const pending=s.runner.reviseSchedule(s.key);await waiting;s.runner.cancel();deliver();await pending;assert.equal(s.store.entries()[0].time,'12:20');assert.ok(s.runner.revisionDue(s.key));assert.equal(s.calls.length,0);
});
test('the controller verifies an old due reservation first, then dispatches only on its revised timer',async t=>{
 const s=setup(t,{now:'11:40'});s.results=s.catalog('12:45');let clicks=0,inspectionSignal,deliver,entered;const waiting=new Promise(resolve=>{entered=resolve;});
 const load=s.page.load.bind(s.page);s.page.load=async function(u){await load(u);if(u===url){entered();await new Promise(resolve=>{deliver=resolve;});}};
 const action={url:'about:blank',route:'catalog',version:0,load:async function(u){this.url=u;},call:async(name,[job,mode])=>{assert.equal(job.time,'12:45');if(mode==='click'){assert.ok(Object.values(s.ledger.snapshot().jobs).some(row=>row.state==='attempting'&&row.dueAt===at('11:55')));clicks++;return {status:'clicked'};}return exact;},allowPopups(){},close(){}};
 const controller=new AutomationController({...s.options,file:s.file,catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){},createInspectionPage:async(_site,signal)=>{inspectionSignal=signal;return s.page;},createPage:async()=>action});clearInterval(controller.timer);controller.entry.sleep=s.clock.sleep;t.after(()=>controller.close());
 controller.catalogFinished(date,['doctorville'],{reason:'finished'});await waiting;controller.tick();assert.equal(inspectionSignal.aborted,false);assert.equal(clicks,0);deliver();await flush();
 assert.equal(controller.store.entries()[0].time,'12:45');assert.equal(controller.store.entries()[0].nextAt,at('11:55'));assert.equal(clicks,0);
 s.clock.set(at('11:55'));controller.tick();await flush();assert.equal(clicks,1);assert.equal(controller.store.entries()[0].status,'clicked');
 controller.catalogFinished(date,['doctorville'],{reason:'finished'});await flush();assert.equal(clicks,1);
});
test('document replacement during a fresh read cannot commit exact-looking evidence',async t=>{
 const s=setup(t);s.propose();s.page.call=async function(){this.version++;this.url='https://www.doctorville.co.kr/';return exact;};
 assert.equal((await s.runner.reviseSchedule(s.key)).ok,false);assert.equal(s.store.entries()[0].time,'12:20');assert.equal(s.actionPages,0);
});
test('another due entry interrupts schedule verification and keeps the original proposal unconsumed',async t=>{
 const s=setup(t);s.results=s.catalog('12:45');let deliver,entered,signal,manual=false;const waiting=new Promise(resolve=>{entered=resolve;});
 const load=s.page.load.bind(s.page);s.page.load=async function(u){await load(u);if(u===url){entered();await new Promise(resolve=>{deliver=resolve;});}};
 const controller=new AutomationController({...s.options,file:s.file,catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){},isManualOpen:site=>site==='doctorville'&&manual,createInspectionPage:async(_site,current)=>{signal=current;return s.page;}});clearInterval(controller.timer);controller.entry.sleep=s.clock.sleep;t.after(()=>controller.close());
 const jobs=[];controller.entry.run=async job=>{jobs.push(job.key);controller.store.updateEntry(job.key,{status:'cancelled',nextAt:0});};
 controller.catalogFinished(date,['doctorville'],{reason:'finished'});await waiting;
 const other={...controller.store.entries()[0],key:'b'.repeat(64),site:'medigate',due:s.clock.now()-1,nextAt:s.clock.now()-1};controller.store.putEntry(other);manual=true;controller.tick();assert.equal(signal.aborted,true);deliver();await flush();
 assert.deepEqual(jobs,[other.key]);assert.equal(controller.store.entries().find(j=>j.key===s.key).time,'12:20');assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
 manual=false;assert.ok(controller.entry.revisionDue(s.key));
});
test('restart rechecks current site data without changing the verified schedule or consuming an entry',async t=>{
 const s=setup(t);s.propose();await s.runner.reviseSchedule(s.key);const store=new WorkflowStore(s.file),runner=new EntryRunner({...s.options,store});
 runner.reserveCatalog(date,s.results);assert.ok(runner.revisionDue());await runner.reviseSchedule(s.key);assert.equal(store.entries()[0].time,'12:45');assert.equal(store.entries()[0].scheduleChanges.length,1);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('schedule audit metadata is bounded and cannot persist raw links or malformed clocks',async t=>{
 const s=setup(t);s.propose();await s.runner.reviseSchedule(s.key);const row=s.store.entries()[0],before=readFileSync(s.file,'utf8');
 for(const change of [{scheduleIdentity:'https://PRIVATE/'},{scheduleChanges:[{...row.scheduleChanges[0],time:'25:00'}]},{scheduleChanges:[{...row.scheduleChanges[0],url:'https://PRIVATE/'}]},{scheduleChanges:Array(9).fill(row.scheduleChanges[0])}]){
  assert.throws(()=>s.store.updateEntry(s.key,change),/storage_error/);assert.equal(readFileSync(s.file,'utf8'),before);
 }
 assert.doesNotMatch(JSON.stringify(s.store.diagnostics()),/PRIVATE|https:|scheduleIdentity/);
});
test('fresh detail time is authoritative even when the catalog still reports a different clock',async t=>{
 const s=setup(t);s.propose('12:45');s.page.call=async()=>({...exact,observedTime:'13:05',endsAt:at('14:00')});
 assert.equal((await s.runner.reviseSchedule(s.key)).ok,true);const row=s.store.entries()[0];assert.equal(row.time,'13:05');assert.equal(row.nextAt,at('12:15'));assert.equal(row.deadline,at('13:15'));assert.equal(s.actionPages,0);
});
test('conflicting cached clocks on one observed identity are resolved by the fresh exact detail',async t=>{
 const s=setup(t);s.propose('12:45',{events:['12:45','12:50'].map(time=>({site:'doctorville',date,time,title:'합성 일정 갱신',url}))});
 assert.equal((await s.runner.reviseSchedule(s.key)).ok,true);assert.equal(s.store.entries()[0].time,'12:45');assert.equal(s.loads.filter(u=>u===url).length,1);
});
test('a live unentered lecture is recovered after obsolete expiry with an immediate bounded timer',async t=>{
 for(const status of ['reserved','expired','target_missing','button_missing']){
  const s=setup(t,{now:'13:30'});s.store.updateEntry(s.key,{status,retries:4,receipt:cleanReceipt({status:'target_missing',reason:'schedule_unmatched',attempted:false}),attempts:[]});s.propose('12:45');
  assert.equal((await s.runner.reviseSchedule(s.key)).ok,true);const row=s.store.entries()[0];assert.equal(row.status,'reserved');assert.equal(row.time,'12:45');assert.equal(row.due,row.nextAt);assert.equal(row.nextAt,s.clock.now());assert.equal(row.deadline,s.clock.now()+600000);assert.equal(row.entryClosesAt,at('14:00'));assert.equal(row.retries,4);assert.equal(row.scheduleChanges.at(-1).recovered,true);assert.equal(s.actionPages,0);
 }
});
test('recovery of a currently open lecture also works when its original clock was correct',async t=>{
 const s=setup(t,{now:'13:30'});s.store.updateEntry(s.key,{status:'expired'});s.propose('12:20');await s.runner.reviseSchedule(s.key);
 assert.equal(s.store.entries()[0].time,'12:20');assert.equal(s.store.entries()[0].status,'reserved');assert.equal(s.store.entries()[0].scheduleChanges[0].recovered,true);
});
test('late recovery requires the ready original entry control and a valid future end',async t=>{
 for(const reply of [{...exact,observedTime:'12:45'},{...exact,observedTime:'12:45',endsAt:at('13:29')},{...exact,status:'not_open',observedTime:'12:45',endsAt:at('14:00')},{...exact,status:'not_registered',observedTime:'12:45',endsAt:at('14:00')},{...exact,observedTime:'12:45',endsAt:at('12:40')}]){
  const s=setup(t,{now:'13:30'});s.store.updateEntry(s.key,{status:'expired'});s.propose('12:45');s.page.call=async()=>reply;
  assert.equal((await s.runner.reviseSchedule(s.key)).ok,false);assert.equal(s.store.entries()[0].status,'expired');assert.equal(s.store.entries()[0].scheduleChanges,undefined);assert.equal(s.actionPages,0);
 }
});
test('a late recovery window ends at the confirmed lecture end when it is less than ten minutes away',async t=>{
 const s=setup(t,{now:'13:58'});s.store.updateEntry(s.key,{status:'expired'});s.propose('12:45');await s.runner.reviseSchedule(s.key);const row=s.store.entries()[0];assert.equal(row.deadline,at('14:00'));assert.equal(row.nextAt,s.clock.now());
});
test('a due expiration pass does not discard pending site verification or revive cancelled data',async t=>{
 const s=setup(t,{now:'13:30'});s.propose('12:45');assert.equal(s.runner.due(),null);assert.equal(s.store.entries()[0].status,'reserved');assert.ok(s.runner.revisionDue());
 await s.runner.reviseSchedule(s.key);assert.equal(s.runner.due().time,'12:45');s.runner.cancelJob(s.key);assert.equal(s.propose(),null);
});
test('the controller recovers an unused expired lecture and dispatches once inside the current live window',async t=>{
 const s=setup(t,{now:'13:30'}),old=cleanReceipt({status:'target_missing',reason:'schedule_unmatched',attempted:false},at('12:25'));
 s.store.updateEntry(s.key,{status:'target_missing',retries:4,receipt:old,attempts:[old]});s.results=s.catalog('12:45');let clicks=0;
 const action={url:'about:blank',route:'catalog',version:0,load:async function(u){this.url=u;},call:async(name,[job,mode])=>{
  assert.equal(job.time,'12:45');assert.equal(job.entryClosesAt,at('14:00'));
  if(action.url!==url)return {...exact};
  if(mode==='click'){assert.ok(Object.values(s.ledger.snapshot().jobs).some(row=>row.state==='attempting'&&row.dueAt>=at('13:30')&&row.deadline<=at('14:00')));clicks++;return {status:'clicked'};}
  return {...exact,endsAt:at('14:00')};
 },allowPopups(){},close(){}};
 const controller=new AutomationController({...s.options,file:s.file,catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){},createPage:async()=>action});clearInterval(controller.timer);controller.entry.sleep=s.clock.sleep;t.after(()=>controller.close());
 controller.catalogFinished(date,['doctorville'],{reason:'finished'});await flush();assert.equal(clicks,1);assert.equal(action.url,url);const row=controller.store.entries()[0];assert.equal(row.status,'clicked');assert.equal(row.retries,4);assert.equal(row.attempts[0].checkedAt,old.checkedAt);assert.equal(row.scheduleChanges.at(-1).recovered,true);
 controller.catalogFinished(date,['doctorville'],{reason:'finished'});await flush();assert.equal(clicks,1);
});
test('current unentered lectures are verified before later future reservations',t=>{
 const s=setup(t,{now:'13:30'}),sample=s.store.entries()[0];
 const events=[{site:'doctorville',date,time:'12:45',title:sample.title,url},{site:'doctorville',date,time:'13:00',title:'합성 진행 중 강의',url:url.replace('17','18')},{site:'doctorville',date,time:'15:00',title:'합성 예정 강의',url:url.replace('17','19')}];
 for(const event of events.slice(1)){const key=s.store.entryKey(event),start=at(event.time);s.store.putEntry({...sample,key,title:event.title,time:event.time,start,due:Math.max(start-3000000,at('00:00')),deadline:start+600000,nextAt:start-3000000,scheduleIdentity:undefined});}
 s.results=s.catalog('12:45',{events});s.runner.reserveCatalog(date,s.results);assert.equal(s.runner.revisionDue().job.time,'13:00');
});
test('an obsolete expired timer is rebooked for a verified future lecture before its entry button opens',async t=>{
 const s=setup(t,{now:'12:31'});s.store.updateEntry(s.key,{status:'expired'});s.propose('13:30');s.page.call=async()=>({...exact,status:'not_open',reason:'opens_later',entryControls:0,observedTime:'13:30',endsAt:at('15:00')});
 assert.equal((await s.runner.reviseSchedule(s.key)).ok,true);const row=s.store.entries()[0];assert.equal(row.time,'13:30');assert.equal(row.nextAt,at('12:40'));assert.equal(row.status,'reserved');assert.equal(s.actionPages,0);
});
