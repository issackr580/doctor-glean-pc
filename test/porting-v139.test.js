import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {kstDate,kstInstant} from '../src/schedule.js';
import {CatalogStore,sanitiseResult} from '../src/catalog-store.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {EntryRunner} from '../src/entry-runner.js';
import {LocalState} from '../src/local-state.js';
import {PcOptions} from '../src/pc-options.js';
import {ActionFuses} from '../src/action-fuses.js';
import {SurveyRunner} from '../src/survey-runner.js';
import {attachCheckpoints} from '../src/entry-checkpoints.js';
import {entrySchedule} from '../src/automation-policy.js';
import {docpleId} from '../src/docple-policy.js';
import {ReportPreview} from '../src/report-preview.js';
import {atomicJson} from '../src/atomic-json.js';
import {AutomationController} from '../src/automation-controller.js';
import {LoungeRunner} from '../src/lounge-runner.js';
const date=kstDate(),at=t=>kstInstant(date,t),title='가상 웨비나';
function setup(t){const root=mkdtempSync(join(tmpdir(),'pc-v139-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let now=at('12:30');return {root,now:()=>now,set:n=>{now=n;},sleep:async ms=>{now+=ms;}};}
const event=(id='701',patch={})=>({site:'docple',id,url:'https://docple-plus.com/webinar/'+id+'?category=C01&mode=LIVE&sort=START_ASC',date,time:'13:00',title,registrationStatus:'registered',...patch});
function harness(t){const s=setup(t),ledger=new LocalState(join(s.root,'state.json')),store=new WorkflowStore(join(s.root,'workflows.json'));ledger.setPaused(false);store.setFeature('entry',true);store.setEntrySites(['docple','whodadoc','dtalks']);const runner=new EntryRunner({ledger,store,now:s.now,sleep:s.sleep});return {...s,ledger,store,runner,reserve:(events)=>runner.reserveCatalog(date,{docple:{status:'ok',stale:false,checkedAt:s.now(),events}})};}
const ready={status:'ready',reason:'entry_ready',targetMatched:true,titleMatches:1,scheduleMatches:1,matchedTargets:1,entryControls:1};
function actionPage(s,{onInspect=()=>{},lose=false,probe='not_open'}={}){return {url:'',version:0,route:'catalog',signal:new AbortController().signal,async load(url){this.url=url;this.version++;},async call(_name,[job,mode]){if(mode==='inspect'){await onInspect(job);return ready;}if(mode==='entry_probe')return {status:probe};if(mode==='click'){s.clicks=(s.clicks??0)+1;assert.equal(Object.values(s.ledger.snapshot().jobs).at(-1).state,'attempting');if(lose)throw Error('lost_ack');this.url='https://docple-plus.com/webinar/701/watch';this.version++;return {status:'clicked'};}return null;},close(){},allowPopups(){}};}
test('Docple catalog keeps public IDs and registration; rejects ID/URL disagreement and opaque parameters',()=>{
 const row=sanitiseResult('docple',date,{status:'ok',coverage:true,events:[event(),event('702')],diagnostics:{stopReason:'docple_list_exhausted',listStatus:'checked',unknown:0}},at('12:00'));
 assert.deepEqual(row.events.map(e=>e.id),['701','702']);assert.equal(row.events[0].registrationStatus,'registered');assert.equal(row.scope,'list_checked');
 for(const e of [event('701',{url:'https://docple-plus.com/webinar/702'}),event('701',{url:'https://docple-plus.com/webinar/701?token=synthetic'}),event('0'),event('12345678901234567')])assert.equal(sanitiseResult('docple',date,{status:'ok',events:[e]}).events.length,0);
 assert.equal(docpleId('https://docple-plus.com/webinar/701?category=C01&category=C01'),'');
});
test('Docple defaults are opt-in and preserve attendance choices, profile data and existing selections',t=>{
 const s=setup(t),catalog=new CatalogStore(join(s.root,'catalog.json')),store=new WorkflowStore(join(s.root,'workflow.json')),options=new PcOptions(join(s.root,'options.json'));
 catalog.select(['hmp']);store.setEntrySites(['hmp']);store.setFeature('dailyClaim',true);const before=readFileSync(store.file,'utf8');
 assert.ok(options.snapshot().dailyKeys.includes('docple:attendance'));assert.deepEqual(new CatalogStore(join(s.root,'catalog.json')).selected(),['hmp']);assert.deepEqual(new WorkflowStore(store.file).entrySites(),['hmp']);assert.equal(readFileSync(store.file,'utf8'),before);
 assert.equal(new WorkflowStore(join(s.root,'fresh.json')).entrySites().includes('docple'),false);
});
test('only registered LIVE identities reserve, same titles remain independent and rename does not grant a new action',t=>{
 const s=harness(t);s.reserve([event(),event('702'),event('703',{registrationStatus:'not_registered'}),event('704',{registrationStatus:'unknown'}),event('705',{lectureEnded:true})]);
 assert.equal(s.store.entries().length,2);const [job]=s.store.entries();assert.equal(job.key,createHash('sha256').update('docple|'+date+'|701').digest('hex'));assert.equal(job.due,at('12:30'));assert.equal(job.deadline,at('13:10'));
 s.store.updateEntry(job.key,{status:'clicked',entryAttempted:true});s.reserve([event('701',{title:'이름 변경'})]);assert.equal(s.store.entries().length,2);assert.equal(s.store.entries().find(j=>j.key===job.key).status,'clicked');
});
test('atomic ledger write failure sends zero original entry clicks',async t=>{
 const s=harness(t);s.reserve([event()]);s.ledger=new LocalState(join(s.root,'failed.json'),{commit:()=>{throw Error('disk_full');}});
 // Allow setup commit, then inject the failure exactly at external dispatch.
 const working=new LocalState(join(s.root,'state2.json'));working.setPaused(false);const failed=new LocalState(join(s.root,'state2.json'),{commit:()=>{throw Error('disk_full');}});s.ledger=failed;s.runner.ledger=failed;s.runner.createPage=async()=>actionPage(s);
 await s.runner.run(s.store.entries()[0]);assert.equal(s.clicks??0,0);assert.equal(failed.snapshot().paused,true);
});
test('lost click ACK remains consumed across restart, refresh and title change',async t=>{
 const s=harness(t);s.reserve([event()]);s.runner.createPage=async()=>actionPage(s,{lose:true});await s.runner.run(s.store.entries()[0]);assert.equal(s.clicks,1);
 const restored=new LocalState(join(s.root,'state.json'));s.runner.ledger=restored;s.runner.recover();s.reserve([event('701',{title:'새 제목'})]);await s.runner.run(s.store.entries()[0]);assert.equal(s.clicks,1);assert.equal(Object.values(restored.snapshot().jobs)[0].state,'unknown');
});
test('selection revocation or cancellation during inspect cannot call click',async t=>{
 for(const revoke of ['selection','cancel']){const s=harness(t);s.reserve([event()]);s.runner.createPage=async()=>actionPage(s,{onInspect:()=>{if(revoke==='selection')s.store.setEntrySites([]);else s.runner.cancelJob(s.store.entries()[0].key);}});await s.runner.run(s.store.entries()[0]);assert.equal(s.clicks??0,0);}
});
test('schedule corrections preserve peers and can consume only two distinct checkpoints',t=>{
 const s=harness(t);s.reserve([event(),event('702')]);const [a,b]=s.store.entries();s.reserve([event('701',{time:'13:20'}),event('702')]);const changed=s.store.entries().find(j=>j.key===a.key);
 assert.equal(changed.schedulePlan.length,2);assert.deepEqual(s.store.entries().find(j=>j.key===b.key),b);assert.equal(attachCheckpoints(changed,{...changed,time:'13:40'},s.now()),null);
 const restored=new WorkflowStore(s.store.file);assert.deepEqual(restored.entries().find(j=>j.key===a.key).schedulePlan,changed.schedulePlan);
});
test('short repeat needs actual player observation before anchoring next checkpoint',async t=>{
 for(const observed of [false,true]){const s=harness(t);s.set(at('13:00'));s.runner.reserveCatalog(date,{whodadoc:{status:'ok',stale:false,events:[{site:'whodadoc',date,time:'13:00',title,url:'https://hcp.whodadoc.com/hcp/main'}]}});s.runner.createPage=async()=>{const p=actionPage(s,{probe:observed?'player_observed':'not_open'});const call=p.call.bind(p);p.call=async(...args)=>{const result=await call(...args);if(args[1][1]==='click')p.url='https://hcp.whodadoc.com/hcp/live';return result;};return p;};await s.runner.run(s.store.entries()[0]);const j=s.store.entries()[0];assert.equal(j.status,observed?'reserved':'clicked');assert.equal(j.slot,observed?1:0);if(observed){assert.equal(j.due,j.repeatFirstEntryAt+600000);assert.equal(j.receipt.playerObserved,true);}}
});
test('quiz-wide pending survives daily rollover; only matching explicit receipts settle and total limit is two',t=>{
 const s=setup(t),file=join(s.root,'fuses.json'),f=new ActionFuses(file),op='a'.repeat(32);assert.equal(f.reserveQuiz(17,0,op),true);const restored=new ActionFuses(file);assert.equal(restored.reserveQuiz(17,1,'b'.repeat(32)),false);assert.equal(restored.settleQuiz(17,'b'.repeat(32),'wrong'),false);assert.equal(restored.settleQuiz(17,op,'wrong'),true);assert.equal(restored.reserveQuiz(17,0,'b'.repeat(32)),false);assert.equal(restored.reserveQuiz(17,1,'b'.repeat(32)),true);assert.equal(restored.settleQuiz(17,'b'.repeat(32),'wrong'),true);assert.equal(restored.reserveQuiz(17,1,'c'.repeat(32)),false);
});
test('CKD daily lease never restarts after an unavailable pre-submit outcome',t=>{
 const s=setup(t),file=join(s.root,'ckd.json'),f=new ActionFuses(file);assert.equal(f.claimCkd(s.now()),true);assert.equal(f.finishCkd(s.now(),{status:'authenticated',submitted:false},s.now()+1),true);assert.equal(new ActionFuses(file).claimCkd(s.now()+2000),false);assert.equal(new ActionFuses(file).summary().ckd.outcome,'unavailable');
});
test('external entry settings are exact DNS choices; HTTP is explicit and secrets/ports/files are rejected',t=>{
 const s=setup(t),o=new PcOptions(join(s.root,'options.json'));for(const host of ['*.example.com','127.0.0.1','localhost','host.local','www.keymedi.com','github.com','user@example.com'])assert.throws(()=>o.hosts([{host,http:false}]));o.hosts([{host:'entry.example.com',http:false}]);assert.equal(o.allowsEntry('medigate','https://entry.example.com/native'),true);assert.equal(o.allowsEntry('keymedi','https://entry.example.com/native'),false);assert.equal(o.allowsEntry('medigate','http://entry.example.com/native'),false);for(const u of ['https://entry.example.com:8443/x','https://entry.example.com.evil.org/','https://user@entry.example.com/','https://entry.example.com/update.exe'])assert.equal(o.allowsEntry('medigate',u),false);o.hosts([{host:'entry.example.com',http:true}]);assert.equal(o.allowsEntry('medigate','http://entry.example.com/native'),true);
});
test('survey reads preserve observed deadlines across restart and notification exclusions never touch action records',t=>{
 const s=setup(t),options=new PcOptions(join(s.root,'options.json')),file=join(s.root,'surveys.json'),url='https://www.doctorville.co.kr/seminar/broadcastSeminarPopup?seminarId=17';let alerts=0;const make=()=>new SurveyRunner({file,options,now:s.now,allowed:()=>true,notify:()=>alerts++});const raw={site:'doctorville',seminarId:'17',status:'open',minutesLeft:5,buttonCount:1,disabled:false};const runner=make();runner.observe(url,raw,{background:true});const row=runner.snapshot()[0];s.set(s.now()+60000);make().observe(url,{...raw,minutesLeft:60},{background:true});assert.equal(make().snapshot()[0].closesAt,row.closesAt);assert.equal(alerts,1);options.excludeSurvey(row.key,true);make().observe(url,raw);assert.equal(make().snapshot()[0].reads,2);assert.equal(options.snapshot().surveyExcluded.length,1);
});
test('workflow write failure after the ledger dispatch reservation still sends zero clicks',async t=>{
 const s=harness(t);s.reserve([event()]);const broken=new WorkflowStore(s.store.file,{commit:(file,data)=>{if(Object.values(data.entries).some(r=>r.status==='attempting'))throw Error('disk_full');atomicJson(file,data);}});s.runner.store=broken;s.runner.createPage=async()=>actionPage(s);
 await s.runner.run(broken.entries()[0]);assert.equal(s.clicks??0,0);assert.equal(Object.values(new LocalState(join(s.root,'state.json')).snapshot().jobs)[0].state,'unknown');
});
test('read-only refresh never joins a queued write batch',t=>{
 const s=setup(t),ledger=new LocalState(join(s.root,'state.json')),c=new AutomationController({file:join(s.root,'workflow.json'),ledger,now:s.now,catalog:()=>({}),catalogBusy:()=>false,queueCatalog(){},yieldCatalog(){}});clearInterval(c.timer);t.after(()=>c.close());ledger.setPaused(false);c.active='prepare';
 c.requestDaily({keys:['doctorville:attendance'],readOnly:false});c.requestDaily({keys:['keymedi:attendance'],readOnly:true});assert.deepEqual(c.pendingDaily,['doctorville:attendance']);assert.deepEqual(c.followupReads,['keymedi:attendance']);assert.equal(c.pendingReadOnly,false);
 c.cancel();assert.deepEqual(c.followupReads,[]);
});
test('six-mission layout commits exactly the observed six category attempts before one original batch call',async t=>{
 const s=harness(t);s.set(at('00:00:03'));s.store.setFeature('lounge',true);let sends=0;
 const page={url:'',route:'lounge',version:0,async load(url){this.url=url;this.version++;},async call(_name,[input]){if(input.mode==='claim'){assert.equal(Object.values(s.ledger.snapshot().jobs).filter(r=>r.state==='attempting').length,6);assert.equal(input.mask,95);sends++;return {sentMask:95};}return {status:'ready',total:6,missionMask:95,current:sends?6:0,eligibleMask:sends?0:95,successMask:sends?95:0};},close(){}};
 await new LoungeRunner({...s,createPage:async()=>page}).run(date,s.now());assert.equal(sends,1);assert.equal(s.store.day(date).lounge.missionTotal,6);assert.equal(s.store.day(date).lounge.status,'complete');
});
test('survey discovery uses the reviewed catalog identity and never invents a countdown or resets forty reads',t=>{
 const s=setup(t),options=new PcOptions(join(s.root,'options.json')),file=join(s.root,'surveys.json'),runner=new SurveyRunner({file,options,now:s.now,allowed:()=>true});
 runner.seed(date,{status:'review',stale:false,events:[{site:'doctorville',date,time:'13:00',url:'https://www.doctorville.co.kr/seminar/seminarDetail?seminarId=17'}]});const row=runner.snapshot()[0];assert.equal(row.status,'unknown');assert.equal(row.closesAt,0);assert.equal(row.reads,0);
 s.set(at('13:20'));assert.ok(runner.due());for(let i=0;i<45;i++)runner.observe(runner.target(row.key),null,{background:true});assert.equal(runner.snapshot()[0].reads,40);assert.equal(new SurveyRunner({file,options,now:s.now,allowed:()=>true}).due(),undefined);
});
test('report preview exports exactly frozen bytes and rejects stale or replaced tokens',()=>{
 let time=1000;const p=new ReportPreview({now:()=>time}),first=p.freeze('처음 보고서\n');assert.equal(p.text(first.token),first.text);const second=p.freeze('다음 보고서\n');assert.equal(p.text(first.token),null);assert.equal(p.text(second.token),second.text);time+=600001;assert.equal(p.text(second.token),null);
});

test('conflicting duplicate Docple identities keep peer lectures and cannot appear as confirmed empty',()=>{const r=sanitiseResult('docple',date,{status:'ok',coverage:true,events:[event(),event('701',{registrationStatus:'not_registered'}),event('702')]});assert.equal(r.coverage,false);assert.equal(r.status,'review');assert.deepEqual(r.events.map(e=>e.id),['702']);});

test('failed option revocation blocks the old external grant and marks storage unavailable',t=>{const s=setup(t),file=join(s.root,'options.json'),o=new PcOptions(file);o.hosts([{host:'entry.example.com',http:false}]);const failed=new PcOptions(file,{commit:()=>{throw Error('disk_full');}});assert.throws(()=>failed.hosts([]));assert.equal(failed.failed,true);assert.equal(failed.allowsEntry('medigate','https://entry.example.com/'),false);});
