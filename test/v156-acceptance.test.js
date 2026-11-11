import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EntryRunner} from '../src/entry-runner.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {CatalogRunner} from '../src/catalog-runner.js';
import {CatalogStore} from '../src/catalog-store.js';
import {createEntryJob} from '../src/entry-job.js';
import {hmp35Proof,migrateEntryPolicy,validHmpCheckpoint,browserHmpCheckpoint,nextHmpCheckpoint} from '../src/hmp-policy.js';
import {automaticEntrySite,hmpLedgerSlot} from '../src/entry-support.js';
import {sameWorker,officialIdentity,legacyEntryKey} from '../src/entry-identity.js';
import {kstInstant} from '../src/schedule.js';
import {ckdCatalog,docplePage,completeDocple} from '../src/catalog-api.js';
import {NativeCatalogRead} from '../src/native-catalog.js';
import {blockHiddenMedia} from '../src/hidden-resources.js';
import {resourceUse} from '../src/resource-use.js';
import {remotePreferences,siteById} from '../src/security.js';
import {DeveloperJournal} from '../editions/developer/developer-journal.js';
import {initialSettings} from '../vendor/engine/core.js';
import {atomicJson} from '../src/atomic-json.js';
const cases=JSON.parse(readFileSync(new URL('./fixtures/android-v156-direction.synthetic.json',import.meta.url))).cases;
const date='2026-11-12',at=t=>kstInstant(date,t),start=at('13:00'),copy=v=>structuredClone(v),key='a'.repeat(64);
const event={site:'hmp',date,time:'13:00',title:'SYNTHETIC HMP',registrationStatus:'registered',lectureIdentity:{schemaVersion:1,kind:'schedule',id:'731',source:'hmp_go_detail'}};
function setup(t){
 const root=mkdtempSync(join(tmpdir(),'pc-v156-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let now=start,fail=false,created=0,posts=0;
 const ledger=new LocalState(join(root,'state-v1.json'));ledger.setPaused(false);
 const store=new WorkflowStore(join(root,'workflows-v1.json'),{now:()=>now,commit:(p,d)=>{if(fail)throw Error('disk_full');atomicJson(p,d);}});
 store.setFeature('entry',true);store.setEntrySites(['hmp','dtalks','docple']);
 const runner=new EntryRunner({ledger,store,now:()=>now,sleep:async ms=>{now+=ms;},createPage:async()=>{created++;return {url:siteById('hmp').url,version:1,route:'catalog',load:async()=>{},close(){},allowPopups(){},armEntryDispatch(){},
  call:async function(_name,[_job,mode]){if(mode==='click'){posts++;assert.equal(store.entries(date)[0].entryAttempted,true);assert.ok(Object.values(ledger.snapshot().jobs).some(r=>r.state==='attempting'));this.version++;return {status:'clicked'};}if(mode.startsWith('playback'))return {status:runner.testPlayback??'playing_observed'};runner.testOnInspect?.();return runner.testReply??{status:'ready',targetMatched:true,matchedTargets:1,entryControls:1};}};}});
 const catalog=(events=[event],extra={})=>({hmp:{status:'review',stale:false,pending:false,checkedAt:now,coverage:true,events,...extra}});
 const reserve=()=>{runner.reserveCatalog(date,catalog());return store.entries(date)[0];};
 return {root,ledger,store,runner,catalog,reserve,set:v=>{now=v;},now:()=>now,get posts(){return posts;},get created(){return created;},fail:()=>{fail=true;}};
}
function row25(override={}){return {hmpRepeatSchema:2,slot:1,due:start+1500000,at:start+1500100,entryAttempted:false,status:'button_missing',...override};}
function job35(rows=[row25()]){return {...createEntryJob(event,start),slot:2,due:start+2100000,deadline:start+2190000,hmpAttempts:rows};}
function ckd(){
 const row={WB_SEQ:701,WB_TITLE:'SYNTHETIC CKD',WB_STARTDATE:date+' 13:00:00',WB_TYPE_CD:'WB',WB_POINT_YN:'Y',WB_USE_YN:'Y',DEL_YN:'N'};
 return {month:{ndate:'2026-11-01',sdate:'2026-11-01',today:date,ldate:'2026-11-30',edate:'2026-12-12',wbList:[row]},day:[copy(row)]};
}
function docRows(n=7){return Array.from({length:n},(_,i)=>({id:800+i,title:'SYNTHETIC DOC '+i,liveStartAt:date+'T13:00:00',liveEndAt:date+'T14:00:00',status:'OPEN',registered:i%2===0,detailUrl:'https://docple-plus.com/webinar/'+(800+i)}));}
const envelope=(items,totalCount=7,totalPages=2)=>({success:true,code:'SUCCESS',message:'ok',data:{items,totalCount,totalPages}});
function native(options={}){
 let epoch=0,generation=0;const requests=[],owner={cookies:{get:async()=>[{name:'accessToken',value:'SYNTHETIC_BEARER_ONLY_NORMAL_PROFILE'}]}},data=ckd(),rows=docRows();
 const reader=new NativeCatalogRead({now:()=>start,sessionOwner:()=>owner,accountEpoch:()=>epoch,profileEpoch:()=>generation,fetchImpl:async(url,request)=>{
  requests.push({url,method:request.method,body:request.body,credentials:request.credentials,authorization:request.headers.Authorization});
  if(options.respond)return options.respond(url,request,requests.length);
  const value=url.includes('CalDtl')?data.day:url.includes('CalAjax')?data.month:envelope(new URL(url).searchParams.get('page')==='1'?rows.slice(0,6):rows.slice(6));
  return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 }});
 reader.admitCkd({authenticated:true,date,accountEpoch:epoch});
 return {reader,requests,data,rows,rotate:()=>{generation++;},account:()=>{epoch++;},owner};
}
for(const c of cases)test('v156 '+c.id+' '+(c.description??c.area),async t=>{
 const id=c.id;
 if(id==='API-001'){
  const n=native(),r=await n.reader.read(initialSettings().profiles.ckd,date,new AbortController().signal);
  assert.equal(r.coverage,true);assert.equal(r.events.length,1);assert.deepEqual(n.requests.map(r=>r.method),['POST','POST']);assert.ok(n.requests.every(r=>r.credentials==='omit'&&!r.authorization));assert.equal(n.requests[0].body,'r_month=2026-11');assert.equal(n.requests[1].body,'r_date='+date);
 }else if(id==='API-002'){
  for(const change of [d=>d.day.push({...d.day[0],WB_SEQ:702}),d=>d.month.wbList=[],d=>d.day[0].WB_TITLE='OTHER',d=>d.month.edate='2026-11-01',d=>d.month.wbList.push(copy(d.month.wbList[0]))]){const d=ckd();change(d);assert.throws(()=>ckdCatalog(d.month,d.day,date));}
 }else if(id==='API-003'){
  const n=native();n.reader.ckdAdmission=null;assert.equal(await n.reader.read(initialSettings().profiles.ckd,date,new AbortController().signal),null);assert.equal(n.requests.length,0);
 }else if(id==='API-004'){
  const s=setup(t),n=native(),cache=new CatalogStore(join(s.root,'catalog.json'));let pages=0;
  const runner=new CatalogRunner({store:cache,now:s.now,nativeRead:(...args)=>n.reader.read(...args),createPage:async()=>{pages++;throw Error('must not render');},onChange:r=>{if(r.completed===1)runner.cancel('entry_priority');}});
  await runner.start(date,['docple','doctorville']);const r=cache.view(date).results.docple;
  assert.equal(r.coverage,true);assert.equal(r.events.length,7);assert.equal(r.status,'ok');assert.equal(pages,0);assert.equal(n.requests.length,2);assert.deepEqual(r.events.map(e=>e.registrationStatus),['registered','not_registered','registered','not_registered','registered','not_registered','registered']);
 }else if(id==='API-005'){
  const rows=docRows(),one=docplePage(envelope(rows.slice(0,6)),date);
  assert.throws(()=>completeDocple([one],date));assert.throws(()=>docplePage(envelope(rows.slice(6),8,2),date,one));assert.throws(()=>completeDocple([one,docplePage(envelope([rows[0]]),date,one)],date));assert.throws(()=>docplePage(envelope([{...rows[0],registered:'true'}]),date));
 }else if(id==='API-006'){
  const s=setup(t),n=native({respond:async()=>{n.account();return new Response(JSON.stringify(envelope(docRows(1),1,1)),{headers:{'content-type':'application/json'}});}}),cache=new CatalogStore(join(s.root,'catalog.json'));let pages=0;
  const runner=new CatalogRunner({store:cache,now:s.now,nativeRead:(...a)=>n.reader.read(...a),createPage:async()=>{pages++;throw Error('stale account cannot open');}});await runner.start(date,['docple']);assert.equal(pages,0);assert.equal(cache.view(date).results.docple.coverage,false);
 }else if(id==='API-007'){
  const s=setup(t),n=native({respond:async()=>new Response('{}',{status:401,headers:{'content-type':'application/json'}})}),cache=new CatalogStore(join(s.root,'catalog.json'));let pages=0;
  await new CatalogRunner({store:cache,now:s.now,nativeRead:(...a)=>n.reader.read(...a),createPage:async()=>{pages++;return {open:async()=>{},read:async()=>({status:'review',done:true,coverage:false,events:[]}),close(){}};}}).start(date,['docple']);assert.equal(pages,1);assert.equal(n.requests.length,1);assert.equal(cache.view(date).results.docple.coverage,false);
 }else if(id==='API-008'){
  let deliver;const n=native({respond:()=>new Promise(r=>{deliver=r;})}),before=resourceUse().apiCompleted;
  assert.equal(await n.reader.read(initialSettings().profiles.docple,date,new AbortController().signal,{remainingMs:20}),null);deliver(new Response(JSON.stringify(envelope(docRows(1),1,1)),{headers:{'content-type':'application/json'}}));await new Promise(r=>setTimeout(r,10));assert.equal(resourceUse().apiCompleted,before);
 }else if(['API-009','API-010','API-011'].includes(id)){
  const n=native(),site=id==='API-011'?'keymedi':'medigate';assert.equal(await n.reader.read(initialSettings().profiles[site],date,new AbortController().signal),null);assert.equal(n.requests.length,0);
 }else if(id==='API-012'||id==='E20'||id==='E21'||id==='E22'||id==='E23'){
  const s=setup(t),old=s.reserve();s.store.updateEntry(old.key,{status:'cancelled'});s.runner.reserveCatalog(date,s.catalog([{...event,title:'RENAMED'}]));assert.equal(s.store.entries(date)[0].key,old.key);assert.equal(s.store.entries(date)[0].status,'cancelled');assert.equal(s.store.entries(date)[0].title,'RENAMED');
  assert.equal(officialIdentity({...event,lectureIdentity:{...event.lectureIdentity,id:'token'}}),null);
  if(id==='E21'){s.runner.reserveCatalog(date,s.catalog([{...event,lectureIdentity:{...event.lectureIdentity,id:'732'}}]));assert.equal(s.store.entries(date).length,2);}
  if(id==='E22'){s.store.putEntry({...old,key:'b'.repeat(64)});assert.equal(s.runner.due(),null);}
 }else if(id==='API-013'||id==='E24'){
  const s=setup(t),old=s.reserve();await s.runner.run(old);const j=s.store.entries(date)[0],before=s.posts;s.runner.cancelJob(j.key,true);await s.runner.run(j);assert.equal(s.posts,before);
  const restored=new LocalState(join(s.root,'state-v1.json'));assert.ok(Object.values(restored.snapshot().jobs).every(r=>r.state==='unknown'));assert.ok(s.store.entries(date)[0].status==='manual_clicked');
 }else if(id==='API-014'){
  for(const type of ['mainFrame','subFrame','image','stylesheet','script','font'])assert.equal(blockHiddenMedia({url:'https://synthetic.invalid/video.mp4',method:'GET',resourceType:type},'hidden_read'),false);
  assert.equal(blockHiddenMedia({url:'https://synthetic.invalid/video.mp4',method:'POST',resourceType:'media'},'hidden_read'),false);assert.equal(blockHiddenMedia({url:'https://synthetic.invalid/mod.ts',method:'GET',resourceType:'other'},'hidden_read'),false);assert.equal(blockHiddenMedia({url:'https://synthetic.invalid/audio.mp3',method:'GET',resourceType:'other'},'hidden_read'),true);assert.equal(blockHiddenMedia({url:'https://synthetic.invalid/video.mp4',method:'GET',resourceType:'media'},'entry'),false);
 }else if(id==='API-015'||['E01','E02','E03','E04','E05'].includes(id)){
  const s=setup(t),old={...createEntryJob(event,start),key,site:'dtalks',repeatSchema:1,repeatAttempts:[{status:'clicked'}],entryAttempted:id==='E02',status:'reserved'};delete old.hmpRepeatSchema;delete old.hmpTiming;delete old.hmpAttempts;
  s.store.putEntry(old);s.store.migrateEntryPolicies();assert.equal(s.store.entries(date)[0].status,'cancelled');assert.equal(s.store.entries(date)[0].entryAttempted,old.entryAttempted);assert.deepEqual(s.store.entries(date)[0].repeatAttempts,old.repeatAttempts);assert.ok(s.store.entrySites().includes('dtalks'));assert.equal(automaticEntrySite('dtalks'),false);
  assert.equal(createEntryJob({...event,site:'dtalks',lectureIdentity:undefined},start),null);await s.runner.run(old);assert.equal(s.created,0);assert.equal(s.runner.retryJob(key),false);assert.ok(siteById('dtalks'));assert.ok(remotePreferences('dtalks').partition);
 }else if(id==='API-016'){
  const n=native(),before=resourceUse();await n.reader.read(initialSettings().profiles.ckd,date,new AbortController().signal);const after=resourceUse();assert.ok(after.apiBodyBytes>before.apiBodyBytes);assert.equal(after.osNetworkBytes,null);assert.equal(after.playbackDurationMs,null);assert.equal(after.fullNetworkMeasured,false);assert.ok(!JSON.stringify(after).includes('SYNTHETIC_BEARER'));
 }else if(id==='API-017'){
  const n=native();await n.reader.read(initialSettings().profiles.docple,date,new AbortController().signal);n.rotate();await n.reader.read(initialSettings().profiles.docple,date,new AbortController().signal);assert.equal(n.requests.length,4);
 }else if(id==='E06'||id==='E07'||id==='E08'||id==='E09'||id==='E10'||id==='E12'||id==='E13'||id==='E14'||id==='E15'){
  const variants=id==='E08'?c.parameters.statuses:id==='E10'?['unknown','inaccessible','requested','not_checked','no_video','not_ready','navigation_unconfirmed','gesture_required']:['normal'];
  for(const variant of variants){
   const s=setup(t);let job=s.reserve();assert.equal(job.hmpRepeatSchema,2);await s.runner.run(job);assert.equal(s.posts,1);job=s.store.entries(date)[0];assert.equal(job.slot,1);assert.equal(job.due,start+1500000);
   if(id==='E13'){const fresh=createEntryJob(event,start+1600000);assert.equal(fresh,null);continue;}
   s.set(start+1500000);
   if(id==='E08')s.runner.testReply={status:variant};if(id==='E09'||id==='E12')s.runner.testPlayback='play_failed';if(id==='E10')s.runner.testPlayback=variant;
   if(id==='E14'||id==='E15')s.runner.testReply={status:'button_missing'};
   await s.runner.run(job);const next=s.store.entries(date)[0];
   const conditional=['E08','E09','E12','E14','E15'].includes(id);assert.equal(next.status==='reserved',conditional);assert.equal(s.posts,id==='E08'||id==='E14'||id==='E15'?1:2);
   if(conditional){assert.equal(next.due,start+2100000);assert.equal(next.slot,2);assert.equal(hmp35Proof(next),true);}
   if(id==='E14'||id==='E15'){s.set(start+1800000);const rows=id==='E15'?[event,{...event,lectureIdentity:{...event.lectureIdentity,id:'733'}}]:[event];s.runner.reserveCatalog(date,s.catalog(rows));assert.equal(s.store.entries(date)[0].status,id==='E15'?'ambiguous':'reserved');}
   if(id==='E12'){s.set(next.due);s.runner.testReply=undefined;await s.runner.run(next);assert.notEqual(s.store.entries(date)[0].status,'reserved');assert.equal(s.posts,3);assert.equal(s.runner.due(),null);}
  }
 }else if(id==='E11'){
  for(const value of ['false',null,0,undefined])assert.equal(hmp35Proof(job35([row25({entryAttempted:value})])),false);
  for(const rows of [[row25(),row25()],[row25({hmpRepeatSchema:1})],[row25({due:start+600000})],[]]){assert.equal(hmp35Proof(job35(rows)),false);assert.equal(browserHmpCheckpoint(job35(rows)),false);}
 }else if(id==='E16'||id==='E17'||id==='E18'){
  const old={...createEntryJob(event,start),key,slot:1,due:start+600000,deadline:start+690000,nextAt:start+600000,hmpRepeatSchema:1,hmpTiming:undefined,hmpAttempts:[{slot:0,due:start,status:'clicked',entryAttempted:true}]};
  if(id==='E16'){const fresh=migrateEntryPolicy(old,start+900000);assert.equal(fresh.hmpRepeatSchema,2);assert.equal(fresh.due,start+1500000);assert.equal(fresh.key,key);assert.deepEqual(fresh.hmpAttempts,old.hmpAttempts);}
  if(id==='E17')for(const change of [{status:'running'},{status:'attempting'},{entryAttempted:true},{entryAttempted:undefined}]){const input={...old,...change},fresh=migrateEntryPolicy(input,start+900000);assert.equal(fresh.status,'unknown');for(const k of ['key','slot','due','deadline','entryAttempted','hmpAttempts'])assert.deepEqual(fresh[k],input[k]);}
  if(id==='E18')for(const status of ['cancelled','manual_clicked','clicked','unknown','lecture_ended'])assert.deepEqual(migrateEntryPolicy({...old,status},start+900000),{...old,status});
 }else if(id==='E19'){
  const fresh=job35(),old={...fresh,hmpRepeatSchema:1};assert.equal(sameWorker(old,fresh),false);
  const s=setup(t),journal=new DeveloperJournal(join(s.root,'diagnostics.json'));journal.setEnabled(true,start);journal.entry({...fresh,slot:1},'entry','work_started',{},start);journal.entry({...fresh,slot:1,hmpRepeatSchema:1},'entry','work_started',{},start+1);
  const rows=journal.export(start+2).entryJournal.records;assert.equal(rows.length,2);assert.deepEqual(rows.map(r=>r.checkpoint).sort(),['hmp:1','hmp:2:1']);
 }else if(id==='E25'){
  const s=setup(t),old=s.reserve();s.runner.reserveCatalog(date,s.catalog([],{coverage:false,stale:false}));assert.equal(s.store.entries(date)[0].status,'reserved');s.runner.reserveCatalog(date,s.catalog([],{coverage:true,stale:true}));assert.equal(s.store.entries(date)[0].status,'reserved');assert.equal(s.store.entries(date)[0].key,old.key);
 }else if(id==='E26'){
  const s=setup(t),old=s.reserve();s.ledger.setPaused(true);await s.runner.run(old);assert.equal(s.posts,0);s.ledger.setPaused(false);s.set(start+86400000);assert.equal(s.runner.due(),null);assert.equal(s.posts,0);
 }else throw Error('Unmapped v156 contract '+id);
});
test('v156 a consumed +25 ledger is unknown, never an explicit unexecuted expiry proof',t=>{
 const s=setup(t);s.set(start+1500000);const row=s.reserve(),input={site:'hmp',kind:'entry',date,target:row.key,slot:hmpLedgerSlot(row),dueAt:row.due,deadline:row.deadline};
 const ticket=s.ledger.reserve(input,s.now());s.ledger.beginDispatch(ticket,s.now());s.set(row.deadline+1);assert.equal(s.runner.due(),null);const current=s.store.entries(date)[0];assert.equal(current.status,'unknown');assert.equal(hmp35Proof(current),false);assert.equal(s.posts,0);
});
test('v156 workflow failure after ledger dispatch grant sends zero and remains consumed across restart',async t=>{
 const s=setup(t);s.set(start+1500000);const row=s.reserve();s.runner.testOnInspect=s.fail;await s.runner.run(row);assert.equal(s.posts,0);assert.equal(s.ledger.snapshot().jobs[Object.keys(s.ledger.snapshot().jobs)[0]].state,'attempting');
 const ledger=new LocalState(join(s.root,'state-v1.json')),store=new WorkflowStore(join(s.root,'workflows-v1.json'),{now:s.now}),runner=new EntryRunner({ledger,store,now:s.now,createPage:async()=>{throw Error('must not dispatch');}});
 runner.recover();assert.equal(store.entries(date)[0].status,'unknown');assert.equal(hmp35Proof(store.entries(date)[0]),false);assert.equal(runner.due(),null);
});
test('v156 pause during a sent start checkpoint does not create a new continuation',async t=>{
 const s=setup(t),row=s.reserve(),make=s.runner.createPage;s.runner.createPage=async(...a)=>{const page=await make(...a),call=page.call;page.call=async function(name,args){const result=await call.call(this,name,args);if(args[1]==='click')s.ledger.setPaused(true);return result;};return page;};
 await s.runner.run(row);assert.equal(s.posts,1);assert.notEqual(s.store.entries(date)[0].status,'reserved');assert.equal(s.store.entries(date)[0].slot,0);
});
test('v156 actual store migration preserves opaque snapshot, old history and consumed legacy slot',t=>{
 const s=setup(t),fresh=createEntryJob(event,start),old={...fresh,key,status:'reserved',slot:1,due:start+600000,deadline:start+690000,nextAt:start+600000,hmpRepeatSchema:1,hmpAttempts:[{slot:0,due:start,entryAttempted:true,status:'clicked'}]};delete old.hmpTiming;
 const file=join(s.root,'migration','workflows-v1.json'),dt={...old,key:'b'.repeat(64),site:'dtalks',repeatSchema:1,entryAttempted:true,status:'attempting'};delete dt.hmpRepeatSchema;delete dt.hmpAttempts;
 const data={schemaVersion:1,features:s.store.features(),entrySites:['hmp','dtalks'],days:{},entries:{[key]:old,[dt.key]:dt}};atomicJson(file,data);const before=readFileSync(file,'utf8');
 const migrated=new WorkflowStore(file,{now:()=>start+900000,policyConsumed:r=>r.key===key});
 assert.equal(JSON.parse(readFileSync(file)).schemaVersion,2);assert.equal(readFileSync(join(s.root,'migration','identity-state-snapshots','before-entry-policy-v156','workflows-v1.json'),'utf8'),before);
 const h=migrated.entries(date).find(r=>r.key===key),d=migrated.entries(date).find(r=>r.site==='dtalks');assert.equal(h.status,'unknown');assert.equal(h.hmpRepeatSchema,1);assert.equal(h.due,old.due);assert.deepEqual(h.hmpAttempts,old.hmpAttempts);assert.equal(d.status,'cancelled');assert.equal(d.entryAttempted,true);assert.equal(d.slot,1);assert.deepEqual(migrated.entrySites(),['hmp','dtalks']);
 const restarted=new WorkflowStore(file,{now:()=>start+1500000});assert.deepEqual(restarted.entries(date),migrated.entries(date));assert.equal(s.posts,0);
});
test('v156 HMP permission and pause stop signals never become a continuation',()=>{
 const job=createEntryJob(event,start);
 for(const status of ['permissions','automation_paused','login','blocked','not_registered','ambiguous','cancelled','manual_clicked','lecture_ended'])assert.equal(nextHmpCheckpoint(job,{status},start+1000,[]),null);
});
