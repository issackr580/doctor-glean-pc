import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {RegistrationController,RegistrationStore,registrationTarget,registrationKey} from '../src/registration.js';
import {LocalState} from '../src/local-state.js';
import {WorkflowStore} from '../src/workflow-store.js';
import {EntryRunner} from '../src/entry-runner.js';
import {kstDate,kstInstant} from '../src/schedule.js';
import {atomicJson} from '../src/atomic-json.js';
import {canRegisterEntry,registrationReplyLabel} from '../src/execution-presentation.js';
function setup(t,{commit,inspect,statusAfter='registered'}={}){
 const root=mkdtempSync(join(tmpdir(),'pc-registration-'));t.after(()=>rmSync(root,{recursive:true,force:true}));let now=kstInstant(kstDate(),'09:00'),clicks=0,hidden=0,visible=0,confirmed=0,clicked=false;
 const target={key:'a'.repeat(64),site:'hmp',date:kstDate(),time:'13:00',title:'Synthetic registration',registrationStatus:'not_registered'},store=new RegistrationStore(join(root,'registration.json'),{commit});
 const make=async(job,signal)=>({url:'https://www.hmp.co.kr/symposium/schedulerequest/scheduleList.hm',version:1,load:async()=>{},ready:async()=>{},call:async function(_job,mode,binding){if(mode==='click'){assert.equal(store.status(job).attempted,true);assert.equal(binding.version,this.version);assert.equal(signal.aborted,false);clicks++;clicked=true;return {status:'registration_clicked'};}return inspect?.(this,signal)??{status:clicked?statusAfter:'registration_ready',targetMatched:true,registrationControls:1};},close(){}});
 const controller=new RegistrationController({store,resolve:(source,key)=>key===target.key?target:null,createPage:async(...args)=>{visible++;return make(...args);},createInspectionPage:async(...args)=>{hidden++;return make(...args);},now:()=>now,sleep:async ms=>{now+=ms;},onConfirmed:()=>confirmed++});
 return {root,target,store,controller,now:()=>now,counts:()=>({clicks,hidden,visible,confirmed})};
}
test('registration uses its own identity across reservation and catalog sources and accepts only current range',t=>{
 const s=setup(t),job=registrationTarget(s.target,s.now());assert.ok(job);assert.equal(registrationKey({...s.target,key:'b'.repeat(64)}),job.key);
 assert.equal(registrationTarget({...s.target,registrationStatus:'closed'},s.now()),null);assert.equal(registrationTarget({...s.target,date:'2026-02-30'},s.now()),null);assert.equal(registrationTarget({...s.target,site:'docple'},s.now()),null);assert.equal(registrationTarget({...s.target,time:'08:00'},s.now()),null);
});
test('explicit registration is durable before one native handler and rechecking never submits again',async t=>{
 const s=setup(t);const first=await s.controller.request('catalog',s.target.key);assert.equal(first.status,'confirmed');assert.equal(s.counts().clicks,1);
 const second=await s.controller.request('entry',s.target.key);assert.equal(second.status,'confirmed');assert.equal(s.counts().clicks,1);assert.equal(s.counts().hidden,1);assert.equal(s.counts().visible,1);
 const reopened=new RegistrationStore(join(s.root,'registration.json'));assert.equal(reopened.status(s.target).state,'confirmed');assert.equal(reopened.status(s.target).attempted,true);assert.doesNotMatch(readFileSync(join(s.root,'registration.json'),'utf8'),/Synthetic|https:|title|password|cookie|url/);
});
test('a click without a fresh registered marker stays unconfirmed after restart',async t=>{
 const s=setup(t,{statusAfter:'registration_ready'});assert.equal((await s.controller.request('entry',s.target.key)).status,'requested');assert.equal(s.store.status(s.target).state,'unknown');s.controller.store=new RegistrationStore(join(s.root,'registration.json'));assert.equal((await s.controller.request('catalog',s.target.key)).status,'unconfirmed');assert.equal(s.counts().clicks,1);
});
test('an already registered target is read without an application click',async t=>{
 const s=setup(t,{inspect:()=>({status:'registered',targetMatched:true})});assert.equal((await s.controller.request('entry',s.target.key)).status,'confirmed');assert.equal(s.counts().clicks,0);assert.equal(s.store.status(s.target).attempted,false);
});
test('unknown targets, invalid selectors and manual verification never grant a registration submit',async t=>{
 const s=setup(t);assert.equal((await s.controller.request('url',s.target.key)).ok,false);assert.equal((await s.controller.request('entry','https://foreign.invalid/')).ok,false);assert.equal((await s.controller.request('entry','b'.repeat(64))).ok,false);assert.equal(s.counts().visible,0);
 const result=await s.controller.request('entry',s.target.key,{readOnly:true});assert.equal(result.status,'unconfirmed');assert.equal(s.counts().visible,0);assert.equal(s.counts().hidden,1);assert.equal(s.counts().clicks,0);
});
test('storage failure before dispatch leaves the original handler untouched',async t=>{
 const s=setup(t,{commit(){throw Error('full');}});const reply=await s.controller.request('entry',s.target.key);assert.equal(reply.reason,'storage_error');assert.equal(reply.attempted,false);assert.equal(s.counts().clicks,0);
});
test('cancellation during durable reservation cannot dispatch or reset the consumed registration',async t=>{
 let s;s=setup(t,{commit(file,data){atomicJson(file,data);s.controller.cancel();}});const result=await s.controller.request('entry',s.target.key);assert.equal(result.reason,'cancelled');assert.equal(s.counts().clicks,0);assert.equal(s.store.status(s.target).attempted,true);
});
test('an interrupted registration file is preserved and corrupt data disables only this feature',t=>{
 const s=setup(t);s.store.reserve(s.target,s.now());const reopened=new RegistrationStore(join(s.root,'registration.json'));assert.equal(reopened.status(s.target).state,'unknown');assert.equal(reopened.reserve(s.target,s.now()),false);
 writeFileSync(join(s.root,'broken.json'),'{broken');const broken=new RegistrationStore(join(s.root,'broken.json'));assert.equal(broken.failed,true);assert.equal(readFileSync(join(s.root,'broken.json'),'utf8'),'{broken');
});
test('fresh registration confirmation can rearm only an unattempted existing missing-registration entry',t=>{
 const s=setup(t),ledger=new LocalState(join(s.root,'state.json')),store=new WorkflowStore(join(s.root,'workflows.json'));store.setFeature('entry',true);
 const key=store.entryKey(s.target),due=kstInstant(s.target.date,s.target.time),job={...s.target,key,start:due,due,deadline:due+90000,nextAt:0,status:'not_registered',slot:0,retries:1,attempts:[],entryAttempted:false};store.putEntry(job);
 const runner=new EntryRunner({ledger,store,now:s.now});assert.equal(runner.registrationConfirmed(s.target),true);assert.equal(store.entries()[0].status,'reserved');
 for(const status of ['cancelled','manual_clicked','clicked']){store.updateEntry(key,{status});assert.equal(runner.registrationConfirmed(s.target),false);assert.equal(store.entries()[0].status,status);}
 store.updateEntry(key,{status:'not_registered',entryAttempted:true});assert.equal(runner.registrationConfirmed(s.target),false);
 store.updateEntry(key,{entryAttempted:false});ledger.setPaused(false);const input={site:job.site,kind:'entry',date:job.date,target:key,slot:0,dueAt:due,deadline:due+90000};assert.ok(ledger.reserve(input,due));runner.now=()=>due;assert.equal(runner.registrationConfirmed(s.target),false);
});
test('UI offers registration for unattempted reservations and never labels a click complete',()=>{
 assert.equal(canRegisterEntry({status:'reserved',entryAttempted:false}),true);assert.equal(canRegisterEntry({status:'running',entryAttempted:false}),false);
 assert.equal(canRegisterEntry({status:'not_registered',entryAttempted:false}),true);assert.equal(canRegisterEntry({status:'reserved',preflight:{status:'not_registered'}}),true);assert.equal(canRegisterEntry({status:'expired',preflight:{status:'not_registered'}}),false);assert.equal(canRegisterEntry({status:'not_registered',entryAttempted:true}),false);
 assert.match(registrationReplyLabel({ok:true,status:'requested'}),/최종/);assert.match(registrationReplyLabel({ok:false,reason:'storage_error',attempted:false}),/실행하지 않았/);assert.doesNotMatch(registrationReplyLabel({ok:false,reason:'storage_error',attempted:true}),/실행하지 않았/);
});
