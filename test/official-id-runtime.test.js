import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {WorkflowStore,cleanReceipt} from '../src/workflow-store.js';
import {LocalState} from '../src/local-state.js';
import {EntryRunner} from '../src/entry-runner.js';
import {createEntryJob} from '../src/entry-job.js';
import {parseOfficialIdentity,officialIdentity,legacyEntryKey,canonicalIdentity,nextIdentityEntry,sameWorker} from '../src/entry-identity.js';
import {snapshotIdentityState} from '../src/identity-snapshot.js';
import {atomicJson} from '../src/atomic-json.js';
import {kstDate,kstInstant} from '../src/schedule.js';
import {evaluate} from '../scripts/id-policy-adapter.mjs';
const date=kstDate(),at=t=>kstInstant(date,t),url='https://new.medigate.net/symposium/901';
const event=(extra={})=>({site:'medigate',date,time:'18:00',title:'합성 제목',url,...extra});
const exact={status:'ready',reason:'entry_ready',targetMatched:true,entryControls:1};
function setup(t){
 const root=mkdtempSync(join(tmpdir(),'pc-identity-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let now=at('18:01'),fail=false,account=0,dispatches=0;
 const ledgerFile=join(root,'state-v1.json'),file=join(root,'workflows-v1.json');
 const ledger=new LocalState(ledgerFile,{commit:(p,d)=>{if(fail)throw Error('disk full');atomicJson(p,d);}});ledger.setPaused(false);
 const store=new WorkflowStore(file);store.setFeature('entry',true);
 let results={medigate:{site:'medigate',date,status:'ok',stale:false,checkedAt:now,events:[event()]}};
 const page={url:'about:blank',route:'catalog',version:1,load:async function(u){this.url=u;},call:async function(_name,[_job,mode],options){if(mode==='click'){assert.equal(options.authorize(),true);assert.ok(Object.values(JSON.parse(readFileSync(ledgerFile))).length);assert.ok(Object.values(ledger.snapshot().jobs).some(j=>j.state==='attempting'));dispatches++;return {status:'clicked'};}return exact;},close(){},allowPopups(){}};
 const options={store,ledger,createPage:async()=>page,createInspectionPage:async()=>page,contextEpoch:()=>account,catalog:()=>results,now:()=>now,sleep:async ms=>{now+=ms;}};
 const runner=new EntryRunner(options);
 return {root,file,ledgerFile,ledger,store,runner,page,options,now:()=>now,setNow:n=>{now=n;},fail:()=>{fail=true;},changeAccount:()=>{account++;},get dispatches(){return dispatches;},setResults:r=>{results=r;}};
}
const seed=s=>{const job=createEntryJob(event(),s.now());s.store.putEntry(job);return job;};
const input=j=>({site:j.site,kind:'entry',date:j.date,target:j.key,slot:j.slot,dueAt:j.due,deadline:j.deadline});
test('identity migration snapshots opaque local state without touching accounts, selections or consumption',t=>{
 const s=setup(t),j=seed(s),ticket=s.ledger.reserve(input(j),s.now());s.ledger.beginDispatch(ticket,s.now());
 const opaque=Buffer.from('SYNTHETIC_DPAPI_OPAQUE'),credential=join(s.root,'credentials-v1.json');writeFileSync(credential,opaque);
 // A new profile gets its one snapshot before the first identity write.
 const beforeDir=join(s.root,'identity-state-snapshots');rmSync(beforeDir,{recursive:true,force:true});
 const state=readFileSync(s.ledgerFile),workflows=readFileSync(s.file);snapshotIdentityState(s.file);
 const backup=join(beforeDir,'before-official-id-v1');assert.deepEqual(readFileSync(join(backup,'state-v1.json')),state);assert.deepEqual(readFileSync(join(backup,'workflows-v1.json')),workflows);assert.deepEqual(readFileSync(join(backup,'credentials-v1.json')),opaque);
 const restored=new WorkflowStore(s.file);assert.deepEqual(restored.features(),s.store.features());assert.deepEqual(restored.entrySites(),s.store.entrySites());assert.deepEqual(readFileSync(credential),opaque);assert.deepEqual(readFileSync(s.ledgerFile),state);
 const snapshot=readFileSync(join(backup,'state-v1.json'));s.ledger.finish(ticket,'unknown',s.now());snapshotIdentityState(s.file);assert.deepEqual(readFileSync(join(backup,'state-v1.json')),snapshot);assert.equal(JSON.parse(readFileSync(join(backup,'SNAPSHOT.json'))).restorePolicy,'pause_and_preserve_newer_attempt_consumption');
});
test('tampered local snapshot or linked state fails closed before migration',t=>{
 const s=setup(t);writeFileSync(join(s.root,'identity-state-snapshots/before-official-id-v1/SNAPSHOT.json'),'{broken');assert.throws(()=>new WorkflowStore(s.file));
 const q=setup(t);rmSync(join(q.root,'identity-state-snapshots'),{recursive:true,force:true});symlinkSync(q.ledgerFile,join(q.root,'credentials-v1.json'));assert.throws(()=>snapshotIdentityState(q.file),/storage_error/);
});
test('unique old key acquires an alias while every attempt and execution reference survives',t=>{
 const s=setup(t),old=createEntryJob(event({url:''}),s.now()),receipt=cleanReceipt({status:'unknown',attempted:true},s.now());
 Object.assign(old,{status:'unknown',entryAttempted:true,retries:2,slot:0,attempts:[receipt],receipt,executionId:'SYNTHETIC_EXISTING',entryOwner:'SYNTHETIC_OWNER',lastStartedAt:s.now()-2});s.store.putEntry(old);
 s.runner.reserveCatalog(date,{medigate:{status:'ok',events:[event()]}});const bound=s.store.entries()[0];
 assert.equal(bound.key,old.key);for(const key of ['status','entryAttempted','retries','slot','attempts','receipt','executionId','entryOwner','lastStartedAt'])assert.deepEqual(bound[key],old[key],key);
 s.runner.reserveCatalog(date,{medigate:{status:'ok',events:[event({title:'변경된 제목'})]}});const renamed=s.store.entries()[0];assert.equal(renamed.key,old.key);assert.equal(renamed.title,'변경된 제목');assert.equal(canonicalIdentity(renamed),'medigate|symposium:901');assert.equal(s.runner.due(),null);
});
test('restart before catalog blocks duplicate old keys regardless of consumed peer state',t=>{
 const s=setup(t),a=seed(s);s.store.putEntry({...a,key:'b'.repeat(64),status:'cancelled',entryAttempted:true});
 const store=new WorkflowStore(s.file),runner=new EntryRunner({...s.options,store});assert.equal(runner.due(),null);assert.equal(nextIdentityEntry(store.entries(),s.now(),{date}),null);assert.equal(store.entries().length,2);
});
test('native PC legacy keys remain JSON hashes; adapter DTO exposes its projection explicitly',async()=>{
 const e=event({url:'',id:'901'}),j=createEntryJob(e,at('18:00')),native=createHash('sha256').update(JSON.stringify([e.site,e.date,'',e.title])).digest('hex');assert.equal(j.key,native);assert.equal(officialIdentity(j),null);
 const dto=(await evaluate({operation:'job',event:e,now:at('18:00')})).job;assert.equal(dto.pcKey,native);assert.notEqual(dto.key,native);
 for(const site of ['intermd','bluepharm','dtalks']){const x=createEntryJob(event({site,url:'https://example.invalid?id=901'}),at('18:00'));assert.equal(officialIdentity(x),null);assert.equal(x.key,legacyEntryKey(x));}
});
test('raw fake IDs, malformed URL, contradictory metadata and nonboolean attempt markers never authorize',t=>{
 const s=setup(t),j=seed(s);for(const marker of [undefined,null,'false'])assert.equal(nextIdentityEntry([{...j,entryAttempted:marker}],s.now(),{date}),null);
 for(const u of [url+'?',url+'#',url+'?token=PRIVATE',url+'?id=901',url.replace('new.','other.'),url.replace('https:','http:')])assert.equal(parseOfficialIdentity('medigate',u),null);
 assert.equal(createEntryJob(event({lectureIdentity:{schemaVersion:1,kind:'symposium',id:'902',source:'detail_url'}}),s.now()),null);
 assert.equal(sameWorker(j,{...j,url:url.replace('901','902'),lectureIdentity:parseOfficialIdentity('medigate',url.replace('901','902'))}),false);
});
test('failed, stale, history-only or pending catalogs cannot bind or clear old consumption',t=>{
 const s=setup(t),j=seed(s);s.ledger.reserve(input(j),s.now());const before=readFileSync(s.file);
 for(const change of [{status:'network'},{stale:true},{pending:true},{events:[event({historyOnly:true})]}])s.runner.reserveCatalog(date,{medigate:{status:'ok',events:[event({title:'변경'})],...change}});
 assert.deepEqual(readFileSync(s.file),before);assert.equal(s.ledger.consumed(input(j)),true);
});
test('durable save failure has zero DOM dispatch and survives as an unavailable ledger',async t=>{
 const s=setup(t),j=seed(s),before=readFileSync(s.ledgerFile);s.fail();await s.runner.run(j);assert.equal(s.dispatches,0);assert.deepEqual(readFileSync(s.ledgerFile),before);assert.equal(s.ledger.snapshot().paused,true);
});
test('competing dispatches commit once; restart and lost callback cannot resend',async t=>{
 const s=setup(t),j=seed(s);let release,entered;const waiting=new Promise(r=>{entered=r;}),original=s.page.call;
 s.page.call=async function(name,args,options){if(args[1]==='click'){await original.call(this,name,args,options);entered();await new Promise(r=>{release=r;});throw Error('lost callback');}return original.call(this,name,args,options);};
 const running=s.runner.run(j);await waiting;const peer=new EntryRunner(s.options);await peer.run({...j});assert.equal(s.dispatches,1);release();await running;
 const restarted=new LocalState(s.ledgerFile),store=new WorkflowStore(s.file),runner=new EntryRunner({...s.options,ledger:restarted,store});runner.recover();assert.equal(store.entries()[0].status,'unknown');assert.equal(store.entries()[0].entryAttempted,true);assert.equal(runner.retryJob(j.key),false);await runner.run(store.entries()[0]);assert.equal(s.dispatches,1);
});
test('commit consumed while stale workflow says unused cannot retry, rebook or replace a sent receipt with manual',t=>{
 const s=setup(t),j=seed(s),ticket=s.ledger.reserve(input(j),s.now());s.ledger.beginDispatch(ticket,s.now());s.store.updateEntry(j.key,{status:'cancelled'});
 assert.equal(s.runner.retryJob(j.key),false);assert.equal(s.runner.cancelJob(j.key,true),false);assert.equal(s.ledger.consumed(input(j)),true);
});
for(const action of ['cancel','manual','account','selection','pause'])test('late inspection after '+action+' has zero click and preserves newer state',async t=>{
 const s=setup(t),j=seed(s);let release,entered;const waiting=new Promise(r=>{entered=r;});s.page.call=async()=>{entered();await new Promise(r=>{release=r;});return exact;};
 const running=s.runner.run(j);await waiting;
 if(action==='cancel')s.runner.cancelJob(j.key);if(action==='manual'){const candidate=createEntryJob(event({title:'변경'}),s.now());assert.equal(s.runner.manualCandidate(candidate),true);assert.equal(candidate.key,j.key);}if(action==='account')s.changeAccount();if(action==='selection'){s.store.setEntrySites([]);s.store.setEntrySites(['medigate']);}if(action==='pause')s.ledger.setPaused(true);
 const state=readFileSync(s.file);release();await running;assert.equal(s.dispatches,0);assert.deepEqual(readFileSync(s.file),state);assert.equal(Object.keys(s.ledger.snapshot().jobs).length,0);
});
test('late preflight after account or selection change cannot overwrite prior read evidence',async t=>{
 for(const change of ['account','selection']){const s=setup(t),j=seed(s);let release,entered;const waiting=new Promise(r=>{entered=r;});s.page.call=async()=>{entered();await new Promise(r=>{release=r;});return exact;};const running=s.runner.preflight(j.key);await waiting;if(change==='account')s.changeAccount();else{s.store.setEntrySites([]);s.store.setEntrySites(['medigate']);}const before=readFileSync(s.file);release();await running;assert.deepEqual(readFileSync(s.file),before);}
});
test('identity alone cannot select an unselected provider or enable a feature, including after restart',t=>{
 const s=setup(t);s.store.setFeature('entry',false);s.runner.reserveCatalog(date,{docple:{status:'ok',events:[event({site:'docple',url:'https://docple-plus.com/webinar/901',id:'901',registrationStatus:'registered'})]}});assert.equal(s.store.entries().length,0);s.store.setFeature('entry',true);s.runner.reserveCatalog(date,{docple:{status:'ok',events:[event({site:'docple',url:'https://docple-plus.com/webinar/901',id:'901',registrationStatus:'registered'})]}});assert.equal(s.store.entries().length,0);assert.equal(new WorkflowStore(s.file).entrySites().includes('docple'),false);
});
test('snapshot outputs and diagnostics contain no raw official IDs, URLs, page bindings or snapshot contents',t=>{
 const s=setup(t);seed(s);assert.doesNotMatch(JSON.stringify(s.store.diagnostics()),/https:|symposium:901|lectureIdentity|__pcEntry|SYNTHETIC_DPAPI/);assert.deepEqual(readdirSync(join(s.root,'identity-state-snapshots')),['before-official-id-v1']);
});

test('a fresh ID matching multiple legacy keys quarantines them without attaching multiple aliases',t=>{
 const s=setup(t),old=createEntryJob(event({url:''}),s.now());s.store.putEntry(old);s.store.putEntry({...old,key:'b'.repeat(64),status:'cancelled'});s.runner.reserveCatalog(date,{medigate:{status:'ok',events:[event()]}});assert.equal(s.store.entries().length,2);assert.ok(s.store.entries().every(j=>j.identityBlock==='identity_conflict'&&!j.lectureIdentity));assert.equal(s.runner.due(),null);const store=new WorkflowStore(s.file),runner=new EntryRunner({...s.options,store});assert.equal(runner.due(),null);
});
